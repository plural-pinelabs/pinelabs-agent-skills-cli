# P3P Server SDK — API Reference

**TypeScript**  
Package: `p3p-server-sdk` — `npm install p3p-server-sdk`  
Requires: Node.js ≥ 18

**Python**  
Package: `pinelabs-online-p3p-server-sdk` — `pip install pinelabs-online-p3p-server-sdk[flask]` or `[fastapi]`  
Import module: `pinelabs_p3p_server`  
Requires: Python ≥ 3.9

---

## `PineLabsOnlineP3P`

The main server SDK class. Manages bearer token lifecycle, signs 402 challenges, verifies client credentials, and executes debits.

### `PineLabsOnlineP3P.create(config)`

Creates a new SDK instance. Use as a singleton — auth tokens are cached per instance.

```ts
import {
  PineLabsOnlineP3P,
  P3PEnvironment,
  PaymentGateway,
  PaymentMethod,
} from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create({
  clientId: "your_client_id",
  clientSecret: "your_client_secret",
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
  env: P3PEnvironment.SANDBOX,
});
```

#### Config Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `clientId` | `string` | Yes | Pine Labs server client ID |
| `clientSecret` | `string` | Yes | Pine Labs server client secret |
| `paymentGateway` | `PaymentGateway` | Yes | Must be `PaymentGateway.PineLabsOnline` |
| `availablePaymentMethods` | `PaymentMethod[]` | Yes | Methods advertised in 402 challenges |
| `env` | `P3PEnvironment` | Yes | `SANDBOX` or `PRODUCTION` |
| `realm` | `P3PEnvironment` | No | Challenge realm (defaults to `env`) |
| `requestTimeoutMs` | `number` | No | HTTP timeout for P3P API calls |
| `maxRetries` | `number` | No | Max retries on transient errors |
| `initialRetryDelayMs` | `number` | No | Initial retry backoff in ms |

#### Environment Defaults

| Env | Base URL | Timeout | Retries | Retry delay |
|---|---|---|---|---|
| `SANDBOX` | `https://pluraluat.v2.pinepg.in` | 60,000 ms | 2 | 300 ms |
| `PRODUCTION` | `https://api.pluralpay.in` | 45,000 ms | 2 | 200 ms |

---

### `p3p.generateChallenge(chargeOptions)`

Generates a signed 402 challenge. Use this if you need the raw challenge string rather than using `decidePayment`.

```ts
import { Amount, ChargeOptions } from "p3p-server-sdk";

const challenge = await p3p.generateChallenge(
  new ChargeOptions(new Amount(50000, "INR"), "/api/premium"),
);
// Returns: base64-encoded signed challenge string
// Set as: WWW-Authenticate: Payment <challenge>
```

---

### `p3p.createMandate(options)` *(Server-initiated)*

Creates a UPI ReservePay mandate directly from the server. Use when the server (not the client agent) initiates the pre-authorization.

```ts
const mandate = await p3p.createMandate({
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",         // required: 10-digit mobile number
  amount: new Amount(50000, "INR"),
  validityInDays: 7,
  paymentMethod: PaymentMethod.RESERVE_PAY,
});
```

The response includes a `deep_link` field — a UPI intent URL the customer must approve in their UPI app. Generate a QR code from this deep link and display it to the customer. Poll mandate status until `order_status === "AUTHORIZED"`.

---

### `p3p.getMandateBalance(options)`

Fetch the current blocked, debited, and remaining balance for an active ReservePay mandate. Useful before starting or retrying paid calls.

```ts
const balance = await p3p.getMandateBalance({
  authorizationId: "auth_123",           // mandate / authorization ID
  phoneNumber: "9876543210",
  paymentMethod: PaymentMethod.RESERVE_PAY,
});

const balanceSummary = {
  status:    balance.status,
  blocked:   balance.amount?.value ?? 0,
  debited:   balance.balance_details?.amount_debited.value ?? 0,
  remaining: balance.balance_details?.amount_remaining.value ?? 0,
};
```

**Note:** Currently supports `PaymentMethod.RESERVE_PAY` only. Skip this call for `PaymentMethod.OTM` and `PaymentMethod.CARD` — per the [P3P SDK docs](https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks), "While integrating with `PaymentMethod.OTM` and `PaymentMethod.CARD`, skip the Fetch Mandate Balance step." For card mandates, poll `getMandate(mandate.mandate_id)` until `order_status` is `AUTHORIZED`/`ACTIVE` and rely on the debit receipt from `decidePayment` for spend accounting.

---

