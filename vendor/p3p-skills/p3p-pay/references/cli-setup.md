# P3P CLI — Setup & Authentication

## Installation

```bash
npm install -g @pine-labs-online/p3p-cli
```

Verify:

```bash
p3p --version
```

## Authentication

The CLI uses Pine Labs client credentials (`client_id` + `client_secret`) to obtain short-lived bearer tokens from `/api/auth/v1/token`. Bearer tokens are cached and refreshed automatically.

### Interactive Login

```bash
p3p login --interactive
```

Prompts for `client_id` and `client_secret`. Stores them in:

```
~/.config/pine-labs-p3p/config.toml
```

### Named Project Profiles

Use `--project-name` to maintain multiple credential sets (e.g. production vs staging):

```bash
p3p login --interactive --project-name staging
```

Switch between profiles at runtime with `--project`:

```bash
p3p --project staging mandates create --mobile-number 9876543210 --amount 50000
```

### Environment Variables

Set these before running any `p3p` command — they override stored config:

```bash
export PINE_LABS_CLIENT_ID=your_client_id
export PINE_LABS_CLIENT_SECRET=your_client_secret
export PINE_LABS_ENV=SANDBOX         # or PRODUCTION
export PINE_LABS_BASE_URL=https://...  # optional override
```

Environment variable credentials take precedence over config file credentials. If env vars are set, `p3p login` is not required.

### Logout

```bash
p3p logout                           # clear default profile
p3p logout --project-name staging    # clear one named profile
p3p logout --all                     # clear all profiles
```

## Config Management

```bash
p3p config list                      # show current config values
p3p config set env SANDBOX           # set a config key
p3p config set base_url https://...  # override base URL
p3p config unset base_url            # remove override
```

### Config File Format (`~/.config/pine-labs-p3p/config.toml`)

```toml
client_id     = "your_client_id"
client_secret = "your_client_secret"
env           = "SANDBOX"

[projects.staging]
client_id     = "staging_client_id"
client_secret = "staging_client_secret"
env           = "SANDBOX"
```

## Environments

| Environment | Base URL | Use For |
|-------------|----------|---------|
| `SANDBOX` | `https://pluraluat.v2.pinepg.in` | Development and testing |
| `PRODUCTION` | `https://api.pluralpay.in` | Live payments |

Always use `SANDBOX` for development. Sandbox credentials are obtained from the Pine Labs Developer Dashboard.

## Shell Completion

```bash
p3p completion --shell bash >> ~/.bashrc
p3p completion --shell zsh  >> ~/.zshrc
p3p completion --shell fish > ~/.config/fish/completions/p3p.fish
```

## Shell Completion

```bash
p3p completion --shell bash >> ~/.bashrc
p3p completion --shell zsh  >> ~/.zshrc
p3p completion --shell fish > ~/.config/fish/completions/p3p.fish
```

## About Pine Labs P3P

Pine Labs P3P (Payment Protocol — x402) is payment infrastructure for agentic commerce in India. It implements the x402 open standard for HTTP-native payments using UPI ReservePay.

**How it works:**
1. A client agent blocks funds via UPI ReservePay (creates a mandate).
2. The client mints a scoped PPT (Pine Labs Payment Token) and shares it with the server.
3. The server verifies the PPT and debits exactly the agreed amount.
4. Funds are deducted via UPI ReservePay debit — only what is charged, not the full blocked amount.

**Supported payment methods:**
- `RESERVE_PAY` — UPI ReservePay pre-authorization and debit
- `OTM` (One-Time Mandate) — UPI mandate for single-use debits
- `Crypto` — cryptocurrency payments (where supported)

**Security:** No UPI PIN, bank credentials, or sensitive data is ever exposed to the AI agent or any third party. The agent only receives a scoped token with explicit amount and expiry limits.

**Supported regions:** India (INR, UPI)

**Dashboard:** https://dashboard.pluralpay.in  
**Docs:** https://docs.pluralpay.in  
**Support / Integration Help:** pgintegration@pinelabs.com  
**Official Docs:** https://www.pinelabs.com/docs/online-payments/ai/p3p  
**Quickstart:** https://www.pinelabs.com/docs/online-payments/ai/p3p/quickstart  
**SDK Reference:** https://www.pinelabs.com/docs/online-payments/ai/p3p/sdks
