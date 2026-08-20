---
name: p3p-sdk-integration
version: 1.0.0

description: Use when a developer asks to integrate Pine Labs P3P payments into an application, set up x402 payment middleware, protect an API route with a 402 challenge, handle 402 responses automatically in a client app, or install and configure p3p-server-sdk, p3p-client-sdk, pinelabs-online-p3p-server-sdk, or pinelabs-online-p3p-client-sdk. Covers TypeScript (Next.js, Express, Vanilla JS) and Python (Flask, FastAPI). Do NOT use for CLI-driven agent payments (use p3p-pay skill instead) or non-P3P payment integrations.
homepage: https://www.pinelabs.com/
author: Pine Labs Online
user-invocable: true
metadata: {"category":"payments","requires":{"npm":["p3p-server-sdk","p3p-client-sdk"],"pip":["pinelabs-online-p3p-server-sdk","pinelabs-online-p3p-client-sdk"]}}
tags:
  - payments
  - sdk
  - x402
  - server
  - client
  - nextjs
  - express
  - middleware
  - typescript
  - python
  - flask
  - fastapi
---

# P3P SDK Integration — x402 Payment Middleware for Applications

Integrate Pine Labs P3P into your server and client application. The server SDK generates x402 challenges and captures debits. The client SDK handles 402 responses automatically, mints PPT tokens, and retries requests with payment credentials.

Supported languages: **TypeScript** (`p3p-server-sdk`, `p3p-client-sdk`) and **Python** (`pinelabs-online-p3p-server-sdk`, `pinelabs-online-p3p-client-sdk`).

## When to Activate

Activate this skill when:
- A developer asks to integrate P3P payments into a Next.js, Express, vanilla JS, Flask, or FastAPI app
- Someone wants to protect an API route with a `402 Payment Required` challenge (TypeScript or Python)
- Someone wants to automatically handle 402 responses in a fetch/HTTP client
- A developer asks about `p3p-server-sdk`, `p3p-client-sdk`, `pinelabs-online-p3p-server-sdk`, `pinelabs-online-p3p-client-sdk`, `decidePayment`, `decide_payment`, `generateChallenge`, `PineLabsOnlineClient`, or `payment_required`
- Someone wants to add x402 payment enforcement to an existing route

## Architecture Overview

```
Client App                    Your Server               Pine Labs P3P
    │                              │                          │
    │── GET /api/premium ─────────▶│                          │
    │◀── 402 + WWW-Authenticate ───│ (generateChallenge)      │
    │                              │                          │
    │  [SDK creates mandate + PPT] │                          │
    │                              │                          │
    │── GET /api/premium ─────────▶│── POST /mpp/v1/debit ───▶│
    │   (P3P-Credential header)    │◀── settlement receipt ───│
    │◀── 200 + Payment-Receipt ────│                          │
```

Both sides use their respective SDK. The client SDK handles the full 402 loop automatically — your application code just calls `client.get(url, init, context)` and receives the final `200` response.

## Server-Side Setup

### 1. Install the Server SDK

**TypeScript:**
```bash
npm install p3p-server-sdk
```
Requires Node.js ≥ 18.

**Python:**
```bash
pip install pinelabs-online-p3p-server-sdk[flask]    # Flask
pip install pinelabs-online-p3p-server-sdk[fastapi]  # FastAPI
```
Requires Python ≥ 3.9.

### 2. Initialize `PineLabsOnlineP3P`

Create a single long-lived instance — it manages bearer token caching and refresh internally:

**TypeScript:**
```ts
import {
  Amount,
  ChargeOptions,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
  PineLabsOnlineP3P,
  decidePayment,
} from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
  env: P3PEnvironment.SANDBOX,   // use P3PEnvironment.PRODUCTION for live
});
```

**Python:**
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

**Required config fields:**

