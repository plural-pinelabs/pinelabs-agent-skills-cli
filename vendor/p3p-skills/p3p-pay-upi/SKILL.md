---
name: p3p-pay-upi
version: 1.0.0

description: Use when the user wants to pay or set up recurring payments via UPI ReservePay or UPI OTM with Pine Labs P3P. Covers mandate creation (QR / deep_link), 402 challenge retry, debit capture, and mandate balance for UPI-based payment methods (PaymentMethod.RESERVE_PAY or PaymentMethod.OTM). Do NOT use for card mandates (use p3p-pay-card), general payment-gateway work, or peer-to-peer UPI transfers.
homepage: https://www.pinelabs.com/
author: Pine Labs Online
user-invocable: true
metadata: {"category":"payments","primaryEnv":"SANDBOX","requires":{"env":["PINELABS_CLIENT_ID","PINELABS_CLIENT_SECRET"],"npm":["p3p-server-sdk","p3p-client-sdk"],"pip":["pinelabs-online-p3p-server-sdk","pinelabs-online-p3p-client-sdk"]}}
tags:
  - payments
  - ai-agents
  - upi
  - reservepay
  - otm
  - x402
  - mandate
  - sdk
---

# P3P Pay — UPI (ReservePay / OTM) Payment Skill

Create a UPI mandate via Pine Labs P3P and execute a debit. Use this skill when the payment method is `PaymentMethod.RESERVE_PAY` (UPI ReservePay) or `PaymentMethod.OTM` (UPI One-Time Mandate). For card mandates, use [`p3p-pay-card`](../p3p-pay-card/SKILL.md).

## When to Activate

Activate this skill when:
- The user asks to pay with UPI ReservePay, set up a UPI mandate, or block funds via UPI
- The payment method is (or should be) `PaymentMethod.RESERVE_PAY` or `PaymentMethod.OTM`
- The user says "pay via UPI", "block via ReservePay", or "set up UPI recurring payment"

Do NOT use for card-based mandates — the card activation flow is different (checkout_url + OTP, not a UPI QR / deep link).

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

## Steps to Execute a UPI Payment

### 1. Initialize the Server SDK

```ts
import { P3PEnvironment, PaymentGateway, PaymentMethod, PineLabsOnlineP3P } from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
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
    availablePaymentMethods=[PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
    env=P3PEnvironment.SANDBOX,
)
p3p = PineLabsOnlineP3P.create(config)
```

### Production Gate

Before `createMandate` or capturing a debit, confirm the environment:

```bash
printf 'PINE_LABS_ENV=%s\n' "${PINE_LABS_ENV:-SANDBOX}"
```

Default to `SANDBOX`. If the active environment is `PRODUCTION`, stop and ask for explicit confirmation that includes the amount, mobile number, merchant context, and operation. Do not continue from an implied approval.

### 2. Gather Payment Context

Confirm you have ALL of:
- [ ] Customer mobile number (10 digits, no country code — e.g. `9876543210`)
- [ ] Mandate amount in **paise** (₹1 = 100 paise, e.g. ₹500 → `50000`)
- [ ] Payment method: `RESERVE_PAY` (recurring block) or `OTM` (one-time)
- [ ] Purpose / description (optional but recommended)
- [ ] Grantex grant token — **required** for P3P txn flows (Grantex surfaces the consent page, daily limit, and per-txn limit). Obtain it from the server-side consent flow (`createGrantexAuthorization` → `exchangeGrantexCode` → `allocateGrantexBudget`).

Do NOT call `createMandate` with guessed or hallucinated values.

### 3. Create the UPI Mandate

Server SDK call:

```ts
import { Amount, PaymentMethod } from "p3p-server-sdk";

const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
  amount: new Amount(50000, "INR"),     // ₹500.00 in paise
  paymentMethod: PaymentMethod.RESERVE_PAY,
  // For UPI one-time mandate use PaymentMethod.OTM
});
```

```python
mandate = await p3p.create_mandate(
    customer_reference="customer-ref-123",
    mobile_number="9876543210",
    amount=Amount(50000, "INR"),
    payment_method=PaymentMethod.RESERVE_PAY,
)
```

Amounts are always in the **smallest currency unit** (paise for INR). `50000` = ₹500.00.

