import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FRAMEWORKS } from "../dist/config.js";
import { installSkillsForFramework, updateManagedBlock } from "../dist/install.js";

test("install writes skills and keeps manifest updates idempotent", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pinelabs-skills-"));
  const framework = FRAMEWORKS.find((item) => item.value === "vscode-copilot");
  assert.ok(framework);

  await installSkillsForFramework(framework, projectRoot);
  const primarySkill = await readFile(
    join(projectRoot, ".github/skills/pinelabs-skills/pinelabs-best-practices/SKILL.md"),
    "utf8",
  );
  assert.match(primarySkill, /Pine Labs Best Practices/);

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

test("managed block repair fails on partial markers", () => {
  const framework = FRAMEWORKS.find((item) => item.value === "cursor");
  assert.ok(framework);
  assert.throws(
    () => updateManagedBlock("prefix\n<!-- BEGIN pinelabs-agent-skills:cursor -->\n", framework, "content"),
    /partial managed block/,
  );
});