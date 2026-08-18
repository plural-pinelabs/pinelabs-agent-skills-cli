import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { FRAMEWORKS, findFramework, primarySkillRelativePath, type FrameworkConfig } from "./config.js";
import { SKILL_ASSETS } from "./generated/skills.generated.js";
import { generateManifestContent } from "./manifest.js";

export type PlannedAction = "create" | "update" | "unchanged";

export interface InstallOperation {
  readonly action: PlannedAction;
  readonly path: string;
}

export interface InstallOptions {
  readonly dryRun?: boolean;
}

function resolveProjectRoot(projectPath: string): string {
  return resolve(projectPath);
}

function resolveInsideProject(projectRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Refusing to write absolute path: ${relativePath}`);
  }
  const targetPath = resolve(projectRoot, relativePath);
  const relativePathFromRoot = relative(projectRoot, targetPath);
  if (relativePathFromRoot.startsWith("..") || isAbsolute(relativePathFromRoot)) {
    throw new Error(`Refusing to write outside project root: ${relativePath}`);
  }
  return targetPath;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertNoSymlinkPath(projectRoot: string, targetPath: string): Promise<void> {
  const chain: string[] = [];
  let currentPath = targetPath;

  while (currentPath !== projectRoot) {
    chain.push(currentPath);
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }

  for (const path of chain.reverse()) {
    if (!(await pathExists(path))) continue;
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to write through symbolic link: ${relative(projectRoot, path)}`);
    }
  }
}

async function planWrite(projectRoot: string, relativePath: string, content: string): Promise<InstallOperation> {
  const targetPath = resolveInsideProject(projectRoot, relativePath);
  if (!(await pathExists(targetPath))) {
    return { action: "create", path: relativePath };
  }
  const existing = await readFile(targetPath, "utf8");
  return {
    action: existing === content ? "unchanged" : "update",
    path: relativePath,
  };
}

async function writeIfNeeded(
  projectRoot: string,
  relativePath: string,
  content: string,
  dryRun: boolean,
): Promise<InstallOperation> {
  const operation = await planWrite(projectRoot, relativePath, content);
  if (dryRun || operation.action === "unchanged") {
    return operation;
  }

  const targetPath = resolveInsideProject(projectRoot, relativePath);
  await assertNoSymlinkPath(projectRoot, targetPath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");
  return operation;
}

export function managedBlockMarkers(framework: FrameworkConfig): { readonly start: string; readonly end: string } {
  const key = `pinelabs-agent-skills:${framework.value}`;
  return {
    start: `<!-- BEGIN ${key} -->`,
    end: `<!-- END ${key} -->`,
  };
}

export function updateManagedBlock(existing: string, framework: FrameworkConfig, content: string): string {
  const markers = managedBlockMarkers(framework);
  const block = `${markers.start}\n${content.trim()}\n${markers.end}`;
  const startIndex = existing.indexOf(markers.start);
  const endIndex = existing.indexOf(markers.end);

  if (startIndex === -1 && endIndex === -1) {
    const separator = existing.trim().length > 0 ? "\n\n" : "";
    return `${existing.trimEnd()}${separator}${block}\n`;
  }

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Manifest has a partial managed block for ${framework.value}. Repair it before rerunning.`);
  }

  return `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex + markers.end.length)}`;
}

async function readExistingManifest(projectRoot: string, framework: FrameworkConfig): Promise<string> {
  const targetPath = resolveInsideProject(projectRoot, framework.manifestPath);
  if (!(await pathExists(targetPath))) return "";
  await assertNoSymlinkPath(projectRoot, targetPath);
  return readFile(targetPath, "utf8");
}

export async function installSkillsForFramework(
  framework: FrameworkConfig,
  projectPath: string,
  options: InstallOptions = {},
): Promise<InstallOperation[]> {
  const projectRoot = resolveProjectRoot(projectPath);
  const operations: InstallOperation[] = [];
  const dryRun = Boolean(options.dryRun);

  for (const asset of SKILL_ASSETS) {
    operations.push(
      await writeIfNeeded(projectRoot, `${framework.skillsBasePath}/${asset.path}`, asset.content, dryRun),
    );
  }

  const existingManifest = await readExistingManifest(projectRoot, framework);
  const manifest = updateManagedBlock(existingManifest, framework, generateManifestContent(framework));
  operations.push(await writeIfNeeded(projectRoot, framework.manifestPath, manifest, dryRun));

  return operations;
}

export async function detectInstalledFrameworks(projectPath: string): Promise<FrameworkConfig[]> {
  const projectRoot = resolveProjectRoot(projectPath);
  const installed: FrameworkConfig[] = [];

  for (const framework of FRAMEWORKS) {
    const primaryPath = resolveInsideProject(projectRoot, primarySkillRelativePath(framework));
    if (await pathExists(primaryPath)) {
      installed.push(framework);
    }
  }

  return installed;
}

export async function detectLikelyFrameworks(projectPath: string): Promise<FrameworkConfig[]> {
  const projectRoot = resolveProjectRoot(projectPath);
  const likely: FrameworkConfig[] = [];

  for (const framework of FRAMEWORKS) {
    const manifestPath = resolveInsideProject(projectRoot, framework.manifestPath);
    const skillsPath = resolveInsideProject(projectRoot, framework.skillsBasePath);
    if ((await pathExists(manifestPath)) || (await pathExists(dirname(skillsPath)))) {
      likely.push(framework);
    }
  }

  return likely;
}

export function frameworkByValue(value: string): FrameworkConfig {
  const framework = findFramework(value);
  if (!framework) {
    throw new Error(`Unsupported framework: ${value}`);
  }
  return framework;
}