Extract and save from the response:
- `mandate.deep_link` — UPI intent URL the customer must approve in their UPI app
- `mandate.mandate_id` — used to poll status via `getMandate(mandate.mandate_id)`; the same value is passed as `authorizationId` when calling `getMandateBalance({ authorizationId: mandate.mandate_id, … })`

### 4. Show the QR and Poll for Activation (UPI-specific)

This is the UPI-specific activation step. Generate a QR code from `deep_link` with any QR library (`qrcode` in Python, `qrcode.react` in JS) and **show it to the user immediately** so they can scan it with their UPI app.

Poll until the mandate is `ACTIVE` (also reported as `AUTHORIZED` / `APPROVED` / `SUCCESS`):

```ts
const status = await p3p.getMandate(mandate.mandate_id);
// repeat until status.order_status === "AUTHORIZED" (a.k.a. ACTIVE)
```

```python
status = await p3p.get_mandate(mandate.mandate_id)
```

> **Sandbox:** In SANDBOX, the mandate is auto-approved — no real UPI scan is needed. Polling resolves almost immediately.

Do NOT proceed to step 5 until the mandate is `ACTIVE`.

Read [cli-mandates reference](../p3p-pay/references/cli-mandates.md) for all mandate states and error conditions.

### 5. Request the Paid Resource (Client SDK mints PPT on 402)

The client SDK creates the one-shot PPT **only after the server returns a `402` challenge**. Your code just calls the protected route:

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
    paymentMethod: PaymentMethod.RESERVE_PAY,   // or PaymentMethod.OTM
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
    availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
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

## Fetch Mandate Balance (UPI ReservePay only)

Mandate balance lookup is a server SDK call and currently supports `PaymentMethod.RESERVE_PAY`:

```ts
const balance = await p3p.getMandateBalance({
  authorizationId: "auth_123",
  phoneNumber: "9876543210",
  paymentMethod: PaymentMethod.RESERVE_PAY,
});

const blocked = balance.amount?.value ?? 0;
const debited = balance.balance_details?.amount_debited?.value ?? 0;
const remaining = balance.balance_details?.amount_remaining?.value ?? 0;
```

```python
balance = await p3p.get_mandate_balance(
    authorization_id="auth_123",
    phone_number="9876543210",
    payment_method=PaymentMethod.RESERVE_PAY,
)
```

Use `getMandateBalance` / `get_mandate_balance` to fetch the mandate balance via `GET /mpp/v1/balance`. Only `PaymentMethod.RESERVE_PAY` is supported — while integrating with `PaymentMethod.OTM` (or `PaymentMethod.CARD`, handled by `p3p-pay-card`), skip the Fetch Mandate Balance step.

## Multi-Charge Flow (ReservePay repeat debits)

A multi-charge token allows repeated debits while:
- `usage.amount_used` + new debit amount ≤ `usage_limits.max_amount`
- `usage.charges_made` < `usage_limits.max_charges`
- Token has not expired

For each subsequent charge, call `client.get(...)` again (step 5). The client SDK mints a fresh one-shot token per challenge; the ReservePay mandate stays active across charges until it expires or is revoked.

## UPI-Specific Activation Differences (ReservePay vs OTM)

| | `RESERVE_PAY` | `OTM` |
|---|---|---|
| Use case | Recurring / multi-charge | Single-use debit |
| Mandate balance lookup | Supported (`getMandateBalance`) | Not supported — skip balance step |
| Activation | UPI app scan of `deep_link` QR | UPI app scan of `deep_link` QR |
| Re-debit | Yes, while mandate is active | No — one mandate, one debit |

Both use the same UPI QR / deep_link activation flow above. The difference is the debit semantics, not the activation step.

## Anti-Patterns

- Calling `createMandate` before credentials are set.
- Proceeding to the paid route before the mandate is `ACTIVE`.
- Treating `OTM` as multi-charge — it is single-use.
- Calling `getMandateBalance` for `OTM` — only `RESERVE_PAY` is supported.
- Guessing or hallucinating the mobile number or amount.
- Asking the user for their secret in chat — read it from server-side env vars only.
- Using paise values as rupees (₹500 ≠ 500 paise — use 50000 paise).
- Instantiating `p3p-client-sdk` in browser code when your integration uses `clientSecret`.

---

*Built by [Pine Labs Online](https://www.pinelabs.com/) — x402 payment infrastructure for AI agents.*
