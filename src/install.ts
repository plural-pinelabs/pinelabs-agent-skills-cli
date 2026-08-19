import { createHash, randomUUID } from "node:crypto";
import { constants, readFileSync } from "node:fs";
import { access, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { FRAMEWORKS, findFramework, primarySkillRelativePath, type FrameworkConfig } from "./config.js";
import {
  SKILL_ASSETS,
  SKILL_PACKAGE_NAME,
  SKILL_SOURCE,
  VERSION_MARKER_KEY,
  VERSION_MARKER_PATH,
} from "./generated/skills.generated.js";
import { generateManifestContent } from "./manifest.js";

export type PlannedAction = "create" | "update" | "unchanged" | "delete";
export type InstallStatus = "current" | "stale" | "legacy";

export interface InstallOperation {
  readonly action: PlannedAction;
  readonly path: string;
  readonly expectedSha256?: string;
}

export interface InstallOptions {
  readonly dryRun?: boolean;
}

export interface InstalledFramework {
  readonly framework: FrameworkConfig;
  readonly status: InstallStatus;
  readonly installedVersion?: string;
  readonly currentVersion: string;
  readonly markerPath: string;
  readonly skillsBasePath: string;
}

interface PackageJson {
  readonly version: string;
}

interface VersionMarker {
  readonly package?: string;
  readonly version?: string;
  readonly openApiVersion?: string;
  readonly specHash?: string;
  readonly managedFiles?: readonly string[];
  readonly "pinelabs-skills-cli-version"?: string;
}

const LEGACY_SKILLS_ROOT_DIRS = ["pinelabs-best-practices"] as const;
const OBSOLETE_0_4_0_MANAGED_FILES = [
  {
    path: "getting-started/SKILL.md",
    sha256: "0a7cae757286aead5ad9834fc0aef7e520a5bffa0e4549e79b12be17534e5eb1",
  },
  {
    path: "pg/SKILL.md",
    sha256: "de67fad3cb3ac7a7fbac0714c0b4b26adecf83efd2d874c45d585ddc4b2ea177",
  },
  {
    path: "settlements/SKILL.md",
    sha256: "8499b360c6e69ebdfc220f56a423fd5d6f41065d27b0f25deb73583cc937b69f",
  },
  {
    path: "subscriptions/SKILL.md",
    sha256: "18637c1d97acaebaa385c2a6e2648454c01e373ed67c243a88358378621d7079",
  },
  {
    path: "p3p/SKILL.md",
    sha256: "ba4eed2ef7b53549ac0ac99fc20782c43ac8125daf3ddd0d0d2c325487cc897a",
  },
  {
    path: "pg/mobile-sdks/SKILL.md",
    sha256: "488acbdc05f641e8164bdc1d4d4e194de88b59f09fb1c780ba53c4fde11ff244",
  },
  {
    path: "pg/web-sdks/SKILL.md",
    sha256: "0c2c167ec39f2a5c69995fb5e06e46e422c290cfa69e37232bf41aac9a868065",
  },
] as const;

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageJson;

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
  await assertNoSymlinkPath(projectRoot, targetPath);
  if (!(await pathExists(targetPath))) {
    return { action: "create", path: relativePath };
  }
  const existing = await readFile(targetPath, "utf8");
  return {
    action: existing === content ? "unchanged" : "update",
    path: relativePath,
  };
}

interface PlannedWrite {
  readonly operation: InstallOperation;
  readonly relativePath: string;
  readonly content: string;
}

