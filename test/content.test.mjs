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
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "SKILL.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "getting-started/SKILL.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "getting-started/authentication.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "getting-started/dashboard-signup-and-token.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pg/orders.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pg/mobile-sdks/SKILL.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pg/mobile-sdks/android.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pg/web-sdks/SKILL.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pg/web-sdks/react-native.md"));
  assert.ok(SKILL_ASSETS.some((asset) => asset.path === "pg/references/REFERENCE.md"));
  const areaSkills = SKILL_ASSETS.filter(
    (asset) =>
      asset.path.endsWith(".md") &&
      asset.path !== "SKILL.md" &&
      !asset.path.endsWith("/SKILL.md") &&
      !asset.path.includes("/references/"),
  );
  assert.equal(areaSkills.length, 39);
  assert.ok(SKILL_ASSETS.every((asset) => asset.content.trim().length > 0));
});

test("generated skill catalog includes P3P skills and resources", () => {
  const paths = new Set(SKILL_ASSETS.map((asset) => asset.path));
  assert.ok(paths.has("p3p/SKILL.md"));
  assert.ok(paths.has("p3p/pay.md"));
  assert.ok(paths.has("p3p/sdk-integration.md"));
  assert.ok(paths.has("p3p/references/REFERENCE.md"));
  assert.ok(paths.has("p3p/references/cli-setup.md"));
  assert.ok(paths.has("p3p/references/server-sdk-api-reference.md"));
  assert.ok(paths.has("p3p/templates/nextjs/route.ts"));
  assert.ok(paths.has("p3p/templates/nextjs/use-p3p.ts"));
  assert.ok(paths.has("p3p/templates/vanilla/client.js"));
  assert.ok(paths.has("p3p/evals/p3p-pay.evals.json"));

  const rootSkill = SKILL_ASSETS.find((asset) => asset.path === "SKILL.md");
  assert.ok(rootSkill);
  assert.match(rootSkill.content, /p3p\/SKILL\.md/);

  const p3pSkill = SKILL_ASSETS.find((asset) => asset.path === "p3p/SKILL.md");
  assert.ok(p3pSkill);
  assert.match(p3pSkill.content, /P3P Pay/);
  assert.match(p3pSkill.content, /P3P SDK Integration/);
});

test("P3P browser-facing assets do not expose client secrets", () => {
  const p3pAssets = SKILL_ASSETS.filter((asset) => asset.path.startsWith("p3p/"));
  assert.ok(p3pAssets.length > 0);
  for (const asset of p3pAssets) {
    assert.doesNotMatch(asset.content, /NEXT_PUBLIC_.*SECRET/);
    assert.doesNotMatch(asset.content, /YOUR_PINELABS_CLIENT_SECRET/);
    assert.doesNotMatch(asset.content, /sandbox_secret_/);
    assert.doesNotMatch(asset.content, /clientSecret:\s*process\.env\.NEXT_PUBLIC/);
  }

  const nextHook = SKILL_ASSETS.find((asset) => asset.path === "p3p/templates/nextjs/use-p3p.ts");
  assert.ok(nextHook);
  assert.match(nextHook.content, /backend proxy/);
});

test("getting started skills include dashboard credential and safe token guidance", () => {
  const dashboardSkill = SKILL_ASSETS.find((asset) => asset.path === "getting-started/dashboard-signup-and-token.md");
  assert.ok(dashboardSkill);
  assert.match(dashboardSkill.content, /Dashboard Settings -> API Keys/);
  assert.match(dashboardSkill.content, /PINELABS_CLIENT_ID/);
  assert.match(dashboardSkill.content, /https:\/\/www\.pinelabs\.com\/docs\/online-payments\/dashboard\/sign-up/);

  const authSkill = SKILL_ASSETS.find((asset) => asset.path === "getting-started/authentication.md");
  assert.ok(authSkill);
  assert.match(authSkill.content, /your_client_id/);
  assert.doesNotMatch(authSkill.content, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test("generated skill asset content omits internal generator comments", () => {
  const generatedMarker = ["AUTO", "-GENERATED", " by ", "scripts", "/"].join("");
  const openApiComment = ["<!-- ", "OpenAPI", " version:"].join("");
  const domainComment = ["<!-- ", "Domain:"].join("");
  for (const asset of SKILL_ASSETS) {
    assert.equal(asset.content.includes(generatedMarker), false, `${asset.path} contains an internal generator marker`);
    assert.equal(asset.content.includes(openApiComment), false, `${asset.path} contains an OpenAPI comment`);
    assert.equal(asset.content.includes(domainComment), false, `${asset.path} contains a domain comment`);
  }
});

test("package source omits generated notice comments", async () => {
  const generatedMarker = ["AUTO", "-GENERATED"].join("");
  const files = await collectTextFiles(".");
  for (const file of files) {
    const content = await readFile(new URL(file, packageRoot), "utf8");
    assert.equal(content.includes(generatedMarker), false, `${file} contains a generated notice comment`);
  }
});

test("manifest references every generated skill file", () => {
  const framework = FRAMEWORKS.find((item) => item.value === "vscode-copilot");
  assert.ok(framework);
  const manifest = generateManifestContent(framework);
  assert.match(manifest, /\/SKILL\.md/);
  assert.match(manifest, /pg\/mobile-sdks\/SKILL\.md/);
  assert.match(manifest, /pg\/web-sdks\/SKILL\.md/);
  assert.match(manifest, /p3p\/SKILL\.md/);
  assert.match(manifest, /getting-started\/authentication\.md/);
  assert.match(manifest, /getting-started\/dashboard-signup-and-token\.md/);
  assert.match(manifest, /p3p\/pay\.md/);
  assert.match(manifest, /p3p\/sdk-integration\.md/);
  assert.match(manifest, /pg\/orders\.md/);
  assert.match(manifest, /pg\/mobile-sdks\/android\.md/);
  assert.match(manifest, /pg\/web-sdks\/react-native\.md/);
  assert.match(manifest, /subscriptions\/subscriptions-plans\.md/);
  assert.match(manifest, /getting-started\/references\/REFERENCE\.md/);
  assert.match(manifest, /pg\/references\/REFERENCE\.md/);
  assert.match(manifest, /settlements\/references\/REFERENCE\.md/);
  assert.match(manifest, /subscriptions\/references\/REFERENCE\.md/);
  assert.match(manifest, /p3p\/references\/REFERENCE\.md/);
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
