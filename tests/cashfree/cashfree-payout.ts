import * as fs from 'fs';
import { CashfreePayoutClient, CashfreeTransferStatus } from '../../src/providers/cashfree';
import { config } from 'dotenv';
config();

/** Resolve RSA public key: if env var is a file path, read it; otherwise use as PEM string */
function resolveRsaPublicKey(): string | undefined {
  const raw = process.env.CASHFREE_RSA_PUBLIC_KEY;
  if (!raw) return undefined;
  if (raw.includes('BEGIN PUBLIC KEY')) return raw;
  try { return fs.readFileSync(raw.trim(), 'utf8'); } catch { return raw; }
}

/** Create a Cashfree payout client configured for sandbox testing */
export const createSandboxClient = (logs = false) => {
  return new CashfreePayoutClient({
    applicationId: process.env.APP_ID!,
    applicationSecret: process.env.APP_SECRET!,
    credentials: {
      clientId: process.env.CASHFREE_CLIENT_ID!,
      clientSecret: process.env.CASHFREE_CLIENT_SECRET!,
      rsaPublicKey: resolveRsaPublicKey(),
      bearerToken: process.env.CASHFREE_BEARER_TOKEN,
    },
    environment: 'sandbox',
    logs,
  });
};

/** Prove transfer status — SUCCESS state */
export const proveTransferSuccess = async () => {
  const client = createSandboxClient(true);
  return await client.proveTransferStatus({
    transferId: process.env.CASHFREE_TEST_TRANSFER_ID_SUCCESS!,
    expectedStatus: CashfreeTransferStatus.SUCCESS,
    context: {
      contextAddress: '0x0000000000000000000000000000000000000000',
      contextMessage: 'cashfree_transfer_success',
    },
  });
};

/** Prove transfer status without asserting a specific status */
export const proveTransferStatusGeneric = async () => {
  const client = createSandboxClient(true);
  return await client.proveTransferStatus({
    transferId: process.env.CASHFREE_TEST_TRANSFER_ID_SUCCESS!,
    context: {
      contextAddress: '0x0000000000000000000000000000000000000000',
      contextMessage: 'cashfree_transfer_generic',
    },
  });
};
