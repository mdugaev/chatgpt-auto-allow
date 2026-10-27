(function initRecognition(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ChatGPTAutoAllowRecognition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const CONTROL_SELECTOR = 'button, [role="button"]';
  const ALWAYS_ALLOW_LABELS = new Set(["always allow", "всегда разрешать"]);
  const ALLOW_ONCE_LABELS = new Set(["allow once", "разрешить один раз"]);
  const DENY_LABELS = new Set(["deny", "decline", "отклонить", "запретить"]);
  const PERMISSION_HEADINGS = [
    /allow\s+chatgpt\s+to\s+use\s+.{1,120}?\?/iu,
    /разрешить\s+chatgpt\s+использовать\s+.{1,120}?\?/iu
  ];

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
  }

  function controlLabels(element) {
    const ariaLabel = normalizeText(element?.getAttribute?.("aria-label")).toLocaleLowerCase();
    const visibleLabel = normalizeText(element?.textContent).toLocaleLowerCase();
    return [ariaLabel, visibleLabel].filter(Boolean);
  }

  function matchesControlLabel(element, labels) {
    return controlLabels(element).some((label) => {
      if (labels.has(label)) return true;
      // ChatGPT can render keyboard hint badges *inside* the actual controls:
      // "Deny Esc" and "Allow once ↵" (sometimes without whitespace).
      if (labels === DENY_LABELS) return /^(?:deny|decline|отклонить|запретить)\s*(?:esc|escape)$/iu.test(label);
      if (labels === ALLOW_ONCE_LABELS) return /^(?:allow once|разрешить один раз)\s*(?:(?:↵|⏎|↩|⤶|enter|return|⌄|▼|▾)\s*)+$/iu.test(label);
      return false;
    });
  }

  function isActionable(element, view) {
    if (!element || !element.isConnected) return false;
    if (element.disabled || element.getAttribute?.("disabled") !== null && element.hasAttribute?.("disabled")) return false;
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.hasAttribute?.("inert") || node.getAttribute?.("aria-hidden") === "true") return false;
      if (node === element && (node.getAttribute?.("aria-disabled") === "true" || node.getAttribute?.("data-disabled") === "true")) return false;
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
      if (node === element && (style.pointerEvents === "none" || Number(style.opacity) === 0)) return false;
    }
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }

  function controlsMatching(root, labels, view) {
    return [...root.querySelectorAll(CONTROL_SELECTOR)].filter((node) => matchesControlLabel(node, labels) && isActionable(node, view));
  }

  function hasPermissionHeading(text) {
    const normalized = normalizeText(text);
    return PERMISSION_HEADINGS.some((pattern) => pattern.test(normalized));
  }

  function findPermissionCard(button, doc, view) {
    // The smallest ancestor containing all three controls and the permission
    // heading is the card. Never search a whole chat for just a button label.
    let node = button?.parentElement;
    for (let depth = 0; node && depth < 16; depth++, node = node.parentElement) {
      if (node === doc.body || node === doc.documentElement) break;
      if (!hasPermissionHeading(node.textContent)) continue;
      if (controlsMatching(node, ALWAYS_ALLOW_LABELS, view).length !== 1) continue;
      if (controlsMatching(node, ALLOW_ONCE_LABELS, view).length !== 1) continue;
      if (controlsMatching(node, DENY_LABELS, view).length !== 1) continue;
      if (!isActionable(button, view)) continue;
      return node;
    }
    return null;
  }

  function findPermissionCandidate(doc, view) {
    if (!doc?.querySelectorAll || !doc.body) return { status: "none" };
    const buttons = controlsMatching(doc, ALWAYS_ALLOW_LABELS, view);
    const candidates = [];
    for (const button of buttons) {
      const card = findPermissionCard(button, doc, view);
      if (card) candidates.push({ button, card });
    }
    if (candidates.length === 0) return { status: "none" };
    if (candidates.length !== 1) return { status: "ambiguous" };
    return { status: "found", ...candidates[0] };
  }

  return Object.freeze({
    normalizeText,
    controlLabels,
    isActionable,
    hasPermissionHeading,
    findPermissionCandidate
  });
});
