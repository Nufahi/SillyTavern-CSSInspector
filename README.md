# CSS Class Inspector for SillyTavern

**Read this in other languages:** [Русский](README.ru.md)

A browser-like CSS inspector extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern). Hover over any UI element to instantly see its classes, ID, dimensions, computed styles, CSS variables, and box model -- with one-click copy.

Built for theme developers, extension creators, or anyone who wants to understand how SillyTavern's UI is structured without opening DevTools.

---

## Features

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

### CSS Variables Detection
Finds CSS custom properties (`--variable-name`) used on the inspected element and shows their resolved values. Essential for working with SillyTavern themes.

### Box Model Overlay
Visual margin (blue) and padding (green) overlays rendered directly on the page, similar to Chrome DevTools.

### Settings Panel
All options are configurable from the Extensions panel:

- Enable / Disable the inspector
- Theme: dark or light tooltip
- Copy mode selector
- Toggle: dimensions, computed styles, CSS variables, box model
- Click Lock -- pin tooltip before copying (prevents accidental copies)
- Toast notifications -- show or hide copy confirmations
- Reset Position -- snap the FAB back to its default location

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
