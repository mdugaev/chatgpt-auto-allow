"use strict";

class FakeElement {
  constructor(tag = "div", text = "", attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.ownText = text;
    this.attributes = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
    this.disabled = false;
    this.visible = true;
    this.clicked = 0;
    this.isConnected = true;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
    return this;
  }

  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getBoundingClientRect() { return { width: this.visible ? 120 : 0, height: this.visible ? 32 : 0 }; }
  click() { this.clicked++; }

  querySelectorAll(selector) {
    if (selector !== 'button, [role="button"]') throw new Error(`Unexpected selector: ${selector}`);
    const found = [];
    function visit(root) {
      for (const child of root.children) {
        if (child.tagName === "BUTTON" || child.getAttribute("role") === "button") found.push(child);
        visit(child);
      }
    }
    visit(this);
    return found;
  }
}

function page(cards = []) {
  const html = new FakeElement("html");
  const body = new FakeElement("body");
  const main = new FakeElement("main");
  html.append(body);
  body.append(main);
  main.append(...cards);
  const document = { body, documentElement: html, querySelectorAll: (...args) => html.querySelectorAll(...args) };
  const window = { getComputedStyle: (el) => ({ display: el.styleDisplay || "block", visibility: "visible", pointerEvents: "auto", opacity: "1" }) };
  return { document, window, main, html, body };
}

function permissionCard({ title = "Allow ChatGPT to use GitHub?", always = "Always allow", roleButton = false } = {}) {
  const card = new FakeElement("section");
  const heading = new FakeElement("h2", title);
  const details = new FakeElement("p", "ChatGPT will call GitHub's Create Blob tool. See details");
  const actions = new FakeElement("div");
  const deny = new FakeElement("button", "Deny");
  const once = new FakeElement("button", "Allow once");
  const allow = new FakeElement(roleButton ? "div" : "button", always, roleButton ? { role: "button" } : {});
  actions.append(deny, once, allow);
  card.append(heading, details, actions);
  return { card, allow, once, deny, heading };
}

module.exports = { FakeElement, page, permissionCard };
