# P3P Setup & Authentication

## What is P3P?

**P3P (Pine Labs Payment Protocol)** is Pine Labs' implementation of the **x402 protocol** — HTTP-native payments for AI agents. Instead of bolting payment onto a checkout page, P3P makes any API endpoint able to declare "this costs ₹X to access" by returning HTTP `402 Payment Required` with a machine-readable challenge. A client agent (or SDK) reads the challenge, sets up a one-time mandate against the customer's UPI/card, mints a Pine Labs Payment Token (PPT), and retries the request with a `P3P-Credential` header. The server captures the debit and returns the resource — all without a browser, redirect, or human-in-the-loop checkout.

**What P3P does:**

- Lets AI agents pay for paid API access programmatically (no hosted checkout page)
- Supports UPI ReservePay, UPI OTM, and CARD mandates
- Enforces per-request and daily spend limits via Grantex delegated authorization
- Returns a settlement `Payment-Receipt` so the agent can prove it paid

**What P3P is NOT:** a general-purpose payment gateway replacement, a peer-to-peer UPI transfer tool, or a hosted checkout product. For those, use the standard Pine Labs Online payment gateway.

For SDK integration (server + client code, Next.js/Express/Flask/FastAPI), use the `p3p-sdk-integration` skill instead of this one.

## Install P3P Runtime SDKs

P3P payments are executed through the P3P client and server SDKs. There is no standalone P3P payment CLI.

**TypeScript (server + client):**
```bash
npm install p3p-server-sdk p3p-client-sdk
```

**Python (server + client):**
```bash
pip install pinelabs-online-p3p-server-sdk pinelabs-online-p3p-client-sdk
```

Verify:
```bash
node -e "require('p3p-server-sdk')" 2>/dev/null && echo "p3p-server-sdk OK" || echo "p3p-server-sdk MISSING"
```

## Get Pine Labs Agent Skills (P3P + all domains)

Install the full Pine Labs agent skills bundle — getting-started, payments, settlements, subscriptions, **and P3P** — into an AI coding assistant project:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks github-copilot --yes
```

Replace `github-copilot` with your assistant (`claude-code`, `cursor`, `kiro`, `gemini-cli`, `opencode`, `codex-cli`, `antigravity`).

Package: https://www.npmjs.com/package/pinelabs-agent-skills-cli

## Authentication

The SDKs use Pine Labs client credentials (`PINELABS_CLIENT_ID` + `PINELABS_CLIENT_SECRET`) to obtain short-lived bearer tokens from `/api/auth/v1/token`. Bearer tokens are cached and refreshed automatically by the SDK.

### Environment Variables

Set these server-side before initializing the SDK — they are the only supported credential path:

```bash
export PINELABS_CLIENT_ID=your_client_id
export PINELABS_CLIENT_SECRET=your_client_secret
export PINE_LABS_ENV=SANDBOX         # or PRODUCTION
```

Never pass client credentials in command arguments, inline JSON, screenshots, logs, or chat. Do not log the secret value. Keep them server-side only.

### Grantex (Required — Delegated Authorization)

Grantex is the **mandatory** delegated-authorization layer for P3P. It provides:
- The **consent page** the user must approve before any paid call begins
- A **daily spend limit** the user sets during consent
- A **per-txn limit** the user sets during consent

Without Grantex configured and a valid `X-Grantex-Token` on the request, `decidePayment` returns `402` and the paid resource is withheld. Do **not** proceed without it. It is optional only in the narrow case where you explicitly disable `grantex.enforceGrant` on the server config — not the default path and not the supported flow.

Set these server-side before initializing the SDK:

```bash
export GRANTEX_AGENT_ID=ag_xxxxxxxxxxxxxxxx    # raw ag_...
export GRANTEX_API_KEY=your_grantex_api_key
```

Use the raw `ag_...` Agent ID for `createGrantexAuthorization` and `exchangeGrantexCode`. Use the DID form `did:grantex:ag_...` for the server-side `agentId` verifier config. Sign up for an Agent at https://grantex.dev.

## Environment Selection

| Environment | SDK value | Use For |
|-------------|----------|---------|
| `SANDBOX` | `P3PEnvironment.SANDBOX` | Development and testing |
| `PRODUCTION` | `P3PEnvironment.PRODUCTION` | Live payments |

Always use `SANDBOX` for development. Sandbox credentials are obtained from the Pine Labs Developer Dashboard.

## Config Management

The SDK reads credentials from `PINELABS_CLIENT_ID` / `PINELABS_CLIENT_SECRET`. Override the base URL only for local/staging proxying (rare):

```ts
const p3p = PineLabsOnlineP3P.create({
  clientId: process.env.PINELABS_CLIENT_ID!,
  clientSecret: process.env.PINELABS_CLIENT_SECRET!,
  paymentGateway: PaymentGateway.PineLabsOnline,
  availablePaymentMethods: [PaymentMethod.RESERVE_PAY, PaymentMethod.OTM],
  env: P3PEnvironment.SANDBOX,
  // baseUrl: "https://pluraluat.v2.pinepg.in",  // optional local/staging override
});
```

## Environments

| Environment | Base URL | Use For |
|-------------|----------|---------|
| `SANDBOX` | `https://pluraluat.v2.pinepg.in` | Development and testing |
| `PRODUCTION` | `https://api.pluralpay.in` | Live payments |

Always use `SANDBOX` for development. Sandbox credentials are obtained from the Pine Labs Developer Dashboard.
