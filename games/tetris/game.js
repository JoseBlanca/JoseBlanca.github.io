// Tetris — modern, glowing, with ghost / hold / next preview.
// - 7-bag randomizer, basic SRS-ish wall kicks, lock delay with reset cap.
// - Fixed-timestep loop with HiDPI canvas (matches the snake game's feel).
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// === Constants ============================================================

const COLS = 10;
const ROWS = 20;
const STORAGE_KEY = 'tetris:best:v1';

const COLORS = {
  bg:          '#0a0e27',
  grid:        'rgba(255, 255, 255, 0.035)',
  border:      'rgba(255, 255, 255, 0.10)',
  panel:       'rgba(255, 255, 255, 0.025)',
  panelBorder: 'rgba(255, 255, 255, 0.08)',
  text:        '#e6ecff',
  dim:         '#7a83b8',
  accent:      '#7cf9ff',
};

const PIECE_DEFS = {
  I: { box: 4, color: '#00f0ff', cells: [[0,1],[1,1],[2,1],[3,1]] },
  O: { box: 2, color: '#ffd000', cells: [[0,0],[1,0],[0,1],[1,1]] },
  T: { box: 3, color: '#b46aff', cells: [[1,0],[0,1],[1,1],[2,1]] },
  S: { box: 3, color: '#4cf07c', cells: [[1,0],[2,0],[0,1],[1,1]] },
  Z: { box: 3, color: '#ff4d6e', cells: [[0,0],[1,0],[1,1],[2,1]] },
  J: { box: 3, color: '#4a8cff', cells: [[0,0],[0,1],[1,1],[2,1]] },
  L: { box: 3, color: '#ff9344', cells: [[2,0],[0,1],[1,1],[2,1]] },
};
const PIECE_TYPES = Object.keys(PIECE_DEFS);

// 4 rotation states (90° CW each), pre-computed once per piece.
const PIECE_ROTATIONS = (() => {
  const out = {};
  for (const t of PIECE_TYPES) {
    const def = PIECE_DEFS[t];
    const states = [def.cells];
    for (let i = 0; i < 3; i++) {
      const prev = states[i];
      states.push(prev.map(([x, y]) => [def.box - 1 - y, x]));
    }
    out[t] = states;
  }
  return out;
})();

// Wall kicks: try in order when a rotation collides.
const KICKS = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1]];

const DAS = 0.15;            // delay before auto-shift kicks in
const ARR = 0.04;            // auto-shift rate
const SOFT_DROP = 0.035;     // soft-drop interval per cell
const LOCK_DELAY = 0.5;      // grace before piece locks on the floor
const MAX_LOCK_RESETS = 15;
const LINE_SCORES = [0, 100, 300, 500, 800];
const LINE_LABELS = ['', '', 'DOUBLE', 'TRIPLE', 'TETRIS!'];

// === Layout (HiDPI) =======================================================

let viewW = 0, viewH = 0;
let cell = 24;
let boardX = 0, boardY = 0;
let holdX = 0, holdY = 0;
let nextX = 0, nextY = 0;
let panelInner = 96;
let panelW = 120;
const PANEL_PAD = 12;
const PANEL_GAP = 14;
let showPanels = true;

function fit() {
  const dpr = window.devicePixelRatio || 1;
  viewW = canvas.clientWidth;
  viewH = canvas.clientHeight;
  canvas.width = viewW * dpr;
  canvas.height = viewH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padTop = 92;
  const padBottom = 24;
  const padX = 14;

  // 18 = 10 board cells + 2 × 4 panel cells.
  const cellWithPanels = Math.floor(Math.min(
    (viewW - padX * 2 - PANEL_GAP * 2 - PANEL_PAD * 4) / 18,
    (viewH - padTop - padBottom) / 20,
  ));
  const cellNoPanels = Math.floor(Math.min(
    (viewW - padX * 2) / 10,
    (viewH - padTop - padBottom) / 20,
  ));
  if (cellWithPanels >= 14) {
    cell = Math.max(8, Math.min(cellWithPanels, 38));
    showPanels = true;
  } else {
    cell = Math.max(8, Math.min(cellNoPanels, 38));
    showPanels = false;
  }

  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  boardX = Math.floor((viewW - boardW) / 2);
  boardY = padTop + Math.floor((viewH - padTop - padBottom - boardH) / 2);

  panelInner = cell * 4;
  panelW = panelInner + PANEL_PAD * 2;
  holdX = boardX - PANEL_GAP - panelW;
  holdY = boardY;
  nextX = boardX + boardW + PANEL_GAP;
  nextY = boardY;
}
addEventListener('resize', fit);
fit();

