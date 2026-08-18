import type { FrameworkConfig } from "./config.js";
import { SKILL_ASSETS, SKILL_SOURCE } from "./generated/skills.generated.js";

function referenceRows(skillsBasePath: string): string[] {
  return SKILL_ASSETS
    .filter((asset) => asset.path.startsWith("pinelabs-best-practices/references/"))
    .map((asset) => {
      const label = asset.path.replace("pinelabs-best-practices/references/", "");
      return `| ${label} | ${skillsBasePath}/${asset.path} |`;
    });
}

export function generateManifestContent(framework: FrameworkConfig): string {
  const body = [
    "# Pine Labs Agent Skills",
    "",
    "Use these local skills when building, modifying, reviewing, testing, or operating Pine Labs Online payment integrations.",
    "",
    "## Required Reading",
    "",
    `1. Start with \`${framework.skillsBasePath}/pinelabs-best-practices/SKILL.md\` for routing and safety rules.`,
    "2. Read the matching reference file before writing code for a specific API area.",
    "3. After integration work, re-check production safety, webhook verification, idempotency, and server-side credential handling.",
    "",
    "## Source",
    "",
    `- OpenAPI version: \`${SKILL_SOURCE.openApiVersion}\``,
    `- Spec hash: \`sha256:${SKILL_SOURCE.specHash}\``,
    "- Package: `pinelabs-agent-skills-cli`",
    "",
    "## Safety Rules",
    "",
    "- Default examples and tests to UAT.",
    "- Use production only after explicit user confirmation.",
    "- Keep `PINELABS_CLIENT_ID` and `PINELABS_CLIENT_SECRET` server-side only.",
    "- Verify webhook signatures before processing events.",
    "- Use idempotency keys or request IDs for state-changing and money-moving calls.",
    "- Do not log secrets, access tokens, card data, or customer PII.",
    "",
    "## Reference Map",
    "",
    "| API area | Local reference |",
    "| --- | --- |",
    ...referenceRows(framework.skillsBasePath),
    "",
  ].join("\n");

  if (framework.manifestFormat === "mdc") {
    return [
      "---",
      "description: Pine Labs Online payment integration skills",
      "alwaysApply: true",
      "---",
      "",
      body,
    ].join("\n");
  }

  return body;
}