# P3P Mandate States and QR Flow (Server SDK)

## What is a Mandate?

A mandate is a UPI ReservePay pre-authorization. It blocks a specified amount in the customer's bank account. The blocked amount can then be debited in one or more charges (up to the blocked limit) without requiring the customer to approve each individual payment.

The mandate is the **x402 challenge** step — the customer proves they can pay by blocking funds.

## Creating a Mandate

Use `p3p-server-sdk` (TypeScript) or `pinelabs-online-p3p-server-sdk` (Python):

```ts
import { Amount, PaymentMethod, PineLabsOnlineP3P } from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create(config);

const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
  amount: new Amount(50000, "INR"),     // ₹500.00 in paise
  paymentMethod: PaymentMethod.RESERVE_PAY,
  // For cards use PaymentMethod.CARD; for UPI OTM use PaymentMethod.OTM
});
```

```python
from pinelabs_p3p_server import (
    Amount, PaymentMethod, PineLabsOnlineP3P,
)

p3p = PineLabsOnlineP3P.create(config)

mandate = await p3p.create_mandate(
    customer_reference="customer-ref-123",
    mobile_number="9876543210",
    amount=Amount(50000, "INR"),
    payment_method=PaymentMethod.RESERVE_PAY,
)
```

### Options

| Option | Required | Description |
|------|----------|-------------|
| `mobileNumber` / `mobile_number` | Yes | Customer mobile number, 10 digits (no `+91`) |
| `amount` (`Amount`) | Yes | Mandate amount in paise via `Amount(value, "INR")` (₹1 = 100 paise) |
| `paymentMethod` / `payment_method` | No | `PaymentMethod.RESERVE_PAY` (default), `PaymentMethod.OTM`, or `PaymentMethod.CARD` |
| `customerReference` / `customer_reference` | No | Your internal customer reference |
| `metadata` | No | Object of arbitrary metadata |

### Response shape

```json
{
  "authorizationId": "pm-v1-260405100000-ab-RBDgpR",
  "object": "mandate",
  "order_status": "CREATED",
  "payment_status": "PAYMENT_PENDING",
  "amount": { "value": 50000, "currency": "INR" },
  "amount_blocked": 0,
  "amount_debited": 0,
  "amount_remaining": 50000,
  "deep_link": "upi://pay?pa=plural@upi&pn=Pine+Labs+Online&am=500&cu=INR",
  "checkout_url": "https://api.pluralpay.in/checkout/pm-v1-...",
  "mobile_number": "+919876543210",
  "expires_at": "2026-04-12T00:00:00Z",
  "created_at": "2026-04-05T10:00:00Z"
}
```

**Key fields to extract:**
- `authorizationId` / `payment_method_id` — used to poll status and fetch balance
- `deep_link` — UPI intent URL; encode into a QR for the customer to scan (`upi://pay?...`)
- `checkout_url` — present for card mandates; show in a modal/iframe
- `expires_at` — mandate validity window

## Polling Mandate Status

Poll until `order_status` is `ACTIVE` (also reported as `AUTHORIZED` / `APPROVED` / `SUCCESS`):

```ts
const status = await p3p.getMandate(mandate.mandate_id);
// repeat until status.order_status === "AUTHORIZED" (a.k.a. ACTIVE)
```

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
