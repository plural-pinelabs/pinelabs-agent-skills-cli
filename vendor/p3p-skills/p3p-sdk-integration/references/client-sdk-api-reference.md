# P3P Client SDK — API Reference

**TypeScript**  
Package: `p3p-client-sdk` — `npm install p3p-client-sdk`  
Requires: Node.js ≥ 18 (or runtime with `fetch` and `AbortSignal.timeout`)

**Python**  
Package: `pinelabs-online-p3p-client-sdk` — `pip install pinelabs-online-p3p-client-sdk`  
Import module: `pinelabs_p3p_client`  
Requires: Python ≥ 3.9

---

## `PineLabsOnlineClient`

The main client SDK class. Automatically handles HTTP 402 responses — creates mandates, mints PPT tokens, and retries requests with payment credentials. Keep one instance per application; auth tokens are cached per instance and concurrent refreshes are deduplicated.

### `PineLabsOnlineClient.create(config)`

```ts
import {
  PineLabsOnlineClient,
  P3PEnvironment,
} from "p3p-client-sdk";

const client = PineLabsOnlineClient.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  env: P3PEnvironment.SANDBOX,
});
```

#### Config Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `clientId` | `string` | Yes | Pine Labs client ID |
| `clientSecret` | `string` | Yes | Pine Labs client secret |
| `env` | `P3PEnvironment` | No | `SANDBOX` or `PRODUCTION` (default: `PRODUCTION`) |
| `requestTimeoutMs` | `number` | No | Timeout for internal P3P calls (not the protected resource request) |
| `maxRetries` | `number` | No | Max retries on P3P API errors |
| `initialRetryDelayMs` | `number` | No | Initial backoff for retries |
| `grantex` | `GrantexConfig` | No | Delegated agent authorization config (see Grantex section) |

#### Environment Defaults

| Env | Base URL | Timeout | Retries | Retry delay |
|---|---|---|---|---|
| `SANDBOX` | `https://pluraluat.v2.pinepg.in` | 60,000 ms | 3 | 500 ms |
| `PRODUCTION` | `https://api.pluralpay.in` | 45,000 ms | 3 | 500 ms |

---

### `client.get(url, init, context)` / `client.post(...)` / `client.request(...)`

Makes a request to a protected resource. Automatically handles 402 responses.

```ts
const response = await client.get(
  "https://your-server.com/api/premium",
  { headers: { "X-Request-Id": "req_123" } },   // standard RequestInit
  {
    customerReference: "customer-ref-123",
    mobileNumber: "9876543210",
    paymentMethod: PaymentMethod.RESERVE_PAY,
  },
);
```

Returns a standard `Response`. If payment succeeded, the response has a `Payment-Receipt` header.

#### `ClientRuntimeContext` Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `mobileNumber` | `string` | Yes* | Customer UPI-registered mobile (10 digits) |
| `customerReference` | `string` | Yes* | Your internal customer ID |
| `paymentMethod` | `PaymentMethod` | Yes | Payment method for this request |
| `grantexToken` | `string` | No | Per-request Grantex grant token (overrides config default) |

*At least one of `mobileNumber` or `customerReference` is required.

**Important:** `paymentMethod` is runtime context, not static config. Pass it per request so one client instance can serve multiple customers with different payment methods.

---

### `client.methods.createToken(options)`

Lower-level method to directly create a PPT token (bypassing the automatic 402 loop):

```ts
const token = await client.methods.createToken({
  customerReference: "customer-ref-123",
  mobileNumber: "9876543210",
  challengeId: "ch_...",                          // challenge ID from a 402 response
  paymentAmount: { value: 50000, currency: "INR" },
  paymentMethod: PaymentMethod.RESERVE_PAY,
});
```

---

## Automatic 402 Flow

When `client.get(...)` receives a `402` response:

