# P3P SDK — Integration Flow (x402)

## Official Documentation

- **P3P Overview:** https://www.pinelabs.com/docs/online-payments/ai/p3p
- **Quickstart:** https://www.pinelabs.com/docs/online-payments/ai/p3p/quickstart
- **SDK Reference:** https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks
- **Integration Support:** pgintegration@pinelabs.com

## Protocol Overview

Pine Labs P3P implements the **x402 protocol** — HTTP-native payments using `402 Payment Required`. A client agent requests a paid resource; the server returns 402 with payment requirements; the client fulfills payment and retries; the server captures the payment and returns the resource.

---

## Full x402 Sequence

```
Client App               Your Server              Pine Labs P3P          UPI / NPCI
    │                         │                         │                     │
    │                         │                         │                     │
    ├── SETUP (one-time) ─────────────────────────────────────────────────────────────
    │                         │                         │                     │
    │── GET /api/premium ────▶│                         │                     │
    │◀── HTTP 402 ────────────│ WWW-Authenticate: Payment <challenge>          │
    │   (payment required)    │                         │                     │
    │                         │                         │                     │
    │  [client SDK decodes    │                         │                     │
    │   challenge, creates    │                         │                     │
    │   mandate + PPT token]  │                         │                     │
    │                         │                         │                     │
    ├── PAYMENT PHASE ────────────────────────────────────────────────────────────────
    │                         │                         │                     │
    │── GET /api/premium ────▶│── POST /mpp/v1/debit ──▶│                     │
    │   P3P-Credential: ...   │                         │── ReservePay debit ─▶│
    │                         │◀── debit confirmed ─────│◀── NPCI confirmed ──│
    │◀── 200 + resource ──────│                         │                     │
    │   Payment-Receipt: ...  │                         │                     │
```

---

## Step-by-Step Flow

### 1. Client makes initial request (no credential)

```http
GET /api/premium HTTP/1.1
Host: your-server.com
```

### 2. Server returns 402 with challenge