| Field | Type | Description |
|---|---|---|
| `clientId` | `string` | Your Pine Labs server client ID |
| `clientSecret` | `string` | Your Pine Labs server client secret |
| `paymentGateway` | `PaymentGateway` | Must be `PaymentGateway.PineLabsOnline` |
| `availablePaymentMethods` | `PaymentMethod[]` | Methods advertised in 402 challenges |
| `env` | `P3PEnvironment` | `SANDBOX` or `PRODUCTION` |

### 3. Protect a Route with `decidePayment` / `decide_payment`

Use the helper — it handles the full server-side decision tree:
- No `P3P-Credential` header → returns 402 with challenge
- Valid credential → executes debit, returns `proceed` with `Payment-Receipt` header
- Debit processing → returns `pending` (202); withhold resource

**TypeScript (framework-agnostic):**
```ts
import { Amount, ChargeOptions, decidePayment } from "p3p-server-sdk";

// Framework-agnostic middleware pattern
const decision = await decidePayment({
  credentialHeader: request.headers.get("P3P-Credential") ?? undefined,
  grantexTokenHeader: request.headers.get("X-Grantex-Token") ?? undefined,
  config,                              // your PineLabsOnlineP3P config object
  chargeOptions: new ChargeOptions(
    new Amount(50000, "INR"),          // amount in paise
    "/api/premium"                     // resource path (used in challenge signing)
  ),
});

if (decision.action !== "proceed") {
  return new Response(JSON.stringify(decision.problemDetails), {
    status: decision.status,
    headers: decision.headers,
  });
}

// decision.action === "pending" (202) means debit is processing — withhold resource
// Store decision.problemDetails.idempotencyKey and poll via p3p.getDebitStatus(key)

// Execute your protected handler
const response = await handler(request);

// Attach the receipt header to the response
// decision.captureResult contains debit details (available when action === "proceed")
response.headers.set("Payment-Receipt", decision.headers["Payment-Receipt"]);
```

`decision.action` values:
- `"challenge"` — returns 402 (no credential or invalid)
- `"proceed"` — credential verified and debit executed; attach `Payment-Receipt`; `decision.captureResult` has debit details
- `"pending"` — debit accepted but processing (202); withhold resource; poll with `p3p.getDebitStatus(idempotencyKey)`

**Python (Flask decorator shorthand):**
```python
from flask import Flask, jsonify
from pinelabs_p3p_server import Amount, ChargeOptions
from pinelabs_p3p_server.flask_mw import payment_required

app = Flask(__name__)

@app.get("/api/premium")
@payment_required(config, ChargeOptions(
    amount=Amount(value=50000, currency="INR"),
    resource="/api/premium",
))
def premium():
    return jsonify({"data": "premium content"})
```

**Python (generic `decide_payment` helper — works with any framework):**
```python
from pinelabs_p3p_server.server.middleware import decide_payment
from pinelabs_p3p_server import Amount, ChargeOptions

decision = decide_payment(
    credential_header=request.headers.get("P3P-Credential"),
    grantex_token_header=request.headers.get("X-Grantex-Token"),
    config=config,
    charge_options=ChargeOptions(
        amount=Amount(value=50000, currency="INR"),
        resource="/api/premium",
    ),
)

if decision.action != "proceed":
    return Response(decision.problem_details, status=decision.status, headers=decision.headers)

# decision.action == "pending": store decision.problem_details["idempotencyKey"],
# poll p3p.get_debit_status(key)

response = make_protected_response()
response.headers["Payment-Receipt"] = decision.headers["Payment-Receipt"]
return response
```

Read [server-sdk-api-reference](references/server-sdk-api-reference.md) for the full API.

### 4. Mandate Creation (Server-Side) — Route the Activation Sub-Step

`createMandate` itself (the server call) is universal: same signature, just a different `paymentMethod`. **What differs is the activation sub-step the user/customer goes through after `createMandate` returns.** Route the activation to the method-specific skill so the right UI is shown (UPI QR vs card checkout URL) and the right identifier is gathered (`mobileNumber` for UPI, `customerReference` for card).

