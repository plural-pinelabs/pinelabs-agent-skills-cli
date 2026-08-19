# pinelabs-agent-skills-cli

Install Pine Labs Online agent skills into AI coding assistant projects.

[![npm](https://img.shields.io/npm/v/pinelabs-agent-skills-cli.svg)](https://www.npmjs.com/package/pinelabs-agent-skills-cli)
[![license](https://img.shields.io/npm/l/pinelabs-agent-skills-cli.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/pinelabs-agent-skills-cli.svg)](#install)

`pinelabs-agent-skills-cli` installs local Pine Labs Online payment-integration guidance for supported AI coding assistants. The installed guidance is generated from Pine Labs OpenAPI and best-practices policy sources, with curated P3P x402/UPI ReservePay guidance and implementation workflow guides bundled into the same installer, so assistants can route from a high-level integration request to the relevant API reference, safety rules, templates, validation checklist, webhook guide, migration guide, and go-live checklist.

The installer does not collect telemetry. It only writes local skill files and managed manifest blocks in the project path you choose.

The npm package is `pinelabs-agent-skills-cli`. The installed binary is `pinelabs-agent-skills`.

## Quick Start

Requires Node.js 18 or newer.

```bash
npx pinelabs-agent-skills-cli add skills
```

The command prompts for which assistant frameworks to configure, writes Pine Labs skill files into the project, and inserts or updates a managed manifest block for each selected framework.

For non-interactive setup:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks github-copilot,kiro --yes
```

Preview the exact file writes before changing a project:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks github-copilot --dry-run
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

To generate an OAuth access token, use Pine Labs CLI tooling with env-backed credentials. Do not pass client credentials in command arguments, inline JSON, screenshots, logs, or chat:

```bash
pinelabs generate-token --env uat
```

For raw API integrations, route assistants to `getting-started/authentication.md` and use the secure backend pattern there. Keep the credential payload in server-side memory or a short-lived local file outside shell history; never commit request-body JSON containing credentials.

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
| `doctor` | Show which Pine Labs skills are installed in a project and whether each install is current, stale, or legacy. |


Common options:

| Option | Commands | Purpose |
| --- | --- | --- |
| `--frameworks <ids>` | `add skills`, `update` | Comma-separated framework IDs, such as `github-copilot,claude-code,kiro`. |
| `--path <path>` | `add skills`, `update`, `doctor` | Project path to inspect or modify. Defaults to the current directory. |
| `--dry-run` | `add skills`, `update` | Print planned writes without modifying files. |
| `--yes` | `add skills` | Use detected framework defaults without prompting. Requires exactly one detected framework; pass `--frameworks` when none or multiple are present. |

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

`doctor` reads `.pinelabs-skills-version.json` under each installed skill root. It reports:

- `current` when the installed marker matches the CLI package version, OpenAPI version, and spec hash.
- `stale` when a marker exists but no longer matches the current package.
- `legacy` when an older install has `SKILL.md` but no version marker yet.

## Framework Install Paths

| Framework ID | Display Name | Skills Location | Manifest File | Format |
| --- | --- | --- | --- | --- |
| `claude-code` | Claude Code | `.claude/skills/pinelabs-skills` | `CLAUDE.md` | Markdown |
| `cursor` | Cursor | `.cursor/pinelabs-skills` | `.cursor/rules/pinelabs.mdc` | MDC |
| `github-copilot` | GitHub Copilot | `.github/skills/pinelabs-skills` | `.github/copilot-instructions.md` | Markdown |
| `gemini-cli` | Gemini CLI | `.gemini/skills/pinelabs-skills` | `GEMINI.md` | Markdown |
| `kiro` | Kiro | `.kiro/skills/pinelabs-skills` | `.kiro/steering/pinelabs-agent-skills.md` | Markdown |
| `opencode` | OpenCode | `.opencode/skills/pinelabs-skills` | `AGENTS.md` | Markdown |
| `codex-cli` | OpenAI Codex CLI | `.agents/skills/pinelabs-skills` | `AGENTS.md` | Markdown |
| `antigravity` | Antigravity | `.agent/skills/pinelabs-skills` | `AGENTS.md` | Markdown |

Supported aliases include `vscode-copilot`, `copilot`, `github-copilot-cli`, `copilot-cli`, `claude`, `gemini`, `kiro-ide`, `kiro-cli`, and `codex`.

For Kiro, the installer writes the Pine Labs skill package into Kiro's native workspace skills directory and adds a workspace steering file so Kiro can consistently route payment-integration asks to that skill tree.

## What Gets Created

A single command creates all skill files plus a manifest update for each selected framework.

### Skills Directory Structure

Each framework receives a `pinelabs-skills` directory with one root `SKILL.md`, domain routers, per-area guidance files, workflow guides, and domain reference indexes.

```text
pinelabs-skills/
├── SKILL.md                                      <- Root router, global safety rules, and integration flow
├── .pinelabs-skills-version.json                 <- Version marker for doctor/update stale-install detection
├── validation-and-testing.md                     <- UAT, negative testing, webhook, refund, and release evidence checklist
├── validation-and-testing/                       <- Focused checkout, refund, webhook, SDK, subscription, and settlement test guides
│   ├── checkout-orders.md                         <- Idempotency, timeout, duplicate, callback, and final-state tests
│   ├── refunds.md                                 <- Full/partial refund, timeout, duplicate, and reconciliation tests
│   ├── webhooks.md                                <- Signature, replay, duplicate, and ordering tests
│   ├── mobile-web-sdks.md                         <- Callback, cancellation, interruption, and recovery tests
│   ├── subscriptions.md                           <- Plan, presentation, retry, and lifecycle tests
│   └── settlements.md                             <- Payout, split-release, UTR, and delayed-settlement tests
├── go-live.md                                    <- Production readiness gates and rollout checklist
├── webhooks.md                                   <- Raw-body, signature verification, replay, and idempotency guidance
├── common-mistakes.md                            <- Review checklist for unsafe or brittle integration patterns
├── upgrade-advisor.md                            <- Update flow for current, stale, and legacy installed skills
├── upgrade-advisor/                              <- Installer and integration upgrade routes with source-verified release checks
│   ├── installer.md                               <- Version marker, managed manifest, and catalog update workflow
│   └── integration.md                             <- SDK/API/OpenAPI upgrade, regression, and rollback workflow
├── migration-guides/                             <- Provider migration routing and concept maps
│   ├── README.md                                 <- Migration guide router
│   ├── razorpay-reference.md                      <- Credentials, lifecycle, webhook, refund, and reconciliation mapping
│   └── *.md                                      <- Provider-specific migration workflows
├── evals/                                        <- Workflow evaluation prompts for safe assistant routing
│   ├── validation-and-testing.evals.json          <- Duplicate, replay, pending callback, and refund-timeout prompts
│   ├── common-mistakes.evals.json                 <- Credential and frontend-fulfillment prompts
│   ├── migration-razorpay.evals.json              <- Legacy-order routing and rollback prompt
│   └── upgrade-advisor.evals.json                 <- Source-verified SDK upgrade prompt
├── getting-started/                              <- Domain folder for onboarding and auth
│   ├── README.md                                 <- Domain router for setup and environment basics
│   ├── authentication.md                         <- OAuth token generation and credential handling
│   ├── dashboard-signup-and-token.md             <- Dashboard signup, API key setup, and first token guidance
│   └── references/REFERENCE.md                   <- Index for getting-started skill files
├── pg/                                           <- Payment gateway domain folder
│   ├── README.md                                 <- Domain router for payment gateway scenarios
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
│   │   ├── README.md                             <- Router: asks Android/iOS/Flutter when platform is unspecified
│   │   ├── android.md                            <- Android native SDK integration guidance
│   │   ├── ios.md                                <- iOS native SDK integration guidance
│   │   └── flutter.md                            <- Flutter native SDK integration guidance
│   ├── web-sdks/                                 <- WebView/browser SDK guidance group
│   │   ├── README.md                             <- Router: asks Android/iOS/Flutter/React Native when unspecified
│   │   ├── android.md                            <- Android web SDK integration guidance
│   │   ├── ios.md                                <- iOS web SDK integration guidance
│   │   ├── flutter.md                            <- Flutter web SDK integration guidance
│   │   ├── react-native.md                       <- React Native web SDK integration guidance
│   │   └── faqs.md                               <- Web SDK troubleshooting and FAQs
│   └── references/REFERENCE.md                   <- Index for PG skill files
├── settlements/                                  <- Settlements and fund movement domain folder
│   ├── README.md                                 <- Domain router for refunds/payouts/settlements
│   ├── refunds.md                                <- Refund initiation and status handling
│   ├── payouts.md                                <- Payout balance, bulk, and scheduled operations
│   ├── settlements.md                            <- Settlement fetch and reconciliation guidance
│   ├── split-settlements.md                      <- Multi-party settlement release/cancel flows
│   └── references/REFERENCE.md                   <- Index for settlement skill files
├── subscriptions/                                <- Recurring payments domain folder
│   ├── README.md                                 <- Domain router for recurring billing
│   ├── subscriptions-plans.md                    <- Plan creation and management
│   ├── subscriptions-subscriptions.md            <- Subscription lifecycle APIs (create/pause/resume/cancel)
│   ├── subscriptions-presentations.md            <- Debit presentation and retry operations
│   └── references/REFERENCE.md                   <- Index for subscriptions skill files
└── p3p/                                          <- P3P x402 and UPI ReservePay domain folder
    ├── README.md                                 <- Domain router for P3P pay and SDK integration
    ├── pay.md                                    <- CLI-driven mandate, PPT token, and debit guidance
    ├── sdk-integration.md                        <- x402 SDK integration guidance for apps
    ├── references/                               <- CLI and SDK reference files plus domain index
    ├── templates/                                <- Next.js, Express, Python, and vanilla client templates
    └── evals/p3p-pay.evals.json                  <- P3P pay skill evaluation cases
```

The framework manifest is updated inside a managed block:

```markdown
<!-- BEGIN pinelabs-agent-skills:github-copilot -->
... generated Pine Labs routing, safety rules, and reference map ...
<!-- END pinelabs-agent-skills:github-copilot -->
```

Content outside the managed block is preserved. Re-running `add skills` or `update` replaces the block and skill files in place, so installs are idempotent. If a manifest contains only one marker or a damaged managed block, the CLI stops and asks you to repair the file before rerunning.


## How Assistants Use The Skills

The generated manifest tells the assistant to start with:

```text
SKILL.md
```

The root skill contains routing and safety rules. For validation, webhook, go-live, troubleshooting, upgrade, or migration work, the assistant reads the matching workflow guide before API files. Validation asks route through the focused guide for checkout/orders, refunds, webhooks, mobile/web SDKs, subscriptions, or settlements. Integration upgrades route through a source-verified release registry and UAT regression checklist. For API-specific work, it reads the domain router, then the matching area guidance file (for example, `pg/orders.md`), and uses the domain reference index for quick cross-area lookup. For P3P work, it routes to `p3p/pay.md` for CLI-driven agent payments or `p3p/sdk-integration.md` for x402 SDK integration. For generic "mobile SDK" or "web SDK" asks, the assistant first requests platform choice, then routes to platform-specific files. The manifest also includes the OpenAPI version and spec hash used to generate the core Pine Labs API guidance, which helps trace the package back to the API surface it was built from.

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
Run a validation checklist for my UAT payment integration.
Test duplicate payments, webhook replay, and a pending mobile callback before go-live.
Plan a Razorpay cutover with legacy-order routing, dual-run reconciliation, and rollback.
Plan a Flutter SDK upgrade using only verified Pine Labs release sources.
Tell me whether this integration is ready for go-live.
Migrate my current provider checkout flow to Pine Labs safely.
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
**AI:** *reads `pg/mobile-sdks/README.md`* -> Asks whether Android, iOS, or Flutter is needed before implementation

**You:** “Add Android mobile SDK integration”
**AI:** *reads `pg/mobile-sdks/android.md`* -> Implements Android SDK install/init/callback/verification flow

**You:** “Add web SDK integration”
**AI:** *reads `pg/web-sdks/README.md`* -> Asks whether Android, iOS, Flutter, or React Native is needed

**You:** “Add Flutter web SDK integration”
**AI:** *reads `pg/web-sdks/flutter.md`* -> Implements Flutter WebView SDK setup with backend verification

**You:** “Use P3P to charge for an API call”
**AI:** *reads `p3p/README.md` -> `p3p/pay.md`* -> Verifies CLI/auth, creates a mandate, mints a PPT token, and executes a debit with sandbox-first safety

**You:** “Add P3P x402 payment middleware to my app”
**AI:** *reads `p3p/README.md` -> `p3p/sdk-integration.md`* -> Chooses the framework template, keeps secrets server-side, and wires the 402 challenge/retry flow

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
**AI:** *reads `webhooks.md` -> `pg/orders.md` if order status is involved* -> Adds raw-body handling, signature verification, replay protection, status checks, and fulfillment gating

**You:** “Review my Pine Labs integration for unsafe credential handling”
**AI:** *reads `common-mistakes.md`* -> Flags plaintext secrets, production-risk patterns, missing webhook verification, and missing backend status checks

**You:** “I’m done coding — what should I test before go-live?”
**AI:** *reads `validation-and-testing.md` -> `go-live.md`* -> Produces a UAT, webhook, refund, settlement, and production-readiness checklist

**You:** “Migrate my existing checkout integration to Pine Labs”
**AI:** *reads `migration-guides/README.md`* -> Maps old payment concepts to Pine Labs order, checkout, webhook, refund, and reconciliation flows


## Safety Defaults

- Examples and tests default to UAT.
- Production actions require explicit user confirmation in the installed guidance.
- `PINELABS_CLIENT_ID` and `PINELABS_CLIENT_SECRET` stay server-side.
- Webhook signatures must be verified before processing Pine Labs events.
- Idempotency keys or request IDs are required for state-changing and money-moving calls.
- Secrets, access tokens, card data, and customer PII must not be logged.
- The installer collects no telemetry. Any future analytics must be opt-in, privacy documented, and must never collect secrets or identifiers silently.

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
npm install -g ./sdks/agent-skills-cli/pinelabs-agent-skills-cli-<version>.tgz
pinelabs-agent-skills list-frameworks
```

Dry-run an install into a temporary project:

```bash
pinelabs-agent-skills add skills \
    --frameworks github-copilot \
    --path /tmp/test-project \
    --dry-run
```

The `.tgz` file is a local test artifact. Do not commit it.

## Publishing

Publishing is handled by `.github/workflows/publish-sdks.yml` using npm Trusted Publishing. Normal releases should not run `npm publish` by hand.

For `pinelabs-agent-skills-cli`, the release workflow syncs and verifies the stamped package source in `plural-pinelabs/pinelabs-agent-skills-cli` main before npm publish, then tags the verified mirror after npm publish. The mirror sync excludes local build artifacts such as `dist/`, `node_modules/`, `.tgz` files, and internal generation-only files.

Before publishing, verify:

```bash
pnpm check:skills
pnpm check:agent-skills-cli
pnpm --filter pinelabs-agent-skills-cli exec npm pack --dry-run
```

For release-candidate validation, run the workflow with the package language selection for `agent-skills-cli` and `skip_mirrors: true`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Unsupported framework` | Run `npx pinelabs-agent-skills-cli list-frameworks` and use one of the listed IDs. |
| `No installed Pine Labs skills were found` during `update` | Run `add skills` first, or pass `--frameworks` to update a specific framework. |
| Partial managed block error | Open the manifest file, remove or repair the incomplete `BEGIN`/`END` block, then rerun the command. |
| `--dry-run` did not write files | Expected behavior. Remove `--dry-run` after reviewing the planned writes. |
| `--yes` reports no detected framework | Create the assistant's skills directory first, or pass `--frameworks` with the intended framework ID. |
| `--yes` reports multiple detected frameworks | Pass `--frameworks` with the one framework you want to install. |
| Multiple frameworks use the same manifest file | Each framework writes a separate managed block keyed by framework ID. Reruns update only the matching block. |

## License

MIT