Server SDK calls `generateChallenge` or `decidePayment`:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/problem+json
WWW-Authenticate: Payment eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "type": "https://pluralpay.in/problems/payment-required",
  "title": "Payment Required",
  "status": 402,
  "detail": "This resource requires payment of ₹500.00"
}
```

The challenge payload (base64-decoded):

```json
{
  "request": {
    "amount": { "value": 50000, "currency": "INR" },
    "availablePaymentMethods": ["RESERVE_PAY", "OTM"],
    "resourcePath": "/api/premium",
    "expires_at": "2026-04-05T10:30:00Z"
  }
}
```

### 3. Client SDK creates mandate and mints PPT

The `PineLabsOnlineClient` handles this automatically:
- Validates challenge amount and expiry
- Calls `POST /mpp/v1/mandates` → gets `payment_method_id` + QR (for user authorization in interactive flows)
- Once mandate is `AUTHORIZED`, calls `POST /mpp/v1/tokens` → gets PPT string

### 4. Client retries with credential

```http
GET /api/premium HTTP/1.1
Host: your-server.com
P3P-Credential: Payment ppt_live_eyJhbGciOiJIUzI1NiIs...
```

### 5. Server verifies and debits

Server SDK `decidePayment`:
- HMAC-verifies the credential against the signed challenge
- Validates `payment_method` is in `availablePaymentMethods`
- Calls `POST /mpp/v1/debit` — executes UPI ReservePay charge
- On success: returns `proceed` action

### 6. Server returns resource + receipt

```http
HTTP/1.1 200 OK
Content-Type: application/json
Payment-Receipt: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{ "data": "your protected resource payload" }
```

The receipt (base64-decoded):

```json
{
  "debit_id": "dbt-v1-260405110000-ab-Kx9pQr",
  "amount": { "value": 50000, "currency": "INR" },
  "paymentGateway": "PineLabsOnline",
  "paymentMethod": "RESERVE_PAY",
  "timestamp": "2026-04-05T11:00:00Z"
}
```

---

## Header Reference

### Client → Server

| Header | When | Description |
|---|---|---|
| *(none)* | First request | No payment credential |
| `P3P-Credential: Payment <token>` | Retry | PPT token from mandate |
| `X-Grantex-Token: <grant>` | Any request | Grantex delegated authorization grant token |

### Server → Client

| Header | When | Description |
|---|---|---|
| `WWW-Authenticate: Payment <challenge>` | 402 response | Encoded payment requirements |
| `Payment-Receipt: <receipt>` | 200 response | Settlement confirmation |

### Server SDK → Pine Labs MPP API

| Header | When | Required | Description |
|---|---|---|---|
| `Authorization: Bearer <token>` | Every call | Yes | m2m access token minted via `POST /api/auth/v1/token` using `client_id` + `client_secret` |
| `Content-Type: application/json` | POST/PUT/PATCH | Yes | JSON body |
| `Accept: application/json` | Every call | Yes | JSON response |
| `Idempotency-Key: <uuid>` | `POST /mpp/v1/pre-authorize` (CARD), `POST /mpp/v1/debit` | **Yes for CARD mandates and debits** | UUIDv4. The server SDK auto-generates one via `randomId()` if `options.idempotencyKey` is not set; pass your own to make retries safe. The Pine Labs sandbox returns `400 IDEMPOTENCY_KEY_REQUIRED` without it. |
| `Merchant-ID: <merchant_id>` | `POST /mpp/v1/pre-authorize` | **Yes** | Numeric merchant ID (e.g. `111567`). Find it in the Pine Labs merchant dashboard or Postman collection. **The SDK does not currently send this header** — see "Known SDK Gap: `Merchant-ID`" below. |

---

## Error States

| Scenario | Server Action | Client SDK Behavior |
|---|---|---|
| No credential | Return 402 with challenge | Create mandate + token, retry |
| Credential expired | Return 402 | Create new mandate + token, retry |
| Invalid credential (HMAC fail) | Return 400 | Raise `P3PCredentialError` |
| Payment method mismatch | Return 402 | Raise `P3PChallengeError` |
| Debit failed | Return 402 or 500 | Raise `P3PDebitError` |
| Debit pending (202) | `decision.action === "pending"` | Server withholds resource; poll `p3p.getDebitStatus(idempotencyKey)` |
| Grantex grant missing/invalid | Return 402 | Raise `P3PGrantexError` |

---

## Grantex — Delegated Agent Authorization (Required for P3P Txn Flows)

Grantex is the **required** delegated-authorization layer for P3P txn flows. It lets users explicitly grant bounded spending authority to your agent via a consent page before paid calls begin, enforces a daily spend limit and a per-txn limit set during consent, and is enforced on every `decidePayment` call. `decidePayment` returns `402` and withholds the paid resource without a valid `X-Grantex-Token`. It is optional only when the server config explicitly sets `grantex.enforceGrant: false` — not the default path or the supported flow.

### Developer Prerequisites (one-time account setup)

1. Sign up at https://grantex.dev
2. Create an **Agent** and add scopes:
   - `mpp:payment:initiate` (required)
   - `mpp:payment:max_txn_paise:*` (required for per-txn limit enforcement)
3. After agent creation, copy:
   - **Agent ID** (`ag_...`) → store as `GRANTEX_AGENT_ID`
   - **API Key** → store as `GRANTEX_API_KEY` (shown only once)

```bash
export GRANTEX_API_KEY=your_grantex_api_key
export GRANTEX_AGENT_ID=ag_xxxxxxxxxxxxxxxx
```

### Integration Steps

1. Add `grantex.hosted.apiKey` and `grantex.agentId` to your server SDK config (see `server-sdk-api-reference.md`)
2. Add `grantex.agentId` to your client SDK config (optional — for client-side grant enforcement)
3. Implement the server-side consent flow as **two HTTP handlers** (the user must leave your app to approve at Grantex, then return via browser redirect):
   - **Handler 1** `POST /grantex/start`: `p3p.createGrantexAuthorization({ userId, agentId, scopes, redirectUri })` → save `state`↔customer mapping (TTL ~10 min) → `res.redirect(302, auth.consentUrl)`
   - **Handler 2** `GET /grantex/callback?code=...&state=...`: verify `state`, `p3p.exchangeGrantexCode({ code, agentId })` → `p3p.allocateGrantexBudget({ grantId, initialBudget: <paise>, currency })` → persist `grantToken` + `grantId` in your DB
   - `redirectUri` passed in Handler 1 **must be HTTPS** (`http://` is rejected). In local dev use a tunnel (`ngrok http 3000` / `cloudflared`) and pass `https://<tunnel>/grantex/callback`. In production use your real `https://yourapp.com/grantex/callback`.
   - Full runnable code: see the "Step 3 — Implement the Grantex Consent Flow (Server-Side)" section in `server-sdk-api-reference.md`.
