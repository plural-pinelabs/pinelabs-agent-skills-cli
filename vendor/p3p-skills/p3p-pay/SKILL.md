---
name: p3p-pay
version: 1.2.0

description: Use when the user asks to make a payment, charge a client agent, set up a mandate, or pay using Pine Labs P3P. Also use for questions about Pine Labs P3P as a product — what it is, how it works, x402 protocol, supported payment methods (RESERVE_PAY, OTM, CARD), mandate lifecycle, token limits, or sandbox setup. This is the router skill — choose the method-specific skill (p3p-pay-upi or p3p-pay-card) for the actual payment flow. Do NOT use for peer-to-peer UPI transfers, general payment-gateway comparisons, or non-P3P integrations.
homepage: https://www.pinelabs.com/
author: Pine Labs Online
user-invocable: true
metadata: {"category":"payments","primaryEnv":"","requires":{"env":["PINELABS_CLIENT_ID","PINELABS_CLIENT_SECRET"],"npm":["p3p-server-sdk","p3p-client-sdk"],"pip":["pinelabs-online-p3p-server-sdk","pinelabs-online-p3p-client-sdk"]}}
tags:
  - payments
  - ai-agents
  - upi
  - reservepay
  - otm
  - card
  - x402
  - mandate
  - ppt
  - sdk
  - router
---

# P3P Pay — Router Skill for AI Agents

This is the **router** for Pine Labs P3P payments. It decides which payment method to use, then delegates the actual execution flow to a method-specific skill. Do not run payment calls from this file directly — pick the right sub-skill and follow it.

## What is P3P?

**P3P (Pine Labs Payment Protocol)** is Pine Labs' implementation of the **x402 protocol** — HTTP-native payments for AI agents. Instead of bolting payment onto a checkout page, P3P makes any API endpoint able to declare "this costs ₹X to access" by returning HTTP `402 Payment Required` with a machine-readable challenge. A client agent (or SDK) reads the challenge, sets up a one-time mandate against the customer's UPI/card, mints a Pine Labs Payment Token (PPT), and retries the request with a `P3P-Credential` header. The server captures the debit and returns the resource — all without a browser, redirect, or human-in-the-loop checkout.

**What P3P does:**

- Lets AI agents pay for paid API access programmatically (no hosted checkout page)
- Supports UPI ReservePay, UPI OTM, and CARD mandates
- Enforces per-request and daily spend limits via Grantex delegated authorization
- Returns a settlement `Payment-Receipt` so the agent can prove it paid

**What P3P is NOT:** a general-purpose payment gateway replacement, a peer-to-peer UPI transfer tool, or a hosted checkout product. For those, use the standard Pine Labs Online payment gateway.

For SDK integration (server + client code, Next.js/Express/Flask/FastAPI), use the `p3p-sdk-integration` skill instead of this one. Full setup/auth details live in the [cli-setup reference](references/cli-setup.md).

## How to Get These Skills

