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
| [`p3p-pay`](./p3p-pay/) | **AI Agents** | CLI-driven UPI ReservePay payments. Create mandates, manage tokens, execute debits — all via the P3P CLI. For AI agent workflows that need to initiate recurring payments. |
| [`p3p-sdk-integration`](./p3p-sdk-integration/) | **AI Applications** | Integrate P3P's payment SDKs into applications. Server-side mandate creation, webhook handling, and debit execution using TypeScript or Python SDKs. Includes templates for Next.js, Express, FastAPI. |

## Repository Structure

```
p3p-pay/                           # Skill for AI agents (CLI-based)
├── SKILL.md                       # Main skill instructions
├── evals/
│   └── evals.json                 # Skill evaluation test cases
└── references/
    ├── cli-setup.md               # CLI installation and auth
    ├── cli-mandates.md            # Mandate creation flows
    ├── cli-tokens.md              # Token management
    └── cli-debit.md               # Debit execution

p3p-sdk-integration/               # Skill for AI applications (SDK-based)
├── SKILL.md                       # Main skill instructions
├── references/
│   ├── server-sdk-api-reference.md  # Full SDK API docs
│   └── test-data.md               # Test UPI IDs and sandbox data
└── templates/
    ├── nextjs/                    # Next.js App Router templates
    ├── express/                   # Express.js templates
    └── fastapi/                   # FastAPI templates
```

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
Use the p3p-pay skill to create a UPI ReservePay mandate and execute a debit through the P3P CLI. First verify the CLI is installed and authenticated, confirm the mobile number and amount, and use sandbox credentials unless I explicitly ask for production.
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

### Install CLI

```bash
npm install -g @pine-labs-online/p3p-cli
```

After the CLI is installed, authenticate before making API calls:

```bash
p3p login --interactive
```

You can also provide credentials with environment variables:

```bash
export PINE_LABS_CLIENT_ID=your_client_id
export PINE_LABS_CLIENT_SECRET=your_client_secret
export PINE_LABS_ENV=SANDBOX
```

Then ask your AI agent to "create a UPI mandate" or "debit a subscription". The agent skill guides the full payment flow.

### For SDK Integration

Point your AI coding agent at this repository and ask it to "integrate P3P payments". The SDK skill guides the agent through setting up the SDK, creating mandate endpoints, and handling webhooks.

---

*Built by [Pine Labs](https://www.pinelabs.com)*
