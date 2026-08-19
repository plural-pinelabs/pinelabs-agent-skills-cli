import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { FRAMEWORKS, parseFrameworkList } from "../dist/config.js";
import {
  SKILL_PACKAGE_NAME,
  SKILL_SOURCE,
  VERSION_MARKER_KEY,
  VERSION_MARKER_PATH,
} from "../dist/generated/skills.generated.js";
import {
  detectLikelyFrameworks,
  inspectInstalledFrameworks,
  installSkillsForFramework,
  updateManagedBlock,
} from "../dist/install.js";

const execFileAsync = promisify(execFile);
const cliPath = new URL("../dist/index.js", import.meta.url);
const legacy040GettingStartedSkill = `# Getting Started

Setup, authentication, environments, and integration kickoff guidance.

## How To Use

1. Start here for quick domain routing and key safety rules.
2. Read the matching area skill file for endpoint-level implementation detail.
3. Use the domain reference index for cross-area routing and quick lookups.
4. For production changes, apply explicit confirmation and idempotency safeguards.

## API Areas

- **Authentication** (\`getting-started/authentication.md\`): Generate OAuth access tokens for server-side API calls.
- **Dashboard Signup and Token Setup** (\`getting-started/dashboard-signup-and-token.md\`): Use when users need Pine Labs Online Dashboard signup, UAT API credential generation, environment setup, or first OAuth access token generation.

## Deep Reference

Read: \`getting-started/references/REFERENCE.md\`

Use this file for detailed operations, request/response handling guidance, and implementation examples.
`;

