import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

import { AREA_SKILL_PATHS, SKILL_ASSETS, WORKFLOW_SKILL_PATHS } from "../dist/generated/skills.generated.js";
import { generateManifestContent } from "../dist/manifest.js";
import { FRAMEWORKS } from "../dist/config.js";

const packageRoot = new URL("..", import.meta.url);
const providerTerms = ["razorpay", "cashfree", "payu", "juspay", "ccavenue"];
const workflowSkillPaths = [
  "validation-and-testing.md",
  "go-live.md",
  "webhooks.md",
  "common-mistakes.md",
  "upgrade-advisor.md",
  "migration-guides/README.md",
  "validation-and-testing/checkout-orders.md",
  "validation-and-testing/refunds.md",
  "validation-and-testing/webhooks.md",
  "validation-and-testing/mobile-web-sdks.md",
  "validation-and-testing/subscriptions.md",
  "validation-and-testing/settlements.md",
  "upgrade-advisor/installer.md",
  "upgrade-advisor/integration.md",
];
const migrationGuidePaths = [
  "migration-guides/razorpay.md",
  "migration-guides/razorpay-reference.md",
  "migration-guides/cashfree.md",
  "migration-guides/payu.md",
  "migration-guides/juspay.md",
  "migration-guides/ccavenue.md",
];
const workflowEvalPaths = [
  "evals/validation-and-testing.evals.json",
  "evals/common-mistakes.evals.json",
  "evals/migration-razorpay.evals.json",
  "evals/upgrade-advisor.evals.json",
];
const requiredWorkflowSections = [
  "Prerequisites",
  "Happy Path",
  "Failure Path",
  "Security Constraints",
  "Diagnostics",
  "Release Evidence",
  "Sources",
];
const sdkBooleanContracts = [
  {
    assetPath: "payments/payment-option.md",
    operationId: "getPaymentOption",
    field: "fetch_vpa",
    expected: true,
    source: "OpenAPI PaymentOptionRequest.payment_option.upi_details.payer.fetch_vpa",
  },
  {
    assetPath: "payments/affordability-suite.md",
    operationId: "offer-validation-create",
    field: "is_mobile_number_required_for_eligibility",
    expected: false,
    source: "OpenAPI OfferData.offer_details.tenure.is_mobile_number_required_for_eligibility",
  },
];

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

function operationIdFromHeading(line) {
  if (!line.startsWith("### ")) return undefined;
  const openingTick = line.lastIndexOf("(`");
  const closingTick = line.lastIndexOf("`)");
  if (openingTick === -1 || closingTick <= openingTick) return undefined;
  return line.slice(openingTick + 2, closingTick);
}

function extractOperationSdkBlocks(asset) {
  const lines = asset.content.split("\n");
  const blocks = [];
  let operationId;

  for (let index = 0; index < lines.length; index += 1) {
    const headingOperationId = operationIdFromHeading(lines[index]);
    if (headingOperationId) {
      operationId = headingOperationId;
      continue;
    }

    const language = lines[index] === "#### TypeScript SDK" ? "ts" : lines[index] === "#### Python SDK" ? "python" : undefined;
    if (!language || !operationId) continue;

    const fence = lines[index + 2];
    assert.equal(fence, `\`\`\`${language}`, `${asset.path} ${operationId} is missing its ${language} fence`);
    const start = index + 3;
    const end = lines.indexOf("```", start);
    assert.notEqual(end, -1, `${asset.path} ${operationId} has an unterminated ${language} fence`);
    blocks.push({ assetPath: asset.path, operationId, language, source: lines.slice(start, end).join("\n") });
    index = end;
  }

  return blocks;
}

