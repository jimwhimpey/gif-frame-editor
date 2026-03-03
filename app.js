import { parseGIF, decompressFrames } from 'https://esm.sh/gifuct-js@2.1.2';

// ── State ──────────────────────────────────────────────────────────
let frames = [];        // { imageData, delay, selected }
let gifWidth = 0;
let gifHeight = 0;
let playing = false;
let playTimer = null;
let currentFrame = 0;

// ── Undo stack ─────────────────────────────────────────────────────
const undoStack = [];
const MAX_UNDO = 30;

function pushUndo() {
  undoStack.push({
    frames: frames.map(f => ({
      imageData: f.imageData, // ImageData is not mutated, safe to share reference
      delay: f.delay,
      selected: f.selected,
    })),
    currentFrame,
  });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  syncUndoButton();
}

function popUndo() {
  if (undoStack.length === 0) return;
  const snapshot = undoStack.pop();
  frames = snapshot.frames;
  currentFrame = Math.min(snapshot.currentFrame, frames.length - 1);
  lastClickedIndex = null;
  renderFrameCards();
  showFrame(currentFrame);
  syncUndoButton();
}

function syncUndoButton() {
  const btn = document.getElementById('btn-undo');
  btn.disabled = undoStack.length === 0;
}

// ── DOM refs ───────────────────────────────────────────────────────
const uploadArea      = document.getElementById('upload-area');
const fileInput       = document.getElementById('file-input');
const editor          = document.getElementById('editor');
const previewCanvas   = document.getElementById('preview-canvas');
const previewCtx      = previewCanvas.getContext('2d');
const frameCounter    = document.getElementById('preview-frame-counter');
const framesContainer = document.getElementById('frames-container');
const selectionCount  = document.getElementById('selection-count');
const bulkDelay       = document.getElementById('bulk-delay');
const progressWrap    = document.getElementById('export-progress');
const progressFill    = document.getElementById('progress-fill');
const progressText    = document.getElementById('progress-text');

// ── Upload handling ────────────────────────────────────────────────
uploadArea.addEventListener('click', () => fileInput.click());

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

uploadArea.addEventListener('dragover', e => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) loadGif(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadGif(fileInput.files[0]);
});

// ── GIF loading (using gifuct-js) ────────────────────────────────
async function loadGif(file) {
  stopPlayback();
  frames = [];
  undoStack.length = 0;
  syncUndoButton();
  framesContainer.innerHTML = '';

  const buf = await file.arrayBuffer();
  let rawFrames;
  try {
    const gif = parseGIF(buf);
    rawFrames = decompressFrames(gif, true);
  } catch (err) {
    alert('Failed to parse GIF: ' + err.message);
    return;
  }

  if (!rawFrames.length) {
    alert('No frames found in GIF.');
    return;
  }

  gifWidth  = rawFrames[0].dims.width;
  gifHeight = rawFrames[0].dims.height;

  // Compositing canvas — handles disposal methods, partial frames, transparency
  const compCanvas = document.createElement('canvas');
  compCanvas.width = gifWidth;
  compCanvas.height = gifHeight;
  const compCtx = compCanvas.getContext('2d');

  const prevCanvas = document.createElement('canvas');
  prevCanvas.width = gifWidth;
  prevCanvas.height = gifHeight;
  const prevCtx = prevCanvas.getContext('2d');

  for (let i = 0; i < rawFrames.length; i++) {
    const raw = rawFrames[i];
    const { dims, delay, disposalType, patch } = raw;

    // Save state before drawing for dispose-to-previous
    if (disposalType === 3) {
      prevCtx.clearRect(0, 0, gifWidth, gifHeight);
      prevCtx.drawImage(compCanvas, 0, 0);
    }

    // Create ImageData from the RGBA patch
    const patchImageData = new ImageData(
      new Uint8ClampedArray(patch),
      dims.width,
      dims.height
    );

    // Draw patch onto a temp canvas, then composite onto the main canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = dims.width;
    tempCanvas.height = dims.height;
    tempCanvas.getContext('2d').putImageData(patchImageData, 0, 0);
    compCtx.drawImage(tempCanvas, dims.left, dims.top);

    // Capture the fully composited frame
    const frameImageData = compCtx.getImageData(0, 0, gifWidth, gifHeight);

    // GIF delay is in centiseconds; 0 or very small typically means 100ms
    const delayMs = (!delay || delay < 2) ? 100 : delay * 10;

    frames.push({
      imageData: frameImageData,
      delay: delayMs,
      selected: false,
    });

    // Handle disposal after capturing
    if (disposalType === 2) {
      compCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
    } else if (disposalType === 3) {
      compCtx.clearRect(0, 0, gifWidth, gifHeight);
      compCtx.drawImage(prevCanvas, 0, 0);
    }
  }

  previewCanvas.width = gifWidth;
  previewCanvas.height = gifHeight;

  uploadArea.classList.add('hidden');
  editor.classList.remove('hidden');

  renderFrameCards();
  showFrame(0);
}