This skill is delivered with the Pine Labs agent skills bundle. Install the full bundle (getting-started, payments, settlements, subscriptions, **and P3P**) into an AI coding assistant project:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks github-copilot --yes
```

Replace `github-copilot` with your assistant (`claude-code`, `cursor`, `kiro`, `gemini-cli`, `opencode`, `codex-cli`, `antigravity`). P3P is installed alongside the other Pine Labs domains under `p3p/`.

The package on npm: https://www.npmjs.com/package/pinelabs-agent-skills-cli

If the install fails due to permissions, do not retry with a privileged global install. Use a user-owned npm prefix, a virtualenv, or `--user` for pip.

Read [cli-setup reference](references/cli-setup.md) for product FAQs, sandbox vs production, and credential handling.

## When to Activate

Activate this skill when:
- The user asks you to pay for something, make a purchase, or charge a service
- The user asks to set up P3P, create a mandate, or link a UPI account / card for agent payments
- The user says "pay with P3P", "use Pine Labs P3P", "set up ReservePay", "card mandate", or similar
- The user asks general questions about Pine Labs P3P as a product or protocol — read [cli-setup reference](references/cli-setup.md) for product FAQs

> **P3P payments are executed through the P3P client and server SDKs, not a shell CLI.** Do not run `p3p mandates create`, `p3p tokens create`, or `p3p debit execute` — there is no `p3p` binary. Use the SDK methods documented in [`p3p/sdk-integration.md`](../p3p-sdk-integration/SKILL.md) and [references/server-sdk-api-reference.md](../p3p-sdk-integration/references/server-sdk-api-reference.md) instead.

## Step 1 — Identify the Payment Method

Ask the user which payment method they want unless they have already specified it. The supported methods and their routing:

| If the user wants… | Payment method constant | Route to skill |
|---|---|---|
| UPI ReservePay (recurring block) | `PaymentMethod.RESERVE_PAY` | [`p3p/pay-upi.md`](pay-upi.md) (`p3p-pay-upi`) |
| UPI One-Time Mandate | `PaymentMethod.OTM` | [`p3p/pay-upi.md`](pay-upi.md) (`p3p-pay-upi`) |
| Card mandate | `PaymentMethod.CARD` | [`p3p/pay-card.md`](pay-card.md) (`p3p-pay-card`) |

If the user's language is ambiguous ("just pay", "P3P it"), ask one short routing question before any SDK call:

> Would you like to pay via **UPI** (ReservePay / OTM) or **Card**?

Do not assume. Picking the wrong method forces the wrong activation step (UPI QR vs card checkout URL), wastes the user's time, and moves real money in production.

## Step 2 — Hand Off to the Method-Specific Skill

Once the method is known, **read the chosen sub-skill and follow it end-to-end**. Do not re-summarise the method-specific steps from this file — the sub-skill is the source of truth for that flow.

- **What the router does NOT do:** call `createMandate`, generate a QR or checkout URL, poll mandate status, mint a PPT, or call `decidePayment`. Those happen in the sub-skill.
- **What the router does own:** the cross-cutting context below — environment check, anti-patterns that apply to every method, and the P3P installation entry point. Read this section once before handing off.

### Routing table for hand-off

| Destination skill | Local path | Handles |
|---|---|---|
| **p3p-pay-upi** | [p3p/pay-upi.md](pay-upi.md) | `PaymentMethod.RESERVE_PAY`, `PaymentMethod.OTM` — UPI QR / `deep_link` activation, `getMandateBalance` (ReservePay only) |
| **p3p-pay-card** | [p3p/pay-card.md](pay-card.md) | `PaymentMethod.CARD` — `checkout_url` + OTP activation (no `getMandateBalance` — CARD not supported) |

## Cross-Cutting Context (read once before handing off)

### Common prerequisites

Install the P3P runtime SDKs in the target project (both router and sub-skills assume this):

**TypeScript (server + client):**
```bash
npm install p3p-server-sdk p3p-client-sdk
```

**Python (server + client):**
```bash
pip install pinelabs-online-p3p-server-sdk pinelabs-online-p3p-client-sdk
```

Set credentials server-side (never in chat, command arguments, screenshots, logs, or committed files):

```bash
export PINELABS_CLIENT_ID=your_client_id
export PINELABS_CLIENT_SECRET=your_client_secret
export PINE_LABS_ENV=SANDBOX
```

### Verify SDK and Authenticate

Confirm the SDK is importable and credentials are available before handing off:

```bash
test -n "${PINELABS_CLIENT_ID:-}" && echo "PINELABS_CLIENT_ID is set" || echo "PINELABS_CLIENT_ID is MISSING"
test -n "${PINELABS_CLIENT_SECRET:-}" && echo "PINELABS_CLIENT_SECRET is set" || echo "PINELABS_CLIENT_SECRET is MISSING"
```

Decision tree:
- **Env vars present** — proceed to hand-off (the sub-skill initializes the SDK).
- **Env vars missing** — ask the user to set them server-side. Never print or log the secret value.

### Production Gate (applies to every method)

Before `createMandate`, creating a token (client SDK), or capturing a debit (`decidePayment`), inspect the active environment:

```bash
printf 'PINE_LABS_ENV=%s\n' "${PINE_LABS_ENV:-SANDBOX}"
```

Default to `SANDBOX`. If the active environment is `PRODUCTION`, stop and ask for explicit confirmation that includes the amount, customer identifier, merchant context, and operation (`mandate`, `token`, or `debit`). Do not continue from an implied approval.

### Shared concepts worth knowing before the hand-off

- **402 protocol** — Pine Labs P3P is an x402 implementation: the protected server resource returns HTTP `402 Payment Required` with a challenge; the client SDK mints a one-shot Pine Labs Payment Token (PPT) against the active mandate and retries with a `P3P-Credential: Payment <payload>` header. The server then captures the debit via `decidePayment` and returns the resource with a `Payment-Receipt` header.
- **Mandate lifecycle** — `CREATED` → `AUTHORIZED`/`ACTIVE` → `CLOSED` (or `FAILED`). The paid route only succeeds once the mandate is `ACTIVE`. Read [cli-mandates reference](references/cli-mandates.md) for all states.
- **One-shot tokens** — a PPT is single-use. For multi-charge (ReservePay or card mandates with `usage_limits`), the client SDK mints a fresh PPT per challenge; the underlying mandate stays active. Read [cli-tokens reference](references/cli-tokens.md) for usage limits, expiry, and the `ppt_test_` / `ppt_prod_` prefixes.
- **Amounts are in paise** — `50000` = ₹500.00. Handling paise/rupees incorrectly is the most common integration bug.
- **Server-only credentials** — `clientSecret` is never in browser code. Backends that use `decidePayment` are always Server Components / server routes. Browser/front-end code should call your own backend endpoints.
- **Grantex tokens** — `X-Grantex-Token` and the `grantexToken` client option are **required for P3P txn flows**: Grantex surfaces the consent page, daily spend limit, and per-txn limit to the user and `decidePayment` rejects paid calls without a valid grant. Use the raw `ag_...` Agent ID for `createGrantexAuthorization` and `exchangeGrantexCode`, and the DID form `did:grantex:ag_...` for the server-side `agentId` verifier config.

### Reference files (shared across methods)

The router and both sub-skills share these reference files under `p3p/references/`:

| Reference | What to read it for |
|---|---|
| [cli-setup.md](references/cli-setup.md) | P3P product FAQs, supported methods, sandbox vs production |
| [cli-mandates.md](references/cli-mandates.md) | Mandate states, creation params, error codes, sandbox auto-approve |
| [cli-tokens.md](references/cli-tokens.md) | PPT usage limits, expiry, prefixes (`ppt_test_` vs `ppt_prod_`), multi-charge |
| [cli-debit.md](references/cli-debit.md) | `decidePayment` outcomes, receipt format, pending debit polling |

For the deeper SDK API surface, SDK integration patterns, and reference templates: [`p3p/sdk-integration.md`](../p3p-sdk-integration/SKILL.md) and its `references/` directory.

## SDK Quick Reference (overview — see sub-skills for per-method usage)

```ts
// Server SDK (p3p-server-sdk)
PineLabsOnlineP3P.create(config)
  .createMandate({...})          // block funds; returns deep_link (UPI) or checkout_url (card)
  .getMandate(mandateId)          // poll for ACTIVE — takes the mandate_id string
  .getMandateBalance({...})      // RESERVE_PAY only — OTM and CARD unsupported
  .getDebitStatus(idemKey)       // poll pending debit
  .createGrantexAuthorization({...})  // required: Grantex consent flow (user consent page + limits)
  .exchangeGrantexCode({...})
  .allocateGrantexBudget({...})

