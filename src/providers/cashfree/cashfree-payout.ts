import * as crypto from 'crypto';
import * as https from 'https';
import { ReclaimClient } from '../../zkfetch';
import { Options, secretOptions, Proof } from '../../interfaces';
import { HttpMethod } from '../../types';
import {
  CASHFREE_DOMAINS,
  CASHFREE_AUTH_DOMAINS,
  CASHFREE_ENDPOINTS,
  DEFAULT_API_VERSION,
} from './constants';
import {
  CashfreePayoutConfig,
  CashfreeEnvironment,
  CashfreeTransferStatusResult,
  CashfreeTransferCreationResult,
  ProveTransferStatusOptions,
  ProveTransferCreationOptions,
} from './types';
import {
  getTransferStatusRedactions,
  getTransferStatusMatches,
  getTransferCreationRedactions,
  getTransferCreationMatches,
} from './patterns';

/**
 * Generate the X-Cf-Signature header for Cashfree 2FA.
 * Encrypts "clientId.timestamp" with the RSA public key using OAEP padding.
 */
function generateCfSignature(clientId: string, rsaPublicKey: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${clientId}.${timestamp}`;
  const encrypted = crypto.publicEncrypt(
    { key: rsaPublicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(data)
  );
  return encrypted.toString('base64');
}

/**
 * Obtain a bearer token from Cashfree's /payout/v1/authorize endpoint.
 *
 * @param clientId - Cashfree x-client-id
 * @param clientSecret - Cashfree x-client-secret
 * @param environment - 'production' or 'sandbox'
 * @param rsaPublicKey - RSA public key PEM for X-Cf-Signature (required if IP not whitelisted)
 * @returns Bearer token string
 */
export async function cashfreeAuthorize(
  clientId: string,
  clientSecret: string,
  environment: CashfreeEnvironment = 'production',
  rsaPublicKey?: string,
): Promise<string> {
  const authDomain = CASHFREE_AUTH_DOMAINS[environment];
  const url = new URL(CASHFREE_ENDPOINTS.authorize, authDomain);

  const headers: Record<string, string> = {
    'X-Client-Id': clientId,
    'X-Client-Secret': clientSecret,
    'Content-Type': 'application/json',
  };

  if (rsaPublicKey) {
    headers['X-Cf-Signature'] = generateCfSignature(clientId, rsaPublicKey);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.status === 'SUCCESS' && parsed.data?.token) {
              resolve(parsed.data.token);
            } else {
              reject(new Error(`Cashfree authorize failed: ${parsed.message || body}`));
            }
          } catch {
            reject(new Error(`Cashfree authorize: invalid response: ${body}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * A wrapper around ReclaimClient for Cashfree Payout API zkTLS proofs.
 *
 * Cashfree Payout API requires 4 auth headers on every request:
 * - `Authorization: Bearer <token>` (from /v1/authorize)
 * - `x-client-id`
 * - `x-client-secret`
 * - `X-Cf-Signature` (RSA-encrypted clientId.timestamp)
 *
 * All of these are placed in secretOptions.headers and hidden from the proof.
 *
 * @example
 * ```typescript
 * const client = new CashfreePayoutClient({
 *   applicationId: 'YOUR_RECLAIM_APP_ID',
 *   applicationSecret: 'YOUR_RECLAIM_APP_SECRET',
 *   credentials: {
 *     clientId: 'YOUR_CASHFREE_CLIENT_ID',
 *     clientSecret: 'YOUR_CASHFREE_CLIENT_SECRET',
 *     rsaPublicKey: fs.readFileSync('public_key.pem', 'utf8'),
 *   },
 *   environment: 'sandbox',
 * });
 *
 * const result = await client.proveTransferStatus({
 *   transferId: 'transfer_123',
 *   expectedStatus: CashfreeTransferStatus.SUCCESS,
 * });
 * ```
 */
export class CashfreePayoutClient {
  private reclaimClient: ReclaimClient;
  private baseUrl: string;
  private environment: CashfreeEnvironment;
  private clientId: string;
  private clientSecret: string;
  private rsaPublicKey?: string;
  private cachedBearerToken?: string;
  private bearerTokenExpiry?: number;
  private useTee: boolean;
  private geoLocation?: string;
  private apiVersion: string;

  constructor(config: CashfreePayoutConfig) {
    this.reclaimClient = new ReclaimClient(
      config.applicationId,
      config.applicationSecret,
      config.logs,
    );

    this.environment = config.environment || 'production';
    this.baseUrl = CASHFREE_DOMAINS[this.environment];
    this.clientId = config.credentials.clientId;
    this.clientSecret = config.credentials.clientSecret;
    this.rsaPublicKey = config.credentials.rsaPublicKey;
    this.apiVersion = config.credentials.apiVersion || DEFAULT_API_VERSION;
    this.useTee = config.useTee || false;
    this.geoLocation = config.geoLocation;

    // If a pre-obtained bearer token was provided, cache it
    if (config.credentials.bearerToken) {
      this.cachedBearerToken = config.credentials.bearerToken;
      // Assume ~4 minutes remaining (tokens last ~5 min)
      this.bearerTokenExpiry = Math.floor(Date.now() / 1000) + 240;
    }
  }

  /** Ensure we have a valid bearer token, obtaining one if needed */
  private async ensureBearerToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedBearerToken && this.bearerTokenExpiry && now < this.bearerTokenExpiry) {
      return this.cachedBearerToken;
    }

    const token = await cashfreeAuthorize(
      this.clientId,
      this.clientSecret,
      this.environment,
      this.rsaPublicKey,
    );
    this.cachedBearerToken = token;
    // Cache for 4 minutes (tokens last ~5 min, leave 1 min buffer)
    this.bearerTokenExpiry = now + 240;
    return token;
  }

  /** Build the secret headers — ALL auth headers go here (hidden from proof) */
  private async buildSecretHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureBearerToken();
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'x-client-id': this.clientId,
      'x-client-secret': this.clientSecret,
    };
    if (this.rsaPublicKey) {
      headers['X-Cf-Signature'] = generateCfSignature(this.clientId, this.rsaPublicKey);
    }
    return headers;
  }

  private buildPublicOptions(
    method: HttpMethod,
    body?: string,
    context?: { contextAddress: string; contextMessage: string },
  ): Options {
    return {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': this.apiVersion,
      },
      body,
      useTee: this.useTee,
      geoLocation: this.geoLocation,
      context,
    };
  }

  private buildSecretOptions(
    secretHeaders: Record<string, string>,
    responseMatches: Array<{ type: 'regex' | 'contains'; value: string }>,
    responseRedactions: Array<{ jsonPath?: string; regex?: string; xPath?: string }>,
  ): secretOptions {
    return {
      headers: secretHeaders,
      responseMatches,
      responseRedactions,
    };
  }

  /**
   * Generate a zkTLS proof of a Cashfree transfer's current status.
   *
   * Makes a GET request to /payout/transfers?transfer_id=xxx and produces
   * a proof binding to the Cashfree domain, endpoint, response content,
   * and timestamp. All auth credentials are kept private.
   *
   * Extracts: transfer_id, cf_transfer_id, status, transfer_amount
   */
  async proveTransferStatus(
    options: ProveTransferStatusOptions,
  ): Promise<CashfreeTransferStatusResult> {
    const url = `${this.baseUrl}${CASHFREE_ENDPOINTS.getTransferStatus}?transfer_id=${encodeURIComponent(options.transferId)}`;

    const publicOptions = this.buildPublicOptions(
      HttpMethod.GET,
      undefined,
      options.context,
    );

    const secretHeaders = await this.buildSecretHeaders();
    const secretOpts = this.buildSecretOptions(
      secretHeaders,
      getTransferStatusMatches(options.expectedStatus),
      getTransferStatusRedactions(options.additionalExtractions),
    );

    const proof = await this.reclaimClient.zkFetch(
      url,
      publicOptions,
      secretOpts,
      options.retries,
      options.retryInterval,
    );

    if (!proof) {
      throw new Error('Failed to generate proof for transfer status');
    }

    const extracted = proof.extractedParameterValues || {};

    return {
      proof,
      transferId: extracted.transfer_id || options.transferId,
      status: extracted.status || '',
      cfTransferId: extracted.cf_transfer_id || '',
      transferAmount: extracted.transfer_amount,
    };
  }

  /**
   * Generate a zkTLS proof of a Cashfree transfer creation.
   *
   * Makes a POST request to /payout/transfers and proves the response.
   * WARNING: This actually executes the transfer on Cashfree's side.
   *
   * Extracts: transfer_id, cf_transfer_id, status
   */
  async proveTransferCreation(
    options: ProveTransferCreationOptions,
  ): Promise<CashfreeTransferCreationResult> {
    const url = `${this.baseUrl}${CASHFREE_ENDPOINTS.createTransfer}`;

    const publicOptions = this.buildPublicOptions(
      HttpMethod.POST,
      JSON.stringify(options.transferRequest),
      options.context,
    );

    const secretHeaders = await this.buildSecretHeaders();
    const secretOpts = this.buildSecretOptions(
      secretHeaders,
      getTransferCreationMatches(),
      getTransferCreationRedactions(),
    );

    const proof = await this.reclaimClient.zkFetch(
      url,
      publicOptions,
      secretOpts,
      options.retries,
      options.retryInterval,
    );

    if (!proof) {
      throw new Error('Failed to generate proof for transfer creation');
    }

    const extracted = proof.extractedParameterValues || {};

    return {
      proof,
      transferId: extracted.transfer_id || '',
      status: extracted.status || '',
      cfTransferId: extracted.cf_transfer_id || '',
    };
  }

  /** Get the underlying ReclaimClient for advanced usage */
  getReclaimClient(): ReclaimClient {
    return this.reclaimClient;
  }

  /** Get the resolved base URL */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Get a fresh set of secret headers (for advanced/direct usage) */
  async getSecretHeaders(): Promise<Record<string, string>> {
    return await this.buildSecretHeaders();
  }
}