function parseTypeScriptBlock(block) {
  const source = ts.createSourceFile(
    `${block.operationId}.ts`,
    `async function generatedExample() {\n${block.source}\n}`,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(source.parseDiagnostics.length, 0, `${block.assetPath} ${block.operationId} has invalid TypeScript syntax`);
  return source;
}

function typeScriptPropertyValues(source, field) {
  const values = [];
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = ts.isStringLiteral(node.name) || ts.isIdentifier(node.name) ? node.name.text : undefined;
      if (name === field) values.push(node.initializer.kind);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}

function pythonPropertyValues(source, field) {
  const parser = [
    "import ast, json, sys",
    "field = sys.argv[1]",
    "tree = ast.parse(sys.stdin.read())",
    "values = []",
    "for node in ast.walk(tree):",
    "    if isinstance(node, ast.Dict):",
    "        for key, value in zip(node.keys, node.values):",
    "            if isinstance(key, ast.Constant) and key.value == field:",
    "                values.append('boolean' if isinstance(value, ast.Constant) and isinstance(value.value, bool) else type(value).__name__)",
    "print(json.dumps(values))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", parser, field], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, `Python block is invalid: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function canonicalBase64Bytes(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return undefined;
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : undefined;
}

function pineLabsWebhookV1SignatureBytes(header) {
  if (!header) return undefined;
  const values = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (values[0] === "v1" && values.length === 2) return canonicalBase64Bytes(values[1]);
  const v1Values = values.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  return v1Values.length === 1 ? canonicalBase64Bytes(v1Values[0]) : undefined;
}

function verifyPineLabsWebhookVector({
  rawBody,
  webhookId,
  webhookTimestamp,
  webhookSignature,
  base64Secret,
  nowSeconds,
}) {
  const signatureBytes = pineLabsWebhookV1SignatureBytes(webhookSignature);
  if (!webhookId || !webhookTimestamp || !signatureBytes) return false;

  if (!/^\d+$/.test(webhookTimestamp)) return false;
  const timestamp = Number(webhookTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;
  const secretBytes = canonicalBase64Bytes(base64Secret);
  if (!secretBytes) return false;

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent, "utf8")
    .digest();
  return expected.length === signatureBytes.length && crypto.timingSafeEqual(expected, signatureBytes);
}

function verifyAndClaimPineLabsWebhook(input, replayStore) {
  if (!verifyPineLabsWebhookVector(input)) return "invalid";
  if (replayStore.has(input.webhookId)) return "replay";
  replayStore.add(input.webhookId);
  return "valid";
}

test("generated skill catalog is populated", () => {
  const paths = new Set(SKILL_ASSETS.map((asset) => asset.path));
  assert.ok(SKILL_ASSETS.length > 1);
  assert.ok(paths.has("SKILL.md"));
  assert.ok(paths.has("getting-started/README.md"));
  assert.ok(paths.has("getting-started/authentication.md"));
  assert.ok(paths.has("getting-started/dashboard-signup-and-token.md"));
  assert.ok(paths.has("payments/orders.md"));
  assert.ok(paths.has("payments/mobile-sdks/README.md"));
  assert.ok(paths.has("payments/mobile-sdks/android.md"));
  assert.ok(paths.has("payments/web-sdks/README.md"));
  assert.ok(paths.has("payments/web-sdks/react-native.md"));
  assert.ok(paths.has("payments/references/REFERENCE.md"));
  assert.deepEqual(SKILL_ASSETS.filter((asset) => asset.path.endsWith("SKILL.md")).map((asset) => asset.path), [
    "SKILL.md",
  ]);
  const areaSkillPathSet = new Set(AREA_SKILL_PATHS);
  const areaSkills = SKILL_ASSETS.filter((asset) => areaSkillPathSet.has(asset.path));
  assert.equal(areaSkills.length, AREA_SKILL_PATHS.length);
  assert.equal(AREA_SKILL_PATHS.length, 41);
  assert.equal(WORKFLOW_SKILL_PATHS.length, workflowSkillPaths.length);
  for (const path of workflowSkillPaths) {
    assert.ok(paths.has(path), `${path} missing from generated assets`);
  }
  for (const path of workflowEvalPaths) {
    assert.ok(paths.has(path), `${path} missing from generated assets`);
  }
  assert.ok(SKILL_ASSETS.every((asset) => asset.content.trim().length > 0));
});

test("generated skill path set matches golden fixture", async () => {
  const expected = JSON.parse(await readFile(new URL("test/golden/skill-paths.json", packageRoot), "utf8"));
  const actual = SKILL_ASSETS.map((asset) => asset.path).sort();
  assert.deepEqual(actual, expected);
});

test("generated skill catalog includes workflow and migration assets", () => {
  const paths = new Set(SKILL_ASSETS.map((asset) => asset.path));
  for (const path of workflowSkillPaths) {
    assert.ok(paths.has(path), `${path} missing from generated assets`);
  }
  for (const path of migrationGuidePaths) {
    assert.ok(paths.has(path), `${path} missing from generated assets`);
  }
  for (const path of workflowEvalPaths) {
    const asset = SKILL_ASSETS.find((item) => item.path === path);
    assert.ok(asset);
    const parsed = JSON.parse(asset.content);
    assert.equal(parsed.schemaVersion, 1);
    assert.ok(Array.isArray(parsed.cases) && parsed.cases.length > 0);
  }

  const webhookSkill = SKILL_ASSETS.find((asset) => asset.path === "webhooks.md");
  assert.ok(webhookSkill);
  assert.match(webhookSkill.content, /raw request body/i);
  assert.match(webhookSkill.content, /idempotent/i);
  assert.match(webhookSkill.content, /webhook-id/);
  assert.match(webhookSkill.content, /webhook-timestamp/);
  assert.match(webhookSkill.content, /webhook-signature/);
  assert.match(webhookSkill.content, /canonical Base64/);
  assert.match(webhookSkill.content, /canonicalBase64/);
  assert.match(webhookSkill.content, /v1SignatureBytes/);
  assert.match(webhookSkill.content, /timingSafeEqual/);
  assert.match(webhookSkill.content, /Ns46HrH\+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=/);
  assert.doesNotMatch(webhookSkill.content, /x-pinelabs-signature/i);

  const goLiveSkill = SKILL_ASSETS.find((asset) => asset.path === "go-live.md");
  assert.ok(goLiveSkill);
  assert.match(goLiveSkill.content, /Production Readiness Gate/);
});

test("mobile SDK skills include official package setup, initialization, and backend reconciliation", () => {
  const android = SKILL_ASSETS.find((asset) => asset.path === "payments/mobile-sdks/android.md");
  assert.ok(android);
  assert.match(android.content, /com\.github\.plural-pinelabs:Pinelabs-Android-SDK:1\.10\.0/);
  assert.match(android.content, /ExpressSDKInitializer\(\)\.initializeSDK/);
  assert.match(android.content, /ExpressSDKCallback/);
  assert.match(android.content, /onSuccess/);
  assert.match(android.content, /onError/);
  assert.match(android.content, /onCancel/);
  assert.match(android.content, /reconcileOrderOnBackend/);
  assert.match(android.content, /minSdk.*26/);

  const flutter = SKILL_ASSETS.find((asset) => asset.path === "payments/mobile-sdks/flutter.md");
  assert.ok(flutter);
  assert.match(flutter.content, /pinelabs_native: \^1\.0\.0/);
  assert.match(flutter.content, /PinelabsFlutterSdk/);
  assert.match(flutter.content, /PinelabsPaymentRequest/);
  assert.match(flutter.content, /PinelabsEnvironment\.uat/);
  assert.match(flutter.content, /reconcileOrder/);
  assert.match(flutter.content, /jitpack\.io/);

  const ios = SKILL_ASSETS.find((asset) => asset.path === "payments/mobile-sdks/ios.md");
  assert.ok(ios);
  assert.match(ios.content, /Infinity_Checkout_iOS_SDK/);
  assert.match(ios.content, /import PineLabsOnline_IOS_SDK/);
  assert.match(ios.content, /PineLabsOnlineSDKManager/);
  assert.match(ios.content, /MerchantCallbackResponse/);
  assert.match(ios.content, /final class CheckoutViewController: UIViewController/);
  assert.doesNotMatch(ios.content, /import PineLabsOnlineSDK\b/);
  assert.match(ios.content, /Verified: 2026-08-19/);

  const androidWeb = SKILL_ASSETS.find((asset) => asset.path === "payments/web-sdks/android.md");
  assert.ok(androidWeb);
  assert.match(androidWeb.content, /EDGE-SDK\.aar/);
  assert.match(androidWeb.content, /EdgeManager/);
  assert.match(androidWeb.content, /EdgeResponseCallback/);

  const iosWeb = SKILL_ASSETS.find((asset) => asset.path === "payments/web-sdks/ios.md");
  assert.ok(iosWeb);
  assert.match(iosWeb.content, /PineLabsWebSDK\.xcframework/);
  assert.match(iosWeb.content, /import UIKit/);
  assert.match(iosWeb.content, /EdgeController/);
  assert.match(iosWeb.content, /ResponseCallback/);
  assert.match(iosWeb.content, /iOS 16 or iOS 17/);
  assert.doesNotMatch(iosWeb.content, /iOS 12\+/);

  const flutterWeb = SKILL_ASSETS.find((asset) => asset.path === "payments/web-sdks/flutter.md");
  assert.ok(flutterWeb);
  assert.match(flutterWeb.content, /pine_payment_sdk: \^1\.0\.0/);
  assert.match(flutterWeb.content, /PinePaymentSdk\.startPaymentWithRedirect/);
  assert.match(flutterWeb.content, /PaymentStatus\.cancelled/);

  const reactNativeWeb = SKILL_ASSETS.find((asset) => asset.path === "payments/web-sdks/react-native.md");
  assert.ok(reactNativeWeb);
  assert.match(reactNativeWeb.content, /react-native-plural react-native-webview/);
  assert.match(reactNativeWeb.content, /SimpleWebView/);
  assert.match(reactNativeWeb.content, /source=\{\{ uri: redirectUrl \}\}/);
  assert.match(reactNativeWeb.content, /onPaymentResult=\{handlePaymentResult\}/);
  assert.match(reactNativeWeb.content, /stopNavigationOnMatch=\{true\}/);
  assert.doesNotMatch(reactNativeWeb.content, /onComplete/);
  assert.doesNotMatch(reactNativeWeb.content, /redirectUrl=\{redirectUrl\}/);
});

test("workflow guides have required delivery sections, verified sources, and actionable coverage", () => {
  for (const path of [...workflowSkillPaths, ...migrationGuidePaths]) {
    const asset = SKILL_ASSETS.find((item) => item.path === path);
    assert.ok(asset);
    for (const heading of requiredWorkflowSections) {
      assert.match(asset.content, new RegExp(`## ${heading}`), `${path} must include ${heading}`);
    }
    assert.match(asset.content, /https:\/\/(?:www\.pinelabs\.com|github\.com)\/[^\s)]+\) \(Verified: \d{4}-\d{2}-\d{2}\)/);
  }

  const validationRouter = SKILL_ASSETS.find((asset) => asset.path === "validation-and-testing.md");
  assert.ok(validationRouter);
  for (const path of workflowSkillPaths.filter((path) => path.startsWith("validation-and-testing/"))) {
    assert.match(validationRouter.content, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const commonMistakes = SKILL_ASSETS.find((asset) => asset.path === "common-mistakes.md");
  assert.ok(commonMistakes);
  assert.equal((commonMistakes.content.match(/^### /gm) ?? []).length, 22);
  assert.match(commonMistakes.content, /\*\*Unsafe pattern:\*\*/);
  assert.match(commonMistakes.content, /\*\*Safe pattern:\*\*/);
  assert.match(commonMistakes.content, /\*\*Proof test:\*\*/);

  const razorpayReference = SKILL_ASSETS.find((asset) => asset.path === "migration-guides/razorpay-reference.md");
  assert.ok(razorpayReference);
  assert.match(razorpayReference.content, /Webhook[s]?\/signatures/);
  assert.match(razorpayReference.content, /Reconciliation/);

  const razorpayMigration = SKILL_ASSETS.find((asset) => asset.path === "migration-guides/razorpay.md");
  assert.ok(razorpayMigration);
  assert.match(razorpayMigration.content, /Adapter Pseudocode/);
  assert.match(razorpayMigration.content, /not a copyable Pine Labs SDK request/);
  assert.match(razorpayMigration.content, /merchant_order_reference/);
  assert.doesNotMatch(razorpayMigration.content, /pineLabsBackend\.createOrder/);
  assert.match(razorpayReference.content, /processor-aware/);

  const upgradeIntegration = SKILL_ASSETS.find((asset) => asset.path === "upgrade-advisor/integration.md");
  assert.ok(upgradeIntegration);
  assert.match(upgradeIntegration.content, /Verified Release Sources/);
  assert.match(upgradeIntegration.content, /official source/);
});

test("official Pine Labs webhook vectors validate failure modes and replay handling", () => {
  const validInput = {
    webhookId: "msg_2nEfCaUDn9fynC9Kz2upo1QSydl",
    webhookTimestamp: "1728543028",
    webhookSignature: "v1,Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=",
    base64Secret: "YWJjMTIzNA==",
    rawBody: Buffer.from('{"payload":"payload"}'),
    nowSeconds: 1728543028,
  };

  assert.equal(verifyPineLabsWebhookVector(validInput), true);
  assert.equal(
    verifyPineLabsWebhookVector({ ...validInput, rawBody: Buffer.from('{"payload":"tampered"}') }),
    false,
  );
  assert.equal(verifyPineLabsWebhookVector({ ...validInput, base64Secret: "d3Jvbmc=" }), false);
  assert.equal(verifyPineLabsWebhookVector({ ...validInput, base64Secret: "not-base64" }), false);
  assert.equal(verifyPineLabsWebhookVector({ ...validInput, nowSeconds: 1728543329 }), false);
  assert.equal(verifyPineLabsWebhookVector({ ...validInput, webhookTimestamp: "1728543028.5" }), false);
  assert.equal(verifyPineLabsWebhookVector({ ...validInput, webhookSignature: "v2,Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=" }), false);
  assert.equal(verifyPineLabsWebhookVector({ ...validInput, webhookSignature: "v1,not-base64" }), false);
  assert.equal(
    verifyPineLabsWebhookVector({
      ...validInput,
      webhookSignature: "v1=Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=,v1=Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=",
    }),
    false,
  );

  const replayStore = new Set();
  assert.equal(verifyAndClaimPineLabsWebhook(validInput, replayStore), "valid");
  assert.equal(verifyAndClaimPineLabsWebhook(validInput, replayStore), "replay");
});

test("generated skill catalog includes P3P skills and resources", () => {
  const paths = new Set(SKILL_ASSETS.map((asset) => asset.path));
  assert.ok(paths.has("p3p/README.md"));
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
  assert.match(rootSkill.content, /p3p\/README\.md/);

  const p3pSkill = SKILL_ASSETS.find((asset) => asset.path === "p3p/README.md");
  assert.ok(p3pSkill);
  assert.match(p3pSkill.content, /P3P Pay/);
  assert.match(p3pSkill.content, /P3P SDK Integration/);
});

test("shipped assets do not expose unsafe browser secret patterns", () => {
  for (const asset of SKILL_ASSETS) {
    assert.doesNotMatch(asset.content, /NEXT_PUBLIC_.*SECRET/i, `${asset.path} exposes a public secret env var`);
    assert.doesNotMatch(asset.content, /YOUR_PINELABS_CLIENT_SECRET/, `${asset.path} contains an unsafe secret placeholder`);
    assert.doesNotMatch(asset.content, /sandbox_secret_/, `${asset.path} contains a real-looking sandbox secret`);
    assert.doesNotMatch(
      asset.content,
      /clientSecret:\s*process\.env\.NEXT_PUBLIC/i,
      `${asset.path} reads a client secret from public env`,
    );
    assert.doesNotMatch(asset.content, /sk_(live|test)_[a-z0-9]/i, `${asset.path} contains a real-looking secret key`);
    assert.doesNotMatch(asset.content, /console\.log\(result\)/, `${asset.path} logs a full result object`);
    assert.doesNotMatch(asset.content, /print\(result\)/, `${asset.path} prints a full result object`);
    assert.doesNotMatch(asset.content, /sudo npm/i, `${asset.path} suggests a privileged npm install`);
    assert.doesNotMatch(asset.content, /client_id:client_secret/i, `${asset.path} documents inline credentials`);
    assert.doesNotMatch(asset.content, /print-json/i, `${asset.path} suggests printing full webhook JSON`);
  }

  const p3pAssets = SKILL_ASSETS.filter((asset) => asset.path.startsWith("p3p/"));
  assert.ok(p3pAssets.length > 0);

  const nextHook = SKILL_ASSETS.find((asset) => asset.path === "p3p/templates/nextjs/use-p3p.ts");
  assert.ok(nextHook);
  assert.match(nextHook.content, /backend proxy/);
});

test("shipped assets and README do not put credentials in command arguments", async () => {
  const readme = await readFile(new URL("README.md", packageRoot), "utf8");
  const shippedTexts = [
    { path: "README.md", content: readme },
    ...SKILL_ASSETS,
  ];
  const unsafeArgPatterns = [
    /curl[\s\S]{0,500}(?:-d|--data)\s+["'][^"']*(?:client_secret|PINELABS_CLIENT_SECRET)/i,
    /curl[\s\S]{0,500}(?:-d|--data)\s+["'][^"']*(?:card_number|cardNumber|cvv|cvc|otp|pan|accountNumber|phone|mobile|email)/i,
    /--json\s+['"][^'"]*(?:client_secret|PINELABS_CLIENT_SECRET)/i,
    /--json\s+['"][^'"]*(?:card_number|cardNumber|cvv|cvc|otp|pan|accountNumber|phone|mobile|email)/i,
    /pinelabs\s+generate-token[\s\S]{0,200}--json/i,
    /\\"client_secret\\":\\"(?:\$\{PINELABS_CLIENT_SECRET\}|your_client_secret)\\"/i,
    /"client_secret":"(?:\$\{PINELABS_CLIENT_SECRET\}|your_client_secret)"/i,
    /console\.log\(result\)/,
    /print\(result\)/,
  ];

  for (const item of shippedTexts) {
    for (const pattern of unsafeArgPatterns) {
      assert.doesNotMatch(item.content, pattern, `${item.path} contains a credential-bearing command pattern`);
    }
  }
});

test("generated examples keep OAuth secrets separate from runtime payment inputs", () => {
  for (const asset of SKILL_ASSETS) {
    assert.doesNotMatch(
      asset.content,
      /"(?!client_secret")[^"]*(?:token|cryptogram|card|cvv|cvc|otp|pan|account|phone|mobile|email)[^"]*": process\.env\.PINELABS_CLIENT_SECRET!/i,
      `${asset.path} maps a non-OAuth sensitive TypeScript field to PINELABS_CLIENT_SECRET`,
    );
    assert.doesNotMatch(
      asset.content,
      /"(?!client_secret")[^"]*(?:token|cryptogram|card|cvv|cvc|otp|pan|account|phone|mobile|email)[^"]*": os\.environ\["PINELABS_CLIENT_SECRET"\]/i,
      `${asset.path} maps a non-OAuth sensitive Python field to PINELABS_CLIENT_SECRET`,
    );
  }

  const applePaySkill = SKILL_ASSETS.find((asset) => asset.path === "payments/apple-pay.md");
  assert.ok(applePaySkill);
  assert.match(applePaySkill.content, /securePineLabsInput/);
  assert.doesNotMatch(applePaySkill.content, /cryptogram[^,\n]+PINELABS_CLIENT_SECRET/i);

  const cardPaymentsSkill = SKILL_ASSETS.find((asset) => asset.path === "payments/card-payments.md");
  assert.ok(cardPaymentsSkill);
  assert.match(cardPaymentsSkill.content, /PCI DSS/i);
  assert.match(cardPaymentsSkill.content, /hosted checkout/i);
  assert.match(cardPaymentsSkill.content, /secure-request-body\.json/);
  assert.match(cardPaymentsSkill.content, /securePineLabsInput/);
});

test("every generated SDK operation block parses and preserves OpenAPI boolean types", () => {
  const blocks = SKILL_ASSETS.flatMap(extractOperationSdkBlocks);
  const typeScriptBlocks = blocks.filter((block) => block.language === "ts");
  const pythonBlocks = blocks.filter((block) => block.language === "python");

  assert.ok(typeScriptBlocks.length > 90, "expected TypeScript examples for the generated operation corpus");
  assert.equal(typeScriptBlocks.length, pythonBlocks.length, "TypeScript and Python operation coverage must match");

  const parsedTypeScript = new Map();
  for (const block of typeScriptBlocks) {
    parsedTypeScript.set(`${block.assetPath}:${block.operationId}`, parseTypeScriptBlock(block));
  }
  for (const block of pythonBlocks) {
    pythonPropertyValues(block.source, "__pinelabs_syntax_probe__");
  }

  for (const contract of sdkBooleanContracts) {
    const key = `${contract.assetPath}:${contract.operationId}`;
    const typeScript = parsedTypeScript.get(key);
    assert.ok(typeScript, `missing TypeScript block for ${contract.source}`);
    assert.deepEqual(
      typeScriptPropertyValues(typeScript, contract.field),
      [contract.expected ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword],
      `${contract.source} must remain a native TypeScript boolean`,
    );

    const python = pythonBlocks.find((block) => block.assetPath === contract.assetPath && block.operationId === contract.operationId);
    assert.ok(python, `missing Python block for ${contract.source}`);
    assert.deepEqual(
      pythonPropertyValues(python.source, contract.field),
      ["boolean"],
      `${contract.source} must remain a native Python boolean`,
    );
  }
});

test("TypeScript SDK examples summarize unknown responses instead of assuming operation fields", () => {
  const authSkill = SKILL_ASSETS.find((asset) => asset.path === "getting-started/authentication.md");
  assert.ok(authSkill);
  assert.match(authSkill.content, /function pineLabsResultSummary\(result: unknown\)/);
  assert.match(authSkill.content, /console\.log\(pineLabsResultSummary\(result\)\)/);
  assert.doesNotMatch(authSkill.content, /result\.id \?\? result\.order_id/);
});

test("provider migration names are scoped to migration guide assets", () => {
  for (const asset of SKILL_ASSETS) {
    if (asset.path.startsWith("migration-guides/") || asset.path.startsWith("evals/migration-")) continue;
    const lowerContent = asset.content.toLowerCase();
    for (const term of providerTerms) {
      assert.equal(lowerContent.includes(term), false, `${asset.path} contains provider term ${term}`);
    }
  }

  for (const path of migrationGuidePaths) {
    const asset = SKILL_ASSETS.find((item) => item.path === path);
    assert.ok(asset);
    assert.doesNotMatch(asset.content, /sk_(live|test)_[a-z0-9]/i);
    assert.doesNotMatch(asset.content, /client[_-]?secret\s*[:=]\s*['"][^'"]+['"]/i);
    assert.match(asset.content, /Pine Labs/);
  }
});

test("getting started skills include dashboard credential and safe token guidance", () => {
  const dashboardSkill = SKILL_ASSETS.find((asset) => asset.path === "getting-started/dashboard-signup-and-token.md");
  assert.ok(dashboardSkill);
  assert.match(dashboardSkill.content, /Dashboard Settings -> API Keys/);
  assert.match(dashboardSkill.content, /PINELABS_CLIENT_ID/);
  assert.match(dashboardSkill.content, /pinelabs generate-token --env uat/);
  assert.match(dashboardSkill.content, /https:\/\/www\.pinelabs\.com\/docs\/online-payments\/dashboard\/sign-up/);
  assert.doesNotMatch(dashboardSkill.content, /curl -X POST/);
  assert.doesNotMatch(dashboardSkill.content, /--json\s+['"]/);

  const authSkill = SKILL_ASSETS.find((asset) => asset.path === "getting-started/authentication.md");
  assert.ok(authSkill);
  assert.match(authSkill.content, /your_client_id/);
  assert.match(authSkill.content, /secure-request-body\.json/);
  assert.match(authSkill.content, /pinelabs generate-token --env uat/);
  assert.match(authSkill.content, /process\.env\.PINELABS_CLIENT_SECRET/);
  assert.doesNotMatch(authSkill.content, /"client_secret": "your_client_secret"/);
  assert.doesNotMatch(authSkill.content, /pinelabs generate-token[\s\S]{0,200}--json/);
  assert.doesNotMatch(authSkill.content, /console\.log\(result\)/);
  assert.doesNotMatch(authSkill.content, /print\(result\)/);
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
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);
  const manifest = generateManifestContent(framework);
  for (const path of workflowSkillPaths) {
    assert.match(manifest, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(manifest, /\/SKILL\.md/);
  assert.match(manifest, /payments\/mobile-sdks\/README\.md/);
  assert.match(manifest, /payments\/web-sdks\/README\.md/);
  assert.match(manifest, /p3p\/README\.md/);
  assert.match(manifest, /getting-started\/authentication\.md/);
  assert.match(manifest, /getting-started\/dashboard-signup-and-token\.md/);
  assert.match(manifest, /p3p\/pay\.md/);
  assert.match(manifest, /p3p\/sdk-integration\.md/);
  assert.match(manifest, /payments\/orders\.md/);
  assert.match(manifest, /payments\/mobile-sdks\/android\.md/);
  assert.match(manifest, /payments\/web-sdks\/react-native\.md/);
  assert.match(manifest, /subscriptions\/subscriptions-plans\.md/);
  assert.match(manifest, /getting-started\/references\/REFERENCE\.md/);
  assert.match(manifest, /payments\/references\/REFERENCE\.md/);
  assert.match(manifest, /settlements\/references\/REFERENCE\.md/);
  assert.match(manifest, /subscriptions\/references\/REFERENCE\.md/);
  assert.match(manifest, /p3p\/references\/REFERENCE\.md/);
});

test("manifest golden includes expected workflow and domain routing", async () => {
  const framework = FRAMEWORKS.find((item) => item.value === "github-copilot");
  assert.ok(framework);
  const manifest = generateManifestContent(framework);
  const expectedSnippets = (await readFile(new URL("test/golden/manifest-github-copilot.includes.txt", packageRoot), "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const snippet of expectedSnippets) {
    assert.ok(manifest.includes(snippet), `manifest missing golden snippet: ${snippet}`);
  }
});
