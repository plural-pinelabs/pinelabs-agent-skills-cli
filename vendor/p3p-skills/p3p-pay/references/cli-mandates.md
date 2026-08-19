# P3P CLI — Mandate States and QR Flow

## What is a Mandate?

A mandate is a UPI ReservePay pre-authorization. It blocks a specified amount in the customer's bank account. The blocked amount can then be debited in one or more charges (up to the blocked limit) without requiring the customer to approve each individual payment.

The mandate is the **x402 challenge** step — the customer proves they can pay by blocking funds.

## Creating a Mandate

```bash
p3p mandates create \
  --mobile-number 9876543210 \
  --amount 50000 \
  --description "Payment for API credits" \
  --json
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--mobile-number <number>` | Yes | Customer mobile number, 10 digits (no `+91`) |
| `--amount <paise>` | Yes | Mandate amount in paise (₹1 = 100 paise) |
| `--currency <code>` | No | Currency code, default `INR` |
| `--payment-method <method>` | No | `RESERVE_PAY`, `OTM`, or `Crypto` (default: `RESERVE_PAY`) |
| `--description <text>` | No | Human-readable mandate purpose |
| `--validity-days <days>` | No | Mandate validity in days, default `7`, max `30` |
| `--customer-reference <ref>` | No | Your internal customer reference |
| `--metadata <json>` | No | JSON metadata string |
| `--server-url <url>` | No | Use a local playground server proxy instead of direct SDK call |
| `--poll` | No | Poll for mandate approval after creation (default: `true`) |
| `--no-poll` | No | Disable auto-polling |
| `--poll-interval <ms>` | No | Polling interval in milliseconds (default: 2000) |
| `--poll-timeout <ms>` | No | Max polling duration in milliseconds (default: 120000 = 2 min) |
| `--json` | No | Output raw JSON |

### Example Response (JSON)

```json
{
  "data": {
    "payment_method_id": "pm-v1-260405100000-ab-RBDgpR",
    "object": "mandate",
    "order_status": "CREATED",
    "payment_status": "PAYMENT_PENDING",
    "amount": { "value": 50000, "currency": "INR" },
    "amount_blocked": 0,
    "amount_debited": 0,
    "amount_remaining": 50000,
    "challenge": {
      "type": "upi_qr",
      "qr_url": "https://api.plural.in/qr/pm-v1-260405100000-ab-RBDgpR",
      "deep_link": "upi://pay?pa=plural@upi&pn=Pine+Labs+Online&am=500&cu=INR",
      "expires_at": "2026-04-05T10:30:00Z"
    },
    "mobile_number": "+919876543210",
    "expires_at": "2026-04-12T00:00:00Z",
    "created_at": "2026-04-05T10:00:00Z"
  }
}
```

**Key fields to extract:**
- `data.payment_method_id` — use this as `--challenge-id` in all subsequent token and debit commands
- `data.challenge.qr_url` — show to user for scanning
- `data.challenge.deep_link` — use for mobile UPI app deep links
- `data.challenge.expires_at` — QR code validity (typically 30 minutes)
- `data.expires_at` — mandate validity window

## Polling Mandate Status

By default, `p3p mandates create` **auto-polls** for mandate approval after creation (up to 2 minutes). You do not need a separate poll loop unless you passed `--no-poll`.

To poll manually:

```bash
p3p mandates get <payment_method_id> --json
```

Poll until `order_status === "AUTHORIZED"`. The default auto-poll checks every 2 seconds for up to 2 minutes.

> **Sandbox note:** In SANDBOX, the mandate QR URL is auto-approved — no real UPI scan is needed. The mandate transitions to `AUTHORIZED` automatically after creation. Polling still works but will resolve almost immediately.

## Mandate Status States