// ── Frame card rendering ──────────────────────────────────────────
function renderFrameCards() {
  framesContainer.innerHTML = '';
  frames.forEach((frame, i) => {
    const card = document.createElement('div');
    card.className = 'frame-card' + (frame.selected ? ' selected' : '');
    card.dataset.index = i;

    const thumb = document.createElement('canvas');
    thumb.width = gifWidth;
    thumb.height = gifHeight;
    thumb.getContext('2d').putImageData(frame.imageData, 0, 0);
    card.appendChild(thumb);

    const check = document.createElement('div');
    check.className = 'frame-check';
    card.appendChild(check);

    const info = document.createElement('div');
    info.className = 'frame-info';

    const num = document.createElement('span');
    num.className = 'frame-number';
    num.textContent = `#${i + 1}`;
    info.appendChild(num);

    const delayInput = document.createElement('input');
    delayInput.type = 'number';
    delayInput.className = 'frame-delay-input';
    delayInput.min = 10;
    delayInput.max = 10000;
    delayInput.step = 10;
    delayInput.value = frame.delay;
    delayInput.title = 'Frame delay (ms)';
    delayInput.addEventListener('click', e => e.stopPropagation());
    delayInput.addEventListener('focus', () => pushUndo());
    delayInput.addEventListener('change', e => {
      frame.delay = Math.max(10, parseInt(e.target.value) || 100);
      e.target.value = frame.delay;
    });
    info.appendChild(delayInput);

    const ms = document.createElement('span');
    ms.textContent = 'ms';
    info.appendChild(ms);

    card.appendChild(info);

    card.addEventListener('click', e => {
      if (e.target.closest('.frame-delay-input')) return;

      if (e.shiftKey && lastClickedIndex !== null) {
        const start = Math.min(lastClickedIndex, i);
        const end   = Math.max(lastClickedIndex, i);
        const newState = !frame.selected;
        for (let j = start; j <= end; j++) {
          frames[j].selected = newState;
        }
      } else {
        frame.selected = !frame.selected;
      }
      lastClickedIndex = i;

      showFrame(i);
      syncSelectionUI();
    });

    framesContainer.appendChild(card);
  });
  syncSelectionUI();
}

let lastClickedIndex = null;

function syncSelectionUI() {
  const cards = framesContainer.querySelectorAll('.frame-card');
  let count = 0;
  frames.forEach((f, i) => {
    if (f.selected) count++;
    cards[i]?.classList.toggle('selected', f.selected);
  });
  selectionCount.textContent = `${count} selected`;
}

// ── Preview ────────────────────────────────────────────────────────
function showFrame(idx) {
  if (idx < 0 || idx >= frames.length) return;
  currentFrame = idx;
  previewCtx.putImageData(frames[idx].imageData, 0, 0);
  frameCounter.textContent = `Frame ${idx + 1} / ${frames.length}`;
}

// ── Playback ───────────────────────────────────────────────────────
function startPlayback() {
  if (frames.length === 0) return;
  playing = true;
  document.getElementById('icon-play').classList.add('hidden');
  document.getElementById('icon-pause').classList.remove('hidden');
  playNextFrame();
}

function playNextFrame() {
  if (!playing) return;
  showFrame(currentFrame);
  playTimer = setTimeout(() => {
    currentFrame = (currentFrame + 1) % frames.length;
    playNextFrame();
  }, frames[currentFrame].delay);
}

function stopPlayback() {
  playing = false;
  clearTimeout(playTimer);
  document.getElementById('icon-play')?.classList.remove('hidden');
  document.getElementById('icon-pause')?.classList.add('hidden');
}

document.getElementById('btn-play').addEventListener('click', () => {
  if (playing) stopPlayback();
  else startPlayback();
});

// ── Undo controls ────────────────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', () => popUndo());

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    popUndo();
  }
});

