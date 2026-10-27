"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const recognition = require("../src/recognition.js");
const { FakeElement, page, permissionCard } = require("./fake-dom");

test("recognizes the complete GitHub approval card", () => {
  const { card, allow } = permissionCard();
  const { document, window } = page([card]);
  assert.deepEqual(recognition.findPermissionCandidate(document, window), { status: "found", card, button: allow });
});

test("recognizes a semantic role button and collapses whitespace", () => {
  const { card, allow } = permissionCard({ always: "Always\n  allow", roleButton: true });
  const { document, window } = page([card]);
  assert.equal(recognition.findPermissionCandidate(document, window).button, allow);
});

test("recognizes screenshot-like Deny Esc and Allow once ↵ controls", () => {
  const { card, allow, deny, once } = permissionCard();
  deny.ownText = "DenyEsc";
  once.ownText = "Allow once ↵";
  const { document, window } = page([card]);
  assert.equal(recognition.findPermissionCandidate(document, window).button, allow);
});

test("visible labels remain usable when aria-label differs", () => {
  const { card, allow } = permissionCard();
  allow.attributes["aria-label"] = "Approve all future GitHub requests";
  const { document, window } = page([card]);
  assert.equal(recognition.findPermissionCandidate(document, window).button, allow);
});

test("a standalone Always allow button is never enough", () => {
  const fakeChat = new FakeElement("article").append(new FakeElement("button", "Always allow"));
  const { document, window } = page([fakeChat]);
  assert.equal(recognition.findPermissionCandidate(document, window).status, "none");
});

test("a misleading card missing Deny or Allow once fails closed", () => {
  for (const remove of ["deny", "once"]) {
    const { card, deny, once } = permissionCard();
    const control = remove === "deny" ? deny : once;
    control.ownText = "Other action";
    const { document, window } = page([card]);
    assert.equal(recognition.findPermissionCandidate(document, window).status, "none");
  }
});

test("non-permission headings never match", () => {
  const { card } = permissionCard({ title: "User wrote: Please always allow GitHub operations" });
  const { document, window } = page([card]);
  assert.equal(recognition.findPermissionCandidate(document, window).status, "none");
});

test("hidden, disabled and inert candidates are not clicked", () => {
  for (const hide of ["disabled", "inert", "aria-disabled", "hidden", "style", "offscreen"]) {
    const { card, allow } = permissionCard();
    if (hide === "disabled") allow.disabled = true;
    if (hide === "inert") card.attributes.inert = "";
    if (hide === "aria-disabled") allow.attributes["aria-disabled"] = "true";
    if (hide === "hidden") card.hidden = true;
    if (hide === "style") allow.styleDisplay = "none";
    if (hide === "offscreen") allow.visible = false;
    const { document, window } = page([card]);
    assert.equal(recognition.findPermissionCandidate(document, window).status, "none", hide);
  }
});

test("two permission cards are ambiguous and blocked", () => {
  const first = permissionCard();
  const second = permissionCard({ title: "Allow ChatGPT to use Google Drive?" });
  const { document, window } = page([first.card, second.card]);
  assert.equal(recognition.findPermissionCandidate(document, window).status, "ambiguous");
});

test("Russian equivalents are recognized only in a matching card", () => {
  const { card, allow, once, deny } = permissionCard({ title: "Разрешить ChatGPT использовать GitHub?", always: "Всегда разрешать" });
  once.ownText = "Разрешить один раз";
  deny.ownText = "Отклонить";
  const { document, window } = page([card]);
  assert.equal(recognition.findPermissionCandidate(document, window).button, allow);
});
