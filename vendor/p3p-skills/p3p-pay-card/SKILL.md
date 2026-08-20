---
name: p3p-pay-card
version: 1.0.0

description: Use when the user wants to pay or set up a card mandate via Pine Labs P3P using PaymentMethod.CARD. Covers mandate creation (checkout_url / OTP), 402 challenge retry, debit capture, and multi-charge for card mandates. Do NOT use for UPI ReservePay or UPI OTM (use p3p-pay-upi), general payment-gateway card payments, or refund flows.
homepage: https://www.pinelabs.com/
author: Pine Labs Online
user-invocable: true
metadata: {"category":"payments","primaryEnv":"SANDBOX","requires":{"env":["PINELABS_CLIENT_ID","PINELABS_CLIENT_SECRET"],"npm":["p3p-server-sdk","p3p-client-sdk"],"pip":["pinelabs-online-p3p-server-sdk","pinelabs-online-p3p-client-sdk"]}}
tags:
  - payments
  - ai-agents
  - card
  - emi
  - mandate
  - x402
  - sdk
---

# P3P Pay — Card Payment Skill

Create a card mandate via Pine Labs P3P and execute a debit. Use this skill when the payment method is `PaymentMethod.CARD`. For UPI mandates (ReservePay or OTM), use [`p3p-pay-upi`](../p3p-pay-upi/SKILL.md).

## When to Activate

Activate this skill when:
- The user asks to pay with a card, set up a card mandate, or block funds via card
- The payment method is (or should be) `PaymentMethod.CARD`
- The user says "pay via card", "card mandate", "EMI mandate", or "block funds on my card"

Do NOT use for UPI ReservePay or UPI OTM mandates — the UPI activation flow is different (QR / deep link, not checkout_url + OTP).

## Prerequisites

Install the P3P runtime SDKs in the target project:

**TypeScript:**
```bash
npm install p3p-server-sdk p3p-client-sdk
```

**Python:**
```bash
pip install pinelabs-online-p3p-server-sdk pinelabs-online-p3p-client-sdk
```

Set credentials server-side (never in chat, logs, committed files, or browser code):

```bash
export PINELABS_CLIENT_ID=your_client_id
export PINELABS_CLIENT_SECRET=your_client_secret
export PINE_LABS_ENV=SANDBOX
```

## Steps to Execute a Card Payment

### 1. Initialize the Server SDK

```ts
import { P3PEnvironment, PaymentGateway, PaymentMethod, PineLabsOnlineP3P } from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.CARD],
  env: P3PEnvironment.SANDBOX,
});
```

```python
from pinelabs_p3p_server import (
    P3PEnvironment, PaymentGateway, PaymentMethod,
    PineLabsOnlineP3P, PineLabsOnlineServerConfig,
)

config = PineLabsOnlineServerConfig(
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
    paymentGateway=PaymentGateway.PineLabsOnline,
    availablePaymentMethods=[PaymentMethod.CARD],
    env=P3PEnvironment.SANDBOX,
)
p3p = PineLabsOnlineP3P.create(config)
```

### Production Gate

Before `createMandate` or capturing a debit, confirm the environment:

```bash
printf 'PINE_LABS_ENV=%s\n' "${PINE_LABS_ENV:-SANDBOX}"
```

Default to `SANDBOX`. If the active environment is `PRODUCTION`, stop and ask for explicit confirmation that includes the amount, customer reference, merchant context, and operation. Do not continue from an implied approval.

### 2. Gather Payment Context

Confirm you have ALL of:
- [ ] Customer reference (e.g. `customer-123`)
- [ ] Mandate amount in **paise** (₹1 = 100 paise, e.g. ₹500 → `50000`)
- [ ] Payment method: `CARD`
- [ ] Validity period in days (optional, defaults apply)
- [ ] Grantex grant token — **required** for P3P txn flows (Grantex surfaces the consent page, daily limit, and per-txn limit). Obtain it from the server-side consent flow (`createGrantexAuthorization` → `exchangeGrantexCode` → `allocateGrantexBudget`).

Card mandates do **not** require a mobile number (unlike UPI). Do NOT call `createMandate` with guessed values.

### 3. Create the Card Mandate

```ts
import { Amount, PaymentMethod } from "p3p-server-sdk";

const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  amount: new Amount(50000, "INR"),     // ₹500.00 in paise
  paymentMethod: PaymentMethod.CARD,
  validityInDays: 30,
});
```

```python
mandate = await p3p.create_mandate(
    customer_reference="customer-ref-123",
    amount=Amount(50000, "INR"),
    payment_method=PaymentMethod.CARD,
    validity_in_days=30,
)
```

Amounts are always in the **smallest currency unit** (paise for INR). `50000` = ₹500.00.

Extract and save from the response:
- `mandate.checkout_url` — Pine Labs Checkout URL the customer must complete (card details + OTP)
- `mandate.mandate_id` — used to poll status via `getMandate(mandate.mandate_id)`; the same value is passed as `authorizationId` when calling `getMandateBalance({ authorizationId: mandate.mandate_id, … })` (note: `getMandateBalance` is unsupported for `PaymentMethod.CARD`)

### 4. Show Checkout URL and Poll for Activation (Card-specific)

This is the card-specific activation step. Open `checkout_url` in a modal, iframe, or redirect — the customer enters card details and completes OTP validation on Pine Labs Checkout. This is **NOT** UPI: there is no QR, no deep_link, no UPI app.

Poll until the mandate is `ACTIVE` (also reported as `AUTHORIZED` / `APPROVED` / `SUCCESS`):

