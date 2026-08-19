---
name: p3p-pay
version: 1.0.0

description: Use when the user asks to make a payment, charge a client agent, set up UPI ReservePay, create a mandate, or pay using Pine Labs P3P. Also use for questions about Pine Labs P3P as a product — what it is, how it works, x402 protocol, supported payment methods (RESERVE_PAY, OTM, Crypto), mandate lifecycle, token limits, or sandbox setup. Do NOT use for peer-to-peer UPI transfers, general payment-gateway comparisons, or non-P3P integrations.
homepage: https://www.pinelabs.com/
author: Pine Labs Online
user-invocable: true
metadata: {"category":"payments","primaryEnv":"","requires":{"env":[],"npm":["@pine-labs-online/p3p-cli"]}}
tags:
  - payments
  - ai-agents
  - upi
  - reservepay
  - x402
  - mandate
  - ppt
  - cli
---

# P3P Pay — UPI ReservePay Payment Skill for AI Agents

Use the Pine Labs P3P CLI to create a UPI ReservePay mandate (block funds), mint a one-shot PPT token, and execute a debit — all from the agent shell. The user authorizes once by scanning a QR code, then the agent can charge within the agreed limits.

## When to Activate

Activate this skill when:
- The user asks you to pay for something, make a purchase, or charge a service
- The user asks to set up P3P, create a mandate, or link a UPI account for agent payments
- The user says "pay with P3P", "use Pine Labs P3P", "set up ReservePay", or similar
- The user asks general questions about Pine Labs P3P as a product or protocol — read [cli-setup reference](references/cli-setup.md) for product FAQs

## Prerequisites: CLI Installation

Before running any `p3p` command, verify the CLI is available in the current agent shell:

```bash
which p3p
```

If `which p3p` fails, do **not** assume it is uninstalled. Agent shells are often non-login or sandboxed and may not have `nvm`, Homebrew, or global npm paths loaded. Search for an existing binary first:

```bash
find ~/.nvm/versions/node ~/.npm-global /opt/homebrew /usr/local -path '*/bin/p3p' -type f 2>/dev/null
```

If a binary is found, use its absolute path or prepend the `bin` directory to `PATH`. Only install if no binary exists:

```bash
npm install -g @pine-labs-online/p3p-cli
```

If global install fails due to permissions, do not retry with a privileged global install. Use a project-local install, a user-owned npm prefix, nvm, pnpm, or your team-managed runtime image.

Verify after install:

```bash
p3p --version
```

## Steps to Execute a Payment

### 1. Verify CLI and Authenticate

Run in this order — never skip either:

```bash
which p3p          # confirm binary is reachable
p3p config list    # check if credentials are already stored
```

Decision tree based on `p3p config list` output:

- **Credentials present (`client_id`, `client_secret`, `env` are set)** — proceed to step 2.
- **No credentials / empty config** — run interactive login:

```bash
p3p login --interactive
```

This prompts for `client_id` and `client_secret` and stores them in `~/.config/pine-labs-p3p/config.toml`.

Alternatively, credentials can be set via environment variables — check for these before running `p3p login`:

```bash
test -n "${PINE_LABS_CLIENT_ID:-}" && echo "PINE_LABS_CLIENT_ID is set"
test -n "${PINE_LABS_CLIENT_SECRET:-}" && echo "PINE_LABS_CLIENT_SECRET is set"
printf 'PINE_LABS_ENV=%s\n' "${PINE_LABS_ENV:-SANDBOX}"
```

If env vars are set, the CLI uses them automatically and `p3p login` is not required.

Read [cli-setup reference](references/cli-setup.md) for full authentication details, multi-project profiles, and sandbox vs production.

### Production Gate

Before `p3p mandates create`, `p3p tokens create`, or `p3p debit execute`, inspect the active environment:

```bash
p3p config list
printf 'PINE_LABS_ENV=%s\n' "${PINE_LABS_ENV:-SANDBOX}"
```

