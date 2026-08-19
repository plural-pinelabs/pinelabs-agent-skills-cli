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

## Grantex — Delegated Agent Authorization

Grantex is an **optional** layer. Skip this section if you are not using delegated authorization.

It lets users explicitly grant bounded spending authority to your agent before paid calls begin. The server enforces the grant on every `decidePayment` call.

### Developer Prerequisites (one-time account setup)

1. Sign up at https://grantex.dev
2. Create an **Agent** and add scopes:
   - `mpp:payment:initiate` (required)
   - `mpp:payment:max_txn_paise:*` (optional, for spend-limit enforcement)
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
3. Implement the server-side consent flow: `createGrantexAuthorization` → redirect user → `exchangeGrantexCode` → `allocateGrantexBudget` → store `grantToken` in your DB
4. On every paid request, attach the stored `grantToken` as `X-Grantex-Token` (server attaches it, never the browser)

### Key Rules

- Use **raw** `ag_...` Agent ID for `createGrantexAuthorization` and `exchangeGrantexCode`
- Use **DID form** `did:grantex:ag_...` for server-side `agentId` in `ServerGrantexConfig` (unless the ID already starts with `did:`)
- Allocate budget in **paise** — do not divide by 100
- Never expose the grant token to browser/frontend code; always attach it server-side

---

## Idempotency

Always set an `Idempotency-Key` on debit operations. The key should be derived from the request context (e.g., a hash of user ID + resource path + amount) so retries reuse the same key and avoid double-charges.

The server SDK passes the idempotency key automatically when using `decidePayment`. For manual debit flows, set it explicitly.
