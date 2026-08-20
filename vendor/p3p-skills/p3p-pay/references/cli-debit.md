# P3P Debit Execution and Receipt (Server SDK)

## What is a Debit?

A debit executes a UPI ReservePay charge against a mandate using a valid PPT token. It withdraws the specified amount from the funds that were pre-authorized (blocked) in the mandate.

## Capturing a Debit

On the server route, use the framework-agnostic `decidePayment` / `decide_payment` helper. It handles the full server-side decision tree: 402 challenge when no credential is present, credential verification, debit capture, pending status, and receipt generation.

```ts
import { Amount, ChargeOptions, decidePayment, PaymentGateway, PaymentMethod, P3PEnvironment } from "p3p-server-sdk";

const decision = await decidePayment({
  credentialHeader: request.headers.get("P3P-Credential") ?? undefined,
  grantexTokenHeader: request.headers.get("X-Grantex-Token") ?? undefined,
  config: {
    clientId: process.env.PINELABS_CLIENT_ID!,
    clientSecret: process.env.PINELABS_CLIENT_SECRET!,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
    env: P3PEnvironment.SANDBOX,
  },
  chargeOptions: new ChargeOptions(new Amount(10000, "INR"), "/api/premium"),
});
```

```python
from pinelabs_p3p_server import (
    Amount, ChargeOptions, PaymentGateway, PaymentMethod,
    P3PEnvironment, decide_payment,
)

decision = await decide_payment(
    credential_header=request.headers.get("P3P-Credential"),
    grantex_token_header=request.headers.get("X-Grantex-Token"),
    config=config,
    charge_options=ChargeOptions(Amount(10000, "INR"), "/api/premium"),
)
```

### ChargeOptions

| Field | Required | Description |
|------|----------|-------------|
| amount (`Amount`) | Yes | Actual debit amount in paise via `Amount(value, "INR")`. Must be ≤ token `max_amount`. |
| resource path | Yes | The route being paid for (used in challenge signing) |

### Decision actions

| `decision.action` | Status | Meaning |
|---|---|---|
| `proceed` | 200 | Credential verified and debit captured — return the resource with `Payment-Receipt` from `decision.headers` |
| `challenge` | 402 | No `P3P-Credential` present — return `decision.headers` (`WWW-Authenticate`) so the client SDK can retry with a token |
| `pending` | 202 | Debit accepted, settlement in progress — store `decision.problemDetails.idempotencyKey` and poll |

## Receipt

```
Status:         SUCCESS
Debit ID:       dbt-v1-260405110000-ab-Kx9pQr
Amount:         ₹100.00 (10000 paise)
Payment Method: RESERVE_PAY
Mandate:        pm-v1-260405100000-ab-RBDgpR
Receipt:        rcpt_live_eyJhbGciOiJIUzI1NiIs...
Timestamp:      2026-04-05T11:00:00Z
```

The receipt is returned in the `Payment-Receipt` response header (part of `decision.headers`). `decision.captureResult` includes `debit_id`, `status`, `amount`, and `idempotency_key`.

**Key fields (TypeScript):**
- `decision.captureResult.debitId` / `debit_id` — unique debit identifier for reconciliation and support
- `decision.captureResult.status` — `SUCCESS`, `PENDING`, or `FAILED`
- `decision.captureResult.receipt` — settlement receipt token
- `decision.captureResult.amount.value` — confirmed debited amount in paise

## Debit Status Values

| Status | Meaning | Action |
|---|---|---|
| `SUCCESS` | Debit executed and confirmed | Proceed — transaction complete |
| `PENDING` | Debit accepted, UPI settlement in progress | Poll `getDebitStatus(idemKey)` |
| `FAILED` | Debit rejected or failed | Check error code; retry if idempotent error |

## Idempotency

`decidePayment` generates an idempotency key automatically and exposes it when pending (`decision.problemDetails.idempotencyKey`). Reusing the same key on retry returns the same debit result without a second charge. Do not change the amount on retry.

## Pending Debits

When `decision.action === "pending"` (202), store the idempotency key and poll:

```ts
const latest = await p3p.getDebitStatus("idem_key_123");
if (latest.status === "SUCCESS") { /* mark order paid */ }
if (latest.status === "FAILED")  { /* mark order failed, show diagnostics */ }
```

```python
latest = await p3p.get_debit_status("idem_key_123")
```

Once ReservePay debit is confirmed by NPCI, status transitions to `SUCCESS`.

## Error Responses

| Error Code | Cause |
|---|---|
| `MPP_TOKEN_EXPIRED` | PPT token has passed its `expires_at` — the client SDK mints a fresh one on the next 402 |
| `MPP_TOKEN_EXHAUSTED` | Token `max_amount` or `max_charges` already reached |
| `MPP_AMOUNT_EXCEEDS_LIMIT` | Debit amount > token `usage_limits.max_amount` |
| `MPP_MANDATE_INSUFFICIENT_FUNDS` | Mandate `amount_remaining` too low |
| `MPP_DUPLICATE_REQUEST` | Same idempotency key, different amount — do not change the amount on retry |
| `MPP_DEBIT_FAILED` | UPI ReservePay debit rejected by bank (insufficient balance, bank error) |
| `MPP_INTERNAL_ERROR` | Server error — safe to retry with same idempotency key |

## Pending Debit Status Polling

Use `getDebitStatus` / `get_debit_status` with the idempotency key from the pending decision:

```ts
const latest = await p3p.getDebitStatus("idem_key_123");
```

Keep polling until `status` is `SUCCESS` or `FAILED`.