async function atomicWriteFile(projectRoot: string, relativePath: string, content: string): Promise<void> {
  const targetPath = resolveInsideProject(projectRoot, relativePath);
  await assertNoSymlinkPath(projectRoot, targetPath);
  await mkdir(dirname(targetPath), { recursive: true });
  await assertNoSymlinkPath(projectRoot, targetPath);

  const tempPath = resolve(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(tempPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(tempPath, targetPath);
  } catch (err) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function planWriteContent(projectRoot: string, relativePath: string, content: string): Promise<PlannedWrite> {
  return {
    operation: await planWrite(projectRoot, relativePath, content),
    relativePath,
    content,
  };
}

async function writePlanned(projectRoot: string, planned: PlannedWrite): Promise<void> {
  if (planned.operation.action === "unchanged") return;
  await atomicWriteFile(projectRoot, planned.relativePath, planned.content);
}

function versionMarkerContent(): string {
  return `${JSON.stringify(
    {
      [VERSION_MARKER_KEY]: packageJson.version,
      package: SKILL_PACKAGE_NAME,
      version: packageJson.version,
      openApiVersion: SKILL_SOURCE.openApiVersion,
      specHash: `sha256:${SKILL_SOURCE.specHash}`,
      managedFiles: managedSkillFiles(),
    },
    null,
    2,
  )}\n`;
}

function managedSkillFiles(): readonly string[] {
  return [...SKILL_ASSETS.map((asset) => asset.path), VERSION_MARKER_PATH].sort();
}

async function readVersionMarker(projectRoot: string, relativePath: string): Promise<VersionMarker | undefined> {
  const targetPath = resolveInsideProject(projectRoot, relativePath);
  if (!(await pathExists(targetPath))) return undefined;
  await assertNoSymlinkPath(projectRoot, targetPath);
  const raw = await readFile(targetPath, "utf8");
  try {
    return JSON.parse(raw) as VersionMarker;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid Pine Labs version marker JSON at ${relativePath}: ${message}`);
  }
}

function installedStatus(marker: VersionMarker | undefined): { readonly status: InstallStatus; readonly version?: string } {
  if (!marker) return { status: "legacy" };

  const version = marker[VERSION_MARKER_KEY] ?? marker.version;
  const expectedSpecHash = `sha256:${SKILL_SOURCE.specHash}`;
  const isCurrent =
    marker.package === SKILL_PACKAGE_NAME &&
    version === packageJson.version &&
    marker.version === packageJson.version &&
    marker.openApiVersion === SKILL_SOURCE.openApiVersion &&
    marker.specHash === expectedSpecHash;

  return { status: isCurrent ? "current" : "stale", version };
}

function managedBlockMarkersForKey(keyValue: string): { readonly start: string; readonly end: string } {
  const key = `pinelabs-agent-skills:${keyValue}`;
  return {
    start: `<!-- BEGIN ${key} -->`,
    end: `<!-- END ${key} -->`,
  };
}

export function managedBlockMarkers(framework: FrameworkConfig): { readonly start: string; readonly end: string } {
  return managedBlockMarkersForKey(framework.value);
}

export function updateManagedBlock(existing: string, framework: FrameworkConfig, content: string): string {
  const canonicalMarkers = managedBlockMarkers(framework);
  const legacyKeys = [framework.value, ...framework.aliases];
  const block = `${canonicalMarkers.start}\n${content.trim()}\n${canonicalMarkers.end}`;
  let output = existing;
  let replaced = false;

  for (const key of legacyKeys) {
    const markers = managedBlockMarkersForKey(key);
    let searchStart = 0;
    while (true) {
      const startIndex = output.indexOf(markers.start, searchStart);
      const endIndex = output.indexOf(markers.end, searchStart);
      if (startIndex === -1 && endIndex === -1) break;
      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error(`Manifest has a partial managed block for ${key}. Repair it before rerunning.`);
      }
      const replacement = replaced ? "" : block;
      output = `${output.slice(0, startIndex)}${replacement}${output.slice(endIndex + markers.end.length)}`;
      searchStart = startIndex + replacement.length;
      replaced = true;
    }
  }

  if (replaced) {
    return `${output.trimEnd()}\n`;
  }

  const separator = existing.trim().length > 0 ? "\n\n" : "";
  return `${existing.trimEnd()}${separator}${block}\n`;
}

async function readExistingManifest(projectRoot: string, framework: FrameworkConfig): Promise<string> {
  const targetPath = resolveInsideProject(projectRoot, framework.manifestPath);
  if (!(await pathExists(targetPath))) return "";
  await assertNoSymlinkPath(projectRoot, targetPath);
  return readFile(targetPath, "utf8");
}

function legacySkillsBasePaths(framework: FrameworkConfig): readonly string[] {
  const parent = dirname(framework.skillsBasePath);
  const candidates = LEGACY_SKILLS_ROOT_DIRS.flatMap((rootDir) => [
    `${framework.skillsBasePath}/${rootDir}`,
    `${parent}/${rootDir}`,
  ]);
  return [...new Set(candidates)].filter((path) => path !== framework.skillsBasePath);
}

async function planRemovePathIfExists(projectRoot: string, relativePath: string): Promise<InstallOperation | undefined> {
  const targetPath = resolveInsideProject(projectRoot, relativePath);
  if (!(await pathExists(targetPath))) return undefined;
  await assertNoSymlinkPath(projectRoot, targetPath);
  return { action: "delete", path: relativePath };
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function planRemovePathIfHashMatches(
  projectRoot: string,
  relativePath: string,
  expectedSha256: string,
): Promise<InstallOperation | undefined> {
  const targetPath = resolveInsideProject(projectRoot, relativePath);
  if (!(await pathExists(targetPath))) return undefined;
  await assertNoSymlinkPath(projectRoot, targetPath);
  const content = await readFile(targetPath, "utf8");
  if (sha256(content) !== expectedSha256) return undefined;
  return { action: "delete", path: relativePath, expectedSha256 };
}

async function removePlannedPath(projectRoot: string, operation: InstallOperation): Promise<void> {
  if (operation.action !== "delete") return;
  const targetPath = resolveInsideProject(projectRoot, operation.path);
  await assertNoSymlinkPath(projectRoot, targetPath);
  if (operation.expectedSha256) {
    if (!(await pathExists(targetPath))) return;
    const content = await readFile(targetPath, "utf8");
    if (sha256(content) !== operation.expectedSha256) return;
  }
  await rm(targetPath, { recursive: true, force: true });
}

function markerManagedFiles(marker: VersionMarker, markerPath: string): readonly string[] {
  if (marker.managedFiles === undefined) return [];
  if (!Array.isArray(marker.managedFiles) || marker.managedFiles.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid managedFiles in Pine Labs version marker at ${markerPath}.`);
  }
  return marker.managedFiles;
}

async function planPruneManagedFiles(projectRoot: string, framework: FrameworkConfig): Promise<InstallOperation[]> {
  const operations: InstallOperation[] = [];
  const markerPath = `${framework.skillsBasePath}/${VERSION_MARKER_PATH}`;
  const marker = await readVersionMarker(projectRoot, markerPath);
  if (!marker) return operations;

  const currentFiles = new Set(managedSkillFiles());
  for (const managedFile of markerManagedFiles(marker, markerPath)) {
    if (currentFiles.has(managedFile)) continue;
    if (isAbsolute(managedFile) || managedFile.includes("..")) continue;
    const operation = await planRemovePathIfExists(projectRoot, `${framework.skillsBasePath}/${managedFile}`);
    if (operation) operations.push(operation);
  }
  return operations;
}

async function planPruneKnownObsoleteManagedFiles(
  projectRoot: string,
  framework: FrameworkConfig,
): Promise<InstallOperation[]> {
  const operations: InstallOperation[] = [];
  for (const obsoleteFile of OBSOLETE_0_4_0_MANAGED_FILES) {
    const operation = await planRemovePathIfHashMatches(
      projectRoot,
      `${framework.skillsBasePath}/${obsoleteFile.path}`,
      obsoleteFile.sha256,
    );
    if (operation) operations.push(operation);
  }
  return operations;
}

async function hasObsoleteManagedFiles(projectRoot: string, framework: FrameworkConfig): Promise<boolean> {
  for (const obsoleteFile of OBSOLETE_0_4_0_MANAGED_FILES) {
    if (await pathExists(resolveInsideProject(projectRoot, `${framework.skillsBasePath}/${obsoleteFile.path}`))) {
      return true;
    }
  }
  return false;
}

async function legacyInstallBasePaths(projectRoot: string, framework: FrameworkConfig): Promise<string[]> {
  const ownedPaths: string[] = [];
  for (const basePath of legacySkillsBasePaths(framework)) {
    const primaryPath = resolveInsideProject(projectRoot, `${basePath}/SKILL.md`);
    if (!(await pathExists(primaryPath))) continue;
    await assertNoSymlinkPath(projectRoot, primaryPath);
    const content = await readFile(primaryPath, "utf8").catch(() => "");
    if (content.includes("name: pinelabs-best-practices") || content.includes("# Pine Labs Best Practices")) {
      ownedPaths.push(basePath);
    }
  }
  return ownedPaths;
}

async function legacyInstallBasePath(projectRoot: string, framework: FrameworkConfig): Promise<string | undefined> {
  return (await legacyInstallBasePaths(projectRoot, framework))[0];
}

async function planPruneLegacyInstall(projectRoot: string, framework: FrameworkConfig): Promise<InstallOperation[]> {
  const operations: InstallOperation[] = [];
  for (const legacyBasePath of await legacyInstallBasePaths(projectRoot, framework)) {
    const operation = await planRemovePathIfExists(projectRoot, legacyBasePath);
    if (operation) operations.push(operation);
  }
  return operations;
}

export async function installSkillsForFramework(
  framework: FrameworkConfig,
  projectPath: string,
  options: InstallOptions = {},
): Promise<InstallOperation[]> {
  const projectRoot = resolveProjectRoot(projectPath);
  const dryRun = Boolean(options.dryRun);
  const plannedWrites: PlannedWrite[] = [];

  for (const asset of SKILL_ASSETS) {
    plannedWrites.push(
      await planWriteContent(projectRoot, `${framework.skillsBasePath}/${asset.path}`, asset.content),
    );
  }

  plannedWrites.push(
    await planWriteContent(
      projectRoot,
      `${framework.skillsBasePath}/${VERSION_MARKER_PATH}`,
      versionMarkerContent(),
    ),
  );

  const existingManifest = await readExistingManifest(projectRoot, framework);
  const manifest = updateManagedBlock(existingManifest, framework, generateManifestContent(framework));
  plannedWrites.push(await planWriteContent(projectRoot, framework.manifestPath, manifest));

  const plannedDeletes = [
    ...(await planPruneManagedFiles(projectRoot, framework)),
    ...(await planPruneKnownObsoleteManagedFiles(projectRoot, framework)),
    ...(await planPruneLegacyInstall(projectRoot, framework)),
  ];
  const operations = [...plannedWrites.map((planned) => planned.operation), ...plannedDeletes];

  if (dryRun) return operations;

  for (const planned of plannedWrites) {
    await writePlanned(projectRoot, planned);
  }

  for (const planned of plannedDeletes) {
    await removePlannedPath(projectRoot, planned);
  }

  return operations;
}

export async function inspectInstalledFrameworks(projectPath: string): Promise<InstalledFramework[]> {
  const projectRoot = resolveProjectRoot(projectPath);
  const installed: InstalledFramework[] = [];

  for (const framework of FRAMEWORKS) {
    const primaryPath = resolveInsideProject(projectRoot, primarySkillRelativePath(framework));
    if (await pathExists(primaryPath)) {
      const markerPath = `${framework.skillsBasePath}/${VERSION_MARKER_PATH}`;
      let marker: VersionMarker | undefined;
      try {
        marker = await readVersionMarker(projectRoot, markerPath);
      } catch {
        marker = {
          package: undefined,
          version: undefined,
          openApiVersion: undefined,
          specHash: undefined,
        };
      }
      const status = installedStatus(marker);
      const hasObsoleteRouters = await hasObsoleteManagedFiles(projectRoot, framework);
      installed.push({
        framework,
        status: status.status === "current" && hasObsoleteRouters ? "stale" : status.status,
        installedVersion: status.version,
        currentVersion: packageJson.version,
        markerPath,
        skillsBasePath: framework.skillsBasePath,
      });
      continue;
    }

    const legacyBasePath = await legacyInstallBasePath(projectRoot, framework);
    if (legacyBasePath) {
      installed.push({
        framework,
        status: "legacy",
        currentVersion: packageJson.version,
        markerPath: `${legacyBasePath}/${VERSION_MARKER_PATH}`,
        skillsBasePath: legacyBasePath,
      });
    }
  }

  return installed;
}

export async function detectInstalledFrameworks(projectPath: string): Promise<FrameworkConfig[]> {
  const installed = await inspectInstalledFrameworks(projectPath);
  return installed.map((item) => item.framework);
}

export async function detectLikelyFrameworks(projectPath: string): Promise<FrameworkConfig[]> {
  const projectRoot = resolveProjectRoot(projectPath);
  const likely: FrameworkConfig[] = [];

  for (const framework of FRAMEWORKS) {
    const indicatorPaths = [
      dirname(framework.skillsBasePath),
      ...(framework.likelyIndicatorPaths ?? []),
    ];
    let found = false;
    for (const indicatorPath of indicatorPaths) {
      if (await pathExists(resolveInsideProject(projectRoot, indicatorPath))) {
        found = true;
        break;
      }
    }
    if (found) {
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