**Routing rule (apply before you write the activation code):**

| `paymentMethod` | Activation sub-skill | Activation UI |
|---|---|---|
| `PaymentMethod.RESERVE_PAY` or `PaymentMethod.OTM` | [`p3p/pay-upi.md`](pay-upi.md) | Show QR generated from `deep_link`; user scans with UPI app |
| `PaymentMethod.CARD` | [`p3p/pay-card.md`](pay-card.md) | Show `checkout_url` in a modal/iframe; user enters card + OTP |

**Server SDK call is the same shape for every method (only `paymentMethod` + the identifier change):**

**TypeScript (UPI ReservePay example):**
```ts
const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",                   // UPI-only
  amount: new Amount(50000, "INR"),
  validityInDays: 7,
  paymentMethod: PaymentMethod.RESERVE_PAY,     // or PaymentMethod.OTM / PaymentMethod.CARD
});
```

**Python:**
```python
from pinelabs_p3p_server import Amount, CreateMandateOptions, PaymentMethod

mandate = p3p.create_mandate(CreateMandateOptions(
    mobileNumber="9876543210",                   # UPI-only; omit for CARD
    customerReference="customer-ref-123",
    amount=Amount(value=50000, currency="INR"),
    paymentMethod=PaymentMethod.RESERVE_PAY,     # or PaymentMethod.OTM / PaymentMethod.CARD
    validityInDays=7,
))
```

**Reading the response (per method):**
- UPI (`RESERVE_PAY` / `OTM`) → `mandate.deep_link` (UPI intent URL). Generate a QR and show it. → See [`p3p/pay-upi.md`](pay-upi.md) §4.
- Card (`CARD`) → `mandate.checkout_url`. Open in a modal/iframe/redirect. → See [`p3p/pay-card.md`](pay-card.md) §4.

After `createMandate`, **do not write activation UI code from this skill**. Read the routed sub-skill for the activation sequence (show QR / checkout URL, poll `getMandate(mandate.mandate_id)` until `order_status` is `AUTHORIZED`/`ACTIVE`) and then return here to wire the client SDK and `decidePayment`. Read [server-sdk-api-reference](references/server-sdk-api-reference.md) for the full `createMandate` contract.

## Client-Side Setup

### 5. Install the Client SDK

**TypeScript:**
```bash
npm install p3p-client-sdk
```

**Python:**
```bash
pip install pinelabs-online-p3p-client-sdk
```

### 6. Initialize `PineLabsOnlineClient`

Create a single long-lived instance — auth tokens are cached per instance:

**TypeScript:**
```ts
import {
  P3PEnvironment,
  P3PCustomerAuthMode,
  PaymentMethod,
  PineLabsOnlineClient,
} from "p3p-client-sdk";

const client = PineLabsOnlineClient.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  env: P3PEnvironment.SANDBOX,
});
```

**Python:**
```python
from pinelabs_p3p_client import (
    P3PEnvironment, PaymentMethod,
    PineLabsOnlineClient, PineLabsOnlineClientConfig,
)

client = PineLabsOnlineClient.create(PineLabsOnlineClientConfig(
    env=P3PEnvironment.SANDBOX,
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
))
# Remember to call client.close() when the process shuts down
```

### 7. Make Requests Against Protected Resources

The client SDK automatically handles 402 responses — no manual retry logic needed:

**TypeScript:**
```ts
const response = await client.get(
  "https://your-server.com/api/premium",
  { headers: { "X-Request-Id": "req_123" } },   // standard RequestInit
  {
    customerReference: "customer-ref-123",       // your customer ID
    mobileNumber: "9876543210",                  // customer's UPI-registered mobile
    paymentMethod: PaymentMethod.RESERVE_PAY,    // payment method to use
    grantexToken: user_grant_token,   # required — Grantex consent + limits enforcement
  },
);
const data = await response.json();
```

