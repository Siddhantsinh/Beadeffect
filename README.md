# 🟡 BeadCam — Live Video to Bead Art

> **Transform your live camera feed or any photo into mesmerizing, real-time bead pixel art.**

BeadCam is a high-performance, production-ready, browser-based creative tool that converts live camera video or uploaded images into stunning bead art rendered on an HTML5 Canvas. It features multiple color palettes, bead shapes, 3D shading effects, Floyd–Steinberg dithering, and a brutalist dark-mode UI — all running entirely client-side with zero dependencies.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Getting Started](#getting-started)
- [UI & Controls Reference](#ui--controls-reference)
  - [Splash Screen](#splash-screen)
  - [Top Bar](#top-bar)
  - [Controls Panel](#controls-panel)
  - [Enhancements Panel](#enhancements-panel)
  - [Source Panel](#source-panel)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Technical Architecture](#technical-architecture)
  - [Rendering Pipeline](#rendering-pipeline)
  - [Color Palettes & LUT System](#color-palettes--lut-system)
  - [Floyd–Steinberg Dithering](#floydsteinberg-dithering)
  - [Stamp & Background Caching](#stamp--background-caching)
  - [3D Bead Effect](#3d-bead-effect)
- [File Structure](#file-structure)
- [Design System (CSS)](#design-system-css)
- [Browser Compatibility](#browser-compatibility)
- [Known Limitations](#known-limitations)
- [Roadmap / Ideas](#roadmap--ideas)

---

## Overview

BeadCam works by:

1. Sampling pixels from a **live camera stream** or **uploaded image** at a low resolution (one pixel per bead cell).
2. Optionally quantizing those pixels to a **named color palette** using a pre-baked 3D Color Look-Up Table (LUT).
3. Optionally applying **Floyd–Steinberg dithering** to minimize quantization banding.
4. Drawing each pixel as a styled **bead shape** (circle, square, diamond, or hexagon) with optional radial-gradient **3D shading** and a specular highlight.
5. Compositing everything onto a background (pegboard, dark, light, or transparent) in real time.

The entire pipeline runs in vanilla JavaScript with no build step, no framework, and no server — just open `index.html` in a browser.

---

## Features

| Feature | Details |
|---|---|
| 🎥 **Live Camera** | WebRTC `getUserMedia`, front & rear camera switching |
| 🖼️ **Image Upload** | Drag-and-drop or file picker; aspect-ratio-correct cropping |
| ⚙️ **Bead Size** | 4 – 30 px (controls grid resolution) |
| 🔲 **Gap** | 0 – 8 px spacing between beads |
| 🔵 **Shapes** | Circle, Square, Diamond, Hexagon |
| 🎨 **Color Modes** | Natural, Perler, Hama, Pastel, Neon, Grayscale |
| 💡 **3D Effect** | Radial gradient highlight + specular dot (0–100%) |
| 🖼️ **Background** | Pegboard (tan + dot grid), Dark, Light, Transparent |
| 🪞 **Mirror** | Horizontally flips the source |
| 🔳 **Show Grid** | Subtle white grid overlay on canvas |
| ☀️ **Brightness** | 50 – 150 % (CSS filter applied pre-sample) |
| 🎛️ **Contrast** | 50 – 150 % |
| 🌈 **Saturation** | 0 – 200 % |
| ✨ **Smooth Dithering** | Floyd–Steinberg error diffusion (toggleable) |
| 📸 **Capture** | Downloads the current canvas as a timestamped PNG |
| ⏸️ **Pause / Resume** | Freezes the render loop |
| 🔄 **Switch Camera** | Toggles between front/rear (environment) cameras |
| ⛶ **Fullscreen** | Native browser fullscreen API |
| 📊 **FPS Counter** | Live frames-per-second overlay |
| 🔢 **Bead Counter** | Live total bead count overlay |
| 📱 **Responsive** | Mobile layout with slide-in panel |

---

## Getting Started

BeadCam requires **no installation**. It runs entirely in the browser.

### Steps

1. **Clone or download** this repository.
2. **Open `index.html`** in any modern browser (Chrome, Edge, Firefox, Safari).
3. On the splash screen:
   - Click **📷 Launch Camera** to start your webcam feed.
   - Click **🖼️ Upload Image** to load a photo from your device.
4. Grant camera permission when prompted (for the camera mode).
5. Use the **Controls Panel** on the right to customize the look in real time.
6. Press **📸** (or keyboard `C`) to capture and save the current frame as a PNG.

> **Note:** Camera access requires HTTPS or `localhost`. If opening from a local file path (`file://`), some browsers will block `getUserMedia`. Use a local server (e.g. `npx serve .` or VS Code Live Server) if needed.

---

## UI & Controls Reference

### Splash Screen

The full-screen landing page displayed on first load.

| Element | Function |
|---|---|
| `📷 Launch Camera` | Requests camera permission and opens the app in camera mode |
| `🖼️ Upload Image` | Opens a file picker to select an image |

### Top Bar

Persistent header visible while the app is running.

| Button | ID | Function |
|---|---|---|
| `📸` | `btn-capture` | Capture current canvas to PNG |
| `⛶` | `btn-fullscreen` | Toggle browser fullscreen |
| `⚙` | `btn-toggle-panel` | Show / hide the Controls panel |

### Controls Panel

The collapsible right-hand panel with all creative controls.

#### Bead Size
- **Slider** `slider-bead-size` · Range: 4 – 30 · Default: **12**
- Controls the size of each bead in pixels. Smaller beads = higher resolution, more beads, heavier render cost.

#### Gap
- **Slider** `slider-bead-gap` · Range: 0 – 8 · Default: **2**
- Space between adjacent beads. A gap of 0 makes beads touch; higher values show more background.

#### Shape
- **Buttons**: Circle, Square, Diamond, Hexagon
- Determines the geometry drawn for each bead cell. Changing shape clears the stamp cache.

#### Color Mode

| Button | Palette | Description |
|---|---|---|
| Natural | `natural` | True color — no palette quantization |
| Perler | `perler` | 23-color Perler bead palette |
| Hama | `hama` | 18-color Hama bead palette |
| Pastel | `pastel` | 14-color soft pastel palette |
| Neon | `neon` | 14-color high-saturation neon palette |
| B&W | `grayscale` | 11-step grayscale ramp |

#### 3D Effect
- **Slider** `slider-bead-3d` · Range: 0 – 100 % · Default: **80 %**
- Internally stored as a 0 – 1 float (`effect3d`). At 0 %, beads are flat-colored. Above 0 %, a radial gradient simulates depth. Above 30 %, a specular white dot is added to circle-shaped beads.

#### Background

| Button | Style | Description |
|---|---|---|
| Pegboard | `pegboard` | Tan (#e8dcc8) board with subtle dot grid |
| Dark | `dark` | Solid black #000 |
| Light | `light` | Solid white #fff |
| None | `transparent` | Fully transparent canvas background |

#### Mirror
- **Toggle** `toggle-mirror` · Default: **On**
- Horizontally mirrors the source before sampling (natural selfie orientation).

#### Show Grid
- **Toggle** `toggle-grid` · Default: **Off**
- Overlays a faint white grid aligned to bead cells — useful for counting or planning patterns.

---

### Enhancements Panel

Image adjustment filters applied to the source before color quantization.

| Control | ID | Range | Default | Effect |
|---|---|---|---|---|
| Brightness | `slider-brightness` | 50 – 150 % | 100 % | CSS `brightness()` filter |
| Contrast | `slider-contrast` | 50 – 150 % | 100 % | CSS `contrast()` filter |
| Saturation | `slider-saturation` | 0 – 200 % | 100 % | CSS `saturate()` filter |
| Smooth Dithering | `toggle-dither` | On / Off | **On** | Enables Floyd–Steinberg dithering |

> Filters are applied via `OffscreenCanvas.filter` before pixel data is read — they affect quantization results but not the raw source.

---

### Source Panel

| Control | ID | Function |
|---|---|---|
| Source label | `source-label` | Shows current source (Live Camera or file name) |
| Upload Image | `btn-upload-panel` | Open file picker |
| Back to Camera | `btn-back-camera` | Stop image mode; restart camera feed |
| Pause / Resume | `btn-pause` | Toggle render loop pause |
| Switch Camera | `btn-switch-cam` | Toggle front/rear camera |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `C` | Capture current frame to PNG |
| `Space` | Toggle Pause / Resume |
| `F` | Toggle Fullscreen |

> Shortcuts are disabled when an `<input>` element is focused.

---

## Technical Architecture

### Rendering Pipeline

```
Camera / Image Source
        |
        v
[Offscreen Canvas]  <- tiny canvas: 1px per bead column/row
  CSS filters: brightness / contrast / saturation
  Mirror transform (scale -1)
  Aspect-fit crop (image mode)
        |
   getImageData()
        |
        v
[processColors()]   <- per-pixel loop over low-res buffer
  LUT lookup (palette quantization)
  Floyd-Steinberg error diffusion
        |
        v
[getBG()]           <- cached background canvas
  Pegboard / Dark / Light / Transparent
        |
        v
[getStamp()]        <- per-color cached mini-canvas
  Shape path (circle / square / diamond / hexagon)
  Radial gradient (3D effect)
  Specular highlight dot
        |
        v
[Main Canvas]       <- full display resolution
  ctx.drawImage(bgCanvas)
  ctx.drawImage(stamp, x, y)  <- for each bead cell
        |
        v
  FPS + bead count overlays
  Grid overlay (optional)
```

The render loop runs via `requestAnimationFrame` at **~30 fps** in camera mode (throttled for efficiency). Drawing logic is decoupled into `drawFrame()` — in **image mode**, controls call `drawFrame()` directly for immediate re-render without stacking rAF callbacks.

**Performance optimizations:**
- `OffscreenCanvas` used for stamp generation when available (avoids DOM allocation overhead)
- Fast-path `putImageData` rendering when 3D effect is off + square shape + >5000 beads
- CSS filter pipeline bypassed entirely when brightness/contrast/saturation are at defaults
- `processColors()` short-circuits immediately in natural mode (no quantization needed)
- `ResizeObserver` with debounced resize replaces `window.resize` for reliable layout detection
- Error boundary in the rAF loop prevents a single bad frame from killing rendering

---

### Color Palettes & LUT System

Each named palette is a hand-curated array of `[R, G, B]` triplets. When a palette is first used, a **32x32x32 Color Look-Up Table** (LUT) is built:

- For every possible `(R>>3, G>>3, B>>3)` bucket (5-bit per channel = 32 levels each), the nearest palette color by squared Euclidean distance is stored.
- The LUT is cached in a `Map<paletteName, Uint8Array>` so it's only built once per session.
- At render time, each pixel is mapped with a single array lookup: `lut[(r>>3)*1024 + (g>>3)*32 + (b>>3)] * 3`.

**Natural mode** (`PALETTES.natural = null`) skips quantization entirely.

---

### Floyd–Steinberg Dithering

When `state.dither = true`, quantization error is diffused to neighboring pixels using the classic Floyd–Steinberg weights:

```
         [current]  ->  7/16
 3/16  <-  5/16  ->   1/16
```

The error is computed in a `Float32Array` (full precision, reused across frames to avoid GC churn) and applied before each pixel is quantized, producing smooth gradients in banded regions.

The diffusion strength is deliberately reduced to **60%** (`errR * 0.6`) to prevent over-dithering at small bead sizes.

> **Note:** Dithering is only applied when a palette LUT is active. In Natural mode, there's no quantization so error diffusion is skipped entirely for performance.

---

### Stamp & Background Caching

**Stamp Cache** (`stampCache: Map<colorKey, Canvas>`)
- A unique bead image is pre-rendered for each distinct quantized color using `OffscreenCanvas` (when available) or `document.createElement('canvas')` as fallback.
- The cache key encodes `(R & 0xF8) << 8 | (G & 0xF8) << 3 | B >> 3` — a 5-bit-per-channel integer — so near-identical colors share a stamp.
- Capped at **4096 entries** with FIFO eviction to prevent unbounded memory growth in Natural mode.
- The cache is **invalidated** whenever `beadSize`, `shape`, or `effect3d` changes.

**Background Cache** (`bgCache: { canvas, key }`)
- A single canvas is reused for the background.
- Keyed by `"${bgStyle}_${canvasWidth}_${canvasHeight}_${cellSize}"`.
- Invalidated on resize, panel toggle, `bgStyle` change, or **gap change** (since gap affects `cellSize` → pegboard dot spacing).

---

### 3D Bead Effect

Each bead stamp uses a `createRadialGradient` offset slightly toward the upper-left, producing a soft specular illusion:

| Stop | Color formula |
|---|---|
| 0 (highlight) | `rgb(r + 60*e, g + 60*e, b + 60*e)` |
| 0.5 (base) | `rgb(r, g, b)` |
| 1.0 (shadow) | `rgb(r - 50*e, g - 50*e, b - 50*e)` |

Where `e = state.effect3d` (0 – 1). At `e > 0.3` and `shape === 'circle'`, a small semi-transparent white arc is drawn near the top-left as a specular highlight dot.

---

## File Structure

```
art/
├── index.html    # Application markup — splash, app layout, controls
├── style.css     # Brutalist design system — tokens, components, animations
├── script.js     # All application logic — render loop, controls, camera
└── README.md     # This document
```

### `index.html`
- Defines two top-level sections: `#splash` (landing) and `#app` (main UI).
- Loads Google Fonts: **Public Sans** (body) and **Syne** (headings/buttons).
- All interactive controls use `id` attributes matching `script.js` DOM lookups.

### `style.css`
- Full brutalist design system with CSS custom properties (`--bg-main`, `--accent`, `--border`, `--shadow`, etc.).
- Stepped transitions (`steps(2)`, `steps(4)`) for a mechanical, glitchy animation feel.
- Responsive breakpoint at `768 px`: panel slides in from the right as a full-screen overlay.
- Custom scrollbar styling and range input thumb overrides.

### `script.js`
- Single IIFE (`(() => { ... })()`), strict mode.
- All state in a single `state` object.
- `bind()` wires up every control listener on startup.
- `render(timestamp)` is the rAF callback (30fps-throttled in camera mode) that calls `drawFrame(timestamp)` — the pure drawing function also invoked directly by control handlers in image mode.
- Defensive `$$()` DOM helper throws descriptive errors when required elements are missing.
- `pagehide` listener releases camera tracks and revokes blob URLs on page unload.

---

## Design System (CSS)

### Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--bg-main` | `#000000` | Page / topbar background |
| `--bg-panel` | `#111111` | Side panel background |
| `--bg-card` | `#1a1a1a` | (Reserved for cards) |
| `--accent` | `#ffff00` | Neon yellow — primary accent |
| `--accent-alt` | `#00ffff` | Neon cyan — secondary accent |
| `--text` | `#ffffff` | Primary text |
| `--text-dim` | `#bbbbbb` | Secondary / hint text |

### Layout Tokens

| Token | Value | Usage |
|---|---|---|
| `--border-width` | `3px` | All hard borders |
| `--border` | `3px solid #fff` | Shorthand border value |
| `--shadow` | `6px 6px 0px #ffff00` | Brutal offset shadow |
| `--shadow-hover` | `3px 3px 0px #ffff00` | Reduced shadow on hover press |
| `--radius` | `0px` | No border radius — sharp corners everywhere |
| `--panel-w` | `340px` | Side panel width on desktop |

### Typography

| Font | Weight | Usage |
|---|---|---|
| **Public Sans** | 400, 700 | Body, labels, notes |
| **Syne** | 700, 800 | Headings, buttons, counters |

All headings and buttons use `text-transform: uppercase` and `letter-spacing: -0.02em`.

---

## Browser Compatibility

| Browser | Camera | Upload | Capture |
|---|---|---|---|
| Chrome 90+ | Yes | Yes | Yes |
| Edge 90+ | Yes | Yes | Yes |
| Firefox 88+ | Yes | Yes | Yes |
| Safari 15+ | Yes | Yes | Yes |
| Mobile Chrome | Yes | Yes | Yes |
| Mobile Safari | Requires HTTPS | Yes | Yes |

> **HTTPS requirement:** `getUserMedia` is restricted to secure contexts. Opening `index.html` via `file://` works for image upload but not camera. Use a local HTTP server for camera access.

---

## Known Limitations

- **Performance on very small bead sizes (< 6 px):** The number of beads can exceed 50,000 at small sizes on a large display, which may cause FPS drops on low-end devices. The `putImageData` fast-path mitigates this for flat square beads.
- **No audio support:** Camera stream is muted; video-only.
- **No video recording:** Capture saves a single frame. Screen recording requires a separate tool.
- **Safari fullscreen:** Only native OS fullscreen is available, not in-browser capture.
- **LUT build time:** The first render with a new palette incurs a one-time ~5 ms LUT construction (imperceptible on modern hardware).
- **Stamp cache growth:** Capped at 4096 entries with FIFO eviction. Natural mode can produce many distinct colors but the cap prevents unbounded memory growth.

---

## Roadmap / Ideas

- [ ] Animated GIF / WebM export — record a sequence of frames
- [ ] Custom palette editor — let users define their own bead colors
- [ ] Pattern grid overlay — printable pegboard template export
- [ ] Bead count estimate by color — shopping list for physical projects
- [ ] WebGL renderer — GPU-accelerated bead rendering for higher resolution
- [ ] PWA / offline support — service worker + manifest for installability
- [ ] More shapes — triangle, star, cross
- [ ] Noise / scanline filters — additional post-processing aesthetics
- [ ] Web Worker rendering — offload pixel processing to a background thread

---

*Made with love and neon yellow.*