decidePayment({...})             // route helper: challenge, verify, capture, receipt

// Client SDK (p3p-client-sdk)
PineLabsOnlineClient.create(config)
  .get/post/put/delete/patch/request(url, init, context)  // automatic 402 → token → retry
  .methods.createToken(...)      // manual token creation (rarely needed)
```

```python
# Python (pinelabs-online-p3p-server-sdk / pinelabs-online-p3p-client-sdk)
PineLabsOnlineP3P.create(config)
  .create_mandate(...)
  .get_mandate(mandate_id)                  // poll for ACTIVE — takes the mandate_id string
  .get_mandate_balance(...)
  .get_debit_status(idem_key)
  .create_grantex_authorization(...)
  .exchange_grantex_code(...)
  .allocate_grantex_budget(...)

decide_payment(...)
PineLabsOnlineClient.create(config).get/post/put/delete(url, init, context)
```

## Environment Variables

| Variable | Description |
|---|---|
| `PINELABS_CLIENT_ID` | Client ID — overrides stored config |
| `PINELABS_CLIENT_SECRET` | Client secret — overrides stored config (never log, never expose to browser) |
| `PINE_LABS_ENV` | `SANDBOX` or `PRODUCTION` |
| `GRANTEX_AGENT_ID` | Required for P3P txn flows — raw `ag_...` Agent ID for Grantex consent and code exchange (Grantex surfaces the consent page, daily limit, per-txn limit) |
| `GRANTEX_API_KEY` | Required for P3P txn flows — Grantex API key for hosted Grantex config (`grantex.hosted.apiKey`) |
| `GRANTEX_ISSUER` | Optional — Grantex issuer URL, defaults to `https://grantex.dev` |
| `GRANTEX_BASE_URL` | Optional — Grantex API base URL, defaults to `https://api.grantex.dev` |

