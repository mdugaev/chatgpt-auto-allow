"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("MV3 manifest has only ChatGPT hosts and scoped permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://chatgpt.com/*", "https://chat.openai.com/*"]);
  assert.deepEqual(manifest.permissions, ["storage", "activeTab", "scripting"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background.service_worker, "src/service-worker.js");
});

test("all referenced local assets exist", () => {
  const references = [manifest.background.service_worker, manifest.action.default_popup, ...manifest.content_scripts.flatMap((script) => [...script.js, ...(script.css || [])])];
  for (const reference of references) assert.ok(fs.statSync(path.join(root, reference)).isFile(), reference);
});

test("the popup exposes exactly one checkbox switch", () => {
  const html = fs.readFileSync(path.join(root, manifest.action.default_popup), "utf8");
  assert.equal((html.match(/type="checkbox"/g) || []).length, 1);
  assert.equal((html.match(/role="switch"/g) || []).length, 1);
});