// ── Selection controls ─────────────────────────────────────────────
document.getElementById('btn-select-all').addEventListener('click', () => {
  frames.forEach(f => f.selected = true);
  syncSelectionUI();
});

document.getElementById('btn-select-none').addEventListener('click', () => {
  frames.forEach(f => f.selected = false);
  syncSelectionUI();
});

document.getElementById('btn-invert-selection').addEventListener('click', () => {
  frames.forEach(f => f.selected = !f.selected);
  syncSelectionUI();
});

// ── Bulk set timing ────────────────────────────────────────────────
document.getElementById('btn-set-delay').addEventListener('click', () => {
  pushUndo();
  const delay = Math.max(10, parseInt(bulkDelay.value) || 100);
  let changed = 0;
  frames.forEach(f => {
    if (f.selected) {
      f.delay = delay;
      changed++;
    }
  });
  if (changed === 0) {
    frames.forEach(f => f.delay = delay);
  }
  renderFrameCards();
  showFrame(currentFrame);
});

// ── Bulk remove frames ─────────────────────────────────────────────
document.getElementById('btn-remove-frames').addEventListener('click', () => {
  const selected = frames.filter(f => f.selected);
  if (selected.length === 0) return;
  if (selected.length === frames.length) {
    alert('Cannot remove all frames.');
    return;
  }
  pushUndo();
  frames = frames.filter(f => !f.selected);
  currentFrame = Math.min(currentFrame, frames.length - 1);
  lastClickedIndex = null;
  renderFrameCards();
  showFrame(currentFrame);
});

// ── Load new GIF ───────────────────────────────────────────────────
document.getElementById('btn-load-new').addEventListener('click', () => {
  stopPlayback();
  frames = [];
  framesContainer.innerHTML = '';
  editor.classList.add('hidden');
  uploadArea.classList.remove('hidden');
  fileInput.value = '';
});

// ── GIF Export ─────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => exportGif());

async function exportGif() {
  if (frames.length === 0) return;

  progressWrap.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Analyzing colors...';
  await sleep(50);

  const encoder = new GifEncoder(gifWidth, gifHeight);

  for (let i = 0; i < frames.length; i++) {
    const pct = Math.round(((i + 1) / frames.length) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `Encoding frame ${i + 1} / ${frames.length}...`;
    await sleep(0);

    const rgba = frames[i].imageData.data;
    const delay = Math.round(frames[i].delay / 10); // GIF delay is in centiseconds
    encoder.addFrame(rgba, delay);
  }

  progressText.textContent = 'Finalizing...';
  await sleep(0);

  const blob = encoder.finish();
  progressWrap.classList.add('hidden');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'edited.gif';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Minimal GIF89a Encoder ─────────────────────────────────────────
class GifEncoder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.frames = [];
  }

  addFrame(rgba, delay) {
    const { palette, indexed, transparentIndex } = this.quantize(rgba);
    this.frames.push({ palette, indexed, delay, transparentIndex });
  }

  quantize(rgba) {
    const colorCounts = new Map();
    const pixels = this.width * this.height;

    for (let i = 0; i < pixels; i++) {
      const off = i * 4;
      const a = rgba[off + 3];
      if (a < 128) continue;
      const r = rgba[off] & 0xF8;
      const g = rgba[off + 1] & 0xF8;
      const b = rgba[off + 2] & 0xF8;
      const key = (r << 16) | (g << 8) | b;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
    const maxColors = 255;
    const paletteColors = sorted.slice(0, maxColors).map(([key]) => [
      (key >> 16) & 0xFF,
      (key >> 8) & 0xFF,
      key & 0xFF,
    ]);

    const transparentIndex = paletteColors.length;
    paletteColors.push([0, 0, 0]);

    const colorTableSize = nextPow2(paletteColors.length);
    while (paletteColors.length < colorTableSize) {
      paletteColors.push([0, 0, 0]);
    }

    const lookup = new Map();
    for (let i = 0; i < transparentIndex; i++) {
      const [r, g, b] = paletteColors[i];
      const key = ((r & 0xF8) << 16) | ((g & 0xF8) << 8) | (b & 0xF8);
      if (!lookup.has(key)) lookup.set(key, i);
    }

    const indexed = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i++) {
      const off = i * 4;
      const a = rgba[off + 3];
      if (a < 128) {
        indexed[i] = transparentIndex;
        continue;
      }
      const r = rgba[off] & 0xF8;
      const g = rgba[off + 1] & 0xF8;
      const b = rgba[off + 2] & 0xF8;
      const key = (r << 16) | (g << 8) | b;
      const exact = lookup.get(key);
      if (exact !== undefined) {
        indexed[i] = exact;
      } else {
        indexed[i] = this.nearestColor(rgba[off], rgba[off+1], rgba[off+2], paletteColors, transparentIndex);
      }
    }

    return { palette: paletteColors, indexed, transparentIndex };
  }

  nearestColor(r, g, b, palette, limit) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < limit; i++) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  finish() {
    const buf = [];

    writeStr(buf, 'GIF89a');

    writeU16(buf, this.width);
    writeU16(buf, this.height);
    buf.push(0x00);
    buf.push(0x00);
    buf.push(0x00);

    // Netscape extension — infinite loop
    buf.push(0x21, 0xFF, 0x0B);
    writeStr(buf, 'NETSCAPE2.0');
    buf.push(0x03, 0x01);
    writeU16(buf, 0);
    buf.push(0x00);

    for (const frame of this.frames) {
      const { palette, indexed, delay, transparentIndex } = frame;
      const colorTableBits = log2(palette.length);

      // Graphic Control Extension
      buf.push(0x21, 0xF9, 0x04);
      buf.push(0x05); // dispose to bg + transparent flag
      writeU16(buf, delay);
      buf.push(transparentIndex);
      buf.push(0x00);

      // Image Descriptor
      buf.push(0x2C);
      writeU16(buf, 0);
      writeU16(buf, 0);
      writeU16(buf, this.width);
      writeU16(buf, this.height);
      buf.push(0x80 | (colorTableBits - 1));

      // Local Color Table
      for (let i = 0; i < palette.length; i++) {
        buf.push(palette[i][0], palette[i][1], palette[i][2]);
      }

      // LZW
      const minCodeSize = Math.max(2, colorTableBits);
      const lzwData = lzwEncode(indexed, minCodeSize);
      buf.push(minCodeSize);

      let offset = 0;
      while (offset < lzwData.length) {
        const chunkSize = Math.min(255, lzwData.length - offset);
        buf.push(chunkSize);
        for (let j = 0; j < chunkSize; j++) {
          buf.push(lzwData[offset + j]);
        }
        offset += chunkSize;
      }
      buf.push(0x00);
    }

    buf.push(0x3B);

    return new Blob([new Uint8Array(buf)], { type: 'image/gif' });
  }
}

