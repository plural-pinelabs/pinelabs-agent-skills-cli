# P3P SDK — Test Data (Sandbox)

> **Official Docs:** https://www.pinelabs.com/docs/online-payments/ai/p3p/quickstart  
> **Get sandbox credentials:** https://dashboard.pluralpay.in (Settings → API Keys in Test mode)

Use these values for development and testing. They work against the sandbox environment only (`P3PEnvironment.SANDBOX`).

## Sandbox Base URLs

| SDK | URL |
|---|---|
| Server SDK / Client SDK | `https://pluraluat.v2.pinepg.in` |
| Auth | `https://api-staging.pluralonline.com/api/auth/v1/token` |
| Customer token endpoint | `https://api-staging.pluralonline.com/api/v1/customer/mpp/token` |

## Sandbox Credentials

Obtain sandbox credentials from the Pine Labs Developer Dashboard. The format is:

```
client_id:     your_sandbox_client_id
client_secret: your_sandbox_client_secret
```

**Never use production credentials in the sandbox environment.** Token prefixes differentiate environments — `ppt_test_` for sandbox, `ppt_live_` for production.

## Sandbox Mandate Behaviour

In SANDBOX, the mandate creation UPI URL is **auto-approved** — no real QR scan is required. The mandate transitions to `AUTHORIZED` automatically after creation. You do not need a real UPI-registered mobile number for sandbox testing.

## Test Amounts — Sandbox Simulation Rules

The sandbox simulates debit outcomes based on the **transaction amount**. All amounts are in paise (₹1 = 100 paise).

| Amount | ₹ equivalent | Sandbox debit result |
|---|---|---|
| < ₹2 (< 200 paise) | e.g. ₹1.00 = 100 paise | **Fail** — debit returns failure |
| ₹2 – ₹4.99 (200–499 paise) | e.g. ₹3.00 = 300 paise | **Pending → Success** — debit returns pending; resolves to success via `getDebitStatus` / `get_debit_status` enquiry |
| ≥ ₹5 (≥ 500 paise) | e.g. ₹5.00 = 500 paise | **Success** — debit completes immediately |

Use these ranges deliberately in tests to exercise all three code paths:

```ts
// TypeScript — test success path
new Amount(500, "INR")   // ₹5.00 → immediate SUCCESS

// TypeScript — test pending path
new Amount(300, "INR")   // ₹3.00 → PENDING → poll getDebitStatus until SUCCESS

// TypeScript — test failure path
new Amount(100, "INR")   // ₹1.00 → FAIL
```

```python
# Python — test success path
Amount(value=500, currency="INR")   # ₹5.00 → immediate SUCCESS

# Python — test pending path
Amount(value=300, currency="INR")   # ₹3.00 → PENDING → poll get_debit_status until SUCCESS

# Python — test failure path
Amount(value=100, currency="INR")   # ₹1.00 → FAIL
```

## Test Mobile Numbers

Any mobile number works in sandbox (mandate is auto-approved). Use any 10-digit number as a placeholder, e.g. `9876543210`.

## Test Merchant IDs

Merchant IDs are tied to your API credentials and assigned during onboarding. Use the merchant ID associated with your sandbox credentials from the Pine Labs Dashboard.

## Sandbox Token Prefixes

| Prefix | Environment |
|---|---|
| `ppt_test_` | Sandbox |
| `ppt_live_` | Production |

## Simulating Error Conditions

Use the P3P CLI playground to trigger specific error scenarios:

```bash
p3p playground start
p3p trigger mandate.created
p3p trigger mandate.authorized
p3p trigger debit.succeeded
p3p trigger debit.failed --override debit.error_code=MPP_DEBIT_FAILED
p3p trigger mandate.expired
```

Or use fixture files:

```bash
p3p fixtures run fixtures/full-payment.json
p3p fixtures run fixtures/full-payment.json --override create_mandate.amount.value=75000
p3p fixtures run fixtures/debit-pending.json    # simulates 202 pending debit
```

## Environment Variables for Testing

**TypeScript / Node.js:**
```bash
export PINELABS_CLIENT_ID=your_sandbox_client_id
export PINELABS_CLIENT_SECRET=your_sandbox_client_secret
export PINE_LABS_ENV=SANDBOX
```

**Python:**
```bash
export PINELABS_CLIENT_ID=your_sandbox_client_id
export PINELABS_CLIENT_SECRET=your_sandbox_client_secret
export PINE_LABS_ENV=SANDBOX
```

Or in `.env` (never commit to version control):

```
PINELABS_CLIENT_ID=your_sandbox_client_id
PINELABS_CLIENT_SECRET=your_sandbox_client_secret
PINE_LABS_ENV=SANDBOX
```

## Idempotency Keys for Testing

Use a deterministic UUID generator in tests to produce reproducible idempotency keys:

```ts
// Node.js
import { randomUUID } from "crypto";
const idempotencyKey = randomUUID();
```

In sandbox, idempotency is enforced — using the same key twice with the same payload returns the cached result without executing a second debit.

## Checking Sandbox Logs

```bash
p3p logs tail                              # stream all requests
p3p logs tail --filter-method POST        # only POST requests
p3p logs tail --filter-path /mpp/v1/debit # only debit calls
```
