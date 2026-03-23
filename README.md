# CSS Class Inspector for SillyTavern

**Read this in other languages:** [Русский](README.ru.md)

A browser-like CSS inspector extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern). Hover over any UI element to instantly see its classes, ID, dimensions, computed styles, CSS variables, and box model with one-click copy.

Built for theme developers, extension creators, or anyone who wants to understand how SillyTavern's UI is structured without opening DevTools.

---

## Features

<img width="1920" height="1080" alt="image_2026-03-23_18-02-16" src="https://github.com/user-attachments/assets/f420c198-c20b-480d-8e28-fb58fbcd2da6" />

### Floating Inspector Button (FAB)
A draggable crosshair button that floats over the UI. Drag it anywhere, click to toggle inspection mode on and off.

### Element Inspection
- **Desktop:** hover over any element to see a tooltip with full details. Click to pin the tooltip, click again to copy.
- **Mobile (desktop mode):** works when the browser is switched to desktop site mode. Tap to inspect, tap again to pin, third tap copies.

### 5 Copy Modes

| Mode | Output | Example |
|---|---|---|
| Full Selector | tag + id + all classes | `div#chat.flexGap5.wide100p` |
| Classes Only | class list only | `.flexGap5.wide100p` |
| ID Only | element id | `#chat` |
| DOM Path | full path from root | `div#sheld > div.flexGap5 > div` |
| CSS Rule Block | ready-to-paste CSS | `div#chat { color: ...; }` |

<img width="1106" height="667" alt="image_2026-03-23_18-02-01" src="https://github.com/user-attachments/assets/aa6a0ba9-7ac0-4cc8-a885-a83a0fe5c5b1" />

### CSS Variables Detection
Finds CSS custom properties (`--variable-name`) used on the inspected element and shows their resolved values. Essential for working with SillyTavern themes.

### Box Model Overlay

<img width="783" height="730" alt="image_2026-03-23_18-02-09" src="https://github.com/user-attachments/assets/938ac8cb-57d3-46f3-8276-30d7af70a35c" />

Visual margin (blue) and padding (green) overlays rendered directly on the page, similar to Chrome DevTools.

### Settings Panel

<img width="408" height="560" alt="image_2026-03-23_17-58-00 (2)" src="https://github.com/user-attachments/assets/c2a9a163-2cd7-4c64-b07b-b68a417cfcdc" />

All options are configurable from the Extensions panel:

- Enable / Disable the inspector
- Theme: dark or light tooltip
- Copy mode selector
- Toggle: dimensions, computed styles, CSS variables, box model
- Click Lock - pin tooltip before copying (prevents accidental copies)
- Toast notifications - show or hide copy confirmations
- Reset Position - snap the FAB back to its default location

---

## Mobile Support

> [!IMPORTANT]
> On phones, enable **"Desktop site"** (or "Request desktop site") in your mobile browser settings. The extension relies on hover and click events that are only fully available in desktop mode.

Once desktop mode is active, the extension works the same as on a PC -- including the draggable FAB button and element inspection.

---

## Installation

1. Open SillyTavern
2. Go to **Extensions** > **Install Extension**
3. Paste the URL:
```
https://github.com/Nufahi/SillyTavern-CSSInspector
```
4. Restart SillyTavern or press `Ctrl+Shift+R`

---

## Usage

1. Enable the extension in **Extensions** > **CSS Class Inspector** > check **Enable**
2. A crosshair button appears on screen
3. Click the button to activate inspection mode
4. Hover over any element to see its details
5. Click to pin, click again to copy the selector

### Keyboard Shortcuts
| Key | Action |
|---|---|
| `Escape` | Unpin tooltip, cancel inspection |
| Right-click | Unpin and dismiss (desktop) |

---

## Compatibility

- SillyTavern 1.12.0+
- Desktop browsers: Chrome, Firefox, Edge
- Mobile browsers: works in desktop site mode (Android Chrome, etc.)
- Compatible with all SillyTavern themes

---

## License

[AGPL-3.0](LICENSE)

---

Made by [Nufahi](https://github.com/Nufahi)
