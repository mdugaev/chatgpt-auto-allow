(() => {
  "use strict";

  const recognition = globalThis.ChatGPTAutoAllowRecognition;
  if (!recognition || globalThis.__chatgptAutoAllowInitialized) return;
  globalThis.__chatgptAutoAllowInitialized = true;

  const SETTLE_MS = 220;
  const FALLBACK_POLL_MS = 2000;
  const MIN_CLICK_GAP_MS = 700;

  let enabled = false;
  let revision = 0;
  let observer = null;
  let scanTimer = null;
  let confirmTimer = null;
  let fallbackTimer = null;
  let pending = null;
  let lastClickedAt = 0;
  let lastActionAt = null;
  let lastStatus = "off";
  let initializationPromise = Promise.resolve();
  const clickedCards = new WeakSet();
  const clickedButtons = new WeakSet();

  function clearScanTimer() {
    if (scanTimer !== null) clearTimeout(scanTimer);
    scanTimer = null;
  }

  function clearConfirmTimer() {
    if (confirmTimer !== null) clearTimeout(confirmTimer);
    confirmTimer = null;
  }

  function stopWatching() {
    observer?.disconnect();
    observer = null;
    if (fallbackTimer !== null) clearInterval(fallbackTimer);
    fallbackTimer = null;
    clearScanTimer();
    clearConfirmTimer();
    pending = null;
  }

  function getCandidate() {
    return recognition.findPermissionCandidate(document, window);
  }

  function scan() {
    scanTimer = null;
    if (!enabled) return;

    const match = getCandidate();
    if (match.status === "ambiguous") {
      pending = null;
      clearConfirmTimer();
      lastStatus = "ambiguous";
      return;
    }
    if (match.status !== "found") {
      pending = null;
      clearConfirmTimer();
      if (lastStatus !== "clicked") lastStatus = "waiting";
      return;
    }
    if (clickedButtons.has(match.button) || clickedCards.has(match.card)) {
      pending = null;
      clearConfirmTimer();
      return;
    }
    if (pending?.button === match.button && pending.card === match.card) return;

    pending = { button: match.button, card: match.card };
    clearConfirmTimer();
    lastStatus = "detected";
    confirmTimer = setTimeout(confirmCandidate, SETTLE_MS);
  }

  function confirmCandidate() {
    confirmTimer = null;
    if (!enabled || !pending) return;
    const original = pending;
    pending = null;
    const match = getCandidate();
    if (match.status !== "found" || match.button !== original.button || match.card !== original.card) {
      scheduleScan();
      return;
    }
    if (clickedButtons.has(match.button) || clickedCards.has(match.card)) return;
    if (Date.now() - lastClickedAt < MIN_CLICK_GAP_MS) {
      scheduleScan(MIN_CLICK_GAP_MS);
      return;
    }

    // Mark before clicking: React may synchronously mutate/re-render the card.
    clickedButtons.add(match.button);
    clickedCards.add(match.card);
    lastClickedAt = Date.now();
    lastActionAt = lastClickedAt;
    try {
      match.button.click();
      lastStatus = "clicked";
    } catch {
      lastStatus = "click_failed";
    }
  }

  function scheduleScan(delay = 120) {
    if (!enabled || scanTimer !== null) return;
    scanTimer = setTimeout(scan, delay);
  }

  function startWatching() {
    stopWatching();
    lastStatus = "waiting";
    if (!document.documentElement) return;
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "inert", "disabled", "aria-hidden", "aria-disabled", "data-disabled"]
    });
    fallbackTimer = setInterval(() => scheduleScan(), FALLBACK_POLL_MS);
    scheduleScan(0);
  }

  async function changeEnabled(next) {
    const currentRevision = ++revision;
    // Stop immediately when the user toggles OFF, even if storage is slow.
    if (!next) { enabled = false; stopWatching(); lastStatus = "off"; }
    let result;
    try { result = await chrome.runtime.sendMessage({ type: "SET_TAB_ENABLED", enabled: next }); }
    catch { result = null; }
    if (currentRevision !== revision) return { enabled, ok: false };
    if (!result?.ok) {
      enabled = false;
      stopWatching();
      lastStatus = "storage_error";
      return { enabled: false, ok: false };
    }
    enabled = result.enabled === true;
    if (enabled) startWatching();
    else { stopWatching(); lastStatus = "off"; }
    return { enabled, ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    if (message.type === "GET_AUTO_ALLOW_STATUS") {
      initializationPromise.then(() => sendResponse({ supported: true, enabled, lastStatus, lastActionAt }));
      return true;
    }
    if (message.type === "SET_AUTO_ALLOW_ENABLED") {
      changeEnabled(message.enabled === true)
        .then((result) => sendResponse({ supported: true, ...result, lastStatus, lastActionAt }))
        .catch(() => sendResponse({ supported: true, enabled: false, ok: false, lastStatus: "storage_error" }));
      return true;
    }
    return false;
  });

  initializationPromise = (async () => {
    const startedAt = revision;
    let result;
    try { result = await chrome.runtime.sendMessage({ type: "GET_TAB_ENABLED" }); }
    catch { result = null; }
    if (startedAt !== revision) return;
    if (result?.error) { lastStatus = "storage_error"; return; }
    enabled = result?.enabled === true;
    if (enabled) startWatching();
  })().catch(() => { enabled = false; stopWatching(); lastStatus = "storage_error"; });
})();
