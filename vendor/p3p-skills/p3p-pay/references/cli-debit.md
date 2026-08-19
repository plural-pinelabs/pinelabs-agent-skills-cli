# P3P CLI — Debit Execution and Receipt

## What is a Debit?

A debit executes a UPI ReservePay charge against a mandate using a valid PPT token. It withdraws the specified amount from the funds that were pre-authorized (blocked) in the mandate.

## Executing a Debit

```bash
p3p debit execute \
  --token <ppt_token> \
  --challenge-id <payment_method_id> \
  --mobile-number 9876543210 \
  --amount 10000 \
  --json
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--token <value>` | Yes | The PPT token string (`ppt_live_...` or `ppt_test_...`) |
| `--challenge-id <id>` | Yes | The `payment_method_id` from the mandate |
| `--amount <paise>` | Yes | Actual debit amount in paise. Must be ≤ token `max_amount` |
| `--payment-method <method>` | No | `RESERVE_PAY`, `OTM`, or `Crypto` (default: `RESERVE_PAY`) |
| `--mobile-number <number>` | No | Customer mobile number |
| `--customer-reference <ref>` | No | Your internal customer reference |
| `--currency <code>` | No | Currency code, default `INR` |
| `--description <text>` | No | Payment description |
| `--metadata <json>` | No | JSON metadata string |
| `--idempotency-key <key>` | No | UUID v4 — prevents duplicate debits on retry. Recommended. |
| `--json` | No | Output raw JSON |

## Example Output (pretty)

```
Status:         SUCCESS
Debit ID:       dbt-v1-260405110000-ab-Kx9pQr
Amount:         ₹100.00 (10000 paise)
Payment Method: RESERVE_PAY
Mandate:        pm-v1-260405100000-ab-RBDgpR
Receipt:        rcpt_live_eyJhbGciOiJIUzI1NiIs...
Timestamp:      2026-04-05T11:00:00Z
```

## Example Response (JSON)

```json
{
  "data": {
    "debit_id": "dbt-v1-260405110000-ab-Kx9pQr",
    "object": "debit",
    "status": "SUCCESS",
    "payment_method_id": "pm-v1-260405100000-ab-RBDgpR",
    "amount": { "value": 10000, "currency": "INR" },
    "payment_method": "RESERVE_PAY",
    "receipt": "rcpt_live_eyJhbGciOiJIUzI1NiIs...",
    "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
    "created_at": "2026-04-05T11:00:00Z"
  }
}
```

**Key fields:**
- `data.debit_id` — unique debit identifier for reconciliation and support
- `data.status` — `SUCCESS`, `PENDING`, or `FAILED`
- `data.receipt` — settlement receipt token; pass to the resource server as proof of payment
- `data.amount.value` — confirmed debited amount in paise

## Debit Status Values

| Status | Meaning | Action |
|---|---|---|
| `SUCCESS` | Debit executed and confirmed | Proceed — transaction complete |
| `PENDING` | Debit accepted, UPI settlement in progress | Poll `p3p debit status <debit_id>` |
| `FAILED` | Debit rejected or failed | Check error code; retry if idempotent error |

## Idempotency

Always pass `--idempotency-key <uuid>` for production debits. Using the same key on retry returns the same debit result without executing a second charge. Generate a UUID v4:

```bash
p3p debit \
  --token ppt_live_... \
  --challenge-id pm-v1-... \
  --mobile-number 9876543210 \
  --amount 10000 \
  --idempotency-key "$(uuidgen | tr '[:upper:]' '[:lower:]')" \
  --json
```

## Pending Debits

If status is `PENDING` (UPI settlement processing), the SDK retries automatically with the same idempotency key. In the CLI you can check status:

```bash
p3p debit status <debit_id> --json
```

Once ReservePay debit is confirmed by NPCI, status transitions to `SUCCESS`.

## Error Responses

| Error Code | Cause |
|---|---|
| `MPP_TOKEN_EXPIRED` | PPT token has passed its `expires_at` — create a new token |
| `MPP_TOKEN_EXHAUSTED` | Token `max_amount` or `max_charges` already reached |
| `MPP_AMOUNT_EXCEEDS_LIMIT` | Debit amount > token `usage_limits.max_amount` |
| `MPP_MANDATE_INSUFFICIENT_FUNDS` | Mandate `amount_remaining` too low |
| `MPP_DUPLICATE_REQUEST` | Same idempotency key, different amount — do not change the amount on retry |
| `MPP_DEBIT_FAILED` | UPI ReservePay debit rejected by bank (insufficient balance, bank error) |
| `MPP_INTERNAL_ERROR` | Server error — safe to retry with same idempotency key |

## Pending Debit Status

When a debit returns `PENDING` (202), poll its status using the idempotency key:

```bash
p3p debit status <idempotency_key> --json
```

Keep polling until `status` is `SUCCESS` or `FAILED`.

| Flag | Required | Description |
|------|----------|-------------|
| `<idempotency_key>` | Yes | The idempotency key used in the original debit |
| `--json` | No | Output raw JSON |

## Sandbox Debit Simulation

In SANDBOX, debit outcomes are determined by the **transaction amount**:

| Amount | Result |
|---|---|
| < ₹2 (< 200 paise) | **Fail** — debit returns failure |
| ₹2 – ₹4.99 (200–499 paise) | **Pending → Success** — debit returns pending; poll `p3p debit status <debit_id>` until SUCCESS |
| ≥ ₹5 (≥ 500 paise) | **Success** — debit completes immediately |

## Amount Rules

- Debit `--amount` must be in **paise** (₹1 = 100 paise).
- Debit amount must be ≤ token `usage_limits.max_amount`.
- Debit amount must be ≤ mandate `amount_remaining`.
- Multiple debits against the same mandate are allowed until `amount_remaining = 0`.

## After Debit

Present to the user:
1. Debited amount (convert from paise: `value / 100` → rupees)
2. `debit_id` for reference
3. Confirmation that the transaction is complete

The `receipt` token can optionally be sent to the resource server as proof of payment for x402-protected APIs.
