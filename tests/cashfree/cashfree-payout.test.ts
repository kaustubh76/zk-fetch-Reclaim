import { config } from 'dotenv';
config();
import { expect, test, describe, beforeAll } from 'vitest';
import {
  CashfreePayoutClient,
  CashfreeTransferStatus,
  CASHFREE_DOMAINS,
  CASHFREE_AUTH_DOMAINS,
  CASHFREE_ENDPOINTS,
  CASHFREE_ALLOWED_URL_PATTERNS,
  DEFAULT_API_VERSION,
  TRANSFER_STATUS_REDACTIONS,
  TRANSFER_CREATION_REDACTIONS,
  TRANSFER_STATUS_REGEX_FALLBACKS,
  getTransferStatusRedactions,
  getTransferStatusMatches,
  getTransferCreationRedactions,
  getTransferCreationMatches,
  cashfreeAuthorize,
} from '../../src/providers/cashfree';

// ───────────────────────────────────────────────
// Client Configuration Tests (no credentials needed)
// ───────────────────────────────────────────────

describe('CashfreePayoutClient - Configuration', () => {
  const dummyAppId = '0x776E23668233b9c0592f75C8A8b1f570d5cFDE83';
  const dummyAppSecret = '0x118e1f6d8cab55f9c9d8a7e5b1cbbbc20e7e4274a0cf3b45b9700b675236e772';

  test('should use sandbox URL for sandbox environment', () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: { clientId: 'test_id', clientSecret: 'test_secret' },
      environment: 'sandbox',
    });
    expect(client.getBaseUrl()).toBe(CASHFREE_DOMAINS.sandbox);
  });

  test('should use production URL by default', () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: { clientId: 'test_id', clientSecret: 'test_secret' },
    });
    expect(client.getBaseUrl()).toBe(CASHFREE_DOMAINS.production);
  });

  test('should expose underlying ReclaimClient', () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: { clientId: 'test_id', clientSecret: 'test_secret' },
    });
    expect(client.getReclaimClient()).toBeDefined();
    expect(client.getReclaimClient().applicationId).toBe(dummyAppId);
  });

  test('should include bearer token in secret headers when provided', async () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: {
        clientId: 'my_client_id',
        clientSecret: 'my_client_secret',
        bearerToken: 'test_bearer_token',
      },
    });
    const headers = await client.getSecretHeaders();
    expect(headers['Authorization']).toBe('Bearer test_bearer_token');
    expect(headers['x-client-id']).toBe('my_client_id');
    expect(headers['x-client-secret']).toBe('my_client_secret');
  });
});

// ───────────────────────────────────────────────
// Constants Tests
// ───────────────────────────────────────────────

