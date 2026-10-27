"use strict";

const checkbox = document.getElementById("enabled");
const status = document.getElementById("status");
let currentTabId = null;
let busy = false;

function supportedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ["chatgpt.com", "chat.openai.com"].includes(parsed.hostname);
  } catch { return false; }
}

function statusText(state) {
  if (!state?.enabled) return "Выключено";
  switch (state.lastStatus) {
    case "detected": return "Запрос найден, проверяю…";
    case "clicked": return "Always allow нажата. Ожидание новых запросов.";
    case "ambiguous": return "Несколько подходящих карточек: нажатие пропущено";
    case "click_failed": return "Нажатие не удалось. Запрос оставлен без изменений.";
    case "storage_error": return "Ошибка сохранения состояния";
    default: return "Включено. Ожидание запросов разрешения.";
  }
}

async function sendToTab(message) {
  return chrome.tabs.sendMessage(currentTabId, message);
}

async function connectContentScript() {
  try { return await sendToTab({ type: "GET_AUTO_ALLOW_STATUS" }); }
  catch {
    // Existing tabs may lack the content script after installation/reload.
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ["src/recognition.js", "src/content.js"]
    });
    return sendToTab({ type: "GET_AUTO_ALLOW_STATUS" });
  }
}

async function initialize() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !supportedUrl(tab.url)) {
    status.textContent = "Откройте вкладку ChatGPT.";
    return;
  }
  currentTabId = tab.id;
  try {
    const state = await connectContentScript();
    if (!state?.supported) throw new Error("Content script unavailable");
    checkbox.checked = state.enabled === true;
    checkbox.disabled = false;
    status.textContent = statusText(state);
  } catch {
    status.textContent = "Нет доступа к странице. Проверьте Site access расширения.";
  }
}

checkbox.addEventListener("change", async () => {
  if (busy || !Number.isInteger(currentTabId)) return;
  busy = true;
  checkbox.disabled = true;
  const desired = checkbox.checked;
  status.textContent = desired ? "Включение…" : "Выключение…";
  try {
    const state = await sendToTab({ type: "SET_AUTO_ALLOW_ENABLED", enabled: desired });
    if (!state?.ok || state.enabled !== desired) throw new Error("Failed to save");
    checkbox.checked = state.enabled;
    status.textContent = statusText(state);
  } catch {
    checkbox.checked = !desired;
    status.textContent = "Не удалось изменить состояние. Повторите попытку.";
  } finally {
    busy = false;
    checkbox.disabled = false;
  }
});

initialize().catch(() => { status.textContent = "Не удалось определить текущую вкладку."; });
