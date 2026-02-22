import { CashfreeTransferStatus } from './types';

/**
 * Response redaction patterns for extracting fields from Cashfree responses.
 *
 * Uses jsonPath for structural stability — immune to field ordering,
 * whitespace, and new fields being added to the response.
 */

/** Redaction patterns for GET /payout/transfers?transfer_id=xxx */
export const TRANSFER_STATUS_REDACTIONS = {
  transferId: { jsonPath: '$.transfer_id' },
  cfTransferId: { jsonPath: '$.cf_transfer_id' },
  status: { jsonPath: '$.status' },
  transferAmount: { jsonPath: '$.transfer_amount' },
} as const;

/** Redaction patterns for POST /payout/transfers (creation response — flat structure) */
export const TRANSFER_CREATION_REDACTIONS = {
  transferId: { jsonPath: '$.transfer_id' },
  cfTransferId: { jsonPath: '$.cf_transfer_id' },
  status: { jsonPath: '$.status' },
  statusCode: { jsonPath: '$.status_code' },
} as const;

/**
 * Regex-based fallback patterns in case jsonPath is not supported
 * by the attestor at runtime. These use named capture groups for extraction.
 */
export const TRANSFER_STATUS_REGEX_FALLBACKS = {
  transferId: { regex: '"transfer_id"\\s*:\\s*"(?<transfer_id>[^"]+)"' },
  status: { regex: '"status"\\s*:\\s*"(?<status>[^"]+)"' },
  cfTransferId: { regex: '"cf_transfer_id"\\s*:\\s*"(?<cf_transfer_id>[^"]+)"' },
  transferAmount: { regex: '"transfer_amount"\\s*:\\s*(?<transfer_amount>[\\d.]+)' },
} as const;

/** Build responseRedactions for transfer status proofs */
export function getTransferStatusRedactions(
  additionalExtractions?: Array<{ jsonPath?: string; regex?: string }>
) {
  const defaults = [
    TRANSFER_STATUS_REDACTIONS.transferId,
    TRANSFER_STATUS_REDACTIONS.cfTransferId,
    TRANSFER_STATUS_REDACTIONS.status,
    TRANSFER_STATUS_REDACTIONS.transferAmount,
  ];

  if (additionalExtractions && additionalExtractions.length > 0) {
    return [...defaults, ...additionalExtractions];
  }
  return defaults;
}

/** Build responseRedactions for transfer creation proofs */
export function getTransferCreationRedactions() {
  return [
    TRANSFER_CREATION_REDACTIONS.transferId,
    TRANSFER_CREATION_REDACTIONS.cfTransferId,
    TRANSFER_CREATION_REDACTIONS.status,
    TRANSFER_CREATION_REDACTIONS.statusCode,
  ];
}

/**
 * Build responseMatches for transfer status validation and extraction.
 *
 * Named capture groups in regex patterns populate `extractedParameters`
 * on the proof. This is how the attestor exposes field values.
 *
 * When expectedStatus is provided, we use a contains match to assert it,
 * plus regex patterns to extract all fields.
 */
export function getTransferStatusMatches(expectedStatus?: CashfreeTransferStatus) {
  const matches: Array<{ type: 'regex' | 'contains'; value: string }> = [];

  if (expectedStatus) {
    matches.push({
      type: 'contains',
      value: `"status":"${expectedStatus}"`,
    });
  }

  // Extract key fields using named capture groups
  matches.push({
    type: 'regex',
    value: '"transfer_id"\\s*:\\s*"(?<transfer_id>[^"]+)"',
  });
  matches.push({
    type: 'regex',
    value: '"cf_transfer_id"\\s*:\\s*"(?<cf_transfer_id>[^"]+)"',
  });
  matches.push({
    type: 'regex',
    value: '"status"\\s*:\\s*"(?<status>[^"]+)"',
  });
  matches.push({
    type: 'regex',
    value: '"transfer_amount"\\s*:\\s*(?<transfer_amount>[\\d.]+)',
  });

  return matches;
}

/** Build responseMatches for transfer creation validation and extraction */
export function getTransferCreationMatches() {
  return [
    {
      type: 'contains' as const,
      value: '"cf_transfer_id"',
    },
    {
      type: 'regex' as const,
      value: '"transfer_id"\\s*:\\s*"(?<transfer_id>[^"]+)"',
    },
    {
      type: 'regex' as const,
      value: '"cf_transfer_id"\\s*:\\s*"(?<cf_transfer_id>[^"]+)"',
    },
    {
      type: 'regex' as const,
      value: '"status"\\s*:\\s*"(?<status>[^"]+)"',
    },
    {
      type: 'regex' as const,
      value: '"status_code"\\s*:\\s*"(?<status_code>[^"]+)"',
    },
  ];
}