4. On every paid request, attach the stored `grantToken` as `X-Grantex-Token` (server attaches it, never the browser)

### Key Rules

- Use **raw** `ag_...` Agent ID for `createGrantexAuthorization` and `exchangeGrantexCode`
- Use **DID form** `did:grantex:ag_...` for server-side `agentId` in `ServerGrantexConfig` (unless the ID already starts with `did:`)
- Allocate budget in **paise** — do not divide by 100
- `redirectUri` must be **HTTPS** (use `ngrok`/`cloudflared` in local dev)
- Never expose the grant token to browser/frontend code; always attach it server-side

> **⚠️ SDK type comment vs docs discrepancy (under review):** The published `p3p-server-sdk` `.d.ts` typedef describes `initialBudget`/`amount` as major units (rupees), implying division by 100. The [P3P SDK public docs](https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks) instead specify paise (minor units), consistent with `Amount.value`. This skill follows the docs (paise). If the `.d.ts` comments are wrong (100× budget inflation bug), it will be filed against `p3p-server-sdk` upstream. Until resolved, pass paise.

---

## Idempotency

`Idempotency-Key` is **required by the Pine Labs MPP API** for `CARD` mandates (`POST /mpp/v1/pre-authorize`) and for all debit operations (`POST /mpp/v1/debit`). The sandbox returns `400 IDEMPOTENCY_KEY_REQUIRED` without it.

For debit operations, derive the key from the request context (e.g., a hash of user ID + resource path + amount) so retries reuse the same key and avoid double-charges.

The server SDK auto-injects `Idempotency-Key` for both paths:
- **`createMandate`** → `ApiClient.createPreAuthorizationRequest` sets `options.idempotencyKey ?? randomId()` — callers can pass an explicit key for deterministic retry behaviour, otherwise a UUID v4 is generated per call.
- **`decidePayment`** → the key is derived automatically.

For manual debit flows (calling `p3p.capture()` directly), set `options.idempotencyKey` explicitly.

---

## Known SDK Gap: `Merchant-ID` Header

> **Status:** confirmed against `p3p-server-sdk@1.0.0` on `P3PEnvironment.SANDBOX` (host `pluraluat.v2.pinepg.in`). To be filed against `p3p-server-sdk` upstream.

### Symptom

Calling `p3p.createMandate({ paymentMethod: PaymentMethod.CARD, ... })` against the Pine Labs sandbox fails with:

```
P3PError: An unexpected error occurred.
  code: INTERNAL_ERROR
  httpStatus: 500
```

### Root cause

The Pine Labs MPP API requires a `Merchant-ID: <merchant_id>` header on `POST /mpp/v1/pre-authorize`. The SDK's `ApiClient.request()` only sends `Authorization`, `Accept`, `Content-Type`, and the call-specific `extraHeaders` — it never adds `Merchant-ID`. Without this header, the upstream backend throws an unhandled exception and returns the catch-all `500 INTERNAL_ERROR "An unexpected error occurred."` (no further detail, no correlation ID).

The merchant id is already present as `attrs.merchant-id` in the m2m JWT's claims, but the upstream MPP service still requires it as an explicit header — the SDK does not surface a way to provide it.

### Reproduction (raw curl, no SDK)

```bash
# Mint token (the SDK does this internally via AuthManager):
TOKEN=$(curl -sS -X POST https://pluraluat.v2.pinepg.in/api/auth/v1/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"<client_id>","client_secret":"<client_secret>"}' \
  | jq -r '.data.access_token')

# Reproduce the SDK failure (no Merchant-ID → 500):
curl -sS -X POST https://pluraluat.v2.pinepg.in/mpp/v1/pre-authorize \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"payment_method":"CARD","customer":{"mobile_number":"9390012810"},"amount":{"value":"1000","currency":"INR"}}'
# → 500 {"code":"INTERNAL_ERROR","message":"An unexpected error occurred."}

# Same call with the Merchant-ID header → 200 OK:
curl -sS -X POST https://pluraluat.v2.pinepg.in/mpp/v1/pre-authorize \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -H 'Merchant-ID: 111567' \
  -d '{"payment_method":"CARD","customer":{"mobile_number":"9390012810"},"amount":{"value":"1000","currency":"INR"}}'
# → 200 OK with payment_method_reference_id, challenge_url, status=PENDING, order_id, validity_in_days
```