Grantex is the **mandatory** delegated-authorization layer for P3P: it shows the consent page and enforces the user's daily and per-txn spend limits. `decidePayment` withholds the paid resource without a valid `X-Grantex-Token`. It is optional only when the server config explicitly sets `grantex.enforceGrant: false` — not the default path or supported flow.

## Anti-Patterns

- Calling `createMandate`, polling `getMandate`, minting a PPT, or calling `decidePayment` from this router — always hand off to the sub-skill first.
- Choosing a payment method without confirming the user's intent when their request is ambiguous.
- Routing a UPI request to `p3p-pay-card` or vice versa (the activation UIs are incompatible: UPI QR vs card checkout URL).
- Calling `createMandate` before credentials are set.
- Creating a token / calling the paid route before the mandate is `ACTIVE`.
- Running a debit with amount greater than the token `max_amount` — debit rejected.
- Guessing or hallucinating customer identifier, amount, or Grantex grant token.
- Asking the user for their secret in chat — read it from server-side env vars only.
- Using paise values as rupees (₹500 ≠ 500 paise — use 50000 paise).
- Allocating Grantex budget in rupees — allocate in paise, matching `Amount.value`. Do not divide by 100. *(SDK `.d.ts` comments contradict this and imply rupees — follow the [public docs](https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks); under review as a possible SDK type-comment bug.)*
- Exposing the Grantex grant token to the browser — always attach `X-Grantex-Token` server-side.
- Treating `p3p-server-sdk` / `p3p-client-sdk` / `pinelabs-agent-skills-cli` as the same thing. `pinelabs-agent-skills-cli` installs this guidance; it does **not** execute payments.

## When the User Asks a General P3P Question

If the user is asking about P3P as a product (what it is, supported methods, sandbox behaviour) rather than requesting a payment, do not route to a sub-skill. Answer from [cli-setup reference](references/cli-setup.md) and the "Shared concepts" section above. Only route to `p3p-pay-upi` or `p3p-pay-card` when a concrete payment is being set up or executed.

---

*Built by [Pine Labs Online](https://www.pinelabs.com/) — x402 payment infrastructure for AI agents.*
