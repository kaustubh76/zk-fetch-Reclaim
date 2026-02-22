/** Cashfree Payout API base URLs (V2) */
export const CASHFREE_DOMAINS = {
  production: 'https://api.cashfree.com',
  sandbox: 'https://sandbox.cashfree.com',
} as const;

/** V2 endpoint path templates */
export const CASHFREE_ENDPOINTS = {
  createTransfer: '/payout/v2/transfers',
  getTransferStatus: '/payout/v2/transfers',
  batchTransfer: '/payout/v2/transfers/batch',
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