1. **Decode challenge** — decodes the `WWW-Authenticate: Payment <challenge>` header.
2. **Validate challenge** — checks amount, expiry, and that `paymentMethod` is in `availablePaymentMethods`.
3. **Create PPT token** — calls `POST /mpp/v1/token` with the customer context.
4. **Retry request** — resends the original request with `P3P-Credential: Payment <token>`.
5. **Parse receipt** — decodes `Payment-Receipt` from the response and attaches it to the `Response` object.

If the server returns another 402 after the retry, the SDK raises an error — it does not loop infinitely.

---

## Customer Auth Modes

### Client Credentials (Default)

The SDK obtains a bearer token from `POST /api/auth/v1/token` using `clientId` + `clientSecret`, then calls the P3P token endpoint directly. Pass `customerReference` or `mobileNumber` at request time.

```ts
PineLabsOnlineClient.create({
  clientId: "...",
  clientSecret: "...",
  env: P3PEnvironment.SANDBOX,
  // customerAuthMode: P3PCustomerAuthMode.ClientCredentials (default)
});
```

### Customer Key Mode

For flows where the customer has their own API token:

```ts
import { P3PCustomerAuthMode } from "p3p-client-sdk";

PineLabsOnlineClient.create({
  clientId: "...",
  clientSecret: "...",
  env: P3PEnvironment.SANDBOX,
  customerAuthMode: P3PCustomerAuthMode.CustomerKey,
});

// Then pass per request:
await client.get(url, {}, {
  mobileNumber: "9876543210",
  customerKey: "cust_api_token_...",       // customer's own API token
  paymentMethod: PaymentMethod.RESERVE_PAY,
});
```

In customer-key mode, the SDK calls the customer token endpoint:
- Sandbox: `POST https://api-staging.pluralonline.com/api/v1/customer/mpp/token`
- Production: `POST https://api.pluralonline.com/api/v1/customer/mpp/token`

---

## Utilities

### `decodeChallenge(header)`

Decode a raw `WWW-Authenticate: Payment <challenge>` header value:

```ts
import { decodeChallenge, validateChallenge } from "p3p-client-sdk";

const challenge = decodeChallenge(wwwAuthenticateHeaderValue);
validateChallenge(challenge);  // throws if invalid/expired
```

### `decodeReceipt(header)`

Decode a `Payment-Receipt` header value:

```ts
import { decodeReceipt } from "p3p-client-sdk";

const receipt = decodeReceipt(paymentReceiptHeaderValue);
// receipt.paymentGateway, receipt.paymentMethod, etc.
```

---

## Grantex (Delegated Agent Authorization)

Grantex is optional. Use it when you want users to explicitly authorize bounded agent spending before paid calls begin.

### Prerequisites — What You Need from grantex.dev

1. Sign up at https://grantex.dev
2. Create an **Agent**, add scopes: `mpp:payment:initiate`, optionally `mpp:payment:max_txn_paise:*`
3. Copy the **Agent ID** (`ag_...`) → `GRANTEX_AGENT_ID` env var
4. Copy the **API Key** → `GRANTEX_API_KEY` env var (only visible once after creation)

The client SDK only needs to **pass** a grant token per request. The grant token is obtained from the Grantex consent flow implemented on your server (see `server-sdk-api-reference.md` for the full server-side setup).

### Client SDK Grantex Config (TypeScript)

```ts
const client = PineLabsOnlineClient.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  env: P3PEnvironment.SANDBOX,
  grantex: {
    enforceGrant: true,                              // throw before payment if no grant token
    agentId: process.env.GRANTEX_AGENT_ID,           // assert grant is for this agent (raw ag_... form)
    requiredScopes: ["mpp:payment:initiate"],         // assert grant has these scopes
    // baseUrl defaults to https://api.grantex.dev
  },
});

// Pass per request — grantToken is retrieved from your DB after user completes consent:
await client.get(url, {}, {
  mobileNumber: "9876543210",
  paymentMethod: PaymentMethod.RESERVE_PAY,
  grantexToken: storedGrantToken,   // from exchangeGrantexCode / DB lookup
});
```

The JWKS URI is always `<baseUrl>/.well-known/jwks.json`.

---

## `PaymentMethod` Enum

