import { expect, test, describe, beforeAll } from 'vitest';
import {
  CashfreePayoutClient,
  CashfreeTransferStatus,
  CASHFREE_DOMAINS,
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
} from '../../src/providers/cashfree';

// ───────────────────────────────────────────────
// Client Configuration Tests (no credentials needed)
// ───────────────────────────────────────────────

describe('CashfreePayoutClient - Configuration', () => {
  // Valid Ethereum key pair for ReclaimClient validation (appId = address derived from secret)
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

  test('should store secret headers correctly', () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: { clientId: 'my_client_id', clientSecret: 'my_client_secret' },
    });

    const headers = client.getSecretHeaders();
    expect(headers['x-client-id']).toBe('my_client_id');
    expect(headers['x-client-secret']).toBe('my_client_secret');
  });

  test('should return a copy of secret headers (mutation safety)', () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: { clientId: 'original_id', clientSecret: 'original_secret' },
    });

    const headers = client.getSecretHeaders();
    headers['x-client-id'] = 'mutated';
    expect(client.getSecretHeaders()['x-client-id']).toBe('original_id');
  });

  test('should expose underlying ReclaimClient', () => {
    const client = new CashfreePayoutClient({
      applicationId: dummyAppId,
      applicationSecret: dummyAppSecret,
      credentials: { clientId: 'test_id', clientSecret: 'test_secret' },
    });

    const reclaimClient = client.getReclaimClient();
    expect(reclaimClient).toBeDefined();
    expect(reclaimClient.applicationId).toBe(dummyAppId);
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

  test('should have correct V2 endpoint paths', () => {
    expect(CASHFREE_ENDPOINTS.createTransfer).toBe('/payout/v2/transfers');
    expect(CASHFREE_ENDPOINTS.getTransferStatus).toBe('/payout/v2/transfers');
    expect(CASHFREE_ENDPOINTS.batchTransfer).toBe('/payout/v2/transfers/batch');
  });

  test('should have valid default API version', () => {
    expect(DEFAULT_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('should have allowed URL patterns for both environments', () => {
    expect(CASHFREE_ALLOWED_URL_PATTERNS.production).toHaveLength(1);
    expect(CASHFREE_ALLOWED_URL_PATTERNS.sandbox).toHaveLength(1);
    expect(CASHFREE_ALLOWED_URL_PATTERNS.all).toHaveLength(2);

    expect(CASHFREE_ALLOWED_URL_PATTERNS.production[0]).toContain('api.cashfree.com');
    expect(CASHFREE_ALLOWED_URL_PATTERNS.sandbox[0]).toContain('sandbox.cashfree.com');
  });
});

// ───────────────────────────────────────────────
// Transfer Status Enum Tests
// ───────────────────────────────────────────────

describe('CashfreeTransferStatus', () => {
  test('should have all expected status values', () => {
    expect(CashfreeTransferStatus.RECEIVED).toBe('RECEIVED');
    expect(CashfreeTransferStatus.PROCESSING).toBe('PROCESSING');
    expect(CashfreeTransferStatus.PENDING).toBe('PENDING');
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
    expect(TRANSFER_CREATION_REDACTIONS.transferId.jsonPath).toBe('$.data.transfer_id');
    expect(TRANSFER_CREATION_REDACTIONS.cfTransferId.jsonPath).toBe('$.data.cf_transfer_id');
    expect(TRANSFER_CREATION_REDACTIONS.status.jsonPath).toBe('$.status');
    expect(TRANSFER_CREATION_REDACTIONS.dataStatus.jsonPath).toBe('$.data.status');
  });

  test('should define regex fallback patterns with named capture groups', () => {
    expect(TRANSFER_STATUS_REGEX_FALLBACKS.transferId.regex).toContain('transfer_id');
    expect(TRANSFER_STATUS_REGEX_FALLBACKS.status.regex).toContain('status');
    expect(TRANSFER_STATUS_REGEX_FALLBACKS.cfTransferId.regex).toContain('cf_transfer_id');
    expect(TRANSFER_STATUS_REGEX_FALLBACKS.transferAmount.regex).toContain('transfer_amount');

    // Verify regex fallbacks actually compile
    for (const pattern of Object.values(TRANSFER_STATUS_REGEX_FALLBACKS)) {
      expect(() => new RegExp(pattern.regex)).not.toThrow();
    }
  });

  test('regex fallbacks should match expected Cashfree response fragments', () => {
    const sampleResponse = '{"transfer_id":"txn_123","cf_transfer_id":"CF456","status":"SUCCESS","transfer_amount":100.50}';

    for (const [key, pattern] of Object.entries(TRANSFER_STATUS_REGEX_FALLBACKS)) {
      const match = sampleResponse.match(new RegExp(pattern.regex));
      expect(match).not.toBeNull();
    }
  });
});

describe('Response Match Builders', () => {
  test('getTransferStatusMatches with expected status', () => {
    const matches = getTransferStatusMatches(CashfreeTransferStatus.SUCCESS);
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('contains');
    expect(matches[0].value).toBe('"status":"SUCCESS"');
  });

  test('getTransferStatusMatches without expected status', () => {
    const matches = getTransferStatusMatches();
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('contains');
    expect(matches[0].value).toBe('"transfer_id"');
  });

  test('getTransferCreationMatches validates cf_transfer_id presence', () => {
    const matches = getTransferCreationMatches();
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('contains');
    expect(matches[0].value).toContain('cf_transfer_id');
  });
});

describe('Response Redaction Builders', () => {
  test('getTransferStatusRedactions returns 4 default extractions', () => {
    const redactions = getTransferStatusRedactions();
    expect(redactions).toHaveLength(4);
  });

  test('getTransferStatusRedactions appends additional extractions', () => {
    const additional = [{ jsonPath: '$.transfer_mode' }];
    const redactions = getTransferStatusRedactions(additional);
    expect(redactions).toHaveLength(5);
    expect(redactions[4]).toEqual({ jsonPath: '$.transfer_mode' });
  });

  test('getTransferCreationRedactions returns 4 extractions', () => {
    const redactions = getTransferCreationRedactions();
    expect(redactions).toHaveLength(4);
  });
});

// ───────────────────────────────────────────────
// Integration Tests (require Cashfree sandbox credentials)
// These are skipped by default — set CASHFREE_CLIENT_ID to enable
// ───────────────────────────────────────────────

const hasCredentials = !!process.env.CASHFREE_CLIENT_ID && !!process.env.APP_ID;

describe.skipIf(!hasCredentials)('Cashfree Payout - Integration Tests', () => {
  // Import helpers lazily to avoid .env errors when skipped
  let helpers: typeof import('./cashfree-payout');

  beforeAll(async () => {
    helpers = await import('./cashfree-payout');
  });

  test('should prove transfer with RECEIVED status', async () => {
    const result = await helpers.proveTransferReceived();

    expect(result).toBeDefined();
    expect(result.proof).toBeDefined();
    expect(result.proof.claimData).toBeDefined();
    expect(result.proof.signatures).toBeDefined();
    expect(result.proof.signatures.length).toBeGreaterThan(0);
    expect(result.transferId).toBe(process.env.CASHFREE_TEST_TRANSFER_ID_RECEIVED);
    expect(result.status).toBe('RECEIVED');
    expect(result.cfTransferId).toBeDefined();
  }, 120000);

  test('should prove transfer with SUCCESS status', async () => {
    const result = await helpers.proveTransferSuccess();

    expect(result).toBeDefined();
    expect(result.proof).toBeDefined();
    expect(result.status).toBe('SUCCESS');
    expect(result.transferId).toBe(process.env.CASHFREE_TEST_TRANSFER_ID_SUCCESS);
    expect(result.transferAmount).toBeDefined();
  }, 120000);

  test('should extract fields without status assertion', async () => {
    const result = await helpers.proveTransferStatusGeneric();

    expect(result).toBeDefined();
    expect(result.proof).toBeDefined();
    expect(result.transferId).toBeDefined();
    expect(result.status).toBeDefined();
    expect(Object.values(CashfreeTransferStatus)).toContain(result.status);
  }, 120000);

  test('should include valid context data in proof', async () => {
    const result = await helpers.proveTransferSuccess();
    const context = JSON.parse(result.proof.claimData.context || '{}');

    expect(context).toBeDefined();
    expect(context.contextAddress).toBe('0x0000000000000000000000000000000000000000');
    expect(context.contextMessage).toContain('cashfree_transfer_success');
  }, 120000);

  test('should fail when expected status does not match', async () => {
    const client = helpers.createSandboxClient();

    await expect(
      client.proveTransferStatus({
        transferId: process.env.CASHFREE_TEST_TRANSFER_ID_SUCCESS!,
        expectedStatus: CashfreeTransferStatus.FAILED,
      })
    ).rejects.toThrow();
  }, 120000);
});
