# Cashfree Payout zkTLS Extension

A zkTLS provider module for generating zero-knowledge proofs of Cashfree Payout API responses. Built on top of Reclaim Protocol's zk-fetch library.

## Overview

This module wraps `ReclaimClient.zkFetch()` to provide a high-level interface for proving Cashfree payout operations (transfer status, transfer creation) without exposing any authentication credentials in the proof.

### What It Proves

- A specific transfer exists on Cashfree with a given `transfer_id`
- The transfer has a specific `status` (e.g. SUCCESS, FAILED)
- The response came from Cashfree's domain at a specific timestamp
- All of this is attested by the Reclaim attestor network

### What Stays Private

All 4 Cashfree auth headers are placed in `secretOptions.headers` and never appear in the proof:
- `Authorization: Bearer <token>`
- `x-client-id`
- `x-client-secret`
- `X-Cf-Signature` (RSA-encrypted signature)

---

## Architecture

```
src/providers/cashfree/
  types.ts          - TypeScript interfaces, enums, config types
  constants.ts      - Domains, endpoints, URL patterns
  patterns.ts       - Response match/redaction/extraction patterns
  cashfree-payout.ts - CashfreePayoutClient class + cashfreeAuthorize()
  index.ts          - Barrel exports

tests/cashfree/
  cashfree-payout.ts      - Test helpers (client factory, proof helpers)
  cashfree-payout.test.ts - 20 tests (18 unit + 2 integration)
```

---

## Authentication Flow

Cashfree Payout V2 API requires a **4-header auth stack** on every request:

```
1. Authorization: Bearer <token>    ← from /payout/v1/authorize
2. x-client-id: <client_id>
3. x-client-secret: <client_secret>
4. X-Cf-Signature: <RSA-encrypted>  ← clientId.timestamp encrypted with RSA OAEP
```

### How the Client Handles Auth

```
                  +-----------------------+
                  |  CashfreePayoutClient |
                  +-----------------------+
                            |
            bearerToken provided?
           /                          \
         YES                           NO
          |                             |
    Use cached token          Call cashfreeAuthorize()
    (4 min expiry)            POST /payout/v1/authorize
          |                   with X-Client-Id,
          |                   X-Client-Secret,
          |                   X-Cf-Signature (RSA)
          |                             |
          +----------+------------------+
                     |
             buildSecretHeaders()
         { Authorization, x-client-id,
           x-client-secret, X-Cf-Signature }
                     |
               zkFetch(url,
                 publicOptions,
                 secretOptions)   ← secret headers hidden from proof
                     |
              Reclaim Attestor
         (TLS intercept + ZK proofs)
                     |
              Signed Proof Object
         { claimData, signatures,
           extractedParameterValues }
```

### Two Auth Modes

**Mode 1: Pre-obtained Bearer Token (recommended)**
```typescript
const client = new CashfreePayoutClient({
  credentials: {
    clientId: 'CF...',
    clientSecret: 'cfsk_...',
    bearerToken: 'eyJhbG...',  // obtained separately
  }
});
```

**Mode 2: Auto-authorize**
```typescript
const client = new CashfreePayoutClient({
  credentials: {
    clientId: 'CF...',
    clientSecret: 'cfsk_...',
    rsaPublicKey: fs.readFileSync('public_key.pem', 'utf8'),
    // No bearerToken — client calls /v1/authorize automatically
  }
});
```

The standalone `cashfreeAuthorize()` helper can also be used directly:
```typescript
import { cashfreeAuthorize } from '@reclaimprotocol/zk-fetch';

const token = await cashfreeAuthorize(
  'CF_CLIENT_ID',
  'CF_CLIENT_SECRET',
  'sandbox',
  rsaPublicKeyPem
);
```

---

## Implementation Details

### File: `types.ts`

Defines all TypeScript types for the module:

| Type | Purpose |
|------|---------|
| `CashfreeEnvironment` | `'production' \| 'sandbox'` |
| `CashfreeTransferStatus` | Enum: RECEIVED, PROCESSING, PENDING, SUCCESS, FAILED, REJECTED, REVERSED |
| `CashfreeTransferMode` | `'banktransfer' \| 'upi'` (lowercase for V2) |
| `CashfreeCredentials` | clientId, clientSecret, rsaPublicKey?, bearerToken?, apiVersion? |
| `CashfreePayoutConfig` | Full client config (Reclaim + Cashfree credentials) |
| `ProveTransferStatusOptions` | Options for `proveTransferStatus()` |
| `ProveTransferCreationOptions` | Options for `proveTransferCreation()` |
| `CashfreeCreateTransferBody` | V2 transfer creation request body |
| `CashfreeTransferStatusResult` | Proof + extracted fields from status check |
| `CashfreeTransferCreationResult` | Proof + extracted fields from creation |

### File: `constants.ts`

| Constant | Value |
|----------|-------|
| `CASHFREE_DOMAINS.production` | `https://api.cashfree.com` |
| `CASHFREE_DOMAINS.sandbox` | `https://sandbox.cashfree.com` |
| `CASHFREE_AUTH_DOMAINS.production` | `https://payout-api.cashfree.com` |
| `CASHFREE_AUTH_DOMAINS.sandbox` | `https://payout-gamma.cashfree.com` |
| `CASHFREE_ENDPOINTS.createTransfer` | `/payout/transfers` (POST) |
| `CASHFREE_ENDPOINTS.getTransferStatus` | `/payout/transfers` (GET with `?transfer_id=xxx`) |
| `CASHFREE_ENDPOINTS.authorize` | `/payout/v1/authorize` |
| `DEFAULT_API_VERSION` | `2024-01-01` |

**Important V2 API quirks discovered during implementation:**
- V2 paths are `/payout/transfers` (NOT `/payout/v2/transfers`)
- GET transfer status uses query param `?transfer_id=xxx` (NOT path param `/{id}`)
- `transfer_mode` must be lowercase (`upi`, `banktransfer`)
- All 4 auth headers required on every request (not just bearer token)

### File: `patterns.ts`

Two pattern systems work together:

**1. `responseRedactions` (jsonPath)** — hide fields from proof output:
```
$.transfer_id, $.cf_transfer_id, $.status, $.transfer_amount
```

**2. `responseMatches` (regex with named capture groups)** — extract fields into `proof.extractedParameterValues`:
```
"transfer_id"\s*:\s*"(?<transfer_id>[^"]+)"
"cf_transfer_id"\s*:\s*"(?<cf_transfer_id>[^"]+)"
"status"\s*:\s*"(?<status>[^"]+)"
"transfer_amount"\s*:\s*(?<transfer_amount>[\d.]+)
```

The named capture groups (`(?<transfer_id>...)`) are what populate `extractedParameterValues` on the proof. This is how the attestor exposes field values to the verifier.

When `expectedStatus` is provided, an additional `contains` match is added:
```
{ type: 'contains', value: '"status":"SUCCESS"' }
```
This makes the proof generation fail if the status doesn't match, ensuring the proof can only be created for transfers with the expected status.

### File: `cashfree-payout.ts`

The core module containing:

**`generateCfSignature(clientId, rsaPublicKey)`** — Generates X-Cf-Signature by RSA OAEP encrypting `clientId.timestamp`

**`cashfreeAuthorize(clientId, clientSecret, environment, rsaPublicKey?)`** — Calls `/payout/v1/authorize` to obtain a bearer token

**`CashfreePayoutClient`** class:
- `constructor(config)` — Initializes ReclaimClient, caches bearer token if provided
- `ensureBearerToken()` — Lazy auth with 4-minute caching
- `buildSecretHeaders()` — Assembles all 4 auth headers (async, triggers auth if needed)
- `buildPublicOptions()` — Builds visible options (Content-Type, x-api-version, context)
- `proveTransferStatus(options)` — GET `/payout/transfers?transfer_id=xxx` with zkTLS proof
- `proveTransferCreation(options)` — POST `/payout/transfers` with zkTLS proof (actually executes transfer!)
- `getReclaimClient()` — Exposes underlying ReclaimClient
- `getBaseUrl()` — Returns resolved API base URL
- `getSecretHeaders()` — Returns fresh auth headers for advanced usage

---

## Proof Generation Flow

Step-by-step for `proveTransferStatus()`:

```
1. Build URL:
   https://sandbox.cashfree.com/payout/transfers?transfer_id=zktls_upi_s_006

2. Build publicOptions (visible in proof):
   { method: 'GET', headers: { Content-Type, x-api-version } }

3. Build secretOptions (hidden from proof):
   - headers: { Authorization, x-client-id, x-client-secret, X-Cf-Signature }
   - responseMatches: [contains "status":"SUCCESS", regex extractors...]
   - responseRedactions: [jsonPath: $.transfer_id, $.status, ...]

4. Call reclaimClient.zkFetch(url, publicOptions, secretOptions)

5. Under the hood:
   a. WebSocket to attestor (wss://attestor.reclaimprotocol.org:444/ws)
   b. Attestor establishes TLS to sandbox.cashfree.com
   c. Request sent through attestor's TLS tunnel
   d. Response received, matches validated
   e. 6 ZK proofs generated locally (snarkjs, ~6.3s)
   f. Attestor verifies ZK proofs, signs claim
   g. Proof returned with extractedParameterValues

6. Parse extractedParameterValues:
   { transfer_id: "zktls_upi_s_006", status: "SUCCESS",
     cf_transfer_id: "665779664", transfer_amount: "1" }
```

---

## Performance

Measured on MacBook Air (Apple Silicon), Cashfree sandbox:

| Phase | Time |
|-------|------|
| Attestor WebSocket connect | ~650ms |
| TLS handshake + Cashfree API request | ~180ms |
| **ZK proof generation (snarkjs, 6 proofs)** | **~6.3-6.9s** |
| Attestor claim verification + signing | ~270ms |
| **Total (cold start)** | **~9.1s** |
| **Total (warm connection)** | **~7.1s** |

**Bottleneck:** ~70% of time is local ZK proof generation (snarkjs). Network is only ~180ms.

**Verification:** Instant (<1ms) — ECDSA signature check on the claim data.

---

## Usage

### Prove Transfer Status

```typescript
import { CashfreePayoutClient, CashfreeTransferStatus } from '@reclaimprotocol/zk-fetch';

const client = new CashfreePayoutClient({
  applicationId: 'YOUR_RECLAIM_APP_ID',
  applicationSecret: 'YOUR_RECLAIM_APP_SECRET',
  credentials: {
    clientId: 'CF_CLIENT_ID',
    clientSecret: 'CF_CLIENT_SECRET',
    rsaPublicKey: fs.readFileSync('public_key.pem', 'utf8'),
  },
  environment: 'sandbox',
});

const result = await client.proveTransferStatus({
  transferId: 'transfer_123',
  expectedStatus: CashfreeTransferStatus.SUCCESS,
  context: {
    contextAddress: '0x0000000000000000000000000000000000000000',
    contextMessage: 'payment_proof',
  },
});

console.log(result.status);         // "SUCCESS"
console.log(result.transferId);     // "transfer_123"
console.log(result.cfTransferId);   // "665779664"
console.log(result.transferAmount); // "1"
console.log(result.proof);          // Full Reclaim proof object
```

### Prove Transfer Creation

```typescript
const result = await client.proveTransferCreation({
  transferRequest: {
    transfer_id: 'my_transfer_001',
    transfer_amount: 100,
    transfer_mode: 'upi',
    beneficiary_details: {
      beneficiary_instrument_details: {
        vpa: 'user@upi',
      },
    },
  },
  context: {
    contextAddress: '0x0000000000000000000000000000000000000000',
    contextMessage: 'transfer_creation_proof',
  },
});
// WARNING: This actually executes the transfer on Cashfree!
```

### Verify a Proof

```typescript
import { verifyProof } from '@reclaimprotocol/js-sdk';

const isValid = await verifyProof(result.proof);
// true if attestor signature is valid
```

---

## Proof Output Structure

