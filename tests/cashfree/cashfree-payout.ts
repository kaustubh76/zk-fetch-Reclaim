import { CashfreePayoutClient, CashfreeTransferStatus } from '../../src/providers/cashfree';
import { config } from 'dotenv';
config();

/** Create a Cashfree payout client configured for sandbox testing */
export const createSandboxClient = (logs = false) => {
  return new CashfreePayoutClient({
    applicationId: process.env.APP_ID!,
    applicationSecret: process.env.APP_SECRET!,
    credentials: {
      clientId: process.env.CASHFREE_CLIENT_ID!,
      clientSecret: process.env.CASHFREE_CLIENT_SECRET!,
    },
    environment: 'sandbox',
    logs,
  });
};

/** Prove transfer status — RECEIVED state */
export const proveTransferReceived = async () => {
  const client = createSandboxClient(true);
  return await client.proveTransferStatus({
    transferId: process.env.CASHFREE_TEST_TRANSFER_ID_RECEIVED!,
    expectedStatus: CashfreeTransferStatus.RECEIVED,
    context: {
      contextAddress: '0x0000000000000000000000000000000000000000',
      contextMessage: 'cashfree_transfer_received',
    },
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

/** Prove transfer status using TEE mode */
export const proveTransferStatusWithTee = async () => {
  const client = new CashfreePayoutClient({
    applicationId: process.env.APP_ID!,
    applicationSecret: process.env.APP_SECRET!,
    credentials: {
      clientId: process.env.CASHFREE_CLIENT_ID!,
      clientSecret: process.env.CASHFREE_CLIENT_SECRET!,
    },
    environment: 'sandbox',
    useTee: true,
    logs: true,
  });

  return await client.proveTransferStatus({
    transferId: process.env.CASHFREE_TEST_TRANSFER_ID_SUCCESS!,
    context: {
      contextAddress: '0x0000000000000000000000000000000000000000',
      contextMessage: 'cashfree_transfer_tee',
    },
  });
};