```ts
const status = await p3p.getMandate(mandate.mandate_id);
// repeat until status.order_status === "AUTHORIZED" (a.k.a. ACTIVE)
```

```python
status = await p3p.get_mandate(mandate.mandate_id)
```

> **Sandbox:** In SANDBOX, use the test card bin and OTP listed in [cli-mandates reference](../p3p-pay/references/cli-mandates.md). The mandate reaches `ACTIVE` after the test OTP is accepted.

Do NOT proceed to step 5 until the mandate is `ACTIVE`.

Read [cli-mandates reference](../p3p-pay/references/cli-mandates.md) for all mandate states and error conditions.

### 5. Request the Paid Resource (Client SDK mints PPT on 402)

The client SDK creates a one-shot PPT **only after the server returns a `402` challenge**. Your code just calls the protected route:

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
    paymentMethod: PaymentMethod.CARD,
    grantexToken: user_grant_token,             // required — Grantex consent + limits enforcement
  },
);
```

The client SDK handles the full 402 loop: decode challenge → create token → build `P3P-Credential: Payment <payload>` → retry → read `Payment-Receipt`. Read [cli-tokens reference](../p3p-pay/references/cli-tokens.md) for token usage limits, expiry, and multi-charge semantics.

### 6. Capture the Debit (Server)

On the server route, `decidePayment` / `decide_payment` handles challenge, credential verification, debit capture, pending status, and receipt generation in one call:

```ts
import { Amount, ChargeOptions, decidePayment, PaymentGateway, PaymentMethod, P3PEnvironment } from "p3p-server-sdk";

const decision = await decidePayment({
  credentialHeader: request.headers.get("P3P-Credential") ?? undefined,
  grantexTokenHeader: request.headers.get("X-Grantex-Token") ?? undefined,
  config: {
    clientId: process.env.PINELABS_CLIENT_ID!,
    clientSecret: process.env.PINELABS_CLIENT_SECRET!,
    paymentGateway: PaymentGateway.PineLabsOnline,
    availablePaymentMethods: [PaymentMethod.CARD],
    env: P3PEnvironment.SANDBOX,
  },
  chargeOptions: new ChargeOptions(new Amount(10000, "INR"), "/api/premium"),
});

if (decision.action === "proceed") {
  // success: decision.headers contains Payment-Receipt
}
if (decision.action === "pending") {
  // 202 — store decision.problemDetails.idempotencyKey and poll
}
```

Read [cli-debit reference](../p3p-pay/references/cli-debit.md) for the receipt format, pending debit polling, and error handling.

## After Debit: Confirm the Transaction

Once the debit succeeds, confirm to the user:
- The debited amount (₹100.00, not paise)
- The capture/debit ID (for support/reconciliation)
- The receipt token if returned

Do NOT ask the user anything between steps 3 and 6. The flow is a single unbreakable sequence.

## Fetch Mandate Balance

`getMandateBalance` / `get_mandate_balance` is **not supported for `PaymentMethod.CARD`**. Skip this step entirely for card mandates — per [P3P SDK docs](https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks), mandate balance lookup currently supports only `PaymentMethod.RESERVE_PAY`. To inspect card mandate state, poll `getMandate(mandate.mandate_id)` until `order_status` is `AUTHORIZED`/`ACTIVE` and rely on the debit receipt from `decidePayment` for spend accounting.

## Multi-Charge Flow (Card repeat debits)

A multi-charge token allows repeated debits while:
- `usage.amount_used` + new debit amount ≤ `usage_limits.max_amount`
- `usage.charges_made` < `usage_limits.max_charges`
- Token has not expired

For each subsequent charge, call `client.get(...)` again (step 5). The client SDK mints a fresh one-shot token per challenge; the card mandate stays active across charges until it expires or is revoked.

## Card-Specific Activation Differences (vs UPI)

| | `CARD` | UPI (`RESERVE_PAY` / `OTM`) |
|---|---|---|
| Activation UI | `checkout_url` → modal/iframe/redirect, card details + OTP | `deep_link` QR → UPI app scan |
| Customer input | Card number, CVV, OTP | UPI PIN (in their UPI app) |
| Customer identifier | `customerReference` | `mobileNumber` (10-digit) |
| Mandate balance lookup | Not supported (skip this step) | ReservePay: supported; OTM: not supported |

Both card and UPI mandates use the same `createMandate` → poll until `ACTIVE` → paid route → `decidePayment` skeleton. The differences are confined to the activation step (step 4) and the customer identifier.

## Anti-Patterns

- Calling `createMandate` before credentials are set.
- Proceeding to the paid route before the mandate is `ACTIVE`.
- Treating the `checkout_url` as a UPI deep link (or vice versa).
- Asking the user to type their card number, CVV, or OTP in chat — Pine Labs Checkout handles card entry securely.
- Guessing or hallucinating customerReference, amount, or validity.
- Using paise values as rupees (₹500 ≠ 500 paise — use 50000 paise).
- Instantiating `p3p-client-sdk` in browser code when your integration uses `clientSecret`.
- Passing `PaymentMethod.RESERVE_PAY` or `PaymentMethod.OTM` in this skill's flow.
- Calling `getMandateBalance` for `CARD` — only `RESERVE_PAY` is supported. Skip the balance step for card mandates; poll `getMandate(mandate.mandate_id)` for `order_status` and rely on the debit receipt from `decidePayment` for spend accounting.

---

*Built by [Pine Labs Online](https://www.pinelabs.com/) — x402 payment infrastructure for AI agents.*