### `p3p.getDebitStatus(idempotencyKey)`

Look up a debit by idempotency key. Use to reconcile pending payments.

```ts
const debit = await p3p.getDebitStatus("idem_key_123");
// Returns: debit status object (SUCCESS / PENDING / FAILED)
```

---

## `decidePayment(options)` *(Helper)*

Framework-agnostic middleware helper. Handles the full server-side 402 decision:
- Missing credential → returns 402 action with challenge headers
- Valid credential → executes debit, returns `proceed` action with receipt

```ts
import { decidePayment, Amount, ChargeOptions } from "p3p-server-sdk";

const decision = await decidePayment({
  credentialHeader: request.headers.get("P3P-Credential") ?? undefined,
  config,
  chargeOptions: new ChargeOptions(new Amount(50000, "INR"), "/api/premium"),
});

if (decision.action !== "proceed") {
  return new Response(JSON.stringify(decision.problemDetails), {
    status: decision.status,
    headers: decision.headers,
  });
}

// Proceed with handler, attach receipt
const response = await handler(request);
response.headers.set("Payment-Receipt", decision.headers["Payment-Receipt"]);
return response;
```

#### Options

| Field | Type | Required | Description |
|---|---|---|---|
| `credentialHeader` | `string \| undefined` | Yes | Value of the `P3P-Credential` request header |
| `grantexTokenHeader` | `string \| undefined` | No | Value of the `X-Grantex-Token` request header |
| `config` | `P3PConfig` | Yes | SDK config object (same shape as `PineLabsOnlineP3P.create` config) |
| `chargeOptions` | `ChargeOptions` | Yes | Amount and resource path for this charge |

#### Decision Object

| Field | Meaning |
|---|---|
| `decision.action === "challenge"` | No credential or invalid — return 402 |
| `decision.action === "proceed"` | Debit executed — call handler and attach receipt |
| `decision.action === "pending"` | Debit processing (202) — withhold resource; poll `getDebitStatus` |
| `decision.status` | HTTP status code |
| `decision.headers` | Headers to set on the response |
| `decision.headers["Payment-Receipt"]` | Settlement receipt — set on the 200 response |
| `decision.captureResult` | Debit details (available when `action === "proceed"`) |
| `decision.problemDetails` | RFC 9457 problem JSON; includes `idempotencyKey` when `action === "pending"` |

---

## `Amount`

```ts
import { Amount } from "p3p-server-sdk";

new Amount(50000, "INR")   // 50000 paise = ₹500.00
```

Always use **paise** (smallest currency unit). ₹1 = 100 paise.

---

## `ChargeOptions`

```ts
import { ChargeOptions, Amount } from "p3p-server-sdk";

new ChargeOptions(
  new Amount(50000, "INR"),  // amount to charge
  "/api/premium"             // resource path — included in challenge signature
)
```

---

## `PaymentMethod` Enum

| Value | String | Description |
|---|---|---|
| `PaymentMethod.RESERVE_PAY` | `"RESERVE_PAY"` | UPI ReservePay pre-authorization |
| `PaymentMethod.OTM` | `"OTM"` | UPI One-Time Mandate |
| `PaymentMethod.Crypto` | `"CRYPTO"` | Cryptocurrency (where supported) |

---

## `P3PEnvironment` Enum

| Value | URL |
|---|---|
| `P3PEnvironment.SANDBOX` | `https://pluraluat.v2.pinepg.in` |
| `P3PEnvironment.PRODUCTION` | `https://api.pluralpay.in` |

---

## Pending Debits (`202 Accepted`)

If `POST /mpp/v1/debit` returns `202`, the SDK treats the debit as pending and retries automatically using the same idempotency key, respecting `Retry-After` headers. If retries are exhausted and the debit is still `PENDING`, `decidePayment` returns `202` — the protected resource must remain withheld until the debit is confirmed. Use `getDebitStatus` to reconcile later.

---

## Grantex — Delegated Agent Authorization (Required for P3P Txn Flows)

Grantex is the **required** delegated-authorization layer for P3P transactions. It provides:
- A **consent page** that the user must approve before any paid call begins
- **Daily spend limit** configured by the user during consent
- **Per-txn limit** configured by the user during consent
- Enforcement on every `decidePayment` call via the `X-Grantex-Token` header

`decidePayment` returns `402` and withholds the paid resource when no valid `X-Grantex-Token` is present. Skipping Grantex (`grantex.enforceGrant: false`) is not the default path and not the supported flow.

### Step 1 — Create a Grantex Account and Get Credentials

