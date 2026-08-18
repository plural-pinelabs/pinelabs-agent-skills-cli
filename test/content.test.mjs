import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { SKILL_ASSETS } from "../dist/generated/skills.generated.js";
import { generateManifestContent } from "../dist/manifest.js";
import { FRAMEWORKS } from "../dist/config.js";

const packageRoot = new URL("..", import.meta.url);
const blockedTerms = [
  [115, 116, 114, 105, 112, 101],
  [114, 97, 122, 111, 114, 112, 97, 121],
  [99, 97, 115, 104, 102, 114, 101, 101],
].map((codes) => String.fromCharCode(...codes));

async function collectTextFiles(relativeDir, files = []) {
  const entries = await readdir(new URL(relativeDir, packageRoot), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (["node_modules", "dist"].includes(entry.name)) continue;
      await collectTextFiles(relativePath, files);
    } else if (/\.(ts|mjs|md|json|yml|yaml|txt)$/.test(entry.name) || ["LICENSE"].includes(entry.name)) {
      files.push(relativePath);
    }
  }
  return files;
}

test("generated skill catalog is populated", () => {
  assert.ok(SKILL_ASSETS.length > 1);
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pinelabs-best-practices/SKILL.md"));
  assert.ok(SKILL_ASSETS.every((asset) => asset.content.trim().length > 0));
});

test("manifest references every generated skill file", () => {
  const framework = FRAMEWORKS.find((item) => item.value === "vscode-copilot");
  assert.ok(framework);
  const manifest = generateManifestContent(framework);
  assert.match(manifest, /pinelabs-best-practices\/SKILL\.md/);
  for (const asset of SKILL_ASSETS.filter((item) => item.path.includes("/references/"))) {
    assert.ok(manifest.includes(asset.path), `${asset.path} missing from manifest`);
  }
});

test("package source avoids disallowed provider names", async () => {
  const files = await collectTextFiles(".");
  for (const file of files) {
    const content = await readFile(new URL(file, packageRoot), "utf8");
    const lowerContent = content.toLowerCase();
    for (const term of blockedTerms) {
      assert.equal(lowerContent.includes(term), false, `${file} contains a blocked provider name`);
    }
  }
});