Default to `SANDBOX`. If the active environment is `PRODUCTION`, stop and ask for explicit confirmation that includes the amount, mobile number, merchant context, and operation (`mandate`, `token`, or `debit`). Do not continue from an implied approval.

### 2. Gather Payment Context

Before creating a mandate, confirm you have ALL of:

- [ ] Customer mobile number (10 digits, no country code — e.g. `9876543210`)
- [ ] Mandate amount in **paise** (₹1 = 100 paise, e.g. ₹500 → `50000`)
- [ ] Merchant ID (format: `merch-v1-...`) — from the merchant or server config
- [ ] Purpose / description (optional but recommended)
- [ ] Token limits: the amount and charge count the agent is authorized to debit

Do NOT call `p3p mandates create` with guessed or hallucinated values.

### 3. Create Mandate (Block UPI Funds)

```bash
p3p mandates create \
  --mobile-number 9876543210 \
  --amount 50000 \
  --description "Payment for API credits" \
  --json
```

Amounts are always in the **smallest currency unit** (paise for INR). `50000` = ₹500.00.

**The CLI auto-polls for mandate approval by default.** After printing the QR URL, `mandates create` waits up to **2 minutes** for the mandate to reach `AUTHORIZED` state before returning. You do not need to run a separate poll loop unless you explicitly pass `--no-poll`.

The command returns a mandate object. Extract and save:
- `data.payment_method_id` (or `data.mandateId` in playground proxy mode) — used as `--challenge-id` in all subsequent commands
- `data.challenge.qr_url` — the UPI QR code URL for the user to scan
- `data.challenge.deep_link` — UPI deep link for app redirect (mobile)

**Show the QR URL to the user immediately** so they can scan it while the CLI polls.

> **Sandbox:** The mandate QR is auto-approved in SANDBOX. The mandate will reach `AUTHORIZED` without any real scan. The CLI will return almost immediately.

If you need to poll manually (e.g. after using `--no-poll`), use:

```bash
p3p mandates get <payment_method_id> --json
```

Poll until `data.order_status` is `"AUTHORIZED"`. The CLI does this automatically within a 2-minute window.

Do NOT proceed to step 4 until the mandate is `AUTHORIZED`.

Read [cli-mandates reference](references/cli-mandates.md) for all mandate states, poll flags, and error conditions.

### 4. Create Payment Token (PPT)

Once the mandate is `AUTHORIZED`, mint a one-shot PPT (Pine Labs Payment Token):

```bash
p3p tokens create \
  --challenge-id <payment_method_id> \
  --mobile-number 9876543210 \
  --amount 10000 \
  --json
```

The `--amount` here is the **maximum amount** this token authorizes for debit — it must be ≤ mandate `amount_remaining`. The actual debit in step 5 can be equal to or less than this amount.

Extract and save `data.token` — this is the PPT string (prefix `ppt_live_` or `ppt_test_`).

Read [cli-tokens reference](references/cli-tokens.md) for usage limits, expiry, and multi-charge tokens.

### 5. Execute Debit

```bash
p3p debit execute \
  --token <ppt_token> \
  --challenge-id <payment_method_id> \
  --mobile-number 9876543210 \
  --amount 10000 \
  --json
```

The `--amount` is the actual debit amount in paise. It must be ≤ the token's `usage_limits.max_amount`.

Successful output:

```
Status:         SUCCESS
Debit ID:       dbt-v1-260405110000-ab-Kx9pQr
Amount:         ₹100.00 (10000 paise)
Payment Method: RESERVE_PAY
Receipt:        rcpt_...
```

Read [cli-debit reference](references/cli-debit.md) for the full receipt format and error handling.

## After Debit: Confirm the Transaction

Once the debit succeeds, confirm to the user:
- The debited amount
- The debit ID (for support/reconciliation)
- The receipt token if returned

Do NOT ask the user anything between steps 3 and 5. The flow is a single unbreakable sequence.

