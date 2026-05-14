// ============================
// BeadCam — Pro Edition (Fixed Glitches)
// ============================

(() => {
  'use strict';

  // ---- Color Palettes ----
  const PALETTES = {
    natural: null,
    perler: [[0,0,0],[255,255,255],[205,50,50],[255,100,60],[255,170,60],[255,225,80],[100,180,70],[45,140,80],[50,160,200],[30,90,180],[75,60,155],[160,60,150],[200,100,160],[255,180,200],[140,90,60],[90,60,40],[180,180,180],[120,120,120],[255,200,150],[200,230,255],[180,255,200],[255,240,200],[220,200,255]],
    hama: [[0,0,0],[255,255,255],[210,40,40],[255,120,40],[255,200,50],[80,170,60],[40,120,190],[100,60,160],[230,100,170],[255,180,190],[160,100,60],[200,200,200],[100,100,100],[255,160,100],[50,180,180],[180,220,100],[255,220,180],[120,80,160]],
    pastel: [[255,182,193],[255,218,185],[255,255,186],[186,255,201],[186,225,255],[219,186,255],[255,200,221],[255,235,205],[230,255,220],[200,240,255],[240,220,255],[255,255,255],[220,220,220],[180,180,200]],
    neon: [[0,0,0],[255,0,102],[255,0,255],[0,255,255],[57,255,20],[255,255,0],[255,100,0],[0,100,255],[180,0,255],[255,50,50],[0,255,128],[255,200,0],[100,0,255],[255,255,255]],
    grayscale: [[0,0,0],[30,30,30],[60,60,60],[90,90,90],[120,120,120],[150,150,150],[180,180,180],[200,200,200],[220,220,220],[240,240,240],[255,255,255]]
  };

  // ---- State ----
  const state = {
    beadSize: 12, gap: 0, shape: 'circle', palette: 'natural',
    effect3d: 0.8, bgStyle: 'dark', mirror: true, showGrid: false,
    brightness: 100, contrast: 100, saturation: 100, dither: true,
    paused: false, facingMode: 'user', stream: null, mode: 'camera', uploadedImage: null
  };

  // ---- High-Precision LUT (32-bit depth for speed) ----
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
            const d = Math.pow(rr - pal[i][0], 2) + Math.pow(gg - pal[i][1], 2) + Math.pow(bb - pal[i][2], 2);
            if (d < minD) { minD = d; best = i; }
          }
          const idx = (r * 1024 + g * 32 + b) * 3;
          lut[idx] = pal[best][0]; lut[idx+1] = pal[best][1]; lut[idx+2] = pal[best][2];
        }
      }
    }
    colorLUTs.set(paletteName, lut);
    return lut;
  }

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const video = $('video'), canvas = $('bead-canvas'), ctx = canvas.getContext('2d');
  const canvasWrap = $('canvas-wrap'), fpsEl = $('fps-counter');
  const beadCountEl = $('bead-counter'), flashEl = $('flash-overlay');
  const splash = $('splash'), appEl = $('app'), fileInput = $('file-input');
  
  const offscreen = document.createElement('canvas');
  const offCtx = offscreen.getContext('2d');

  // ---- Caching ----
  const stampCache = new Map();
  let lastStampSettings = "";
  const bgCache = { canvas: document.createElement('canvas'), key: "" };

  function getStamp(r, g, b) {
    // Numeric key is much faster
    const key = ((r & 0xF8) << 8) | ((g & 0xF8) << 3) | (b >> 3);
    if (stampCache.has(key)) return stampCache.get(key);
    
    const size = state.beadSize, radius = size / 2, ss = size + 2;
    const sc = document.createElement('canvas'); sc.width = ss; sc.height = ss;
    const sctx = sc.getContext('2d');
    const cx = ss / 2, cy = ss / 2, e3d = state.effect3d;

    sctx.beginPath();
    if (e3d > 0) {
      const grad = sctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.2, 0, cx, cy, radius);
      grad.addColorStop(0, `rgb(${Math.min(255, r + 60 * e3d)},${Math.min(255, g + 60 * e3d)},${Math.min(255, b + 60 * e3d)})`);
      grad.addColorStop(0.5, `rgb(${r},${g},${b})`);
      grad.addColorStop(1, `rgb(${Math.max(0, r - 50 * e3d)},${Math.max(0, g - 50 * e3d)},${Math.max(0, b - 50 * e3d)})`);
      sctx.fillStyle = grad;
    } else sctx.fillStyle = `rgb(${r},${g},${b})`;

    if (state.shape === 'circle') sctx.arc(cx, cy, radius, 0, Math.PI * 2);
    else if (state.shape === 'square') sctx.rect(cx - radius, cy - radius, size, size);
    else if (state.shape === 'diamond') { sctx.moveTo(cx, cy - radius); sctx.lineTo(cx + radius, cy); sctx.lineTo(cx, cy + radius); sctx.lineTo(cx - radius, cy); sctx.closePath(); }
    else if (state.shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const vx = cx + radius * Math.cos(a), vy = cy + radius * Math.sin(a);
        if (i === 0) sctx.moveTo(vx, vy); else sctx.lineTo(vx, vy);
      }
      sctx.closePath();
    }
    sctx.fill();
    
    if (e3d > 0.3 && state.shape === 'circle') {
      sctx.beginPath(); sctx.arc(cx, cy, radius * 0.15, 0, Math.PI * 2);
      sctx.fillStyle = 'rgba(0,0,0,0.15)'; sctx.fill();
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
      for (let x = cellSize / 2; x < cw; x += cellSize)
        for (let y = cellSize / 2; y < ch; y += cellSize)
          { bctx.beginPath(); bctx.arc(x, y, 1.2, 0, Math.PI * 2); bctx.fill(); }
    } else if (state.bgStyle === 'dark') { bctx.fillStyle = '#000'; bctx.fillRect(0, 0, cw, ch); }
    else if (state.bgStyle === 'light') { bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, cw, ch); }
    bgCache.key = key; return bgCache.canvas;
  }

  // ---- Dithering (Fixed Glitches with Float Array) ----
  function processColors(pixels, w, h, lut) {
    // Use Float32 for math to prevent clamping glitches
    const fData = new Float32Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) fData[i] = pixels[i];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const oldR = fData[i], oldG = fData[i + 1], oldB = fData[i + 2];
        
        let newR, newG, newB;
        if (lut) {
          // Clamp input to 0-255 before LUT lookup
          const rL = Math.max(0, Math.min(255, oldR)) >> 3;
          const gL = Math.max(0, Math.min(255, oldG)) >> 3;
          const bL = Math.max(0, Math.min(255, oldB)) >> 3;
          const lIdx = (rL * 1024 + gL * 32 + bL) * 3;
          newR = lut[lIdx]; newG = lut[lIdx + 1]; newB = lut[lIdx + 2];
        } else {
          newR = Math.max(0, Math.min(255, oldR));
          newG = Math.max(0, Math.min(255, oldG));
          newB = Math.max(0, Math.min(255, oldB));
        }

        pixels[i] = newR; pixels[i + 1] = newG; pixels[i + 2] = newB;

        if (state.dither) {
          const errR = (oldR - newR) * 0.6; // Reduced error factor to prevent artifacts
          const errG = (oldG - newG) * 0.6;
          const errB = (oldB - newB) * 0.6;
          
          if (x + 1 < w) { 
            const j = i + 4; fData[j] += errR * 7/16; fData[j+1] += errG * 7/16; fData[j+2] += errB * 7/16; 
          }
          if (y + 1 < h) {
            if (x > 0) { const j = i + (w - 1) * 4; fData[j] += errR * 3/16; fData[j+1] += errG * 3/16; fData[j+2] += errB * 3/16; }
            const j = i + w * 4; fData[j] += errR * 5/16; fData[j+1] += errG * 5/16; fData[j+2] += errB * 5/16;
            if (x + 1 < w) { const j = i + (w + 1) * 4; fData[j] += errR * 1/16; fData[j+1] += errG * 1/16; fData[j+2] += errB * 1/16; }
          }
        }
      }
    }
  }

  // ---- Core Render ----
  let lastTime = 0, frameCount = 0;
  function render(timestamp) {
    requestAnimationFrame(render);
    if (state.paused) return;

    const cw = canvas.width, ch = canvas.height;
    if (cw <= 0 || ch <= 0) return;

    let source = (state.mode === 'image') ? state.uploadedImage : video;
    if (!source || (state.mode === 'camera' && video.readyState < 2)) return;

    const cellSize = state.beadSize + state.gap;
    const cols = Math.floor(cw / cellSize), rows = Math.floor(ch / cellSize);
    if (cols <= 0 || rows <= 0) return;
    
    if (offscreen.width !== cols || offscreen.height !== rows) { offscreen.width = cols; offscreen.height = rows; }
    offCtx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%)`;
    offCtx.clearRect(0, 0, cols, rows);
    offCtx.save();
    if (state.mirror) { offCtx.translate(cols, 0); offCtx.scale(-1, 1); }
    
    if (state.mode === 'image') {
      const iw = source.width, ih = source.height, aspect = iw / ih, cAspect = cols / rows;
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
    
    ctx.drawImage(getBG(cw, ch, cellSize), 0, 0);
    const off = Math.ceil(state.beadSize / 2) + 1;
    const pData = imgData.data;

    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols * 4;
      const drawY = y * cellSize + cellSize / 2 - off;
      for (let x = 0; x < cols; x++) {
        const i = rowOff + x * 4;
        ctx.drawImage(getStamp(pData[i], pData[i+1], pData[i+2]), x * cellSize + cellSize / 2 - off, drawY);
      }
    }

    if (state.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5; ctx.beginPath();
      for (let x = 0; x <= cw; x += cellSize) { ctx.moveTo(x, 0); ctx.lineTo(x, ch); }
      for (let y = 0; y <= ch; y += cellSize) { ctx.moveTo(0, y); ctx.lineTo(cw, y); }
      ctx.stroke();
    }
    beadCountEl.textContent = (cols * rows).toLocaleString() + ' beads';

    frameCount++;
    if (timestamp - lastTime >= 1000) { fpsEl.textContent = frameCount + ' FPS'; frameCount = 0; lastTime = timestamp; }
  }

  // ---- Bind Controls ----
  function bind() {
    const set = (id, key, valEl) => $(id).addEventListener('input', e => { 
      state[key] = +e.target.value; 
      if (valEl) $(valEl).textContent = e.target.value + (id.includes('bead') ? '' : '%');
      bgCache.key = ""; 
      stampCache.clear();
      if (state.mode === 'image') render(performance.now());
    });
    
    set('slider-bead-size', 'beadSize', 'val-bead-size');
    set('slider-bead-gap', 'gap', 'val-bead-gap');
    set('slider-bead-3d', 'effect3d', 'val-bead-3d');
    set('slider-brightness', 'brightness', 'val-brightness');
    set('slider-contrast', 'contrast', 'val-contrast');
    set('slider-saturation', 'saturation', 'val-saturation');

    $('toggle-dither').onchange = e => { state.dither = e.target.checked; if(state.mode==='image') render(performance.now()); };
    $('toggle-mirror').onchange = e => { state.mirror = e.target.checked; if(state.mode==='image') render(performance.now()); };
    $('toggle-grid').onchange = e => { state.showGrid = e.target.checked; if(state.mode==='image') render(performance.now()); };
    
    document.querySelectorAll('.shape-btn').forEach(b => b.onclick = () => { 
      document.querySelectorAll('.shape-btn').forEach(x => x.classList.remove('active')); 
      b.classList.add('active'); 
      state.shape = b.dataset.shape; 
      stampCache.clear();
      if(state.mode==='image') render(performance.now()); 
    });
    document.querySelectorAll('.palette-btn').forEach(b => b.onclick = () => { 
      document.querySelectorAll('.palette-btn').forEach(x => x.classList.remove('active')); 
      b.classList.add('active'); 
      state.palette = b.dataset.palette; 
      stampCache.clear();
      if(state.mode==='image') render(performance.now()); 
    });
    document.querySelectorAll('.bg-btn').forEach(b => b.onclick = () => { 
      document.querySelectorAll('.bg-btn').forEach(x => x.classList.remove('active')); 
      b.classList.add('active'); 
      state.bgStyle = b.dataset.bg; 
      bgCache.key=""; 
      if(state.mode==='image') render(performance.now()); 
    });

    $('btn-start').onclick = async () => {
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        video.srcObject = state.stream; video.play();
        splash.classList.add('fade-out');
        setTimeout(() => { splash.style.display = 'none'; appEl.classList.remove('hidden'); resize(); }, 400);
        requestAnimationFrame(render);
      } catch(e) { alert("Camera Error: " + e.message); }
    };

    $('btn-upload-splash').onclick = () => fileInput.click();
    fileInput.onchange = e => {
      if (!e.target.files[0]) return;
      const img = new Image();
      img.onload = () => { 
        state.uploadedImage = img; state.mode = 'image'; 
        splash.classList.add('fade-out');
        setTimeout(() => { splash.style.display = 'none'; appEl.classList.remove('hidden'); resize(); }, 400);
        requestAnimationFrame(render);
      };
      img.src = URL.createObjectURL(e.target.files[0]);
    };

    $('btn-pause').onclick = () => { state.paused = !state.paused; $('btn-pause').textContent = state.paused ? '▶ Resume' : '⏸ Pause'; };
    $('btn-capture').onclick = $('btn-capture-float').onclick = () => {
      flashEl.classList.add('flash'); 
      setTimeout(() => flashEl.classList.remove('flash'), 100);
      
      const toast = $('capture-toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);

      canvas.toBlob(b => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `beadcam-${Date.now()}.png`; a.click();
      });
    };

    const resize = () => { const r = canvasWrap.getBoundingClientRect(); canvas.width = r.width; canvas.height = r.height; bgCache.key = ""; };
    window.onresize = resize;
  }

  bind();
})();