// === Input ================================================================

const pressed = new Set();
const held = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
  if ([
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
    'Space','KeyP','KeyC',
  ].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => { held.clear(); pressed.clear(); if (!gameOver) paused = true; });

// === Game state ===========================================================

let board;
let piece;          // { type, rot, x, y }
let nextQueue;
let bag;
let hold;
let canHold;
let score, best, level, lines;
let dropTimer;
let dropInterval;
let lockTimer;
let lockResets;
let dasDir, dasTimer, arrTimer;
let softDropAcc;
let particles;
let clearAnim;      // { rows, t, duration }
let toast;          // { text, color, t, duration }
let flash;
let gameOver;
let paused;

best = readBest();

function readBest() {
  try { return Number.parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
function writeBest(n) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
}

function reset() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = [];
  nextQueue = [];
  hold = null;
  canHold = true;
  score = 0;
  level = 1;
  lines = 0;
  particles = [];
  clearAnim = null;
  toast = null;
  flash = 0;
  gameOver = false;
  paused = false;
  lockTimer = 0;
  lockResets = 0;
  dropTimer = 0;
  dasDir = 0;
  dasTimer = 0;
  arrTimer = 0;
  softDropAcc = 0;
  refillNext();
  updateGravity();
  spawnPiece();
}

function refillBag() {
  bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function refillNext() {
  while (nextQueue.length < 5) {
    if (bag.length === 0) refillBag();
    nextQueue.push(bag.shift());
  }
}

function spawnPiece(typeOverride = null) {
  refillNext();
  const type = typeOverride ?? nextQueue.shift();
  refillNext();
  const def = PIECE_DEFS[type];
  const x = Math.floor((COLS - def.box) / 2);
  const y = -1;
  if (collides(type, 0, x, y)) {
    triggerGameOver();
    return;
  }
  piece = { type, rot: 0, x, y };
  dropTimer = 0;
  lockTimer = 0;
  lockResets = 0;
}

function updateGravity() {
  dropInterval = Math.max(0.05, Math.pow(0.85, level - 1) * 0.8);
}

function collides(type, rot, px, py) {
  const cells = PIECE_ROTATIONS[type][rot];
  for (const [dx, dy] of cells) {
    const cx = px + dx;
    const cy = py + dy;
    if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
    if (cy >= 0 && board[cy][cx]) return true;
  }
  return false;
}

function tryMove(dx, dy) {
  if (!piece) return false;
  if (collides(piece.type, piece.rot, piece.x + dx, piece.y + dy)) return false;
  piece.x += dx;
  piece.y += dy;
  noteMovement();
  return true;
}

function rotatePiece(dir) {
  if (!piece) return;
  if (PIECE_DEFS[piece.type].box === 2) return; // O — visually identical
  const newRot = (piece.rot + (dir > 0 ? 1 : 3)) % 4;
  for (const [kx, ky] of KICKS) {
    if (!collides(piece.type, newRot, piece.x + kx, piece.y + ky)) {
      piece.x += kx;
      piece.y += ky;
      piece.rot = newRot;
      noteMovement();
      return;
    }
  }
}

// Reset the lock timer when the piece moves while resting on the floor;
// a movement made in mid-air just zeroes the timer without consuming a reset.
function noteMovement() {
  if (!piece) return;
  if (collides(piece.type, piece.rot, piece.x, piece.y + 1)) {
    if (lockResets < MAX_LOCK_RESETS) {
      lockTimer = 0;
      lockResets++;
    }
  } else {
    lockTimer = 0;
  }
}

function ghostY() {
  if (!piece) return 0;
  let dy = 0;
  while (!collides(piece.type, piece.rot, piece.x, piece.y + dy + 1)) dy++;
  return piece.y + dy;
}

function hardDrop() {
  if (!piece) return;
  const target = ghostY();
  const drop = target - piece.y;
  piece.y = target;
  score += drop * 2;
  lockPiece();
}

function holdPiece() {
  if (!canHold || !piece) return;
  const swap = hold;
  hold = piece.type;
  piece = null;
  if (swap) spawnPiece(swap);
  else spawnPiece();
  canHold = false;
}

function lockPiece() {
  if (!piece) return;
  for (const [dx, dy] of PIECE_ROTATIONS[piece.type][piece.rot]) {
    const cx = piece.x + dx;
    const cy = piece.y + dy;
    if (cy >= 0) board[cy][cx] = PIECE_DEFS[piece.type].color;
  }
  piece = null;
  canHold = true;

  const fullRows = [];
  for (let y = 0; y < ROWS; y++) {
    if (board[y].every((c) => c)) fullRows.push(y);
  }

  if (fullRows.length === 0) {
    spawnPiece();
  } else {
    clearAnim = { rows: fullRows, t: 0, duration: 0.32 };
  }
}

function finishClear() {
  const rows = clearAnim.rows.slice();
  const rowSet = new Set(rows);
  const newRows = [];
  for (let y = 0; y < ROWS; y++) {
    if (!rowSet.has(y)) newRows.push(board[y]);
  }
  while (newRows.length < ROWS) newRows.unshift(Array(COLS).fill(null));
  board = newRows;

  const n = rows.length;
  lines += n;
  score += LINE_SCORES[n] * level;
  if (score > best) { best = score; writeBest(best); }
  const newLevel = 1 + Math.floor(lines / 10);
  if (newLevel > level) {
    level = newLevel;
    updateGravity();
  }
  if (LINE_LABELS[n]) {
    toast = {
      text: LINE_LABELS[n],
      color: n === 4 ? COLORS.accent : COLORS.text,
      t: 0,
      duration: 1.0,
    };
  }
  for (const r of rows) {
    for (let x = 0; x < COLS; x++) {
      burstAt(x, r, n === 4 ? COLORS.accent : '#ffffff');
    }
  }
  if (n === 4) flash = 0.18;
  clearAnim = null;
  spawnPiece();
}

function triggerGameOver() {
  gameOver = true;
  if (score > best) { best = score; writeBest(best); }
  flash = 0.45;
  piece = null;
  // Sparse confetti from the locked board.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x] && Math.random() < 0.18) burstAt(x, y, board[y][x]);
    }
  }
}

