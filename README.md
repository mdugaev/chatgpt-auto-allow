# ChatGPT Auto Allow

Chrome/Chromium Manifest V3 extension. When switched **ON** for a ChatGPT tab, it watches for a genuine ChatGPT connected-app permission card and automatically clicks **Always allow**. A tab starts **OFF**; the switch applies only to that browser tab. Multiple tabs can be enabled independently.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository folder containing `manifest.json`.
4. Open a ChatGPT tab, click the extension icon and switch it **ON**.

The popup also works on ChatGPT tabs that were open when the extension was installed or reloaded; it injects the content scripts on demand when Chrome permits site access. Each new tab starts OFF. The enabled state is stored in `chrome.storage.session` and is cleared when the browser session ends or the tab closes.

## Recognition and behavior

- Only runs on `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- Detects the **Always allow** control together with an **Allow ChatGPT to use ...?** heading and adjacent **Allow once** and **Deny** controls, in the same visible card.
- Waits briefly and revalidates the card before clicking. Ambiguous, hidden or disabled controls are ignored.
- Clicks each card only once, and does not retry a failed action or attempt to bypass disabled controls.
- Observes DOM changes to work in inactive/background tabs (subject to Chrome's scheduling). A low-frequency timer provides a fallback.
- Does not inspect conversation contents, access external APIs, communicate with a developer server, or alter the other ChatGPT Auto Continue extension.

## Caution

**Always allow** is a persistent app permission for eligible accounts. It can allow future connected-app actions, potentially including writes or destructive changes, without additional confirmation. Enable this extension only for ChatGPT tabs and connected apps you trust. Site policies and higher-risk confirmation requirements are not overridden. The extension only clicks the visible button when ChatGPT offers it.

The ChatGPT UI is undocumented and may change. This build recognizes English labels (plus limited Russian equivalents) and fails closed when the expected permission card structure cannot be verified. Browser tests using reconstructed page fixtures do not establish compatibility with a particular authenticated ChatGPT account; verify in a signed-in tab before unattended use.

## Development

No external runtime dependencies:

```sh
npm test
npm run check
```

`src/recognition.js` handles conservative matching, `src/content.js` observes and clicks, `src/service-worker.js` stores per-tab ON/OFF state, and `popup/` provides the single switch.
