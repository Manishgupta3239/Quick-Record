# Quick Record

> Record your screen and audio directly from Chrome — one click, no fuss.

A lightweight Chrome extension (Manifest V3) that captures your screen, system audio, and optionally your microphone. Perfect for meetings, tutorials, and quick demos.

---

## ✨ Features

- **Screen capture** — Record your entire screen, a window, or a single tab
- **System audio** — Capture tab or screen audio (e.g. meeting sound)
- **Optional microphone** — Add your voice to the recording via a simple checkbox
- **One-click start** — Popup closes after you hit Start; pick your source and you’re recording
- **Keyboard shortcut** — `Ctrl+Shift+R` (Windows/Linux) or `Command+Shift+R` (Mac) to start or stop
- **Recording indicator** — Red **REC** badge on the extension icon while recording
- **Flexible format** — Saves as WebM or MP4 when supported; opens in most players (e.g. VLC, Chrome)
- **Save As dialog** — Choose where to save each recording when you stop

---

## 🚀 Installation

### From source (developer / unpacked)

1. **Clone or download** this repo.
2. Open Chrome and go to **`chrome://extensions`**.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the extension folder (the one containing `manifest.json`).
5. Pin **Quick Record** to the toolbar if you like.

---

## 📖 How to use

1. Click the **Quick Record** icon in the toolbar (or use **Ctrl+Shift+R** / **Cmd+Shift+R**).
2. Optionally check **Include my microphone (voice)** to record your voice.
3. Click **Start Recording**.
   - With mic: a new tab opens → allow microphone → click **Choose screen to share** → pick screen/window/tab.
   - Without mic: the screen picker appears right away.
4. Choose what to share (screen, window, or tab). Check **Share tab audio** if you want meeting/system sound.
5. Recording starts. Use the **REC** badge or the timer in the popup (reopen the icon to see it).
6. Click **Stop Recording** in the popup or press **Ctrl+Shift+R** again. Choose where to save the file in the Save As dialog.

---

## ⌨️ Keyboard shortcut

| Action        | Windows / Linux | macOS          |
|---------------|-----------------|----------------|
| Start / Stop  | `Ctrl+Shift+R`  | `Cmd+Shift+R`  |

You can change it under **chrome://extensions** → **Quick Record** → **Keyboard shortcuts**.

---

## 📁 Project structure

```
video recorder/
├── manifest.json       # Extension config (name, permissions, icons, commands)
├── logo.png            # Extension icon & popup logo
├── popup.html          # Popup UI
├── popup.js            # Popup logic (timer, start/stop, mic option)
├── background.js       # Service worker (offscreen/tab coordination, badge, download)
├── offscreen.html      # Offscreen document (screen-only recording)
├── offscreen.js        # getDisplayMedia + MediaRecorder (no mic)
├── record-tab.html     # Tab used when “Include microphone” is checked
├── record-tab.js       # Mic + screen in one tab (reliable mic permission)
└── README.md           # This file
```

- **Without mic:** recording runs in an **offscreen document** (screen + tab audio).
- **With mic:** recording runs in a **tab** (screen + tab audio + your voice) so Chrome can prompt for microphone access.

---

## 🛠 Tech

- **Chrome Extension Manifest V3**
- **Web APIs:** `getDisplayMedia`, `getUserMedia`, `MediaRecorder`, Web Audio API (mixing)
- **Chrome APIs:** `offscreen`, `storage`, `downloads`, `tabs`, `action` (badge)

---

**Quick Record** — record in seconds, not minutes.