1. Sign up at https://grantex.dev (or https://grantex.dev/dashboard/signup)
2. Create an **Agent** — give it a name and add these scopes:
   - `mpp:payment:initiate` (required)
   - `mpp:payment:max_txn_paise:*` (required for per-txn limit enforcement)
3. After creating the agent, copy:
   - **API Key** → set as `GRANTEX_API_KEY` env var (save it — you won't see it again)
   - **Agent ID** → set as `GRANTEX_AGENT_ID` env var (format: `ag_...`)

```bash
export GRANTEX_API_KEY=your_grantex_api_key
export GRANTEX_AGENT_ID=ag_xxxxxxxxxxxxxxxx
export GRANTEX_REDIRECT_URI=https://yourapp.com/grantex/callback   # MUST be https://
```

### Step 2 — Configure the Server SDK with Grantex

The server SDK verifies the `X-Grantex-Token` header on every `decidePayment` call when `enforceGrant: true`.

**TypeScript:**
```ts
import {
  P3PEnvironment, PaymentGateway, PaymentMethod, PineLabsOnlineP3P,
} from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY],
  env: P3PEnvironment.SANDBOX,
  grantex: {
    enforceGrant: true,
    // agentId for verification: use DID form if raw ID doesn't start with "did:"
    agentId: process.env.GRANTEX_AGENT_ID!.startsWith("did:")
      ? process.env.GRANTEX_AGENT_ID!
      : `did:grantex:${process.env.GRANTEX_AGENT_ID!}`,
    requiredScopes: ["mpp:payment:initiate", "mpp:payment:max_txn_paise:50000"],
    hosted: {
      apiKey: process.env.GRANTEX_API_KEY!,   // your Grantex API key
      // baseUrl defaults to https://api.grantex.dev
    },
  },
});
```

**Python:**
```python
from pinelabs_p3p_server import PineLabsOnlineP3P, PineLabsOnlineServerConfig
from pinelabs_p3p_server.types.config import HostedGrantexConfig, ServerGrantexConfig

agent_id = os.environ["GRANTEX_AGENT_ID"]
grantex_agent_did = agent_id if agent_id.startswith("did:") else f"did:grantex:{agent_id}"

config = PineLabsOnlineServerConfig(
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
    paymentGateway=PaymentGateway.PineLabsOnline,
    availablePaymentMethods=[PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
    env=P3PEnvironment.SANDBOX,
    grantex=ServerGrantexConfig(
        enforceGrant=True,
        agentId=grantex_agent_did,
        requiredScopes=["mpp:payment:initiate", "mpp:payment:max_txn_paise:50000"],
        hosted=HostedGrantexConfig(
            apiKey=os.environ["GRANTEX_API_KEY"],   # your Grantex API key
        ),
    ),
)
```

### Step 3 — Implement the Grantex Consent Flow (Server-Side)

Before a user's agent can make paid calls, the user must authorize it via Grantex. This is a one-time OAuth-style consent flow your backend drives.

The flow has **two separate HTTP handlers** — step 1 starts the consent (frontend button → your `/grantex/start` endpoint), then the user leaves your app to Grantex's hosted consent page and returns via browser redirect to your `/grantex/callback` (step 2). You cannot perform both in the same request because the user must approve in a browser at `auth.consentUrl`.

> **redirectUri must be HTTPS** (Grantex rejects `http://`). In local dev, use a tunnel such as `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000` and pass the resulting `https://<tunnel>.ngrok.app/grantex/callback` as `redirectUri`. In production, use your real `https://yourapp.com/grantex/callback`. Never `http://localhost` in sandbox/prod.

**TypeScript:**
```ts
import { randomUUID } from "node:crypto";

// Handler 1 — POST /grantex/start (e.g. from a "Connect Agent" button)
app.post("/grantex/start", async (req, res) => {
  const customerId = req.user.id;
  const state = randomUUID();            // CSRF + session lookup token
  const auth = await p3p.createGrantexAuthorization({
    userId: customerId,                  // SDK maps userId -> principalId on the wire
    agentId: process.env.GRANTEX_AGENT_ID!,   // raw ag_... (NOT did:grantex:ag_... form)
    scopes: ["mpp:payment:initiate", "mpp:payment:max_txn_paise:50000"],
    redirectUri: process.env.GRANTEX_REDIRECT_URI!,  // https://.../grantex/callback
  });
  await db.save(`grantex:state:${state}`, customerId);   // 10-min TTL
  res.redirect(302, auth.consentUrl);    // send user to Grantex hosted consent page
});

// Handler 2 — GET /grantex/callback?code=...&state=...  (user returns after approving)
app.get("/grantex/callback", async (req, res) => {
  const { code, state } = req.query;
  const customerId = await db.get(`grantex:state:${state}`);
  if (!customerId) return res.status(400).send("invalid or expired state");

  const exchanged = await p3p.exchangeGrantexCode({
    code: String(code),
    agentId: process.env.GRANTEX_AGENT_ID!,   // raw ag_... here too
  });

  // Allocate budget (amounts in paise — do NOT divide by 100)
  await p3p.allocateGrantexBudget({
    grantId: exchanged.grantId,
    initialBudget: 50000,     // ₹500.00 in paise
    currency: "INR",
  });

  // Persist the grant token for this customer
  await db.save(customerId, {
    grantToken: exchanged.grantToken,
    grantId: exchanged.grantId,
  });
  res.redirect(302, "/connected");   // success page
});
```

### Step 4 — Pass Grant Token on Paid Calls

Your backend attaches the stored `grantToken` as `X-Grantex-Token` when calling the paid resource (or passes it via the client SDK):

**TypeScript (client SDK):**
```ts
const storedGrant = await db.get(customerId);
const response = await client.get(url, {}, {
  mobileNumber: "9876543210",
  paymentMethod: PaymentMethod.RESERVE_PAY,
  grantexToken: storedGrant.grantToken,
});
```

**Important:** Never expose the grant token to browser/frontend code — always attach it server-side.

### `HostedGrantexConfig` Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | Yes (when `enforceGrant: true`) | Your Grantex API key from grantex.dev |
| `baseUrl` | `string` | No | Defaults to `https://api.grantex.dev` |
| `timeoutMs` | `number` | No | HTTP timeout for Grantex calls |
| `maxRetries` | `number` | No | Retry count for Grantex calls |

### `ServerGrantexConfig` Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `enforceGrant` | `boolean` | `false` | When `true`, missing/invalid grants return 402 (P3PGrantexError) before capture |
| `agentId` | `string` | — | Expected agent DID; must match grant `agt` claim. Use `did:grantex:ag_...` form |
| `requiredScopes` | `string[]` | — | Scopes that must be present in the grant token |
| `hosted` | `HostedGrantexConfig` | — | Required when `enforceGrant: true` |
| `issuer` | `string` | — | Expected issuer URL |
| `debitBudgetBeforeChallenge` | `boolean` | `true` | Check budget before 402, debit after successful capture |

---

## Python SDK

The Python server SDK (`pinelabs_p3p_server`) mirrors the TypeScript SDK with snake_case naming.

### Config

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

### `p3p.create_mandate(options)`

```python
from pinelabs_p3p_server import Amount, CreateMandateOptions, PaymentMethod

mandate = p3p.create_mandate(CreateMandateOptions(
    mobileNumber="9876543210",
    customerReference="customer-ref-123",
    amount=Amount(value=100000, currency="INR"),
    paymentMethod=PaymentMethod.RESERVE_PAY,
    validityInDays=20,
))
# mandate.deep_link — UPI intent URL for the customer to scan
```

### `p3p.get_mandate_balance(options)`

```python
balance = p3p.get_mandate_balance({
    "authorizationId": "auth_123",
    "phoneNumber": "9876543210",
    "paymentMethod": PaymentMethod.RESERVE_PAY,
})
remaining = balance.balance_details.amount_remaining.value
```

**Note:** Currently supports `PaymentMethod.RESERVE_PAY` only. Skip this call for `PaymentMethod.OTM` and `PaymentMethod.CARD` — per the [P3P SDK docs](https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks), "While integrating with `PaymentMethod.OTM` and `PaymentMethod.CARD`, skip the Fetch Mandate Balance step." For card mandates, poll `getMandate(mandate.mandate_id)` until `order_status` is `AUTHORIZED`/`ACTIVE` and rely on the debit receipt from `decidePayment` for spend accounting.

### `decide_payment(...)` (Python helper)

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
    return error_response(decision.status, decision.problem_details, decision.headers)

# decision.action == "pending": poll p3p.get_debit_status(decision.problem_details["idempotencyKey"])
# decision.capture_result: debit details when action == "proceed"
```

### Flask Decorator

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

### `p3p.get_debit_status(idempotency_key)`

```python
latest = p3p.get_debit_status("idem_key_123")
if latest.status == "SUCCESS":
    # mark order paid
elif latest.status == "FAILED":
    # mark order failed
```