**Python:**
```python
from pinelabs_p3p_client import ClientRuntimeContext, PaymentMethod

response = client.get(
    "https://your-server.com/api/premium",
    context=ClientRuntimeContext(
        customerReference="customer-ref-123",
        mobileNumber="9876543210",
        paymentMethod=PaymentMethod.RESERVE_PAY,
        grantexToken=user_grant_token,   # required
    ),
)
data = response.json()
```

The SDK:
1. Makes the initial request.
2. On 402: decodes the challenge, creates a mandate, mints a PPT token.
3. Retries the request with `P3P-Credential: Payment <token>`.
4. Returns the final 200 response.

Read [client-sdk-api-reference](references/client-sdk-api-reference.md) for the full API, customer auth modes, and Grantex (delegated agent authorization).

## Framework Templates

Choose the template that matches your stack:

| Framework | Server Template | Client Template |
|---|---|---|
| Next.js App Router | [templates/nextjs/route.ts](templates/nextjs/route.ts) | [templates/nextjs/use-p3p.ts](templates/nextjs/use-p3p.ts) |
| Express.js | [templates/express/middleware.ts](templates/express/middleware.ts) | [templates/express/client.ts](templates/express/client.ts) |
| Vanilla JS / Fetch | — | [templates/vanilla/client.js](templates/vanilla/client.js) |
| Python / Flask | [templates/python/flask_server.py](templates/python/flask_server.py) | [templates/python/client.py](templates/python/client.py) |
| Python / FastAPI | [templates/python/fastapi_server.py](templates/python/fastapi_server.py) | [templates/python/client.py](templates/python/client.py) |

Copy the relevant template into your project and adjust the amount, resource path, and environment.

## Environment Variables

Set these before running your application:

### Server

| Variable | Required | Description |
|---|---|---|
| `PINELABS_CLIENT_ID` | Yes | Pine Labs server client ID |
| `PINELABS_CLIENT_SECRET` | Yes | Pine Labs server client secret |
| `PINE_LABS_ENV` | No | `SANDBOX` (default) or `PRODUCTION` |

### Client

| Variable | Required | Description |
|---|---|---|
| `PINELABS_CLIENT_ID` | Yes | Pine Labs client ID |
| `PINELABS_CLIENT_SECRET` | Yes | Pine Labs client secret |
| `PINE_LABS_ENV` | No | `SANDBOX` (default) or `PRODUCTION` |

## Sandbox vs Production

| Aspect | Sandbox | Production |
|---|---|---|
| `env` value | `P3PEnvironment.SANDBOX` | `P3PEnvironment.PRODUCTION` |
| Base URL | `https://pluraluat.v2.pinepg.in` | `https://api.pluralpay.in` |
| Token prefix | `ppt_test_` | `ppt_live_` |
| UPI | Mock — no real bank calls | Live UPI ReservePay |

Use sandbox for all development and testing. See [test-data reference](references/test-data.md) for sandbox credentials and test mobile numbers.

## Security Rules

- **Never expose `clientSecret` to the browser** — initialize the server SDK on the server only.
- **Never log or return the `P3P-Credential` header** contents to the client.
- **Always use HTTPS** in production — credentials transmitted over plain HTTP are invalid.
- **Validate `chargeOptions` amounts server-side** — never trust client-supplied amounts for the debit.
- **Use idempotency keys** on debit operations to prevent double-charges on retries.

## Anti-Patterns

- Initializing `PineLabsOnlineP3P` or `PineLabsOnlineClient` on every request — use singleton instances.
- Exposing `clientSecret` in frontend code or environment variables accessible to the browser.
- Trusting client-supplied amounts for the server-side `ChargeOptions` — always derive the amount server-side.
- Skipping `Payment-Receipt` header on the response — clients need it for receipt verification.
- Passing `paymentMethod` in the SDK config instead of the runtime context — it must be per-request.
- Using `accessToken` or `baseUrl` static config fields — they are no longer supported; use `env`.

---

*Built by [Pine Labs Online](https://pluralpay.in) — x402 payment infrastructure for AI agents.*
