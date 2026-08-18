# pinelabs-agent-skills-cli

Install Pine Labs Online agent skills into AI coding assistant projects.

[![npm](https://img.shields.io/npm/v/pinelabs-agent-skills-cli.svg)](https://www.npmjs.com/package/pinelabs-agent-skills-cli)
[![license](https://img.shields.io/npm/l/pinelabs-agent-skills-cli.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/pinelabs-agent-skills-cli.svg)](#install)

`pinelabs-agent-skills-cli` installs local Pine Labs Online payment-integration guidance for supported AI coding assistants. The installed skills are generated from Pine Labs OpenAPI and best-practices policy sources, with curated P3P x402/UPI ReservePay guidance bundled into the same installer, so assistants can route from a high-level integration request to the relevant API reference, safety rules, templates, and examples.

The npm package is `pinelabs-agent-skills-cli`. The installed binary is `pinelabs-agent-skills`.

## Quick Start

Requires Node.js 18 or newer.

```bash
npx pinelabs-agent-skills-cli add skills
```

The command prompts for which assistant frameworks to configure, writes Pine Labs skill files into the project, and inserts or updates a managed manifest block for each selected framework.

For non-interactive setup:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks vscode-copilot,kiro --yes
```

Preview the exact file writes before changing a project:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks vscode-copilot --dry-run
```

Install into another project path:

```bash
npx pinelabs-agent-skills-cli add skills --path /path/to/project --frameworks cursor
```

## Get Credentials and Generate a Token

`pinelabs-agent-skills-cli` installs local assistant guidance. It does not sign in to Pine Labs, create Dashboard accounts, or request OAuth tokens itself.

Before using the installed skills for API work:

1. Create a Pine Labs Online Dashboard account from the [Dashboard sign-up guide](https://www.pinelabs.com/docs/online-payments/dashboard/sign-up).
2. Verify your email address and sign in to the Dashboard. Two-factor authentication is required during login.
3. Open Dashboard Settings -> API Keys and generate UAT or test credentials.
4. Use the Client ID as `PINELABS_CLIENT_ID` and the Client Secret as `PINELABS_CLIENT_SECRET`.

Set credentials in your server-side environment:

```bash
export PINELABS_CLIENT_ID=your_client_id
export PINELABS_CLIENT_SECRET=your_client_secret
export PINELABS_ENV=uat
```

To generate an OAuth access token, use Pine Labs API or CLI tooling with those credentials. For example:

```bash
curl -X POST "https://pluraluat.v2.pinepg.in/api/auth/v1/token" \
  -H "Request-Timestamp: <Request-Timestamp>" \
  -H "Request-ID: <Request-ID>" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"${PINELABS_CLIENT_ID}\",\"client_secret\":\"${PINELABS_CLIENT_SECRET}\",\"grant_type\":\"client_credentials\"}"
```

After installing the skills, prompts such as “Generate an access token for Pine Labs APIs” route assistants to `getting-started/dashboard-signup-and-token.md` and `getting-started/authentication.md` for the full credential and token flow. Keep credentials and access tokens out of browser code, mobile apps, committed files, screenshots, and logs.

## P3P Skills

The installer also bundles Pine Labs P3P skills from the curated `p3p-skills` source snapshot:

- `p3p/pay.md` guides CLI-driven UPI ReservePay flows for agent payments: mandate creation, PPT token creation, debit execution, webhook listening, and sandbox checks.
- `p3p/sdk-integration.md` guides application integration for x402 payment middleware using the P3P server/client SDKs, framework templates, and sandbox test data.

These are guidance assets only. The installer does not install runtime packages. Install the needed P3P runtime dependency in the target project when the assistant asks for it:

```bash
npm install -g @pine-labs-online/p3p-cli
npm install p3p-server-sdk p3p-client-sdk
pip install pinelabs-online-p3p-server-sdk pinelabs-online-p3p-client-sdk
```

Browser-facing templates route through backend-owned P3P code so Pine Labs client secrets stay server-side.

## Commands

| Command | Purpose |
| --- | --- |
| `add skills` | Install Pine Labs skills and framework manifests. Prompts unless `--frameworks` is provided. |
| `update` | Refresh already installed Pine Labs skills. Defaults to detected installed frameworks. |
| `list-frameworks` | Print supported framework IDs, display names, skills paths, and manifest paths. |
| `doctor` | Show which Pine Labs skills are installed in a project. |


Common options:

| Option | Commands | Purpose |
| --- | --- | --- |
| `--frameworks <ids>` | `add skills`, `update` | Comma-separated framework IDs, such as `vscode-copilot,claude-code,kiro`. |
| `--path <path>` | `add skills`, `update`, `doctor` | Project path to inspect or modify. Defaults to the current directory. |
| `--dry-run` | `add skills`, `update` | Print planned writes without modifying files. |
| `--yes` | `add skills` | Use detected framework defaults without prompting. Falls back to VS Code Copilot when no likely framework is detected. |

Refresh an existing installation:

```bash
npx pinelabs-agent-skills-cli update
npx pinelabs-agent-skills-cli update --frameworks cursor,claude-code,kiro
```

Inspect supported frameworks and current installation state:

```bash
npx pinelabs-agent-skills-cli list-frameworks
npx pinelabs-agent-skills-cli doctor --path /path/to/project
```

## Framework Install Paths

| Framework ID | Display Name | Skills Location | Manifest File | Format |
| --- | --- | --- | --- | --- |
| `claude-code` | Claude Code | `.claude/skills/pinelabs-skills` | `CLAUDE.md` | Markdown |
| `cursor` | Cursor | `.cursor/pinelabs-skills` | `.cursor/rules/pinelabs.mdc` | MDC |
| `vscode-copilot` | VS Code Copilot | `.github/skills/pinelabs-skills` | `.github/copilot-instructions.md` | Markdown |
| `gemini-cli` | Gemini CLI | `.gemini/skills/pinelabs-skills` | `GEMINI.md` | Markdown |
| `kiro` | Kiro | `.kiro/skills/pinelabs-skills` | `.kiro/steering/pinelabs-agent-skills.md` | Markdown |
| `opencode` | OpenCode | `.opencode/skills/pinelabs-skills` | `AGENTS.md` | Markdown |
| `github-copilot-cli` | GitHub Copilot CLI | `.github/skills/pinelabs-skills` | `.github/copilot-instructions.md` | Markdown |
| `codex-cli` | OpenAI Codex CLI | `.agents/skills/pinelabs-skills` | `AGENTS.md` | Markdown |
| `antigravity` | Antigravity | `.agent/skills/pinelabs-skills` | `AGENTS.md` | Markdown |

Supported aliases include `claude`, `copilot`, `github-copilot`, `gemini`, `kiro-ide`, `kiro-cli`, `copilot-cli`, and `codex`.

For Kiro, the installer writes the Pine Labs skill package into Kiro's native workspace skills directory and adds a workspace steering file so Kiro can consistently route payment-integration asks to that skill tree.

## What Gets Created

A single command creates all skill files plus a manifest update for each selected framework.

### Skills Directory Structure

Each framework receives a `pinelabs-skills` directory with a root skill, domain routers, per-area skill files, and domain reference indexes.

```text
pinelabs-skills/
├── SKILL.md                                      <- Root router, global safety rules, and integration flow
├── getting-started/                              <- Domain folder for onboarding and auth
│   ├── SKILL.md                                  <- Domain router for setup and environment basics
│   ├── authentication.md                         <- OAuth token generation and credential handling
│   ├── dashboard-signup-and-token.md             <- Dashboard signup, API key setup, and first token guidance
│   └── references/REFERENCE.md                   <- Index for getting-started skill files
├── pg/                                           <- Payment gateway domain folder
│   ├── SKILL.md                                  <- Domain router for payment gateway scenarios
│   ├── orders.md                                 <- Order creation, fetch, capture, cancel lifecycle
│   ├── checkout.md                               <- Hosted checkout and redirect flow guidance
│   ├── card-payments.md                          <- Card payment APIs including auth/capture flow
│   ├── upi-payments.md                           <- UPI collect/intent/QR payment implementations
│   ├── netbanking.md                             <- Net banking payment option integration
│   ├── wallet.md                                 <- Wallet payment option integration
│   ├── payment-links.md                          <- Payment link creation and lifecycle actions
│   ├── payment-option.md                         <- Payment option eligibility and UPI VPA lookup
│   ├── customers.md                              <- Customer profile create/fetch/update workflows
│   ├── tokenization.md                           <- Card/network token create/fetch/delete workflows
│   ├── convenience-fee.md                        <- Convenience fee calculation flows
│   ├── pay-by-points.md                          <- Reward points eligibility and redemption
│   ├── affordability-suite.md                    <- EMI/offer discovery and affordability checks
│   ├── bnpl.md                                   <- BNPL payment journey and controls
│   ├── apple-pay.md                              <- Apple Pay payment authorization flow
│   ├── brand-wallet.md                           <- Brand wallet lifecycle and balance operations
│   ├── brand-wallet-payments.md                  <- Wallet-funded payments and load-money flows
│   ├── international-payments.md                 <- Cross-border payments and conversion support
│   ├── e-challans.md                             <- E-challan create/retrieve/download flows
│   ├── upi-reserve-pay.md                        <- Fund-blocking and reserve-pay workflows
│   ├── mobile-sdks/                              <- Native mobile SDK guidance group
│   │   ├── SKILL.md                              <- Router: asks Android/iOS/Flutter when platform is unspecified
│   │   ├── android.md                            <- Android native SDK integration guidance
│   │   ├── ios.md                                <- iOS native SDK integration guidance
│   │   └── flutter.md                            <- Flutter native SDK integration guidance
│   ├── web-sdks/                                 <- WebView/browser SDK guidance group
│   │   ├── SKILL.md                              <- Router: asks Android/iOS/Flutter/React Native when unspecified
│   │   ├── android.md                            <- Android web SDK integration guidance
│   │   ├── ios.md                                <- iOS web SDK integration guidance
│   │   ├── flutter.md                            <- Flutter web SDK integration guidance
│   │   ├── react-native.md                       <- React Native web SDK integration guidance
│   │   └── faqs.md                               <- Web SDK troubleshooting and FAQs
│   └── references/REFERENCE.md                   <- Index for PG skill files
├── settlements/                                  <- Settlements and fund movement domain folder
│   ├── SKILL.md                                  <- Domain router for refunds/payouts/settlements
│   ├── refunds.md                                <- Refund initiation and status handling
│   ├── payouts.md                                <- Payout balance, bulk, and scheduled operations
│   ├── settlements.md                            <- Settlement fetch and reconciliation guidance
│   ├── split-settlements.md                      <- Multi-party settlement release/cancel flows
│   └── references/REFERENCE.md                   <- Index for settlement skill files
├── subscriptions/                                <- Recurring payments domain folder
│   ├── SKILL.md                                  <- Domain router for recurring billing
│   ├── subscriptions-plans.md                    <- Plan creation and management
│   ├── subscriptions-subscriptions.md            <- Subscription lifecycle APIs (create/pause/resume/cancel)
│   ├── subscriptions-presentations.md            <- Debit presentation and retry operations
│   └── references/REFERENCE.md                   <- Index for subscriptions skill files
└── p3p/                                          <- P3P x402 and UPI ReservePay domain folder
    ├── SKILL.md                                  <- Domain router for P3P pay and SDK integration
    ├── pay.md                                    <- CLI-driven mandate, PPT token, and debit guidance
    ├── sdk-integration.md                        <- x402 SDK integration guidance for apps
    ├── references/                               <- CLI and SDK reference files plus domain index
    ├── templates/                                <- Next.js, Express, Python, and vanilla client templates
    └── evals/p3p-pay.evals.json                  <- P3P pay skill evaluation cases
```

The framework manifest is updated inside a managed block:

```markdown
<!-- BEGIN pinelabs-agent-skills:vscode-copilot -->
... generated Pine Labs routing, safety rules, and reference map ...
<!-- END pinelabs-agent-skills:vscode-copilot -->
```

Content outside the managed block is preserved. Re-running `add skills` or `update` replaces the block and skill files in place, so installs are idempotent. If a manifest contains only one marker or a damaged managed block, the CLI stops and asks you to repair the file before rerunning.


## How Assistants Use The Skills

The generated manifest tells the assistant to start with:

```text
SKILL.md
```

The root skill contains routing and safety rules. For API-specific work, the assistant reads the domain skill, then the matching area skill file (for example, `pg/orders.md`), and uses the domain reference index for quick cross-area lookup. For P3P work, it routes to `p3p/pay.md` for CLI-driven agent payments or `p3p/sdk-integration.md` for x402 SDK integration. For generic "mobile SDK" or "web SDK" asks, the assistant first requests platform choice, then routes to platform-specific files. The manifest also includes the OpenAPI version and spec hash used to generate the core Pine Labs API skills, which helps trace the package back to the API surface it was built from.

Example prompts after installation:

```text
Create a Pine Labs order flow in my backend and keep it in UAT.
Set up webhook signature verification before fulfilling an order.
Create a payment link and expire it after a fixed time window.
Issue a partial refund and explain the idempotency key strategy.
Reconcile a settlement using UTR details.
Create a payout workflow with production confirmation gates.
Add a subscription plan and explain what should be tested before go-live.
Review my Pine Labs integration for unsafe credential handling.
Use P3P to create a UPI ReservePay mandate and execute a sandbox debit.
Integrate P3P x402 middleware into my Next.js app without exposing client secrets.
```

## Example Interactions

**You:** “I want to integrate Pine Labs Payments”
**AI:** *reads `SKILL.md`* -> Explains auth, UAT setup, order-first flow, and safest integration path

**You:** “Create a Pine Labs order flow in my backend and keep it in UAT”
**AI:** *reads `SKILL.md` -> `pg/orders.md`* -> Builds an order creation flow with UAT-safe guidance

**You:** “Generate an access token for Pine Labs APIs”
**AI:** *reads `getting-started/dashboard-signup-and-token.md` -> `getting-started/authentication.md`* -> Provides Dashboard credential setup and OAuth token generation guidance

**You:** “Set up hosted checkout for my app”
**AI:** *reads `SKILL.md` -> `pg/checkout.md`* -> Creates a hosted checkout link flow with redirect handling

**You:** “Accept card payments with OTP authentication”
**AI:** *reads `SKILL.md` -> `pg/card-payments.md`* -> Explains card payment creation, card lookup, OTP generation, and OTP submission

**You:** “Add UPI collect and QR payments”
**AI:** *reads `SKILL.md` -> `pg/upi-payments.md`* -> Implements UPI collect, intent, or QR payment flows

**You:** “Add mobile SDK integration”
**AI:** *reads `pg/mobile-sdks/SKILL.md`* -> Asks whether Android, iOS, or Flutter is needed before implementation

**You:** “Add Android mobile SDK integration”
**AI:** *reads `pg/mobile-sdks/android.md`* -> Implements Android SDK install/init/callback/verification flow

**You:** “Add web SDK integration”
**AI:** *reads `pg/web-sdks/SKILL.md`* -> Asks whether Android, iOS, Flutter, or React Native is needed

**You:** “Add Flutter web SDK integration”
**AI:** *reads `pg/web-sdks/flutter.md`* -> Implements Flutter WebView SDK setup with backend verification

**You:** “Use P3P to charge for an API call”
**AI:** *reads `p3p/SKILL.md` -> `p3p/pay.md`* -> Verifies CLI/auth, creates a mandate, mints a PPT token, and executes a debit with sandbox-first safety

**You:** “Add P3P x402 payment middleware to my app”
**AI:** *reads `p3p/SKILL.md` -> `p3p/sdk-integration.md`* -> Chooses the framework template, keeps secrets server-side, and wires the 402 challenge/retry flow

**You:** “Enable NetBanking and wallet payments in checkout”
**AI:** *reads `pg/netbanking.md` + `pg/wallet.md`* -> Adds bank and wallet payment initiation flows

**You:** “Create a payment link for ₹5000 and expire it in 7 days”
**AI:** *reads `SKILL.md` -> `pg/payment-links.md`* -> Creates the payment link and sets expiry and lifecycle actions

**You:** “Issue a partial refund and explain idempotency”
**AI:** *reads `SKILL.md` -> `settlements/refunds.md`* -> Creates a refund flow and explains merchant reference/idempotency usage

**You:** “Match a bank statement UTR to a Pine Labs settlement”
**AI:** *reads `SKILL.md` -> `settlements/settlements.md`* -> Uses settlement lookup flow and explains reconciliation steps

**You:** “Create a payout workflow with approval gates”
**AI:** *reads `SKILL.md` -> `settlements/payouts.md`* -> Designs payout creation with production safeguards and confirmation steps

**You:** “Create a customer and save their card for future payments”
**AI:** *reads `pg/customers.md` -> `pg/tokenization.md`* -> Creates customer profile flow and tokenized saved-card flow

**You:** “Show me EMI and no-cost EMI options for this order”
**AI:** *reads `pg/affordability-suite.md`* -> Uses affordability APIs for offer discovery and validation

**You:** “Calculate convenience fee before showing the final payable amount”
**AI:** *reads `pg/convenience-fee.md`* -> Adds convenience fee calculation into the checkout flow

**You:** “Check if reward points payment is available”
**AI:** *reads `pg/pay-by-points.md`* -> Checks points-based payment option flow

**You:** “Create and manage recurring billing plans”
**AI:** *reads `subscriptions/subscriptions-plans.md`* -> Creates plan APIs and recurring billing setup

**You:** “Create a subscription and pause or resume it later”
**AI:** *reads `subscriptions/subscriptions-subscriptions.md`* -> Implements subscription lifecycle management

**You:** “Submit a recurring debit request for an active subscription”
**AI:** *reads `subscriptions/subscriptions-presentations.md`* -> Handles subscription presentation and retry flows

**You:** “Set up webhook signature verification before fulfilling an order”
**AI:** *reads `SKILL.md`* -> Adds webhook validation, status checks, and fulfillment gating

**You:** “Review my Pine Labs integration for unsafe credential handling”
**AI:** *reads `SKILL.md`* -> Flags plaintext secrets, production-risk patterns, and missing validation checks

**You:** “I’m done coding — what should I test before go-live?”
**AI:** *reads `SKILL.md`* -> Produces a UAT, webhook, refund, settlement, and production-readiness checklist


## Safety Defaults

- Examples and tests default to UAT.
- Production actions require explicit user confirmation in the installed guidance.
- `PINELABS_CLIENT_ID` and `PINELABS_CLIENT_SECRET` stay server-side.
- Webhook signatures must be verified before processing Pine Labs events.
- Idempotency keys or request IDs are required for state-changing and money-moving calls.
- Secrets, access tokens, card data, and customer PII must not be logged.

## Local Development

From the repository root:

```bash
pnpm --filter pinelabs-agent-skills-cli build
pnpm check:agent-skills-cli
```

When OpenAPI or skill policy changes, refresh the generated skill artifacts first:

```bash
pnpm generate:skills
pnpm generate:agent-skills-cli
```

To validate against CDN content:

```bash
CDN_CONTENT_URL=https://<cdn-base> pnpm generate:skills
pnpm generate:agent-skills-cli
```

## Local Tarball Testing

Build and pack the npm package locally:

```bash
pnpm --filter pinelabs-agent-skills-cli build
pnpm --filter pinelabs-agent-skills-cli exec npm pack
```

Install the tarball globally for a smoke test:

```bash
npm install -g ./sdks/agent-skills-cli/pinelabs-agent-skills-cli-0.1.0.tgz
pinelabs-agent-skills list-frameworks
```

Dry-run an install into a temporary project:

```bash
pinelabs-agent-skills add skills \
    --frameworks vscode-copilot \
    --path /tmp/test-project \
    --dry-run
```

The `.tgz` file is a local test artifact. Do not commit it unless you deliberately need to attach it to a release process.

## Publishing

Publishing is handled by the repository release workflow using npm Trusted Publishing. Normal releases should not run `npm publish` by hand.

Before publishing, verify:

```bash
pnpm check:skills
pnpm check:agent-skills-cli
pnpm --filter pinelabs-agent-skills-cli exec npm pack --dry-run
```

For a first release or release-candidate validation, run the workflow with the package language selection for `agent-skills-cli` and skip mirror sync until the public mirror repository is ready.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Unsupported framework` | Run `npx pinelabs-agent-skills-cli list-frameworks` and use one of the listed IDs. |
| `No installed Pine Labs skills were found` during `update` | Run `add skills` first, or pass `--frameworks` to update a specific framework. |
| Partial managed block error | Open the manifest file, remove or repair the incomplete `BEGIN`/`END` block, then rerun the command. |
| `--dry-run` did not write files | Expected behavior. Remove `--dry-run` after reviewing the planned writes. |
| Multiple frameworks use the same manifest file | Each framework writes a separate managed block keyed by framework ID. Reruns update only the matching block. |

## License

MIT
