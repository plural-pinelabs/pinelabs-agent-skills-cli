# P3P Skills

This repository contains **skills** for the [Pine Labs P3P](https://www.pinelabs.com/docs/online-payments/ai/p3p) ecosystem — UPI ReservePay for recurring payments powered by AI agents.

## About P3P

[P3P (Pine Labs Payment Platform)](https://www.pinelabs.com/docs/online-payments/ai/p3p) provides UPI ReservePay for recurring payments in India. Features include:

- **UPI Mandates** — Create recurring payment authorizations via UPI
- **Flexible Scheduling** — One-time, daily, weekly, monthly, or custom recurrence
- **Token Management** — Secure storage and retrieval of mandate tokens
- **Real-time Webhooks** — Instant notifications for mandate and debit status

## What are Skills?

Skills are structured instruction sets designed for AI coding agents (like Claude Code, Cursor, GitHub Copilot, etc.). They provide the context, templates, and step-by-step guidance an AI agent needs to integrate P3P into any application — without hallucinating APIs or inventing incorrect patterns.

Each skill includes:
- **`SKILL.md`** — The main instruction file with integration steps, security rules, and framework-specific guidance
- **`references/`** — Detailed API docs, flow diagrams, and test data
- **`templates/`** — Ready-to-use code templates for different frameworks (SDK skill only)

## Available Skills

| Skill | Audience | Description |
|-------|----------|-------------|
| [`p3p-pay`](./p3p-pay/) | **AI Agents** | **Router** for P3P payments. Identifies the desired payment method (UPI vs Card) and routes to the method-specific skill (`p3p-pay-upi` or `p3p-pay-card`). Also owns cross-cutting context: prerequisites, environment gate, anti-patterns, and P3P product FAQs. Start here for any P3P payment request. |
| [`p3p-pay-upi`](./p3p-pay-upi/) | **AI Agents** | UPI ReservePay and UPI OTM payment flow. Handles UPI-specific activation (generate QR from `deep_link`, customer scans with UPI app, poll until `ACTIVE`), mandate creation, 402 challenge retry, debit capture, balance lookup (ReservePay only), and multi-charge. Use when `paymentMethod` is `PaymentMethod.RESERVE_PAY` or `PaymentMethod.OTM`. |
| [`p3p-pay-card`](./p3p-pay-card/) | **AI Agents** | Card mandate payment flow. Handles card-specific activation (show `checkout_url` in modal/iframe, customer enters card + OTP, poll until `ACTIVE`), mandate creation, 402 challenge retry, debit capture, and multi-charge. Balance lookup via `getMandateBalance` is **not supported for CARD** — only `PaymentMethod.RESERVE_PAY` is. Use when `paymentMethod` is `PaymentMethod.CARD`. |
| [`p3p-sdk-integration`](./p3p-sdk-integration/) | **AI Applications** | Integrate P3P's payment SDKs into applications. Server-side mandate creation (routes the activation sub-step to `p3p-pay-upi` / `p3p-pay-card`), 402 challenge generation, `decidePayment` debit capture, and the client SDK's automatic 402 retry. TypeScript or Python; templates for Next.js, Express, FastAPI. |

## Repository Structure

```
p3p-pay/                           # Router skill for AI agents
├── SKILL.md                       # Router: identifies method, hands off to sub-skill
├── evals/
│   └── evals.json                 # Skill evaluation test cases (router)
└── references/                    # Shared references (used by router AND sub-skills)
    ├── cli-setup.md               # Product FAQs, sandbox vs production, credential handling
    ├── cli-mandates.md            # Mandate creation, states, error codes
    ├── cli-tokens.md              # PPT usage limits, expiry, multi-charge
    └── cli-debit.md               # decidePayment outcomes, receipt, pending polling

p3p-pay-upi/                       # UPI payment sub-skill (ReservePay / OTM)
├── SKILL.md                       # UPI flow: deep_link/QR activation, UPI balance (ReservePay)
└── evals/
    └── evals.json                 # UPI eval cases (upi-001 .. upi-006)

p3p-pay-card/                      # Card payment sub-skill
├── SKILL.md                       # Card flow: checkout_url + OTP activation, card balance
└── evals/
    └── evals.json                 # Card eval cases (card-001 .. card-006)

p3p-sdk-integration/               # Skill for AI applications (SDK-based)
├── SKILL.md                       # SDK integration; routes mandate activation to sub-skills
├── references/
│   ├── integration-flow.md        # End-to-end flow
│   ├── server-sdk-api-reference.md  # Full server SDK API docs
│   ├── client-sdk-api-reference.md  # Full client SDK API docs
│   └── test-data.md               # Sandbox test data
└── templates/
    ├── nextjs/                    # Next.js App Router templates
    ├── express/                   # Express.js templates
    ├── python/                    # Python (Flask/FastAPI) templates
    └── vanilla/                   # Vanilla JS templates
```

## Routing Model

`p3p-pay` is the entry point. It does not call `createMandate` or any payment SDK method directly. It:

1. Identifies the payment method the user wants (UPI vs Card), asking one routing question if the request is ambiguous.
2. Hands off to `p3p-pay-upi` (for `PaymentMethod.RESERVE_PAY` or `PaymentMethod.OTM`) or `p3p-pay-card` (for `PaymentMethod.CARD`).
3. Owns the cross-cutting context shared by both sub-skills: SDK prerequisites, the production environment gate, the paise-amounts rule, the 402/mandate/token concepts, env vars, and the routing anti-patterns.

The sub-skills own the method-specific execution: `createMandate` with the right `paymentMethod`, the activation UI (QR vs checkout URL), polling `getMandate(mandate.mandate_id)` until `order_status` is `AUTHORIZED`/`ACTIVE`, calling the paid route via the client SDK, capturing the debit via `decidePayment`, and reporting final state to the user.

`p3p-sdk-integration` covers SDK installation and wiring `decidePayment` / `payment_required` into app routes. For mandate activation it routes to the same sub-skills (`p3p-pay-upi` / `p3p-pay-card`) — the SDK call is method-agnostic; only the activation UI differs.

## Unified P3P References

The four `cli-*.md` reference files under `p3p-pay/references/` are shared by the router and both sub-skills. They ship as `p3p/references/cli-*.md` after installation. They are NOT duplicated under `p3p-pay-upi/` or `p3p-pay-card/`.

## How to Use

### Recommended: Install from npm

Use the npm package when you want project-local, reproducible skill installation. This works well for AI coding agents because the skills are installed into the current project and can be committed with the app if desired.

```bash
npm install --save-dev p3p-skills
npx skills experimental_sync --agent github-copilot --yes
```

Replace `github-copilot` with your agent if needed:

```bash
npx skills experimental_sync --agent claude-code --yes
npx skills experimental_sync --agent cursor --yes
npx skills experimental_sync --agent codex --yes
npx skills experimental_sync --agent promptscript --yes
```

The npm package is available at https://www.npmjs.com/package/p3p-skills.

Do not run `npx skills add p3p-skills`; the `skills` CLI treats a bare package name as a repository source. Use the npm install + sync flow above, or use the GitHub URL flow below.

### Ask Your Agent

After installation, ask your AI coding agent one of these:

```text
Use the p3p-sdk-integration skill to integrate Pine Labs P3P payments into this app. Detect the framework and language, install the required SDK package if missing, use SANDBOX configuration, and implement the server 402 challenge plus client 402 retry flow using the skill references.
```

```text
Use the p3p-pay skill to create a UPI ReservePay mandate and execute a debit. First verify the P3P server and client SDKs are installed and PINELABS_CLIENT_ID / PINELABS_CLIENT_SECRET are set server-side, confirm the mobile number and amount (in paise), use SANDBOX unless I explicitly ask for production, and route the payment through p3p.createMandate, the client SDK 402 retry, and decidePayment.
```

### SDK Prerequisites (Required for p3p-sdk-integration)

Skills provide agent instructions and templates. They do not auto-install runtime SDK dependencies.

Install SDKs from npm/PyPI, or directly from the source repositories:

- Server SDK (Python): https://github.com/plural-pinelabs/mpp-server-sdk-python
- Client SDK (Python): https://github.com/plural-pinelabs/mpp-client-sdk-python
- Client SDK (TypeScript): https://github.com/plural-pinelabs/mpp-client-sdk-typescript
- Server SDK (TypeScript): https://github.com/plural-pinelabs/mpp-server-sdk-typescript

Package names used by this skill:

- TypeScript: `p3p-server-sdk`, `p3p-client-sdk`
- Python: `pinelabs-online-p3p-server-sdk`, `pinelabs-online-p3p-client-sdk`

### Install Skills (for AI Agents)

Most supported agents can also install skills globally from GitHub:

```bash
npx --yes skills add https://github.com/plural-pinelabs/p3p-skills --global --yes --full-depth
```

If your project uses **PromptScript**, do not use `--global`. PromptScript skills are project-scoped only and install under `./.agents/skills/`. If you see `PromptScript: PromptScript does not support global skill installation`, the install target is wrong, not the skill repo.

Install for PromptScript from npm using the project-local flow:

```bash
npm install --save-dev p3p-skills
npx skills experimental_sync --agent promptscript --yes
```

Or install for PromptScript from GitHub from the project where PromptScript runs:

```bash
npx --yes skills add https://github.com/plural-pinelabs/p3p-skills --agent promptscript --yes --full-depth --copy
```

If you are not using PromptScript but the installer auto-detects it, target the intended agent explicitly:

```bash
npx --yes skills add https://github.com/plural-pinelabs/p3p-skills --agent github-copilot --global --yes --full-depth
```

Or install a specific skill:

```bash
# P3P CLI skill for AI agents
npx --yes skills add https://github.com/plural-pinelabs/p3p-skills --skill p3p-pay --global --yes --full-depth

# SDK integration skill for applications
npx --yes skills add https://github.com/plural-pinelabs/p3p-skills --skill p3p-sdk-integration --global --yes --full-depth
```

Use `--full-depth` when installing a single skill so sibling skills are not installed alongside the requested one.

### Install for Codex (OpenAI)

If you are installing from Codex or another sandboxed/non-login agent shell where `npx` is not on PATH, use a PATH-resolving install command:

```bash
NPX="$(command -v npx || find "$HOME/.nvm/versions/node" "$HOME/.npm-global" /opt/homebrew /usr/local -path '*/bin/npx' -type f 2>/dev/null | sort -Vr | head -n 1)" && "$NPX" --yes skills add https://github.com/plural-pinelabs/p3p-skills --global --yes --full-depth
```

Or install a specific skill:

```bash
# P3P CLI skill for Codex agents
NPX="$(command -v npx || find "$HOME/.nvm/versions/node" "$HOME/.npm-global" /opt/homebrew /usr/local -path '*/bin/npx' -type f 2>/dev/null | sort -Vr | head -n 1)" && "$NPX" --yes skills add https://github.com/plural-pinelabs/p3p-skills --skill p3p-pay --global --yes --full-depth
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/plural-pinelabs/p3p-skills.git
cd p3p-skills

# Symlink to global skills directory (Claude Code / Cursor)
mkdir -p ~/.agents/skills
ln -s "$(pwd)/p3p-pay" ~/.agents/skills/p3p-pay
ln -s "$(pwd)/p3p-sdk-integration" ~/.agents/skills/p3p-sdk-integration

# Or copy instead of symlink
cp -r p3p-pay ~/.agents/skills/
cp -r p3p-sdk-integration ~/.agents/skills/
```

### Verify Installation

```bash
npx skills list
```

Use the project list command after npm install + sync. Use the global list command only when you installed with `--global`:

```bash
npx skills list --global
# or
npx skills ls -g
```

For PromptScript/project installs, run `npx skills list` from the project root.

### Install Pine Labs Agent Skills (P3P + all domains)

Install the full Pine Labs agent skills bundle — getting-started, payments, settlements, subscriptions, **and P3P** — into an AI coding assistant project with the deployed npm installer:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks github-copilot --yes
```

Replace `github-copilot` with your assistant (`claude-code`, `cursor`, `kiro`, `gemini-cli`, `opencode`, `codex-cli`, `antigravity`). The installer writes the P3P skills alongside the other Pine Labs domains under `p3p/`.

Package: https://www.npmjs.com/package/pinelabs-agent-skills-cli

### For SDK Integration

Install the P3P runtime SDKs in the target project (the skills installer does not auto-install runtime dependencies):

**TypeScript:**
```bash
npm install p3p-server-sdk p3p-client-sdk
```

**Python:**
```bash
pip install pinelabs-online-p3p-server-sdk pinelabs-online-p3p-client-sdk
```

Set credentials server-side (never in chat, logs, or committed files):

```bash
export PINELABS_CLIENT_ID=your_client_id
export PINELABS_CLIENT_SECRET=your_client_secret
export PINE_LABS_ENV=SANDBOX
```

Then point your AI coding agent at this repository and ask it to "integrate P3P payments". The SDK skill guides the agent through setting up the SDK, creating mandate endpoints, and handling the 402 challenge/retry flow.

> There is no standalone P3P payment CLI. Payments are executed through the P3P client and server SDKs, not a shell binary.