| Value | String | Description |
|---|---|---|
| `PaymentMethod.RESERVE_PAY` | `"RESERVE_PAY"` | UPI ReservePay pre-authorization |
| `PaymentMethod.OTM` | `"OTM"` | UPI One-Time Mandate |
| `PaymentMethod.Crypto` | `"CRYPTO"` | Cryptocurrency |

The `paymentMethod` in the runtime context must match one of the server's `availablePaymentMethods` in the 402 challenge. If it does not match, the SDK raises a validation error before creating the token.

---

## Python SDK

The Python client SDK (`pinelabs_p3p_client`) mirrors the TypeScript SDK with snake_case naming.

### Create Client

```python
from pinelabs_p3p_client import (
    P3PEnvironment, PineLabsOnlineClient, PineLabsOnlineClientConfig,
)

client = PineLabsOnlineClient.create(PineLabsOnlineClientConfig(
    env=P3PEnvironment.SANDBOX,
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
))
# Call client.close() on shutdown
```

### Make a Paid Request

```python
from pinelabs_p3p_client import ClientRuntimeContext, PaymentMethod

response = client.get(
    "https://server.example.com/api/premium",
    context=ClientRuntimeContext(
        customerReference="customer-ref-123",
        mobileNumber="9876543210",
        paymentMethod=PaymentMethod.RESERVE_PAY,
        grantexToken=user_grant_token,   # optional
    ),
)
data = response.json()
```

### Customer-Key Auth Mode

```python
from pinelabs_p3p_client import P3PCustomerAuthMode

client = PineLabsOnlineClient.create(PineLabsOnlineClientConfig(
    env=P3PEnvironment.SANDBOX,
    customerAuthMode=P3PCustomerAuthMode.CustomerKey,
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
))

# Then pass customerKey in context:
response = client.get(
    url,
    context=ClientRuntimeContext(
        mobileNumber="9876543210",
        customerKey="cust_api_token_...",
        paymentMethod=PaymentMethod.RESERVE_PAY,
    ),
)
```

### Direct Token Creation

```python
from pinelabs_p3p_client import Amount, CreateTokenOptions, PaymentMethod

token = client.methods.create_token(CreateTokenOptions(
    customerReference="customer-ref-123",
    mobileNumber="9876543210",
    challengeId="ch_...",
    paymentAmount=Amount(value=50000, currency="INR"),
    paymentMethod=PaymentMethod.RESERVE_PAY,
))
```

### Grantex (Python)

```python
from pinelabs_p3p_client.types.config import ClientGrantexConfig

client = PineLabsOnlineClient.create(PineLabsOnlineClientConfig(
    env=P3PEnvironment.SANDBOX,
    clientId=os.environ["PINELABS_CLIENT_ID"],
    clientSecret=os.environ["PINELABS_CLIENT_SECRET"],
    grantex=ClientGrantexConfig(
        enforceGrant=True,
        agentId=os.environ.get("GRANTEX_AGENT_ID"),  # raw ag_... form for client SDK
        requiredScopes=["mpp:payment:initiate"],
        # baseUrl defaults to https://api.grantex.dev
    ),
))

# Pass per request:
response = client.get(
    url,
    context=ClientRuntimeContext(
        mobileNumber="9876543210",
        paymentMethod=PaymentMethod.RESERVE_PAY,
        grantexToken=stored_grant_token,   # from your DB after user completes consent
    ),
)
```

**Note:** The client SDK only needs the grant token at request time. Getting the grant token (consent flow, `createGrantexAuthorization`, `exchangeGrantexCode`, `allocateGrantexBudget`) is done entirely on the **server side** — see `server-sdk-api-reference.md`.

### Error Handling

```python
from pinelabs_p3p_client import P3PChallengeError, P3PError, P3PNetworkError

try:
    response = client.get(url, context=runtime_context)
except P3PChallengeError as err:
    # challenge validation failed
except P3PNetworkError as err:
    # network / timeout
except P3PError as err:
    print(err.code, err.http_status, err.details)
```
