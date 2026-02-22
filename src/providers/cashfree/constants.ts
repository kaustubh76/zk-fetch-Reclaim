/** Cashfree Payout API base URLs */
export const CASHFREE_DOMAINS = {
  production: 'https://api.cashfree.com',
  sandbox: 'https://sandbox.cashfree.com',
} as const;

/** Cashfree Payout API auth domains (for /v1/authorize) */
export const CASHFREE_AUTH_DOMAINS = {
  production: 'https://payout-api.cashfree.com',
  sandbox: 'https://payout-gamma.cashfree.com',
} as const;

/** Endpoint path templates (V2 paths — no /v2/ prefix) */
export const CASHFREE_ENDPOINTS = {
  /** POST /payout/transfers — create a transfer */
  createTransfer: '/payout/transfers',
  /** GET /payout/transfers?transfer_id=xxx — get transfer status */
  getTransferStatus: '/payout/transfers',
  /** POST /payout/transfers/batch — batch transfer */
  batchTransfer: '/payout/transfers/batch',
  /** POST /payout/v1/authorize — get bearer token */
  authorize: '/payout/v1/authorize',
} as const;

/** Default API version header value */
export const DEFAULT_API_VERSION = '2024-01-01';

/**
 * Pre-built URL patterns for signature-based auth (frontend mode).
 * These match the wildcard format accepted by isUrlAllowed() in utils.ts.
 */
export const CASHFREE_ALLOWED_URL_PATTERNS = {
  production: [
    'https://api.cashfree.com/payout/*',
  ],
  sandbox: [
    'https://sandbox.cashfree.com/payout/*',
  ],
  all: [
    'https://api.cashfree.com/payout/*',
    'https://sandbox.cashfree.com/payout/*',
  ],
} as const;
