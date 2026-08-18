import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FRAMEWORKS, parseFrameworkList } from "../dist/config.js";
import { detectLikelyFrameworks, installSkillsForFramework, updateManagedBlock } from "../dist/install.js";

test("install writes skills and keeps manifest updates idempotent", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-"));
  const framework = FRAMEWORKS.find((item) => item.value === "vscode-copilot");
  assert.ok(framework);

  await installSkillsForFramework(framework, projectRoot);
  const primarySkill = await readFile(join(projectRoot, ".github/skills/pinelabs-skills/SKILL.md"), "utf8");
  assert.match(primarySkill, /Pine Labs Best Practices/);
  const pgOrderSkill = await readFile(join(projectRoot, ".github/skills/pinelabs-skills/pg/orders.md"), "utf8");
  assert.match(pgOrderSkill, /# Orders/);
  const mobileRouterSkill = await readFile(
    join(projectRoot, ".github/skills/pinelabs-skills/pg/mobile-sdks/SKILL.md"),
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
  await installSkillsForFramework(framework, projectRoot);
  const secondManifest = await readFile(manifestPath, "utf8");
  assert.equal(secondManifest, firstManifest);
  assert.equal(secondManifest.match(/BEGIN pinelabs-agent-skills:vscode-copilot/g)?.length, 1);
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

test("managed block repair fails on partial markers", () => {
  const framework = FRAMEWORKS.find((item) => item.value === "cursor");
  assert.ok(framework);
  assert.throws(
    () => updateManagedBlock("prefix\n<!-- BEGIN pinelabs-agent-skills:cursor -->\n", framework, "content"),
    /partial managed block/,
  );
});