describe('Cashfree Constants', () => {
  test('should have correct domain URLs', () => {
    expect(CASHFREE_DOMAINS.production).toBe('https://api.cashfree.com');
    expect(CASHFREE_DOMAINS.sandbox).toBe('https://sandbox.cashfree.com');
  });

  test('should have correct auth domain URLs', () => {
    expect(CASHFREE_AUTH_DOMAINS.production).toBe('https://payout-api.cashfree.com');
    expect(CASHFREE_AUTH_DOMAINS.sandbox).toBe('https://payout-gamma.cashfree.com');
  });

  test('should have correct endpoint paths', () => {
    expect(CASHFREE_ENDPOINTS.createTransfer).toBe('/payout/transfers');
    expect(CASHFREE_ENDPOINTS.getTransferStatus).toBe('/payout/transfers');
    expect(CASHFREE_ENDPOINTS.batchTransfer).toBe('/payout/transfers/batch');
    expect(CASHFREE_ENDPOINTS.authorize).toBe('/payout/v1/authorize');
  });

  test('should have valid default API version', () => {
    expect(DEFAULT_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('should have allowed URL patterns for both environments', () => {
    expect(CASHFREE_ALLOWED_URL_PATTERNS.production).toHaveLength(1);
    expect(CASHFREE_ALLOWED_URL_PATTERNS.sandbox).toHaveLength(1);
    expect(CASHFREE_ALLOWED_URL_PATTERNS.all).toHaveLength(2);
  });
});

// ───────────────────────────────────────────────
// Transfer Status Enum Tests
// ───────────────────────────────────────────────

describe('CashfreeTransferStatus', () => {
  test('should have all expected status values', () => {
    expect(CashfreeTransferStatus.RECEIVED).toBe('RECEIVED');
    expect(CashfreeTransferStatus.SUCCESS).toBe('SUCCESS');
    expect(CashfreeTransferStatus.FAILED).toBe('FAILED');
    expect(CashfreeTransferStatus.REJECTED).toBe('REJECTED');
    expect(CashfreeTransferStatus.REVERSED).toBe('REVERSED');
  });
});

// ───────────────────────────────────────────────
// Pattern Tests
// ───────────────────────────────────────────────

describe('Response Extraction Patterns', () => {
  test('should define jsonPath patterns for transfer status fields', () => {
    expect(TRANSFER_STATUS_REDACTIONS.transferId.jsonPath).toBe('$.transfer_id');
    expect(TRANSFER_STATUS_REDACTIONS.cfTransferId.jsonPath).toBe('$.cf_transfer_id');
    expect(TRANSFER_STATUS_REDACTIONS.status.jsonPath).toBe('$.status');
    expect(TRANSFER_STATUS_REDACTIONS.transferAmount.jsonPath).toBe('$.transfer_amount');
  });

  test('should define jsonPath patterns for transfer creation fields', () => {
    expect(TRANSFER_CREATION_REDACTIONS.transferId.jsonPath).toBe('$.transfer_id');
    expect(TRANSFER_CREATION_REDACTIONS.cfTransferId.jsonPath).toBe('$.cf_transfer_id');
    expect(TRANSFER_CREATION_REDACTIONS.status.jsonPath).toBe('$.status');
    expect(TRANSFER_CREATION_REDACTIONS.statusCode.jsonPath).toBe('$.status_code');
  });

  test('regex fallbacks compile and match Cashfree responses', () => {
    const sample = '{"transfer_id":"txn_123","cf_transfer_id":"CF456","status":"SUCCESS","transfer_amount":100.50}';
    for (const pattern of Object.values(TRANSFER_STATUS_REGEX_FALLBACKS)) {
      expect(() => new RegExp(pattern.regex)).not.toThrow();
      expect(sample.match(new RegExp(pattern.regex))).not.toBeNull();
    }
  });
});

describe('Response Match Builders', () => {
  test('getTransferStatusMatches with expected status', () => {
    const matches = getTransferStatusMatches(CashfreeTransferStatus.SUCCESS);
    expect(matches).toHaveLength(1);
    expect(matches[0].value).toBe('"status":"SUCCESS"');
  });

  test('getTransferStatusMatches without expected status', () => {
    const matches = getTransferStatusMatches();
    expect(matches[0].value).toBe('"transfer_id"');
  });

  test('getTransferCreationMatches validates cf_transfer_id presence', () => {
    const matches = getTransferCreationMatches();
    expect(matches[0].value).toContain('cf_transfer_id');
  });
});

describe('Response Redaction Builders', () => {
  test('getTransferStatusRedactions returns 4 defaults + additional', () => {
    expect(getTransferStatusRedactions()).toHaveLength(4);
    expect(getTransferStatusRedactions([{ jsonPath: '$.x' }])).toHaveLength(5);
  });

  test('getTransferCreationRedactions returns 4 extractions', () => {
    expect(getTransferCreationRedactions()).toHaveLength(4);
  });
});

// ───────────────────────────────────────────────
// Integration Tests (require Cashfree sandbox credentials)
// ───────────────────────────────────────────────

const hasCredentials = !!process.env.CASHFREE_CLIENT_ID && !!process.env.APP_ID;

describe.skipIf(!hasCredentials)('Cashfree Payout - Integration Tests', () => {
  let helpers: typeof import('./cashfree-payout');

  beforeAll(async () => {
    helpers = await import('./cashfree-payout');
  });

  test('should prove transfer with SUCCESS status', async () => {
    const result = await helpers.proveTransferSuccess();
    expect(result).toBeDefined();
    expect(result.proof).toBeDefined();
    expect(result.status).toBe('SUCCESS');
    expect(result.transferId).toBe(process.env.CASHFREE_TEST_TRANSFER_ID_SUCCESS);
  }, 120000);

  test('should extract fields without status assertion', async () => {
    const result = await helpers.proveTransferStatusGeneric();
    expect(result.transferId).toBeDefined();
    expect(result.status).toBeDefined();
    expect(Object.values(CashfreeTransferStatus)).toContain(result.status);
  }, 120000);
});
