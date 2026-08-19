# P3P CLI — PPT Token Creation

## What is a PPT Token?

A PPT (Pine Labs Payment Token) is a scoped, short-lived credential that the client agent mints from an authorized mandate and shares with a server agent or resource API. It grants the server permission to debit a specific amount from the mandate, up to defined usage limits.

The PPT is the **x402 payment credential** — the client proves authorization by presenting it.

## Prerequisites

The mandate's `order_status` must be `"AUTHORIZED"` before creating a token. If the mandate is still `CREATED` (QR not yet scanned), token creation will fail with `MPP_MANDATE_NOT_AUTHORIZED`.

## Creating a Token

```bash
p3p tokens create \
  --challenge-id <payment_method_id> \
  --mobile-number 9876543210 \
  --amount 10000 \
  --json
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--challenge-id <id>` | Yes | The `payment_method_id` from the mandate |
| `--amount <paise>` | Yes | Maximum amount this token authorizes (paise). Must be ≤ mandate `amount_remaining` |
| `--payment-method <method>` | No | `RESERVE_PAY`, `OTM`, or `Crypto` (default: `RESERVE_PAY`). Must match mandate payment method. |
| `--mobile-number <number>` | No | Customer mobile number (required in client-credentials mode) |
| `--customer-reference <ref>` | No | Your internal customer reference |
| `--currency <code>` | No | Currency code, default `INR` |
| `--json` | No | Output raw JSON |

### Example Response (JSON)

```json
{
  "data": {
    "token_id": "ppt-v1-260405100500-ab-Jn3xRt",
    "object": "plural_payment_token",
    "payment_method_id": "pm-v1-260405100000-ab-RBDgpR",
    "token": "ppt_live_eyJhbGciOiJIUzI1NiIs...",
    "usage_limits": {
      "max_amount": 10000,
      "currency": "INR",
      "max_charges": null,
      "expires_at": "2026-04-05T12:00:00Z"
    },
    "usage": {
      "amount_used": 0,
      "charges_made": 0
    },
    "created_at": "2026-04-05T10:05:00Z"
  }
}
```

**Key fields to extract:**
- `data.token` — the PPT string. Pass this as `--token` in `p3p debit`.
- `data.token_id` — unique token identifier for lookups.
- `data.usage_limits.expires_at` — token expiry. Complete debit before this time.

## Token Prefixes

| Prefix | Environment |
|---|---|
| `ppt_live_` | Production |
| `ppt_test_` | Sandbox |

## Usage Limits

| Field | Meaning |
|---|---|
| `max_amount` | Maximum total paise that can be debited via this token |
| `max_charges` | Maximum number of debits allowed (`null` = unlimited) |
| `expires_at` | Token expiry — must be ≤ mandate `expires_at` |

After each debit, `usage.amount_used` increases. When `amount_used >= max_amount` or `charges_made >= max_charges`, the token is exhausted and cannot be used for further debits.

## Token Expiry

Tokens expire at `usage_limits.expires_at`. Complete debit(s) before this time. Expired tokens return `MPP_TOKEN_EXPIRED` on debit.

For short transactions, set `expires_at` to 30–60 minutes from now. For longer-running agent sessions, set a larger window — up to the mandate's `expires_at`.

## Error Responses

| Error Code | Step | Cause |
|---|---|---|
| `MPP_MANDATE_NOT_AUTHORIZED` | `MANDATE_VALIDATION` | Mandate not in AUTHORIZED state (QR not yet scanned) |
| `MPP_MANDATE_NOT_FOUND` | `MANDATE_LOOKUP` | `payment_method_id` does not exist |
| `MPP_AMOUNT_EXCEEDS_LIMIT` | `TOKEN_VALIDATION` | `--amount` exceeds mandate `amount_remaining` |
| `MPP_MANDATE_EXPIRED` | `TOKEN_VALIDATION` | Mandate has expired |
| `MPP_VALIDATION_FAILED` | `TOKEN_CREATION` | Missing required fields or bad format |

## Multi-Charge Tokens

A single token can cover multiple debits if the server charges less than `max_amount` per request. Example:

```bash
# Create a token for up to 5 charges totalling ₹100
p3p tokens create \
  --challenge-id pm-v1-... \
  --mobile-number 9876543210 \
  --amount 10000 \
  --json
```

Each `p3p debit` call against this token decrements `usage.amount_used` and increments `usage.charges_made`. The token remains active until exhausted or expired.
