import { PRIMARY_SKILL_PATH, SKILLS_ROOT_DIR } from "./generated/skills.generated.js";

export type ManifestFormat = "markdown" | "mdc";

export interface FrameworkConfig {
  readonly value: string;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly skillsBasePath: string;
  readonly manifestPath: string;
  readonly manifestFormat: ManifestFormat;
  readonly likelyIndicatorPaths?: readonly string[];
}

export const FRAMEWORKS: readonly FrameworkConfig[] = [
  {
    value: "claude-code",
    label: "Claude Code",
    aliases: ["claude"],
    skillsBasePath: `.claude/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: "CLAUDE.md",
    manifestFormat: "markdown",
  },
  {
    value: "cursor",
    label: "Cursor",
    aliases: [],
    skillsBasePath: `.cursor/${SKILLS_ROOT_DIR}`,
    manifestPath: ".cursor/rules/pinelabs.mdc",
    manifestFormat: "mdc",
  },
  {
    value: "vscode-copilot",
    label: "VS Code Copilot",
    aliases: ["copilot", "github-copilot"],
    skillsBasePath: `.github/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: ".github/copilot-instructions.md",
    manifestFormat: "markdown",
  },
  {
    value: "gemini-cli",
    label: "Gemini CLI",
    aliases: ["gemini"],
    skillsBasePath: `.gemini/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: "GEMINI.md",
    manifestFormat: "markdown",
  },
  {
    value: "kiro",
    label: "Kiro",
    aliases: ["kiro-ide", "kiro-cli"],
    skillsBasePath: `.kiro/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: ".kiro/steering/pinelabs-agent-skills.md",
    manifestFormat: "markdown",
    likelyIndicatorPaths: [".kiro", ".kiro/steering", ".kiro/skills"],
  },
  {
    value: "opencode",
    label: "OpenCode",
    aliases: [],
    skillsBasePath: `.opencode/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: "AGENTS.md",
    manifestFormat: "markdown",
  },
  {
    value: "github-copilot-cli",
    label: "GitHub Copilot CLI",
    aliases: ["copilot-cli"],
    skillsBasePath: `.github/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: ".github/copilot-instructions.md",
    manifestFormat: "markdown",
  },
  {
    value: "codex-cli",
    label: "OpenAI Codex CLI",
    aliases: ["codex"],
    skillsBasePath: `.agents/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: "AGENTS.md",
    manifestFormat: "markdown",
  },
  {
    value: "antigravity",
    label: "Antigravity",
    aliases: [],
    skillsBasePath: `.agent/skills/${SKILLS_ROOT_DIR}`,
    manifestPath: "AGENTS.md",
    manifestFormat: "markdown",
  },
] as const;

export function findFramework(value: string): FrameworkConfig | undefined {
  const normalized = value.trim().toLowerCase();
  return FRAMEWORKS.find(
    (framework) => framework.value === normalized || framework.aliases.includes(normalized),
  );
}

export function parseFrameworkList(value: string): FrameworkConfig[] {
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const frameworks: FrameworkConfig[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const framework = findFramework(name);
    if (!framework) {
      throw new Error(`Unsupported framework: ${name}. Run \`pinelabs-agent-skills list-frameworks\` for supported IDs.`);
    }
    if (!seen.has(framework.value)) {
      frameworks.push(framework);
      seen.add(framework.value);
    }
  }

  return frameworks;
}

export function primarySkillRelativePath(framework: FrameworkConfig): string {
  return `${framework.skillsBasePath}/${PRIMARY_SKILL_PATH}`;
}