function burstAt(cellX, cellY, color) {
  const cx = boardX + cellX * cell + cell / 2;
  const cy = boardY + cellY * cell + cell / 2;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 180;
    const life = 0.35 + Math.random() * 0.4;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 30,
      life, maxLife: life,
      color,
    });
  }
}

// === Update ===============================================================

function update(dt) {
  // Decorative state always advances (so particles fade even when paused / over).
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.vy += 380 * dt;
    p.life -= dt;
  }
  if (particles.length) particles = particles.filter((p) => p.life > 0);
  if (flash > 0) flash = Math.max(0, flash - dt * 2);
  if (toast) {
    toast.t += dt;
    if (toast.t >= toast.duration) toast = null;
  }

  if (gameOver) {
    if (pressed.has('Enter') || pressed.has('Space') || pressed.has('KeyR')) reset();
    pressed.clear();
    return;
  }

  if (paused) {
    if (pressed.has('KeyP') || pressed.has('Escape') ||
        pressed.has('Space') || pressed.has('Enter')) {
      paused = false;
    }
    pressed.clear();
    return;
  }

  if (pressed.has('KeyP') || pressed.has('Escape')) {
    paused = true;
    pressed.clear();
    return;
  }

  if (clearAnim) {
    clearAnim.t += dt;
    if (clearAnim.t >= clearAnim.duration) finishClear();
    pressed.clear();
    return;
  }

  if (!piece) {
    pressed.clear();
    return;
  }

  // Edge-triggered actions.
  if (pressed.has('ArrowUp') || pressed.has('KeyW') || pressed.has('KeyX')) rotatePiece(1);
  if (pressed.has('KeyZ')) rotatePiece(-1);
  if (pressed.has('Space')) hardDrop();
  if (pressed.has('KeyC') || pressed.has('ShiftLeft') || pressed.has('ShiftRight')) holdPiece();

  // Horizontal DAS / ARR.
  let dir = 0;
  if (held.has('ArrowLeft')  || held.has('KeyA')) dir = -1;
  if (held.has('ArrowRight') || held.has('KeyD')) dir =  1;
  if (dir !== dasDir) {
    dasDir = dir;
    dasTimer = 0;
    arrTimer = 0;
    if (dir !== 0) tryMove(dir, 0);
  } else if (dir !== 0) {
    dasTimer += dt;
    if (dasTimer >= DAS) {
      arrTimer += dt;
      while (arrTimer >= ARR) {
        if (!tryMove(dir, 0)) { arrTimer = 0; break; }
        arrTimer -= ARR;
      }
    }
  }

  // Soft drop.
  if (piece && (held.has('ArrowDown') || held.has('KeyS'))) {
    softDropAcc += dt;
    while (piece && softDropAcc >= SOFT_DROP) {
      softDropAcc -= SOFT_DROP;
      if (tryMove(0, 1)) score++;
      else { softDropAcc = 0; break; }
    }
  } else {
    softDropAcc = 0;
  }

  pressed.clear();
  if (!piece) return; // hard drop / lock may have nullified

  // Gravity.
  dropTimer += dt;
  while (piece && dropTimer >= dropInterval) {
    dropTimer -= dropInterval;
    if (collides(piece.type, piece.rot, piece.x, piece.y + 1)) break;
    piece.y++;
  }

  // Lock delay.
  if (piece && collides(piece.type, piece.rot, piece.x, piece.y + 1)) {
    lockTimer += dt;
    if (lockTimer >= LOCK_DELAY) lockPiece();
  } else {
    lockTimer = 0;
    lockResets = 0;
  }
}