### Workaround (until the SDK is patched)

Inject the header yourself after constructing the server SDK instance. The merchant id should come from environment (e.g. `PINELABS_MERCHANT_ID`) — never hardcode it:

```typescript
import { PineLabsOnlineP3P } from "p3p-server-sdk";

const p3p = PineLabsOnlineP3P.create(serverConfig);
const merchantId = process.env.PINELABS_MERCHANT_ID; // e.g. "111567"

if (merchantId) {
  // The SDK does not expose ApiClient on its public type; cast through unknown.
  const apiClient = (p3p as unknown as { apiClient: { request: (...args: unknown[]) => Promise<unknown> } }).apiClient;
  const origRequest = apiClient.request.bind(apiClient);
  apiClient.request = async (method, path, body, extraHeaders = {}) => {
    const merged = { ...(extraHeaders as Record<string, string>) };
    if (path === "/mpp/v1/pre-authorize" && !merged["Merchant-ID"]) {
      merged["Merchant-ID"] = merchantId;
    }
    return origRequest(method, path, body, merged);
  };
}
```

### Success response shape (`POST /mpp/v1/pre-authorize` → `200 OK`)

```json
{
  "payment_method": "CARD",
  "payment_method_reference_id": "v1-sub-260820103357-aa-fHeFMP",
  "customer": {
    "customer_id": "cust-v1-260709082742-aa-hqn13Y",
    "merchant_customer_reference": "67ec95c2-3e35-4409-adc7-a679015ce524",
    "mobile_number": "9390012810",
    "global_customer_id": "pl-v1-260709082743-aa-VcE5zS"
  },
  "challenge_url": "https://pluraluat.v2.pinepg.in/api/v3/checkout-bff/redirect/checkout?flow=CARD&token=V3_...",
  "status": "PENDING",
  "amount": { "value": 1000, "currency": "INR" },
  "order_id": "v1-260820103357-aa-x7IcCI",
  "validity_in_days": 4,
  "expiry_at": "2026-08-24T10:33:57.101757271Z"
}
```

The SDK parses this into a `Mandate` with `mandate_id`, `order_status` (set to `"PENDING"` until the customer completes the challenge at `challenge_url`), and (for CARD) a `challenge` object with `qr_url` / `deep_link` pointing at the same `challenge_url`.

### Find your `Merchant-ID`

- **Pine Labs merchant dashboard** — usually shown on the top-right or under Settings → Merchant Profile.
- **Your Postman collection** — many Pine Labs Postman workspace examples pre-set a `Merchant-ID` header (e.g. `111567` for the public sandbox samples).
- **The m2m JWT itself** — decode the `access_token` (it is a JWT); the merchant id is in the `attrs.merchant-id` claim. This is also a useful sanity check that your `client_id` is bound to the merchant you expect.

---

## Sandbox Mobile-Number Behaviour

The Pine Labs sandbox provisions customers on demand: any mobile number that is not already known to the merchant creates a new `customer_id` on the fly. There is one important caveat:

- **Do not use the placeholder `9876543210`** — the sandbox returns `500 INTERNAL_ERROR "An unexpected error occurred."` for that specific number. This is the SDK's `TEST_MOBILE` default; override it via env var (`PINELABS_TEST_MOBILE` or whatever your integration uses). Any other 10-digit Indian mobile number we tested (e.g. `9390012810`, `9123456789`) succeeded.
- This is a **sandbox-side quirk only** — production does not exhibit the same blacklist.

### Recommended env vars for local integration tests

```bash
# Pine Labs M2M credentials (from your Pine Labs merchant dashboard)
PINELABS_CLIENT_ID=<your_client_id>
PINELABS_CLIENT_SECRET=<your_client_secret>
# Numeric merchant ID (required by /mpp/v1/pre-authorize; see "Known SDK Gap" above)
PINELABS_MERCHANT_ID=<your_merchant_id>
# Test mobile number — anything except 9876543210
PINELABS_TEST_MOBILE=9390012810
```
