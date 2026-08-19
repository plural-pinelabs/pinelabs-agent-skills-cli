import type { FrameworkConfig } from "./config.js";
import {
  AREA_SKILL_PATHS,
  DOMAIN_REFERENCE_PATHS,
  DOMAIN_SKILL_PATHS,
  GROUP_SKILL_PATHS,
  SKILL_SOURCE,
  WORKFLOW_SKILL_PATHS,
} from "./generated/skills.generated.js";

function referenceRows(skillsBasePath: string): string[] {
  return DOMAIN_REFERENCE_PATHS.map((path) => {
    const domain = path.split("/")[0];
    return `| ${domain} | ${skillsBasePath}/${path} |`;
  });
}

function domainSkillRows(skillsBasePath: string): string[] {
  return DOMAIN_SKILL_PATHS.map((path) => {
    const domain = path.split("/")[0];
    return `| ${domain} | ${skillsBasePath}/${path} |`;
  });
}

function areaSkillRows(skillsBasePath: string): string[] {
  return AREA_SKILL_PATHS.map((path) => {
    const domain = path.split("/")[0];
    return `| ${domain} | ${skillsBasePath}/${path} |`;
  });
}

function groupSkillRows(skillsBasePath: string): string[] {
  return GROUP_SKILL_PATHS.map((path) => {
    const domain = path.split("/")[0];
    return `| ${domain} | ${skillsBasePath}/${path} |`;
  });
}

function workflowSkillRows(skillsBasePath: string): string[] {
  return WORKFLOW_SKILL_PATHS.map((path) => {
    const workflow = path.split("/")[0];
    return `| ${workflow} | ${skillsBasePath}/${path} |`;
  });
}

export function generateManifestContent(framework: FrameworkConfig): string {
  const domains = DOMAIN_SKILL_PATHS.map((path) => path.split("/")[0]).join(", ");
  const body = [
    "# Pine Labs Agent Skills",
    "",
    "Use these local skills when building, modifying, reviewing, testing, or operating Pine Labs Online payment integrations.",
    "",
    "## Required Reading",
    "",
    `1. Start with \`${framework.skillsBasePath}/SKILL.md\` for global routing and safety rules.`,
    "2. For validation, webhook, go-live, troubleshooting, upgrade, or migration asks, read the matching workflow guide before API files.",
    `3. Read the domain router before writing code for that area (${domains}).`,
    "4. Read the matching API guidance file for endpoint-level detail and implementation examples.",
    "5. For P3P x402, UPI ReservePay, or agent-payment asks, route through `p3p/pay.md` or `p3p/sdk-integration.md`.",
    "6. For generic mobile/web SDK asks, ask platform first (Android, iOS, Flutter, or React Native) before implementation.",
    "7. Use the domain REFERENCE file as an index for cross-area routing and quick lookup.",
    "8. After integration work, re-check production safety, webhook verification, idempotency, and server-side credential handling.",
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
    "## Workflow References",
    "",
    "| Workflow | Local reference |",
    "| --- | --- |",
    ...workflowSkillRows(framework.skillsBasePath),
    "",
    "## Domain Routers",
    "",
    "| Domain | Local router |",
    "| --- | --- |",
    ...domainSkillRows(framework.skillsBasePath),
    "",
    "## Domain References",
    "",
    "| Domain | Local reference |",
    "| --- | --- |",
    ...referenceRows(framework.skillsBasePath),
    "",
    "## SDK Group Routers",
    "",
    "| Domain | Local group router |",
    "| --- | --- |",
    ...groupSkillRows(framework.skillsBasePath),
    "",
    "## API Guidance Files",
    "",
    "| Domain | Local guidance file |",
    "| --- | --- |",
    ...areaSkillRows(framework.skillsBasePath),
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