// === Render ===============================================================

function drawBlock(x, y, color, size = cell, options = {}) {
  const { glow = 18, alpha = 1, ghost = false, pad = 1 } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (ghost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2, size * 0.18);
    ctx.stroke();
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Soft top-down highlight.
    const grad = ctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.30)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoardBg() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  // Slight inset behind the play area for depth.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
  ctx.fillRect(boardX, boardY, COLS * cell, ROWS * cell);

  // Grid.
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x++) {
    const px = boardX + x * cell + 0.5;
    ctx.moveTo(px, boardY);
    ctx.lineTo(px, boardY + ROWS * cell);
  }
  for (let y = 0; y <= ROWS; y++) {
    const py = boardY + y * cell + 0.5;
    ctx.moveTo(boardX, py);
    ctx.lineTo(boardX + COLS * cell, py);
  }
  ctx.stroke();

  // Border.
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX - 1, boardY - 1, COLS * cell + 2, ROWS * cell + 2);
}

function drawLockedBoard() {
  const flashRows = clearAnim ? new Set(clearAnim.rows) : null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = board[y][x];
      if (!c) continue;
      const px = boardX + x * cell;
      const py = boardY + y * cell;
      if (flashRows && flashRows.has(y)) {
        const t = clearAnim.t / clearAnim.duration;
        // Flash white, then fade out.
        const a = Math.max(0, 1 - t);
        const blend = Math.min(1, t * 2);
        ctx.save();
        ctx.globalAlpha = 1 - blend * 0.4;
        drawBlock(px, py, c);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = a;
        drawBlock(px, py, '#ffffff', cell, { glow: 36 });
        ctx.restore();
      } else {
        drawBlock(px, py, c);
      }
    }
  }
}

function drawGhost() {
  if (!piece || gameOver) return;
  const gy = ghostY();
  if (gy === piece.y) return;
  const color = PIECE_DEFS[piece.type].color;
  for (const [dx, dy] of PIECE_ROTATIONS[piece.type][piece.rot]) {
    const cx = piece.x + dx;
    const cy = gy + dy;
    if (cy < 0) continue;
    drawBlock(boardX + cx * cell, boardY + cy * cell, color, cell, { ghost: true, alpha: 0.42 });
  }
}