| `order_status` | `payment_status` | Meaning | Action |
|---|---|---|---|
| `CREATED` | `PAYMENT_PENDING` | Mandate created, QR not yet scanned | Show QR, keep polling |
| `AUTHORIZED` | `PAYMENT_SUCCESS` | User scanned QR, funds blocked | **Proceed to token creation** |
| `CLOSED` | `PAYMENT_SUCCESS` | Mandate fully debited and closed | No further debits possible |
| `CLOSED` | `PAYMENT_FAILED` | Mandate failed or expired | Start over with a new mandate |
| `FAILED` | `PAYMENT_FAILED` | Block failed (insufficient funds, bank error) | Inform user, start over |

## Sandbox Debit Simulation

In SANDBOX, debit outcomes are determined by the transaction amount:

| Amount | Result |
|---|---|
| < ₹2 (< 200 paise) | **Fail** |
| ₹2 – ₹4.99 (200–499 paise) | **Pending → Success** (poll `p3p mandates get` or debit status) |
| ≥ ₹5 (≥ 500 paise) | **Success** |

## Mandate Balance

Fetch the current blocked, debited, and remaining balance for an active mandate:

```bash
p3p mandates balance \
  --authorization-id pm-v1-260405100000-ab-RBDgpR \
  --phone-number 9876543210 \
  --json
```

| Flag | Required | Description |
|------|----------|-------------|
| `--authorization-id <id>` | Yes | Mandate / authorization ID |
| `--phone-number <number>` | Yes | Customer mobile number |
| `--payment-method <method>` | No | `RESERVE_PAY` only (default: `RESERVE_PAY`) |
| `--json` | No | Output raw JSON |

**Note:** Currently supports `RESERVE_PAY` only.

## Revoke Mandate

Revoke (cancel) an active mandate:

```bash
p3p mandates revoke \
  --payment-method RESERVE_PAY \
  --payment-method-reference-id pm-v1-260405100000-ab-RBDgpR \
  --json
```

| Flag | Required | Description |
|------|----------|-------------|
| `--payment-method <method>` | Yes | `RESERVE_PAY`, `OTM`, or `Crypto` |
| `--payment-method-reference-id <id>` | No* | Mandate reference ID |
| `--mobile-number <number>` | No* | Customer mobile number |
| `--customer-reference <ref>` | No* | Merchant customer reference |
| `--json` | No | Output raw JSON |

*At least one of `--payment-method-reference-id`, `--mobile-number`, or `--customer-reference` is required.

## QR Expiry vs Mandate Expiry

- **QR expiry** (`challenge.expires_at`): The UPI QR code validity — typically 30 minutes. If the user does not scan within this window, the mandate remains in `CREATED` state but the QR is no longer scannable. Create a new mandate.
- **Mandate expiry** (`expires_at`): The overall mandate validity — default 7 days. Debits can be executed against an `AUTHORIZED` mandate until this timestamp.

## Amount Fields

| Field | Meaning |
|---|---|
| `amount.value` | Total blocked amount in paise |
| `amount_blocked` | Confirmed amount blocked by the bank (0 until AUTHORIZED) |
| `amount_debited` | Cumulative amount debited so far |
| `amount_remaining` | `amount_blocked - amount_debited` — available for future debits |

## Error Responses

| Error Code | Step | Cause |
|---|---|---|
| `MPP_VALIDATION_FAILED` | `MANDATE_CREATION` | Invalid mobile number, missing fields, bad amount |
| `MPP_DUPLICATE_REQUEST` | `IDEMPOTENCY_CHECK` | Same `Idempotency-Key` with different payload |
| `MPP_MERCHANT_NOT_ELIGIBLE` | `MERCHANT_VALIDATION` | Merchant not enabled for UPI ReservePay |
| `MPP_INTERNAL_ERROR` | `MANDATE_CREATION` | Server error — retry |

## Local Playground

Test mandate flows locally without real UPI:

```bash
p3p playground start
p3p trigger mandate.created
p3p trigger mandate.authorized
```

The playground returns mock mandate objects with `SANDBOX`-prefixed IDs.
