"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function setup() {
  const storage = {};
  let listener;
  let removed;
  const badge = [];
  const chrome = {
    storage: { session: {
      async get(key) { return { [key]: storage[key] }; },
      async set(change) { Object.assign(storage, change); }
    } },
    action: {
      async setBadgeText(data) { badge.push(data); },
      async setBadgeBackgroundColor() {}
    },
    runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { onRemoved: { addListener(fn) { removed = fn; } } }
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../src/service-worker.js"), "utf8");
  vm.runInNewContext(source, { chrome, Promise });
  function request(tabId, type, enabled) {
    return new Promise((resolve) => {
      assert.equal(listener({ type, enabled }, { tab: { id: tabId } }, resolve), true);
    });
  }
  return { storage, badge, request, closeTab: (id) => removed(id) };
}

test("OFF by default, one enabled tab does not enable another", async () => {
  const env = setup();
  assert.equal((await env.request(10, "GET_TAB_ENABLED")).enabled, false);
  assert.equal((await env.request(10, "SET_TAB_ENABLED", true)).ok, true);
  assert.equal((await env.request(10, "GET_TAB_ENABLED")).enabled, true);
  assert.equal((await env.request(11, "GET_TAB_ENABLED")).enabled, false);
});

test("simultaneous changes preserve unrelated per-tab entries", async () => {
  const env = setup();
  await Promise.all([env.request(1, "SET_TAB_ENABLED", true), env.request(2, "SET_TAB_ENABLED", true)]);
  assert.equal((await env.request(1, "GET_TAB_ENABLED")).enabled, true);
  assert.equal((await env.request(2, "GET_TAB_ENABLED")).enabled, true);
  await env.request(1, "SET_TAB_ENABLED", false);
  assert.equal((await env.request(1, "GET_TAB_ENABLED")).enabled, false);
  assert.equal((await env.request(2, "GET_TAB_ENABLED")).enabled, true);
});

test("tab closure clears its enabled state", async () => {
  const env = setup();
  await env.request(42, "SET_TAB_ENABLED", true);
  env.closeTab(42);
  // The cleanup is queued asynchronously; a subsequent GET shares the queue.
  assert.equal((await env.request(42, "GET_TAB_ENABLED")).enabled, false);
});
