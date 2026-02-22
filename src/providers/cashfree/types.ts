import { Proof } from '../../interfaces';

/** Cashfree API environment */
export type CashfreeEnvironment = 'production' | 'sandbox';

/** Cashfree transfer status values */
export enum CashfreeTransferStatus {
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
}

/** Transfer mode (Cashfree V2 uses lowercase) */
export type CashfreeTransferMode = 'banktransfer' | 'upi';

/** Cashfree authentication credentials */
export interface CashfreeCredentials {
  /** Cashfree x-client-id */
  clientId: string;
  /** Cashfree x-client-secret */
  clientSecret: string;
  /**
   * RSA public key PEM string for generating X-Cf-Signature.
   * Required for the /v1/authorize call when IP is not whitelisted.
   * Obtained from Cashfree Dashboard > Developers > Two-Factor Auth > Public Key.
   */
  rsaPublicKey?: string;
  /**
   * Pre-obtained bearer token from /payout/v1/authorize.
   * If provided, skips the authorize call. Token is valid for ~5 minutes.
   * If not provided, the client will call /payout/v1/authorize automatically
   * (requires rsaPublicKey or IP whitelisting).
   */
  bearerToken?: string;
  /** API version date string (defaults to '2024-01-01') */
  apiVersion?: string;
}

/** Configuration for CashfreePayoutClient */
export interface CashfreePayoutConfig {
  /** Reclaim application ID */
  applicationId: string;
  /** Reclaim application secret or signature token */
  applicationSecret: string;
  /** Cashfree API credentials (kept private in proofs) */
  credentials: CashfreeCredentials;
  /** API environment (default: 'production') */
  environment?: CashfreeEnvironment;
  /** Enable logging (default: false) */
  logs?: boolean;
  /** Use TEE mode for requests (default: false) */
  useTee?: boolean;
  /** Geolocation for requests (ISO country code) */
  geoLocation?: string;
}

/** Options for proving a transfer status */
export interface ProveTransferStatusOptions {
  /** The transfer_id to look up */
  transferId: string;
  /** Optional: assert the status must match this value */
  expectedStatus?: CashfreeTransferStatus;
  /** Optional: extract additional fields beyond defaults */
  additionalExtractions?: Array<{ jsonPath?: string; regex?: string }>;
  /** Optional: context for the proof */
  context?: { contextAddress: string; contextMessage: string };
  /** Optional: retry count (default: 1) */
  retries?: number;
  /** Optional: retry interval in ms (default: 1000) */
  retryInterval?: number;
}

/** Options for proving a transfer creation */
export interface ProveTransferCreationOptions {
  /** Transfer creation request body */
  transferRequest: CashfreeCreateTransferBody;
  /** Optional: context for the proof */
  context?: { contextAddress: string; contextMessage: string };
  /** Optional: retry count */
  retries?: number;
  /** Optional: retry interval in ms */
  retryInterval?: number;
}

/** Cashfree V2 Create Transfer request body */
export interface CashfreeCreateTransferBody {
  transfer_id: string;
  transfer_amount: number;
  transfer_mode: CashfreeTransferMode;
  beneficiary_details?: {
    beneficiary_id?: string;
    beneficiary_name?: string;
    beneficiary_contact_details?: {
      beneficiary_phone?: string;
      beneficiary_email?: string;
    };
    beneficiary_instrument_details?: {
      bank_account_number?: string;
      bank_ifsc?: string;
      vpa?: string;
    };
  };
  beneficiary_id?: string;
  [key: string]: unknown;
}

/** Parsed result from a transfer status proof */
export interface CashfreeTransferStatusResult {
  /** The full Reclaim proof object */
  proof: Proof;
  /** Extracted transfer_id */
  transferId: string;
  /** Extracted status */
  status: string;
  /** Extracted cf_transfer_id */
  cfTransferId: string;
  /** Extracted transfer_amount (as string from proof) */
  transferAmount?: string;
}

/** Parsed result from a transfer creation proof */
export interface CashfreeTransferCreationResult {
  /** The full Reclaim proof object */
  proof: Proof;
  /** Extracted transfer_id from response */
  transferId: string;
  /** Extracted status from response */
  status: string;
  /** Extracted cf_transfer_id from response */
  cfTransferId: string;
}
