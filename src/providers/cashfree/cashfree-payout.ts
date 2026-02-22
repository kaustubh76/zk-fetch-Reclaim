import { ReclaimClient } from '../../zkfetch';
import { Options, secretOptions, Proof } from '../../interfaces';
import { HttpMethod } from '../../types';
import { CASHFREE_DOMAINS, CASHFREE_ENDPOINTS, DEFAULT_API_VERSION } from './constants';
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
 * A thin wrapper around ReclaimClient that provides pre-configured
 * zkTLS proof generation for Cashfree Payout API V2 endpoints.
 *
 * Credentials (x-client-id, x-client-secret) are placed in secretOptions
 * and are never revealed in the generated proof.
 *
 * @example
 * ```typescript
 * const client = new CashfreePayoutClient({
 *   applicationId: 'YOUR_RECLAIM_APP_ID',
 *   applicationSecret: 'YOUR_RECLAIM_APP_SECRET',
 *   credentials: {
 *     clientId: 'YOUR_CASHFREE_CLIENT_ID',
 *     clientSecret: 'YOUR_CASHFREE_CLIENT_SECRET',
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
  private secretHeaders: Record<string, string>;
  private useTee: boolean;
  private geoLocation?: string;
  private apiVersion: string;

  constructor(config: CashfreePayoutConfig) {
    this.reclaimClient = new ReclaimClient(
      config.applicationId,
      config.applicationSecret,
      config.logs
    );

    const env: CashfreeEnvironment = config.environment || 'production';
    this.baseUrl = CASHFREE_DOMAINS[env];

    // These go into secretOptions.headers — hidden from proof
    this.secretHeaders = {
      'x-client-id': config.credentials.clientId,
      'x-client-secret': config.credentials.clientSecret,
    };

    this.apiVersion = config.credentials.apiVersion || DEFAULT_API_VERSION;
    this.useTee = config.useTee || false;
    this.geoLocation = config.geoLocation;
  }

  private buildPublicOptions(
    method: HttpMethod,
    body?: string,
    context?: { contextAddress: string; contextMessage: string }
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
    responseMatches: Array<{ type: 'regex' | 'contains'; value: string }>,
    responseRedactions: Array<{ jsonPath?: string; regex?: string; xPath?: string }>
  ): secretOptions {
    return {
      headers: this.secretHeaders,
      responseMatches,
      responseRedactions,
    };
  }

  /**
   * Generate a zkTLS proof of a Cashfree transfer's current status.
   *
   * Makes a GET request to /payout/v2/transfers/{transferId} and produces
   * a proof binding to the Cashfree domain, endpoint, response content,
   * and timestamp. Authentication credentials are kept private.
   *
   * Extracts: transfer_id, cf_transfer_id, status, transfer_amount
   */
  async proveTransferStatus(
    options: ProveTransferStatusOptions
  ): Promise<CashfreeTransferStatusResult> {
    const url = `${this.baseUrl}${CASHFREE_ENDPOINTS.getTransferStatus}/${options.transferId}`;

    const publicOptions = this.buildPublicOptions(
      HttpMethod.GET,
      undefined,
      options.context
    );

    const secretOpts = this.buildSecretOptions(
      getTransferStatusMatches(options.expectedStatus),
      getTransferStatusRedactions(options.additionalExtractions)
    );

    const proof = await this.reclaimClient.zkFetch(
      url,
      publicOptions,
      secretOpts,
      options.retries,
      options.retryInterval
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
   * Makes a POST request to /payout/v2/transfers and proves the response.
   * This actually executes the transfer on Cashfree's side.
   *
   * Extracts: transfer_id, cf_transfer_id, status
   */
  async proveTransferCreation(
    options: ProveTransferCreationOptions
  ): Promise<CashfreeTransferCreationResult> {
    const url = `${this.baseUrl}${CASHFREE_ENDPOINTS.createTransfer}`;

    const publicOptions = this.buildPublicOptions(
      HttpMethod.POST,
      JSON.stringify(options.transferRequest),
      options.context
    );

    const secretOpts = this.buildSecretOptions(
      getTransferCreationMatches(),
      getTransferCreationRedactions()
    );

    const proof = await this.reclaimClient.zkFetch(
      url,
      publicOptions,
      secretOpts,
      options.retries,
      options.retryInterval
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

  /** Get a copy of the secret headers (returns new object to prevent mutation) */
  getSecretHeaders(): Record<string, string> {
    return { ...this.secretHeaders };
  }
}
