// ============================
// BeadCam — Production Edition
// ============================

(() => {
  'use strict';

  // ---- Color Palettes ----
  const PALETTES = {
    natural: null,
    perler: [[0, 0, 0], [255, 255, 255], [205, 50, 50], [255, 100, 60], [255, 170, 60], [255, 225, 80], [100, 180, 70], [45, 140, 80], [50, 160, 200], [30, 90, 180], [75, 60, 155], [160, 60, 150], [200, 100, 160], [255, 180, 200], [140, 90, 60], [90, 60, 40], [180, 180, 180], [120, 120, 120], [255, 200, 150], [200, 230, 255], [180, 255, 200], [255, 240, 200], [220, 200, 255]],
    hama: [[0, 0, 0], [255, 255, 255], [210, 40, 40], [255, 120, 40], [255, 200, 50], [80, 170, 60], [40, 120, 190], [100, 60, 160], [230, 100, 170], [255, 180, 190], [160, 100, 60], [200, 200, 200], [100, 100, 100], [255, 160, 100], [50, 180, 180], [180, 220, 100], [255, 220, 180], [120, 80, 160]],
    pastel: [[255, 182, 193], [255, 218, 185], [255, 255, 186], [186, 255, 201], [186, 225, 255], [219, 186, 255], [255, 200, 221], [255, 235, 205], [230, 255, 220], [200, 240, 255], [240, 220, 255], [255, 255, 255], [220, 220, 220], [180, 180, 200]],
    neon: [[0, 0, 0], [255, 0, 102], [255, 0, 255], [0, 255, 255], [57, 255, 20], [255, 255, 0], [255, 100, 0], [0, 100, 255], [180, 0, 255], [255, 50, 50], [0, 255, 128], [255, 200, 0], [100, 0, 255], [255, 255, 255]],
    grayscale: [[0, 0, 0], [30, 30, 30], [60, 60, 60], [90, 90, 90], [120, 120, 120], [150, 150, 150], [180, 180, 180], [200, 200, 200], [220, 220, 220], [240, 240, 240], [255, 255, 255]]
  };

  // ---- State (defaults must match HTML initial values) ----
  const state = {
    beadSize: 12,
    gap: 2,           // matches slider default value="2"
    shape: 'circle',
    palette: 'natural',
    effect3d: 0.8,    // stored as 0-1 float; slider range 0-100 divided on read
    bgStyle: 'pegboard', // matches active HTML button
    mirror: true,
    showGrid: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    dither: true,
    paused: false,
    facingMode: 'user',
    stream: null,
    mode: 'camera',
    uploadedImage: null
  };

  // ---- High-Precision LUT (32-level per channel) ----
  const colorLUTs = new Map();
  function getLUT(paletteName) {
    if (!PALETTES[paletteName]) return null;
    if (colorLUTs.has(paletteName)) return colorLUTs.get(paletteName);
    const pal = PALETTES[paletteName];
    const lut = new Uint8Array(32 * 32 * 32 * 3);
    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          const rr = r * 8, gg = g * 8, bb = b * 8;
          let best = 0, minD = Infinity;
          for (let i = 0; i < pal.length; i++) {
            const dr = rr - pal[i][0], dg = gg - pal[i][1], db = bb - pal[i][2];
            const d = dr * dr + dg * dg + db * db;
            if (d < minD) { minD = d; best = i; }
          }
          const idx = (r * 1024 + g * 32 + b) * 3;
          lut[idx] = pal[best][0]; lut[idx + 1] = pal[best][1]; lut[idx + 2] = pal[best][2];
        }
      }
    }
    colorLUTs.set(paletteName, lut);
    return lut;
  }

  // ---- Defensive DOM helper ----
  // Returns the element or throws with a descriptive error during init.
  const $ = id => document.getElementById(id);
  function $$(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`BeadCam: required element #${id} not found in DOM`);
    return el;
  }

  const video = $$('video'), canvas = $$('bead-canvas'), ctx = canvas.getContext('2d');
  const canvasWrap = $$('canvas-wrap'), fpsEl = $$('fps-counter');
  const beadCountEl = $$('bead-counter'), flashEl = $$('flash-overlay');
  const splash = $$('splash'), appEl = $$('app'), fileInput = $$('file-input');

  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');

  // ---- Caching ----
  const stampCache = new Map();
  let lastStampSettings = '';
  const bgCache = { canvas: document.createElement('canvas'), key: '' };

  // PERF/MEMORY: cap the stamp cache. In Natural mode there's no palette
  // limiting distinct colors, so this map could otherwise grow toward its
  // theoretical max (~32,768 entries, each a small canvas) and never shrink.
  const STAMP_CACHE_MAX = 4096;

  // PERF: prefer OffscreenCanvas for stamp generation when available —
  // avoids main-thread DOM allocation overhead per stamp.
  const canUseOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  function createMiniCanvas(w, h) {
    if (canUseOffscreenCanvas) {
      return new OffscreenCanvas(w, h);
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function getStamp(r, g, b) {
    const key = ((r & 0xF8) << 8) | ((g & 0xF8) << 3) | (b >> 3);
    if (stampCache.has(key)) return stampCache.get(key);
    if (stampCache.size >= STAMP_CACHE_MAX) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldestKey = stampCache.keys().next().value;
      stampCache.delete(oldestKey);
    }

    const size = state.beadSize, radius = size / 2, ss = size + 2;
    // PERF: use OffscreenCanvas when available
    const sc = createMiniCanvas(ss, ss);
    const sctx = sc.getContext('2d');
    const cx = ss / 2, cy = ss / 2, e3d = state.effect3d; // already 0-1

    sctx.beginPath();
    if (e3d > 0) {
      const grad = sctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, 0, cx, cy, radius);
      grad.addColorStop(0, `rgb(${Math.min(255, r + 60 * e3d)},${Math.min(255, g + 60 * e3d)},${Math.min(255, b + 60 * e3d)})`);
      grad.addColorStop(0.5, `rgb(${r},${g},${b})`);
      grad.addColorStop(1, `rgb(${Math.max(0, r - 50 * e3d)},${Math.max(0, g - 50 * e3d)},${Math.max(0, b - 50 * e3d)})`);
      sctx.fillStyle = grad;
    } else {
      sctx.fillStyle = `rgb(${r},${g},${b})`;
    }

    if (state.shape === 'circle') {
      sctx.arc(cx, cy, radius, 0, Math.PI * 2);
    } else if (state.shape === 'square') {
      sctx.rect(cx - radius, cy - radius, size, size);
    } else if (state.shape === 'diamond') {
      sctx.moveTo(cx, cy - radius); sctx.lineTo(cx + radius, cy);
      sctx.lineTo(cx, cy + radius); sctx.lineTo(cx - radius, cy); sctx.closePath();
    } else if (state.shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const vx = cx + radius * Math.cos(a), vy = cy + radius * Math.sin(a);
        if (i === 0) sctx.moveTo(vx, vy); else sctx.lineTo(vx, vy);
      }
      sctx.closePath();
    }
    sctx.fill();

    // Specular highlight
    if (e3d > 0.3 && state.shape === 'circle') {
      sctx.beginPath();
      sctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.18, 0, Math.PI * 2);
      sctx.fillStyle = `rgba(255,255,255,${e3d * 0.45})`;
      sctx.fill();
    }

    stampCache.set(key, sc);
    return sc;
  }

  function getBG(cw, ch, cellSize) {
    const key = `${state.bgStyle}_${cw}_${ch}_${cellSize}`;
    if (bgCache.key === key) return bgCache.canvas;
    bgCache.canvas.width = cw; bgCache.canvas.height = ch;
    const bctx = bgCache.canvas.getContext('2d');
    if (state.bgStyle === 'pegboard') {
      bctx.fillStyle = '#e8dcc8'; bctx.fillRect(0, 0, cw, ch);
      bctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let x = cellSize / 2; x < cw; x += cellSize) {
        for (let y = cellSize / 2; y < ch; y += cellSize) {
          bctx.beginPath(); bctx.arc(x, y, 1.2, 0, Math.PI * 2); bctx.fill();
        }
      }
    } else if (state.bgStyle === 'dark') {
      bctx.fillStyle = '#000'; bctx.fillRect(0, 0, cw, ch);
    } else if (state.bgStyle === 'light') {
      bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, cw, ch);
    }
    // 'transparent' leaves canvas blank
    bgCache.key = key;
    return bgCache.canvas;
  }

  // ---- Floyd-Steinberg Dithering (Float32 for precision) ----
  // PERF: reuse one scratch buffer instead of allocating a fresh
  // Float32Array on every single frame (was causing GC churn at 30-60fps).
  // Only grows when the grid actually gets bigger.
  let fDataBuf = new Float32Array(0);
  function processColors(pixels, w, h, lut) {
    // PERF: Short-circuit in natural mode — nothing to quantize or diffuse.
    if (!lut && !state.dither) return;
    // Even with dither enabled, natural mode has no palette quantization so
    // diffusing rounding error is pure overhead — skip.
    if (!lut) return;

    if (fDataBuf.length < pixels.length) fDataBuf = new Float32Array(pixels.length);
    const fData = fDataBuf;
    for (let i = 0; i < pixels.length; i++) fData[i] = pixels[i];

    const doDither = state.dither && !!lut;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const oldR = fData[i], oldG = fData[i + 1], oldB = fData[i + 2];
        let newR, newG, newB;
        if (lut) {
          const rL = Math.max(0, Math.min(255, oldR)) >> 3;
          const gL = Math.max(0, Math.min(255, oldG)) >> 3;
          const bL = Math.max(0, Math.min(255, oldB)) >> 3;
          const lIdx = (rL * 1024 + gL * 32 + bL) * 3;
          newR = lut[lIdx]; newG = lut[lIdx + 1]; newB = lut[lIdx + 2];
        } else {
          newR = Math.max(0, Math.min(255, Math.round(oldR)));
          newG = Math.max(0, Math.min(255, Math.round(oldG)));
          newB = Math.max(0, Math.min(255, Math.round(oldB)));
        }
        pixels[i] = newR; pixels[i + 1] = newG; pixels[i + 2] = newB;

        // BUGFIX: dithering error diffusion used wrong index for bottom-left
        // neighbor. Was: `i + (w - 1) * 4` (wrong). Now: `((y+1)*w+(x-1))*4`.
        if (doDither) {
          const errR = (oldR - newR) * 0.6;
          const errG = (oldG - newG) * 0.6;
          const errB = (oldB - newB) * 0.6;
          if (x + 1 < w) {
            const j = i + 4;
            fData[j] += errR * 7 / 16; fData[j + 1] += errG * 7 / 16; fData[j + 2] += errB * 7 / 16;
          }
          if (y + 1 < h) {
            if (x > 0) {
              // BUGFIX: correct bottom-left neighbor index
              const j = ((y + 1) * w + (x - 1)) * 4;
              fData[j] += errR * 3 / 16; fData[j + 1] += errG * 3 / 16; fData[j + 2] += errB * 3 / 16;
            }
            { const j = i + w * 4; fData[j] += errR * 5 / 16; fData[j + 1] += errG * 5 / 16; fData[j + 2] += errB * 5 / 16; }
            if (x + 1 < w) {
              const j = i + (w + 1) * 4;
              fData[j] += errR * 1 / 16; fData[j + 1] += errG * 1 / 16; fData[j + 2] += errB * 1 / 16;
            }
          }
        }
      }
    }
  }

  // PERF: avoid rebuilding + reparsing the CSS filter string every single
  // frame — only recompute it when brightness/contrast/saturation change.
  // PERF: return 'none' when all values are at defaults to skip browser
  // filter pipeline entirely.
  let filterCacheKey = '', filterCacheStr = '';
  function getFilterString() {
    const k = `${state.brightness}_${state.contrast}_${state.saturation}`;
    if (k !== filterCacheKey) {
      filterCacheKey = k;
      if (state.brightness === 100 && state.contrast === 100 && state.saturation === 100) {
        filterCacheStr = 'none';
      } else {
        filterCacheStr = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
      }
    }
    return filterCacheStr;
  }

  // ---- Core Render ----
  let lastTime = 0, frameCount = 0, rafRunning = false;
  // PERF: throttle camera mode to ~30fps — skip every other frame.
  let frameParity = false;
  const TARGET_FRAME_MS = 1000 / 30; // ~33.3ms between frames
  let lastFrameTime = 0;

  // BUGFIX: separated drawing logic from rAF scheduling. Event handlers
  // (sliders, toggles) call drawFrame() directly for image mode re-renders
  // without stacking additional rAF callbacks.
  function drawFrame(timestamp) {
    const cw = canvas.width, ch = canvas.height;
    if (cw <= 0 || ch <= 0) return;

    const source = (state.mode === 'image') ? state.uploadedImage : video;
    if (!source || (state.mode === 'camera' && video.readyState < 2)) return;

    const cellSize = state.beadSize + state.gap;
    const cols = Math.floor(cw / cellSize), rows = Math.floor(ch / cellSize);
    if (cols <= 0 || rows <= 0) return;

    if (offscreen.width !== cols || offscreen.height !== rows) {
      offscreen.width = cols; offscreen.height = rows;
    }

    offCtx.filter = getFilterString();
    offCtx.clearRect(0, 0, cols, rows);
    offCtx.save();
    if (state.mirror) { offCtx.translate(cols, 0); offCtx.scale(-1, 1); }

    if (state.mode === 'image') {
      const iw = source.width, ih = source.height;
      const aspect = iw / ih, cAspect = cols / rows;
      let sx, sy, sw, sh;
      if (aspect > cAspect) { sh = ih; sw = ih * cAspect; sx = (iw - sw) / 2; sy = 0; }
      else { sw = iw; sh = iw / cAspect; sx = 0; sy = (ih - sh) / 2; }
      offCtx.drawImage(source, sx, sy, sw, sh, 0, 0, cols, rows);
    } else if (source.videoWidth > 0) {
      offCtx.drawImage(source, 0, 0, cols, rows);
    }
    offCtx.restore();

    const imgData = offCtx.getImageData(0, 0, cols, rows);
    processColors(imgData.data, cols, rows, getLUT(state.palette));

    const sKey = `${state.beadSize}_${state.shape}_${state.effect3d}`;
    if (lastStampSettings !== sKey) { stampCache.clear(); lastStampSettings = sKey; }

    const pData = imgData.data;
    const totalBeads = cols * rows;

    // PERF: fast-path for flat rendering (no 3D effect) with high bead counts.
    // Instead of thousands of individual drawImage calls, fill a pixel buffer
    // directly and use putImageData. Only works for circles/squares without
    // gradients — falls back to stamp path otherwise.
    if (state.effect3d === 0 && state.shape === 'square' && totalBeads > 5000) {
      // Fast path: direct pixel fill
      const outData = ctx.createImageData(cw, ch);
      const out = outData.data;

      // Fill background first
      const bgFill = state.bgStyle === 'pegboard' ? [232, 220, 200, 255]
        : state.bgStyle === 'dark' ? [0, 0, 0, 255]
        : state.bgStyle === 'light' ? [255, 255, 255, 255]
        : [0, 0, 0, 0]; // transparent

      for (let p = 0; p < out.length; p += 4) {
        out[p] = bgFill[0]; out[p + 1] = bgFill[1];
        out[p + 2] = bgFill[2]; out[p + 3] = bgFill[3];
      }

      const beadPx = state.beadSize;
      const halfGap = Math.floor(state.gap / 2);

      for (let row = 0; row < rows; row++) {
        const baseY = row * cellSize + halfGap;
        for (let col = 0; col < cols; col++) {
          const pi = (row * cols + col) * 4;
          const cr = pData[pi], cg = pData[pi + 1], cb = pData[pi + 2];
          const baseX = col * cellSize + halfGap;
          for (let by = 0; by < beadPx && baseY + by < ch; by++) {
            const rowStart = (baseY + by) * cw;
            for (let bx = 0; bx < beadPx && baseX + bx < cw; bx++) {
              const oi = (rowStart + baseX + bx) * 4;
              out[oi] = cr; out[oi + 1] = cg; out[oi + 2] = cb; out[oi + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(outData, 0, 0);
    } else {
      // Standard stamp-based path
      ctx.drawImage(getBG(cw, ch, cellSize), 0, 0);

      // BUGFIX: use consistent offset derived from stamp size (ss = beadSize + 2).
      // Previously Math.ceil(size/2) + 1 caused 0.5px jitter at odd bead sizes.
      const ss = state.beadSize + 2;
      const off = Math.floor(ss / 2);

      for (let y = 0; y < rows; y++) {
        const rowOff = y * cols * 4;
        const drawY = y * cellSize + Math.floor(cellSize / 2) - off;
        for (let x = 0; x < cols; x++) {
          const i = rowOff + x * 4;
          ctx.drawImage(getStamp(pData[i], pData[i + 1], pData[i + 2]), x * cellSize + Math.floor(cellSize / 2) - off, drawY);
        }
      }
    }

    if (state.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let x = 0; x <= cw; x += cellSize) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
      for (let y = 0; y <= ch; y += cellSize) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
      ctx.stroke();
    }

    beadCountEl.textContent = totalBeads.toLocaleString() + ' beads';
    frameCount++;
    if (timestamp - lastTime >= 1000) {
      fpsEl.textContent = frameCount + ' FPS';
      frameCount = 0; lastTime = timestamp;
    }
  }

  function render(timestamp) {
    rafId = requestAnimationFrame(render);
    if (state.paused) return;

    // PERF: throttle camera mode to ~30fps. Image mode renders on-demand
    // via drawFrame() calls from event handlers, so this only affects the
    // continuous camera loop.
    if (state.mode === 'camera') {
      if (timestamp - lastFrameTime < TARGET_FRAME_MS) return;
      lastFrameTime = timestamp;
    }

    // PRODUCTION: error boundary — a single bad frame shouldn't kill the loop.
    try {
      drawFrame(timestamp);
    } catch (err) {
      console.error('BeadCam render error:', err);
    }
  }

  let rafId = 0;
  function startRenderLoop() {
    if (rafRunning) return;
    rafRunning = true;
    rafId = requestAnimationFrame(render);
  }

  // ---- Show App ----
  function showApp() {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      appEl.classList.remove('hidden');
      // BUGFIX: on mobile, default to panel-closed so canvas is visible.
      if (window.innerWidth <= 768) {
        appEl.classList.add('panel-closed');
      }
      resize();
      startRenderLoop();
    }, 400);
  }

  // ---- Camera ----
  // Returns true/false so callers can avoid switching to the app view when
  // the camera never actually started.
  async function startCamera(facingMode) {
    if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }

    // On non-secure contexts (file://, http://) or very old browsers,
    // navigator.mediaDevices is undefined. Give a clear message.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access requires HTTPS (or localhost) and a modern browser. Try uploading an image instead.');
      return false;
    }

    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facingMode || state.facingMode }
      });
      video.srcObject = state.stream;
      await video.play();
      state.mode = 'camera';
      $('source-label').textContent = '📷 Live Camera';
      $('wrap-back-camera').style.display = 'none';
      return true;
    } catch (e) {
      alert('Camera Error: ' + e.message);
      return false;
    }
  }

  // ---- Upload Handler ----
  let currentImageObjectURL = null;
  function handleFileInput(e) {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      // Revoke previous blob URL to prevent memory leaks.
      if (currentImageObjectURL) URL.revokeObjectURL(currentImageObjectURL);
      currentImageObjectURL = objectUrl;
      state.uploadedImage = img;
      state.mode = 'image';
      if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
      $('source-label').textContent = '🖼️ ' + file.name.slice(0, 20);
      $('wrap-back-camera').style.display = '';
      stampCache.clear(); bgCache.key = '';
      showApp();
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      alert('Could not load that image file.');
    };
    img.src = objectUrl;
    if (e.target.value !== undefined) e.target.value = '';
  }

  // ---- Resize (debounced) ----
  let resizeTimer = 0;
  const resize = () => {
    const r = canvasWrap.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      canvas.width = r.width; canvas.height = r.height; bgCache.key = '';
    }
  };
  const debouncedResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  };

  // ---- Suffix for slider display ----
  function getSuffix(id) {
    return (id === 'slider-bead-size' || id === 'slider-bead-gap') ? '' : '%';
  }

  // ---- Bind Controls ----
  function bind() {
    // Cache invalidation is opt-in per control — only sliders that affect
    // stamp/bg appearance clear the relevant caches.
    const set = (id, key, valEl, transform, invalidate) => $(id).addEventListener('input', e => {
      const raw = +e.target.value;
      state[key] = transform ? transform(raw) : raw;
      if (valEl) $(valEl).textContent = e.target.value + getSuffix(id);
      if (invalidate) invalidate();
      if (state.mode === 'image') drawFrame(performance.now());
    });

    const clearStamps = () => stampCache.clear();
    // BUGFIX: invalidate bgCache on gap change — gap affects cellSize which
    // changes the pegboard dot spacing.
    const clearBG = () => { bgCache.key = ''; };

    // Bead size changes the stamp bitmap itself -> must clear stamp cache.
    set('slider-bead-size', 'beadSize', 'val-bead-size', null, clearStamps);
    // BUGFIX: gap changes cellSize which changes pegboard dot positions -> invalidate bg cache.
    set('slider-bead-gap', 'gap', 'val-bead-gap', null, clearBG);
    // Convert 0-100 slider to 0-1 float for rendering math
    set('slider-bead-3d', 'effect3d', 'val-bead-3d', v => v / 100, clearStamps);
    // Brightness/contrast/saturation only affect the CSS filter on the
    // offscreen source draw — they never touch stamp or background caches.
    set('slider-brightness', 'brightness', 'val-brightness');
    set('slider-contrast', 'contrast', 'val-contrast');
    set('slider-saturation', 'saturation', 'val-saturation');

    $('toggle-dither').onchange = e => { state.dither = e.target.checked; if (state.mode === 'image') drawFrame(performance.now()); };
    $('toggle-mirror').onchange = e => { state.mirror = e.target.checked; if (state.mode === 'image') drawFrame(performance.now()); };
    $('toggle-grid').onchange = e => { state.showGrid = e.target.checked; if (state.mode === 'image') drawFrame(performance.now()); };

    document.querySelectorAll('.shape-btn').forEach(b => b.onclick = () => {
      document.querySelectorAll('.shape-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); state.shape = b.dataset.shape; stampCache.clear();
      if (state.mode === 'image') drawFrame(performance.now());
    });
    document.querySelectorAll('.palette-btn').forEach(b => b.onclick = () => {
      document.querySelectorAll('.palette-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); state.palette = b.dataset.palette; stampCache.clear();
      if (state.mode === 'image') drawFrame(performance.now());
    });
    document.querySelectorAll('.bg-btn').forEach(b => b.onclick = () => {
      document.querySelectorAll('.bg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); state.bgStyle = b.dataset.bg; bgCache.key = '';
      if (state.mode === 'image') drawFrame(performance.now());
    });

    // Camera start — only show app if camera actually succeeded.
    $('btn-start').onclick = async () => {
      const ok = await startCamera('user');
      if (ok) showApp();
    };

    $('btn-upload-splash').onclick = () => fileInput.click();
    $('btn-upload-panel').onclick = () => fileInput.click();
    fileInput.onchange = handleFileInput;

    $('btn-back-camera').onclick = async () => {
      state.uploadedImage = null;
      await startCamera('user');
      $('wrap-back-camera').style.display = 'none';
      $('source-label').textContent = '📷 Live Camera';
    };

    $('btn-pause').onclick = () => {
      state.paused = !state.paused;
      $('btn-pause').textContent = state.paused ? '▶ Resume' : '⏸ Pause';
    };

    const doCapture = () => {
      flashEl.classList.add('flash');
      setTimeout(() => flashEl.classList.remove('flash'), 150);
      const toast = $('capture-toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
      canvas.toBlob(b => {
        // toBlob can return null under memory pressure — guard it.
        if (!b) { alert('Capture failed — please try again.'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `beadcam-${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      });
    };
    $('btn-capture').onclick = doCapture;
    $('btn-capture-float').onclick = doCapture;

    $('btn-switch-cam').onclick = async () => {
      state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
      if (state.mode === 'camera') await startCamera(state.facingMode);
    };

    // Panel toggle — applies .panel-closed on the app root.
    $('btn-toggle-panel').onclick = () => {
      appEl.classList.toggle('panel-closed');
      resize();
    };

    $('btn-fullscreen').onclick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen && document.exitFullscreen();
      }
    };

    canvasWrap.addEventListener('dragover', e => { e.preventDefault(); canvasWrap.classList.add('drag-over'); });
    canvasWrap.addEventListener('dragleave', () => canvasWrap.classList.remove('drag-over'));
    canvasWrap.addEventListener('drop', e => {
      e.preventDefault(); canvasWrap.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFileInput({ target: { files: [file] } });
      }
    });

    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'c' || e.key === 'C') doCapture();
      if (e.key === ' ') { e.preventDefault(); $('btn-pause').click(); }
      if (e.key === 'f' || e.key === 'F') $('btn-fullscreen').click();
    });

    // PRODUCTION: prefer ResizeObserver for more reliable resize detection
    // (handles panel toggle, flexbox reflow, etc.). Fall back to window resize.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(debouncedResize);
      ro.observe(canvasWrap);
    } else {
      window.addEventListener('resize', debouncedResize);
    }
    // Always listen for fullscreen changes, since ResizeObserver may not
    // fire during fullscreen transitions on all browsers.
    window.addEventListener('fullscreenchange', resize);
    // Safari (older versions) fires a vendor-prefixed event instead.
    document.addEventListener('webkitfullscreenchange', resize);

    // PRODUCTION HYGIENE: release the camera and any blob URL when the
    // page is actually going away.
    window.addEventListener('pagehide', () => {
      if (state.stream) state.stream.getTracks().forEach(t => t.stop());
      if (currentImageObjectURL) URL.revokeObjectURL(currentImageObjectURL);
    });
  }

  bind();
})();