// ── LZW Encoder ────────────────────────────────────────────────────
function lzwEncode(indexed, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const output = [];
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxTableSize = 4096;

  let table = new Map();
  function initTable() {
    table = new Map();
    for (let i = 0; i < clearCode; i++) {
      table.set(String(i), i);
    }
    nextCode = eoiCode + 1;
    codeSize = minCodeSize + 1;
  }

  let bitBuf = 0;
  let bitCount = 0;
  function writeBits(code, size) {
    bitBuf |= (code << bitCount);
    bitCount += size;
    while (bitCount >= 8) {
      output.push(bitBuf & 0xFF);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  }

  initTable();
  writeBits(clearCode, codeSize);

  if (indexed.length === 0) {
    writeBits(eoiCode, codeSize);
    if (bitCount > 0) output.push(bitBuf & 0xFF);
    return output;
  }

  let current = String(indexed[0]);

  for (let i = 1; i < indexed.length; i++) {
    const next = current + ',' + indexed[i];
    if (table.has(next)) {
      current = next;
    } else {
      writeBits(table.get(current), codeSize);
      if (nextCode < maxTableSize) {
        table.set(next, nextCode);
        nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        initTable();
      }
      current = String(indexed[i]);
    }
  }

  writeBits(table.get(current), codeSize);
  writeBits(eoiCode, codeSize);
  if (bitCount > 0) output.push(bitBuf & 0xFF);

  return output;
}

// ── Helpers ────────────────────────────────────────────────────────
function writeStr(buf, str) {
  for (let i = 0; i < str.length; i++) buf.push(str.charCodeAt(i));
}

function writeU16(buf, val) {
  buf.push(val & 0xFF, (val >> 8) & 0xFF);
}

function nextPow2(n) {
  let v = 2;
  while (v < n) v <<= 1;
  return Math.min(v, 256);
}

function log2(n) {
  let v = 0;
  let t = 1;
  while (t < n) { t <<= 1; v++; }
  return Math.max(v, 1);
}