```json
{
  "claimData": {
    "provider": "http",
    "parameters": "{\"method\":\"GET\",\"url\":\"https://sandbox.cashfree.com/payout/transfers?transfer_id=zktls_upi_s_006\",\"responseMatches\":[{\"type\":\"contains\",\"value\":\"\\\"status\\\":\\\"SUCCESS\\\"\"},...],\"responseRedactions\":[{\"jsonPath\":\"$.transfer_id\"},...],...}",
    "owner": "0x7cc82e29510e2ac06fe66cbd2687a8ce3341f7da",
    "timestampS": 1771732991,
    "context": "{\"contextAddress\":\"0x0000000000000000000000000000000000000000\",\"contextMessage\":\"cashfree_transfer_success\",\"extractedParameters\":{\"transfer_id\":\"zktls_upi_s_006\",\"cf_transfer_id\":\"665779664\",\"status\":\"SUCCESS\",\"transfer_amount\":\"1\"},\"providerHash\":\"0x1e1c...\"}"
  },
  "signatures": ["0xe5f8afaf..."],
  "witnesses": [{ "id": "0x244897...", "url": "wss://attestor.reclaimprotocol.org:444/ws" }],
  "extractedParameterValues": {
    "transfer_id": "zktls_upi_s_006",
    "cf_transfer_id": "665779664",
    "status": "SUCCESS",
    "transfer_amount": "1"
  }
}
```

**What's visible in the proof (parameters field):**
- URL: `https://sandbox.cashfree.com/payout/transfers?transfer_id=zktls_upi_s_006`
- Method: `GET`
- Public headers: `Content-Type`, `x-api-version`
- Response match patterns
- Response redaction patterns

**What's NOT in the proof:**
- Bearer token
- Client ID / Client Secret
- X-Cf-Signature
- Full response body (only extracted fields via redactions)

---

## Testing

### Unit Tests (no credentials needed)

```bash
npx vitest run tests/cashfree
```

Runs 18 unit tests covering:
- Client configuration (sandbox/production URL, bearer token in headers)
- Constants validation (domains, auth domains, endpoints, API version)
- Transfer status enum values
- Response extraction patterns (jsonPath, regex)
- Match builder outputs (contains + regex extractors)
- Redaction builder outputs

### Integration Tests (require credentials)

Set up `.env`:
```bash
APP_ID = <Reclaim application ID from dev.reclaimprotocol.org>
APP_SECRET = <Reclaim application secret>
CASHFREE_CLIENT_ID = CF...
CASHFREE_CLIENT_SECRET = cfsk_...
CASHFREE_RSA_PUBLIC_KEY = /path/to/public_key.pem
CASHFREE_BEARER_TOKEN = eyJhbG...  # optional, auto-authorize if omitted
CASHFREE_TEST_TRANSFER_ID_SUCCESS = zktls_upi_s_006
```

Then run:
```bash
npx vitest run tests/cashfree
```

Integration tests (2 additional tests):
1. `should prove transfer with SUCCESS status` — generates zkTLS proof, asserts status = SUCCESS
2. `should extract fields without status assertion` — proves transfer exists, extracts all fields

---

## Environment Setup

### Prerequisites

1. **Reclaim Protocol app** — register at [dev.reclaimprotocol.org](https://dev.reclaimprotocol.org)
2. **Cashfree Payout API credentials** — from Cashfree dashboard
3. **RSA public key** — from Cashfree Dashboard > Developers > Two-Factor Auth
4. **IP whitelisting** (optional) — whitelist your IP in Cashfree dashboard, or use RSA key for X-Cf-Signature

### Sandbox Test Data

- **UPI VPA for success:** `success@upi`
- **Transfer mode:** `upi` (lowercase)
- **Minimum amount:** 1 INR

---

## Commit History

| Commit | Description |
|--------|-------------|
| `32c5179` | feat: Add RSA public key and bearer token to credentials type |
| `d71cea3` | feat: Add Cashfree auth domains and authorize endpoint constant |
| `326552c` | fix: Update transfer creation redactions to flat response structure |
| `6e98510` | feat: Implement bearer token auth with RSA 2FA signature |
| `48c9050` | feat: Export cashfreeAuthorize and CASHFREE_AUTH_DOMAINS |
| `e37ae32` | refactor: Update test helpers with RSA key resolution and bearer token |
| `977542c` | test: Align test suite with updated auth and API structure |
| `877500c` | chore: Update .env.example with RSA key and bearer token vars |
| `41a722b` | fix: Use regex named capture groups for field extraction |
| `a5f2479` | test: Update match builder tests for regex extraction patterns |