test("install writes skills and keeps manifest updates idempotent", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  await installSkillsForFramework(framework, projectRoot);
  const primarySkill = await readFile(join(projectRoot, ".github/skills/pinelabs-skills/SKILL.md"), "utf8");
  assert.match(primarySkill, /Pine Labs Best Practices/);
  const pgOrderSkill = await readFile(join(projectRoot, ".github/skills/pinelabs-skills/pg/orders.md"), "utf8");
  assert.match(pgOrderSkill, /# Orders/);
  const mobileRouterSkill = await readFile(
    join(projectRoot, ".github/skills/pinelabs-skills/pg/mobile-sdks/README.md"),
    "utf8",
  );
  assert.match(mobileRouterSkill, /ask: Android, iOS, or Flutter\?/);
  const webReactSkill = await readFile(
    join(projectRoot, ".github/skills/pinelabs-skills/pg/web-sdks/react-native.md"),
    "utf8",
  );
  assert.match(webReactSkill, /# Web SDK - React Native/);

  const manifestPath = join(projectRoot, ".github/copilot-instructions.md");
  const firstManifest = await readFile(manifestPath, "utf8");
  const marker = JSON.parse(
    await readFile(join(projectRoot, ".github/skills/pinelabs-skills", VERSION_MARKER_PATH), "utf8"),
  );
  assert.equal(marker.package, SKILL_PACKAGE_NAME);
  assert.equal(marker[VERSION_MARKER_KEY], marker.version);
  assert.ok(marker.managedFiles.includes("SKILL.md"));
  assert.ok(marker.managedFiles.includes("webhooks.md"));
  await installSkillsForFramework(framework, projectRoot);
  const secondManifest = await readFile(manifestPath, "utf8");
  assert.equal(secondManifest, firstManifest);
  assert.equal(secondManifest.match(/BEGIN pinelabs-agent-skills:github-copilot/g)?.length, 1);
});

test("all frameworks support dry-run and real install smoke tests", async () => {
  for (const framework of FRAMEWORKS) {
    const dryRunRoot = await mkdtemp(join(tmpdir(), `pinelabs-skills-${framework.value}-dry-`));
    const dryRunOperations = await installSkillsForFramework(framework, dryRunRoot, { dryRun: true });
    assert.ok(dryRunOperations.some((operation) => operation.path === `${framework.skillsBasePath}/SKILL.md`));
    assert.ok(
      dryRunOperations.some(
        (operation) => operation.path === `${framework.skillsBasePath}/${VERSION_MARKER_PATH}`,
      ),
    );
    await assert.rejects(readFile(join(dryRunRoot, framework.manifestPath), "utf8"));

    const projectRoot = await mkdtemp(join(tmpdir(), `pinelabs-skills-${framework.value}-`));
    await installSkillsForFramework(framework, projectRoot);

    const primarySkill = await readFile(join(projectRoot, framework.skillsBasePath, "SKILL.md"), "utf8");
    assert.match(primarySkill, /Pine Labs Best Practices/);

    const marker = JSON.parse(
      await readFile(join(projectRoot, framework.skillsBasePath, VERSION_MARKER_PATH), "utf8"),
    );
    assert.equal(marker.package, SKILL_PACKAGE_NAME);
    assert.equal(marker[VERSION_MARKER_KEY], marker.version);

    const manifestPath = join(projectRoot, framework.manifestPath);
    const firstManifest = await readFile(manifestPath, "utf8");
    assert.equal(firstManifest.match(new RegExp(`BEGIN pinelabs-agent-skills:${framework.value}`, "g"))?.length, 1);

    await installSkillsForFramework(framework, projectRoot);
    const secondManifest = await readFile(manifestPath, "utf8");
    assert.equal(secondManifest, firstManifest);
    assert.equal(secondManifest.match(new RegExp(`BEGIN pinelabs-agent-skills:${framework.value}`, "g"))?.length, 1);
  }
});

test("version marker inspection reports current, stale, and legacy installs", async () => {
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const currentRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-current-"));
  await installSkillsForFramework(framework, currentRoot);
  const currentInstall = (await inspectInstalledFrameworks(currentRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(currentInstall);
  assert.equal(currentInstall.status, "current");
  assert.equal(currentInstall.installedVersion, currentInstall.currentVersion);

  const staleMarker = {
    [VERSION_MARKER_KEY]: "0.0.1",
    package: SKILL_PACKAGE_NAME,
    version: "0.0.1",
    openApiVersion: "3.0",
    specHash: `sha256:${SKILL_SOURCE.specHash}`,
  };
  await writeFile(
    join(currentRoot, framework.skillsBasePath, VERSION_MARKER_PATH),
    `${JSON.stringify(staleMarker, null, 2)}\n`,
    "utf8",
  );
  const staleInstall = (await inspectInstalledFrameworks(currentRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(staleInstall);
  assert.equal(staleInstall.status, "stale");
  assert.equal(staleInstall.installedVersion, "0.0.1");

  const legacyRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-legacy-"));
  const legacySkillsBasePath = ".github/skills/pinelabs-skills/pinelabs-best-practices";
  await mkdir(join(legacyRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(
    join(legacyRoot, legacySkillsBasePath, "SKILL.md"),
    "---\nname: pinelabs-best-practices\n---\n# Pine Labs Best Practices\n",
    "utf8",
  );
  const legacyInstall = (await inspectInstalledFrameworks(legacyRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(legacyInstall);
  assert.equal(legacyInstall.status, "legacy");
  assert.equal(legacyInstall.skillsBasePath, legacySkillsBasePath);
  assert.equal(legacyInstall.installedVersion, undefined);

  await installSkillsForFramework(framework, legacyRoot);
  const migratedInstall = (await inspectInstalledFrameworks(legacyRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(migratedInstall);
  assert.equal(migratedInstall.status, "current");
  await assert.rejects(readFile(join(legacyRoot, legacySkillsBasePath, "SKILL.md"), "utf8"));
  await readFile(join(legacyRoot, framework.skillsBasePath, "SKILL.md"), "utf8");
});

test("known 0.4.0 obsolete routers are pruned only when exact package content matches", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-040-obsolete-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  await installSkillsForFramework(framework, projectRoot);
  const obsoletePath = join(projectRoot, framework.skillsBasePath, "getting-started/SKILL.md");
  await mkdir(join(projectRoot, framework.skillsBasePath, "getting-started"), { recursive: true });
  await writeFile(obsoletePath, legacy040GettingStartedSkill, "utf8");

  const contaminatedInstall = (await inspectInstalledFrameworks(projectRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(contaminatedInstall);
  assert.equal(contaminatedInstall.status, "stale");

  const operations = await installSkillsForFramework(framework, projectRoot, { dryRun: true });
  assert.ok(
    operations.some(
      (operation) =>
        operation.action === "delete" &&
        operation.path === `${framework.skillsBasePath}/getting-started/SKILL.md`,
    ),
  );

  await installSkillsForFramework(framework, projectRoot);
  await assert.rejects(readFile(obsoletePath, "utf8"));
  const cleanedInstall = (await inspectInstalledFrameworks(projectRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(cleanedInstall);
  assert.equal(cleanedInstall.status, "current");

  await writeFile(obsoletePath, `${legacy040GettingStartedSkill}\n# user note\n`, "utf8");
  const modifiedOperations = await installSkillsForFramework(framework, projectRoot, { dryRun: true });
  assert.equal(
    modifiedOperations.some(
      (operation) =>
        operation.action === "delete" &&
        operation.path === `${framework.skillsBasePath}/getting-started/SKILL.md`,
    ),
    false,
  );
  await installSkillsForFramework(framework, projectRoot);
  assert.match(await readFile(obsoletePath, "utf8"), /user note/);
  const modifiedInstall = (await inspectInstalledFrameworks(projectRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(modifiedInstall);
  assert.equal(modifiedInstall.status, "stale");
});

test("installer uses exclusive randomized temporary files for atomic writes", async () => {
  const compiledInstaller = await readFile(new URL("../dist/install.js", import.meta.url), "utf8");
  assert.match(compiledInstaller, /randomUUID/);
  assert.match(compiledInstaller, /flag:\s*"wx"/);
  assert.match(compiledInstaller, /mode:\s*0o600/);
});

test("sibling legacy fallback is detected and migrated", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-legacy-sibling-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const legacySkillsBasePath = ".github/skills/pinelabs-best-practices";
  await mkdir(join(projectRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(
    join(projectRoot, legacySkillsBasePath, "SKILL.md"),
    "---\nname: pinelabs-best-practices\n---\n# Pine Labs Best Practices\n",
    "utf8",
  );

  const legacyInstall = (await inspectInstalledFrameworks(projectRoot)).find(
    (item) => item.framework.value === framework.value,
  );
  assert.ok(legacyInstall);
  assert.equal(legacyInstall.status, "legacy");
  assert.equal(legacyInstall.skillsBasePath, legacySkillsBasePath);

  await installSkillsForFramework(framework, projectRoot);
  await assert.rejects(readFile(join(projectRoot, legacySkillsBasePath, "SKILL.md"), "utf8"));
  await readFile(join(projectRoot, framework.skillsBasePath, "SKILL.md"), "utf8");
});

test("update dry-run reports legacy removals without changing files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-legacy-dry-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const legacySkillsBasePath = ".github/skills/pinelabs-skills/pinelabs-best-practices";
  const legacySkillPath = join(projectRoot, legacySkillsBasePath, "SKILL.md");
  await mkdir(join(projectRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(legacySkillPath, "# Pine Labs Best Practices\n", "utf8");

  const operations = await installSkillsForFramework(framework, projectRoot, { dryRun: true });
  assert.ok(operations.some((operation) => operation.action === "delete" && operation.path === legacySkillsBasePath));
  await readFile(legacySkillPath, "utf8");
  await assert.rejects(readFile(join(projectRoot, framework.skillsBasePath, "SKILL.md"), "utf8"));
});

test("manifest preflight prevents legacy deletion on malformed managed blocks", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-bad-manifest-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const legacySkillsBasePath = ".github/skills/pinelabs-skills/pinelabs-best-practices";
  const legacySkillPath = join(projectRoot, legacySkillsBasePath, "SKILL.md");
  await mkdir(join(projectRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(legacySkillPath, "# Pine Labs Best Practices\n", "utf8");
  await mkdir(join(projectRoot, ".github"), { recursive: true });
  await writeFile(
    join(projectRoot, ".github/copilot-instructions.md"),
    "prefix\n<!-- BEGIN pinelabs-agent-skills:github-copilot -->\n",
    "utf8",
  );

  await assert.rejects(() => installSkillsForFramework(framework, projectRoot), /partial managed block/);
  await readFile(legacySkillPath, "utf8");
  await assert.rejects(readFile(join(projectRoot, framework.skillsBasePath, "SKILL.md"), "utf8"));
});

test("marker preflight prevents deletes when version marker JSON is malformed", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-bad-marker-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const legacySkillsBasePath = ".github/skills/pinelabs-best-practices";
  const legacySkillPath = join(projectRoot, legacySkillsBasePath, "SKILL.md");
  await mkdir(join(projectRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(legacySkillPath, "# Pine Labs Best Practices\n", "utf8");
  await mkdir(join(projectRoot, framework.skillsBasePath), { recursive: true });
  await writeFile(join(projectRoot, framework.skillsBasePath, VERSION_MARKER_PATH), "{not-json", "utf8");

  await assert.rejects(() => installSkillsForFramework(framework, projectRoot), /Invalid Pine Labs version marker JSON/);
  await readFile(legacySkillPath, "utf8");
});

test("symlink preflight prevents legacy deletion", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-symlink-"));
  const outsideRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-outside-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const legacySkillsBasePath = ".github/skills/pinelabs-best-practices";
  const legacySkillPath = join(projectRoot, legacySkillsBasePath, "SKILL.md");
  await mkdir(join(projectRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(legacySkillPath, "# Pine Labs Best Practices\n", "utf8");
  await mkdir(join(projectRoot, ".github/skills"), { recursive: true });
  await symlink(outsideRoot, join(projectRoot, framework.skillsBasePath));

  await assert.rejects(() => installSkillsForFramework(framework, projectRoot), /symbolic link/);
  await readFile(legacySkillPath, "utf8");
});

test("write failures happen before legacy pruning", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-write-fail-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);

  const legacySkillsBasePath = ".github/skills/pinelabs-best-practices";
  const legacySkillPath = join(projectRoot, legacySkillsBasePath, "SKILL.md");
  await mkdir(join(projectRoot, legacySkillsBasePath), { recursive: true });
  await writeFile(legacySkillPath, "# Pine Labs Best Practices\n", "utf8");
  await writeFile(join(projectRoot, framework.skillsBasePath), "not a directory", "utf8");

  await assert.rejects(() => installSkillsForFramework(framework, projectRoot));
  await readFile(legacySkillPath, "utf8");
});

test("doctor reports installed status and versions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-doctor-"));
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);
  await installSkillsForFramework(framework, projectRoot);

  const { stdout } = await execFileAsync(process.execPath, [cliPath.pathname, "doctor", "--path", projectRoot]);
  assert.match(stdout, /Installed Pine Labs agent skills:/);
  assert.match(stdout, /github-copilot\tcurrent\tinstalled=/);
  assert.match(stdout, /\tcurrent=/);
  assert.match(stdout, /\.github\/skills\/pinelabs-skills/);
});

test("dry run plans writes without touching the project", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-dry-"));
  const framework = FRAMEWORKS.find((item) => item.value === "cursor");
  assert.ok(framework);

  const operations = await installSkillsForFramework(framework, projectRoot, { dryRun: true });
  assert.ok(operations.length > 1);
  assert.equal(operations.every((operation) => operation.action === "create"), true);

  await assert.rejects(readFile(join(projectRoot, ".cursor/rules/pinelabs.mdc"), "utf8"));
});

test("kiro aliases resolve to one framework", () => {
  const frameworks = parseFrameworkList("kiro,kiro-ide,kiro-cli");
  assert.equal(frameworks.length, 1);
  assert.equal(frameworks[0].value, "kiro");
});

test("copilot aliases resolve to one canonical framework", () => {
  const frameworks = parseFrameworkList("github-copilot,vscode-copilot,github-copilot-cli,copilot-cli,copilot");
  assert.equal(frameworks.length, 1);
  assert.equal(frameworks[0].value, "github-copilot");
});

test("install writes native Kiro skills and steering manifest idempotently", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-kiro-"));
  const framework = FRAMEWORKS.find((item) => item.value === "kiro");
  assert.ok(framework);

  await installSkillsForFramework(framework, projectRoot);
  const primarySkill = await readFile(join(projectRoot, ".kiro/skills/pinelabs-skills/SKILL.md"), "utf8");
  assert.match(primarySkill, /Pine Labs Best Practices/);

  const manifestPath = join(projectRoot, ".kiro/steering/pinelabs-agent-skills.md");
  const firstManifest = await readFile(manifestPath, "utf8");
  assert.match(firstManifest, /\.kiro\/skills\/pinelabs-skills\/SKILL\.md/);
  assert.equal(firstManifest.match(/BEGIN pinelabs-agent-skills:kiro/g)?.length, 1);

  await installSkillsForFramework(framework, projectRoot);
  const secondManifest = await readFile(manifestPath, "utf8");
  assert.equal(secondManifest, firstManifest);
  assert.equal(secondManifest.match(/BEGIN pinelabs-agent-skills:kiro/g)?.length, 1);
});

test("likely framework detection recognizes Kiro steering projects", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-kiro-likely-"));
  await mkdir(join(projectRoot, ".kiro/steering"), { recursive: true });
  await writeFile(join(projectRoot, ".kiro/steering/product.md"), "# Product\n", "utf8");

  const likely = await detectLikelyFrameworks(projectRoot);
  assert.ok(likely.some((framework) => framework.value === "kiro"));
});

test("generic AGENTS.md does not trigger ambiguous framework detection", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-agents-only-"));
  await writeFile(join(projectRoot, "AGENTS.md"), "# Agent instructions\n", "utf8");

  const likely = await detectLikelyFrameworks(projectRoot);
  assert.deepEqual(likely, []);
});

test("add skills --yes fails when detection is empty or ambiguous", async () => {
  const emptyRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-empty-"));
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath.pathname, "add", "skills", "--yes", "--path", emptyRoot]),
    /No assistant framework was detected/,
  );

  const ambiguousRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-ambiguous-"));
  await mkdir(join(ambiguousRoot, ".cursor"), { recursive: true });
  await mkdir(join(ambiguousRoot, ".kiro"), { recursive: true });
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath.pathname, "add", "skills", "--yes", "--path", ambiguousRoot]),
    /Multiple assistant frameworks were detected/,
  );
});

test("managed block repair fails on partial markers", () => {
  const framework = FRAMEWORKS.find((item) => item.value === "cursor");
  assert.ok(framework);
  assert.throws(
    () => updateManagedBlock("prefix\n<!-- BEGIN pinelabs-agent-skills:cursor -->\n", framework, "content"),
    /partial managed block/,
  );
});

test("managed block migration replaces old copilot keys with canonical key", () => {
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);
  const existing = [
    "prefix",
    "<!-- BEGIN pinelabs-agent-skills:vscode-copilot -->",
    "old block",
    "<!-- END pinelabs-agent-skills:vscode-copilot -->",
    "<!-- BEGIN pinelabs-agent-skills:github-copilot-cli -->",
    "duplicate old block",
    "<!-- END pinelabs-agent-skills:github-copilot-cli -->",
  ].join("\n");

  const updated = updateManagedBlock(existing, framework, "new block");
  assert.equal(updated.match(/BEGIN pinelabs-agent-skills:github-copilot/g)?.length, 1);
  assert.equal(updated.includes("vscode-copilot"), false);
  assert.equal(updated.includes("github-copilot-cli"), false);
});
