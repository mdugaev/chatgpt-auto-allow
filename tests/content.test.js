"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const recognition = require("../src/recognition.js");
const { page, permissionCard } = require("./fake-dom");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setup(cards = [], initiallyEnabled = false) {
  const { document, window, main } = page(cards);
  let enabledInStore = initiallyEnabled;
  let listener;
  let watcher;
  class MutationObserverMock {
    constructor(callback) { this.callback = callback; watcher = this; }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
    mutate() { if (this.active) this.callback([]); }
  }
  const chrome = {
    runtime: {
      onMessage: { addListener(fn) { listener = fn; } },
      async sendMessage(message) {
        if (message.type === "GET_TAB_ENABLED") return { enabled: enabledInStore };
        if (message.type === "SET_TAB_ENABLED") {
          enabledInStore = message.enabled;
          return { enabled: enabledInStore, ok: true };
        }
        throw new Error("Unrecognized message");
      }
    }
  };
  const context = { document, window, chrome, MutationObserver: MutationObserverMock, setTimeout, clearTimeout, setInterval, clearInterval, Date, WeakSet };
  context.globalThis = context;
  context.ChatGPTAutoAllowRecognition = recognition;
  const source = fs.readFileSync(path.resolve(__dirname, "../src/content.js"), "utf8");
  vm.runInNewContext(source, context);
  function request(type, enabled) {
    return new Promise((resolve) => {
      const async = listener({ type, enabled }, {}, resolve);
      assert.equal(async, true);
    });
  }
  return { request, main, watcher: () => watcher, get enabledInStore() { return enabledInStore; } };
}

test("does not click while OFF; ON approves exactly once", async () => {
  const { card, allow } = permissionCard();
  const env = setup([card]);
  try {
    await sleep(270);
    assert.equal(allow.clicked, 0);
    assert.equal((await env.request("GET_AUTO_ALLOW_STATUS")).enabled, false);
    assert.equal((await env.request("SET_AUTO_ALLOW_ENABLED", true)).enabled, true);
    await sleep(520);
    assert.equal(allow.clicked, 1);
    env.watcher().mutate();
    await sleep(380);
    assert.equal(allow.clicked, 1);
  } finally { await env.request("SET_AUTO_ALLOW_ENABLED", false); }
});

test("popup receives initialized state when restored from storage", async () => {
  const env = setup([], true);
  try { assert.equal((await env.request("GET_AUTO_ALLOW_STATUS")).enabled, true); }
  finally { await env.request("SET_AUTO_ALLOW_ENABLED", false); }
});

test("newly inserted card in enabled tab is clicked, then OFF prevents further clicks", async () => {
  const env = setup();
  try {
    await env.request("SET_AUTO_ALLOW_ENABLED", true);
    const first = permissionCard();
    env.main.append(first.card);
    env.watcher().mutate();
    await sleep(480);
    assert.equal(first.allow.clicked, 1);
    await env.request("SET_AUTO_ALLOW_ENABLED", false);
    const second = permissionCard({ title: "Allow ChatGPT to use Google Drive?" });
    env.main.append(second.card);
    env.watcher().mutate();
    await sleep(400);
    assert.equal(second.allow.clicked, 0);
  } finally { await env.request("SET_AUTO_ALLOW_ENABLED", false); }
});

test("two simultaneously visible cards are never auto-approved", async () => {
  const first = permissionCard();
  const second = permissionCard({ title: "Allow ChatGPT to use Google Drive?" });
  const env = setup([first.card, second.card]);
  try {
    await env.request("SET_AUTO_ALLOW_ENABLED", true);
    await sleep(490);
    assert.equal(first.allow.clicked, 0);
    assert.equal(second.allow.clicked, 0);
  } finally { await env.request("SET_AUTO_ALLOW_ENABLED", false); }
});
