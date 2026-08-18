# pinelabs-agent-skills-cli

Install Pine Labs Online agent skills into AI coding assistant projects.

[![npm](https://img.shields.io/npm/v/pinelabs-agent-skills-cli.svg)](https://www.npmjs.com/package/pinelabs-agent-skills-cli)
[![license](https://img.shields.io/npm/l/pinelabs-agent-skills-cli.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/pinelabs-agent-skills-cli.svg)](#install)

`pinelabs-agent-skills-cli` installs local Pine Labs Online payment-integration guidance for supported AI coding assistants. The installed skills are generated from Pine Labs OpenAPI and best-practices policy sources, so assistants can route from a high-level integration request to the relevant API reference, safety rules, and examples.

The npm package is `pinelabs-agent-skills-cli`. The installed binary is `pinelabs-agent-skills`.

## Quick Start

Requires Node.js 18 or newer.

```bash
npx pinelabs-agent-skills-cli add skills
```

The command prompts for which assistant frameworks to configure, writes Pine Labs skill files into the project, and inserts or updates a managed manifest block for each selected framework.

For non-interactive setup:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks vscode-copilot --yes
```

Preview the exact file writes before changing a project:

```bash
npx pinelabs-agent-skills-cli add skills --frameworks vscode-copilot --dry-run
```

Install into another project path:

```bash
npx pinelabs-agent-skills-cli add skills --path /path/to/project --frameworks cursor
```

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
| `--frameworks <ids>` | `add skills`, `update` | Comma-separated framework IDs, such as `vscode-copilot,claude-code`. |
| `--path <path>` | `add skills`, `update`, `doctor` | Project path to inspect or modify. Defaults to the current directory. |
| `--dry-run` | `add skills`, `update` | Print planned writes without modifying files. |
| `--yes` | `add skills` | Use detected framework defaults without prompting. Falls back to VS Code Copilot when no likely framework is detected. |

Refresh an existing installation:

```bash
npx pinelabs-agent-skills-cli update
npx pinelabs-agent-skills-cli update --frameworks cursor,claude-code
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
| `opencode` | OpenCode | `.opencode/skills/pinelabs-skills` | `AGENTS.md` | Markdown |
| `github-copilot-cli` | GitHub Copilot CLI | `.github/skills/pinelabs-skills` | `.github/copilot-instructions.md` | Markdown |
| `codex-cli` | OpenAI Codex CLI | `.agents/skills/pinelabs-skills` | `AGENTS.md` | Markdown |
| `antigravity` | Antigravity | `.agent/skills/pinelabs-skills` | `AGENTS.md` | Markdown |

Supported aliases include `claude`, `copilot`, `github-copilot`, `gemini`, `copilot-cli`, and `codex`.

## What Gets Installed

Each selected framework receives a `pinelabs-skills` directory plus a framework-specific manifest update.

```text
pinelabs-skills/
└── pinelabs-best-practices/
        ├── SKILL.md
        └── references/
                ├── authentication.md
                ├── orders.md
                ├── payment-links.md
                ├── payouts.md
                ├── subscriptions-plans.md
                └── ...
```

The framework manifest is updated inside a managed block:

```markdown
<!-- BEGIN pinelabs-agent-skills:vscode-copilot -->
... generated Pine Labs routing, safety rules, and reference map ...
<!-- END pinelabs-agent-skills:vscode-copilot -->
```

Content outside the managed block is preserved. Re-running `add skills` or `update` replaces the block and skill files in place, so installs are idempotent. If a manifest contains only one marker or a damaged managed block, the CLI stops and asks you to repair the file before rerunning.

## Generated References

The current package installs these Pine Labs API-area references.

| API Area | Reference File |
| --- | --- |
| Affordability Suite | `affordability-suite.md` |
| Apple Pay | `apple-pay.md` |
| Authentication | `authentication.md` |
| BNPL | `bnpl.md` |
| Brand Wallet | `brand-wallet.md` |
| Brand Wallet Payments | `brand-wallet-payments.md` |
| Card Payments | `card-payments.md` |
| Checkout | `checkout.md` |
| Convenience Fee | `convenience-fee.md` |
| Customers | `customers.md` |
| E-Challans | `e-challans.md` |
| International Payments | `international-payments.md` |
| NetBanking | `netbanking.md` |
| Orders | `orders.md` |
| Pay by Points | `pay-by-points.md` |
| Payment Links | `payment-links.md` |
| Payment Option | `payment-option.md` |
| Payouts | `payouts.md` |
| Refunds | `refunds.md` |
| Settlements | `settlements.md` |
| Split Settlements | `split-settlements.md` |
| Subscriptions - Plans | `subscriptions-plans.md` |
| Subscriptions - Presentations | `subscriptions-presentations.md` |
| Subscriptions - Subscriptions | `subscriptions-subscriptions.md` |
| Tokenization | `tokenization.md` |
| UPI Payments | `upi-payments.md` |
| UPI Reserve Pay | `upi-reserve-pay.md` |
| Wallet | `wallet.md` |

## How Assistants Use The Skills

The generated manifest tells the assistant to start with:

```text
pinelabs-best-practices/SKILL.md
```

That primary skill contains routing and safety rules. For API-specific work, the assistant then reads the matching file under `references/`. The manifest also includes the OpenAPI version and spec hash used to generate the skills, which helps trace the package back to the API surface it was built from.

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
```

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