## Multi-Charge Flow (Repeat Debits)

If you created a token with `--max-charges > 1`, the same PPT can be used for multiple debits as long as:
- `usage.amount_used` + new debit amount ≤ `usage_limits.max_amount`
- `usage.charges_made` < `usage_limits.max_charges`
- Token has not expired

Run step 5 again with the same `--token` and `--challenge-id` for each charge.

## CLI Quick Reference

```bash
# Authentication
p3p login --interactive                                          # store credentials interactively
p3p login --interactive --project-name staging                   # save to a named profile
p3p config list                                                  # show current config
p3p config set env SANDBOX                                       # switch environment
p3p logout                                                       # clear credentials

# Mandates
p3p mandates create --mobile-number <num> --amount <paise> [--payment-method RESERVE_PAY|OTM|Crypto] [--description <text>] [--json]
p3p mandates get <payment_method_id> [--json]                    # poll for AUTHORIZED state
p3p mandates balance --authorization-id <id> --phone-number <num> [--payment-method RESERVE_PAY] [--json]
p3p mandates revoke --payment-method <method> [--payment-method-reference-id <id>] [--mobile-number <num>] [--json]

# Tokens
p3p tokens create --challenge-id <payment_method_id> --mobile-number <num> --amount <paise> [--payment-method RESERVE_PAY|OTM|Crypto] [--json]

# Debit
p3p debit execute --token <ppt_token> --challenge-id <payment_method_id> --mobile-number <num> --amount <paise> [--payment-method RESERVE_PAY|OTM|Crypto] [--json]
p3p debit status <idempotency_key> [--json]                      # poll pending (202) debit

# Webhooks
p3p listen --forward-to http://localhost:3000/webhooks           # forward webhook events locally
p3p listen --forward-to <url> --events mandate.*,debit.*         # filter by event type

# Developer tools
p3p logs tail                                                    # stream playground logs
p3p logs tail --filter-path /mpp/v1/debit                        # filter by path
p3p playground start                                             # start local P3P playground
p3p playground open                                              # open playground web UI (default port 4001)
p3p playground open --port 4002                                  # open on custom port
p3p fixtures run <file>                                          # run fixture flow
p3p fixtures run <file> --override create_mandate.amount.value=75000
p3p trigger mandate.created                                      # fire test event
p3p trigger debit.succeeded --override debit.amount.value=5000   # fire with override
p3p trigger <event> --mandate-id <id>                            # reuse existing mandate
```

## Global Flags (all commands)

| Flag | Description |
|---|---|
| `--api-key` | Do not use inline credentials. Prefer interactive login, env vars, or a named profile. |
| `--base-url <url>` | Override base URL (useful for local/staging) |
| `--project <name>` | Use a named project profile |
| `--json` | Output raw JSON where supported |
| `--color / --no-color` | Force or disable color output |

## Environment Variables

| Variable | Description |
|---|---|
| `PINE_LABS_CLIENT_ID` | Client ID — overrides stored config |
| `PINE_LABS_CLIENT_SECRET` | Client secret — overrides stored config |
| `PINE_LABS_ENV` | `SANDBOX` or `PRODUCTION` |
| `PINE_LABS_BASE_URL` | Optional base URL override for local/staging |

## Anti-Patterns

- Running `tokens create` before mandate is `AUTHORIZED` — token creation fails.
- Running `debit` with amount greater than token `max_amount` — debit rejected.
- Guessing or hallucinating mobile number, merchant ID, or amounts.
- Asking the user for credentials — the CLI handles all auth from config or env vars.
- Pausing between token creation and debit — tokens expire; complete checkout immediately.
- Using paise values as rupees (₹500 ≠ 500 paise — use 50000 paise).
- Running `p3p login` when credentials are already set via environment variables.

---

*Built by [Pine Labs Online](https://www.pinelabs.com/) — x402 payment infrastructure for AI agents.*