function drawPiece() {
  if (!piece) return;
  const color = PIECE_DEFS[piece.type].color;
  // Pulse the glow slightly when the piece is on the floor and lock timer is ticking.
  const onGround = collides(piece.type, piece.rot, piece.x, piece.y + 1);
  const lockProgress = onGround ? lockTimer / LOCK_DELAY : 0;
  const glow = 22 + lockProgress * 14;
  for (const [dx, dy] of PIECE_ROTATIONS[piece.type][piece.rot]) {
    const cx = piece.x + dx;
    const cy = piece.y + dy;
    if (cy < 0) continue;
    drawBlock(boardX + cx * cell, boardY + cy * cell, color, cell, { glow });
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5 * a + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPanelFrame(x, y, h, label) {
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, panelW, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.dim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + PANEL_PAD, y + 9);
}

// Draw a piece centered inside a square area of the given size.
function drawPieceInBox(type, x, y, size) {
  const def = PIECE_DEFS[type];
  const cells = PIECE_ROTATIONS[type][0];
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const [dx, dy] of cells) {
    if (dx < minX) minX = dx;
    if (dy < minY) minY = dy;
    if (dx > maxX) maxX = dx;
    if (dy > maxY) maxY = dy;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const block = Math.floor(Math.min(size / Math.max(w, h), size / 4) * 0.95);
  const px = x + (size - w * block) / 2 - minX * block;
  const py = y + (size - h * block) / 2 - minY * block;
  for (const [dx, dy] of cells) {
    drawBlock(px + dx * block, py + dy * block, def.color, block, { glow: 14 });
  }
}

function drawHoldPanel() {
  if (!showPanels) return;
  const slot = panelInner;
  const h = 26 + PANEL_PAD * 2 + slot;
  drawPanelFrame(holdX, holdY, h, 'HOLD');
  if (hold) {
    ctx.save();
    ctx.globalAlpha = canHold ? 1 : 0.4;
    drawPieceInBox(hold, holdX + PANEL_PAD, holdY + 26 + PANEL_PAD, slot);
    ctx.restore();
  }
  // Key hint under the box.
  ctx.fillStyle = COLORS.dim;
  ctx.font = '500 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('C / SHIFT', holdX + panelW / 2, holdY + h + 6);
}

function drawNextPanel() {
  if (!showPanels) return;
  const slot = Math.max(36, panelInner * 0.7);
  const h = 26 + PANEL_PAD * 2 + slot * 3;
  drawPanelFrame(nextX, nextY, h, 'NEXT');
  for (let i = 0; i < 3 && i < nextQueue.length; i++) {
    const py = nextY + 26 + PANEL_PAD + i * slot;
    ctx.save();
    if (i > 0) ctx.globalAlpha = 0.7 - (i - 1) * 0.25;
    drawPieceInBox(nextQueue[i], nextX + PANEL_PAD, py, slot);
    ctx.restore();
  }
}

function drawHUD() {
  const stats = [
    { label: 'SCORE', value: score.toLocaleString(), color: COLORS.text },
    { label: 'BEST',  value: best.toLocaleString(),  color: COLORS.accent },
    { label: 'LEVEL', value: String(level),          color: COLORS.text },
    { label: 'LINES', value: String(lines),          color: COLORS.text },
  ];
  const labelY = boardY - 60;
  const valueY = boardY - 42;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let x = boardX;
  const colW = 105;
  for (const s of stats) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(s.label, x, labelY);
    ctx.fillStyle = s.color;
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.fillText(s.value, x, valueY);
    x += colW;
  }

  // Right-side hint, only if there's room next to the HUD columns.
  if (boardX + COLS * cell - x > 100) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('← → move · ↑/X rotate · ⎵ drop · C hold · P pause',
      boardX + COLS * cell, valueY + 8);
  }
}

function drawToast() {
  if (!toast) return;
  const t = toast.t / toast.duration;
  const fadeIn = Math.min(1, t / 0.18);
  const fadeOut = Math.min(1, (1 - t) / 0.4);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const yOffset = -28 * t;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = toast.color;
  ctx.shadowColor = toast.color;
  ctx.shadowBlur = 26;
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText(toast.text, boardX + COLS * cell / 2, boardY + 130 + yOffset);
  ctx.restore();
}

function drawOverlay(title, subtitle, hint) {
  ctx.fillStyle = 'rgba(10, 14, 39, 0.78)';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLORS.text;
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText(title, viewW / 2, viewH / 2 - 30);

  if (subtitle) {
    ctx.fillStyle = COLORS.accent;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText(subtitle, viewW / 2, viewH / 2 + 14);
  }

  ctx.fillStyle = COLORS.dim;
  ctx.font = '500 14px system-ui, sans-serif';
  ctx.fillText(hint, viewW / 2, viewH / 2 + 50);
}

function render() {
  drawBoardBg();
  drawHoldPanel();
  drawNextPanel();
  drawGhost();
  drawLockedBoard();
  drawPiece();
  drawParticles();
  drawHUD();
  drawToast();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (gameOver) {
    drawOverlay(
      'GAME OVER',
      `Score ${score.toLocaleString()}  ·  Best ${best.toLocaleString()}`,
      'Press SPACE to play again',
    );
  } else if (paused) {
    drawOverlay('PAUSED', '', 'Press P to resume');
  }
}

// === Loop =================================================================

const STEP_MS = 1000 / 60;
const MAX_FRAME = 250;
let acc = 0, last = performance.now();

function frame(now) {
  let elapsed = now - last;
  last = now;
  if (elapsed > MAX_FRAME) elapsed = MAX_FRAME;
  acc += elapsed;
  while (acc >= STEP_MS) {
    update(STEP_MS / 1000);
    acc -= STEP_MS;
  }
  render();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);

addEventListener('focus', () => { last = performance.now(); });
