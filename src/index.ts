#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { Command } from "commander";

import { FRAMEWORKS, parseFrameworkList, type FrameworkConfig } from "./config.js";
import {
  detectInstalledFrameworks,
  detectLikelyFrameworks,
  installSkillsForFramework,
  type InstallOperation,
} from "./install.js";

interface PackageJson {
  readonly version: string;
}

interface CommonOptions {
  readonly frameworks?: string;
  readonly path?: string;
  readonly yes?: boolean;
  readonly dryRun?: boolean;
}

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

function projectPathFromOptions(options: CommonOptions): string {
  return options.path || process.cwd();
}

function summarizeOperations(framework: FrameworkConfig, operations: readonly InstallOperation[], dryRun: boolean): void {
  const action = dryRun ? "Would install" : "Installed";
  process.stdout.write(`${action} ${framework.label}\n`);
  for (const operation of operations) {
    process.stdout.write(`  ${operation.action.padEnd(9)} ${operation.path}\n`);
  }
}

async function promptForFrameworks(projectPath: string): Promise<FrameworkConfig[]> {
  process.stdout.write("Select frameworks to configure:\n");
  FRAMEWORKS.forEach((framework, index) => {
    process.stdout.write(`  ${index + 1}. ${framework.label} (${framework.value})\n`);
  });

  const readline = createInterface({ input, output });
  try {
    const answer = await readline.question("Enter comma-separated numbers or IDs: ");
    if (!answer.trim()) {
      throw new Error("No frameworks selected.");
    }
    const translated = answer
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = Number(item);
        if (Number.isInteger(index) && index >= 1 && index <= FRAMEWORKS.length) {
          return FRAMEWORKS[index - 1].value;
        }
        return item;
      })
      .join(",");
    return parseFrameworkList(translated);
  } finally {
    readline.close();
  }
}

async function frameworksForAdd(options: CommonOptions): Promise<FrameworkConfig[]> {
  if (options.frameworks) return parseFrameworkList(options.frameworks);
  const projectPath = projectPathFromOptions(options);

  if (options.yes) {
    const likely = await detectLikelyFrameworks(projectPath);
    return likely.length > 0 ? likely : parseFrameworkList("vscode-copilot");
  }

  return promptForFrameworks(projectPath);
}

async function frameworksForUpdate(options: CommonOptions): Promise<FrameworkConfig[]> {
  if (options.frameworks) return parseFrameworkList(options.frameworks);
  const installed = await detectInstalledFrameworks(projectPathFromOptions(options));
  if (installed.length === 0) {
    throw new Error("No installed Pine Labs skills were found. Run `pinelabs-agent-skills add skills` first.");
  }
  return installed;
}

async function installForFrameworks(frameworks: readonly FrameworkConfig[], options: CommonOptions): Promise<void> {
  const projectPath = projectPathFromOptions(options);
  for (const framework of frameworks) {
    const operations = await installSkillsForFramework(framework, projectPath, { dryRun: options.dryRun });
    summarizeOperations(framework, operations, Boolean(options.dryRun));
  }
}

const program = new Command();
program
  .name("pinelabs-agent-skills")
  .description("Install Pine Labs Online agent skills into AI coding assistant projects.")
  .version(packageJson.version);

const addCommand = new Command("add").description("Add Pine Labs assets to a project.");
addCommand
  .command("skills")
  .description("Install Pine Labs agent skills and framework manifests.")
  .option("--frameworks <ids>", "Comma-separated framework IDs. Run list-frameworks for supported values.")
  .option("--path <path>", "Project path to modify. Defaults to the current directory.")
  .option("--yes", "Use detected framework defaults without prompting.")
  .option("--dry-run", "Print planned writes without modifying files.")
  .action(async (options: CommonOptions) => {
    await installForFrameworks(await frameworksForAdd(options), options);
  });
program.addCommand(addCommand);

program
  .command("update")
  .description("Refresh already installed Pine Labs agent skills.")
  .option("--frameworks <ids>", "Comma-separated framework IDs. Defaults to installed frameworks.")
  .option("--path <path>", "Project path to modify. Defaults to the current directory.")
  .option("--dry-run", "Print planned writes without modifying files.")
  .action(async (options: CommonOptions) => {
    await installForFrameworks(await frameworksForUpdate(options), options);
  });

program.command("list-frameworks").description("Print supported framework IDs.").action(() => {
  for (const framework of FRAMEWORKS) {
    process.stdout.write(`${framework.value}\t${framework.label}\t${framework.skillsBasePath}\t${framework.manifestPath}\n`);
  }
});

program
  .command("doctor")
  .description("Show Pine Labs skills installation state for a project.")
  .option("--path <path>", "Project path to inspect. Defaults to the current directory.")
  .action(async (options: CommonOptions) => {
    const projectPath = projectPathFromOptions(options);
    const installed = await detectInstalledFrameworks(projectPath);
    if (installed.length === 0) {
      process.stdout.write("No Pine Labs agent skills installation found.\n");
      return;
    }
    process.stdout.write("Installed Pine Labs agent skills:\n");
    for (const framework of installed) {
      process.stdout.write(`  ${framework.value}\t${framework.skillsBasePath}\n`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
});