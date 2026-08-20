# P3P PPT Token Creation (Client SDK)

## What is a PPT Token?

A PPT (Pine Labs Payment Token) is a scoped, short-lived credential that the client mints from an ACTIVE mandate and shares with the server as `P3P-Credential: Payment <payload>`. It grants the server permission to debit a specific amount from the mandate, up to defined usage limits.

The PPT is the **x402 payment credential** — the client proves authorization by presenting it.

## How Tokens Are Created

The client SDK creates the one-shot PPT **automatically** after the server returns a `402 Payment Required` challenge. You do not mint tokens manually in normal flows — just call the protected route and the client SDK handles challenge decode, token creation, credential header, retry, and receipt parsing:

```ts
import { P3PEnvironment, PaymentMethod, PineLabsOnlineClient } from "p3p-client-sdk";

const client = PineLabsOnlineClient.create({
  env: P3PEnvironment.SANDBOX,
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
});

const response = await client.get(
  "https://merchant.example.com/api/premium",
  {},
  {
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
    grantexToken: user_grant_token,   // required — Grantex consent + per-txn/daily limits enforcement
  },
);
```

For manual flows (rare), use `client.methods.createToken(...)`.

## Prerequisites

The mandate must be `ACTIVE` before the paid route can complete. If the mandate is still `CREATED` (QR not yet scanned / card authorization incomplete), the 402 retry will fail with `MPP_MANDATE_NOT_AUTHORIZED`.

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
