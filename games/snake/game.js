// Snake — modern, glowing, smoothly interpolated, with classic Nibbles-style levels.
// - Logic ticks at a discrete step interval (gets faster within a level and per level).
// - Rendering interpolates between previous and current cell positions.
// - Fixed-timestep loop with HiDPI canvas.
// - 5 levels, eat APPLES_PER_LEVEL to advance. Snake resets between levels; score persists.
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- Constants ------------------------------------------------------------
const GRID_W = 22;
const GRID_H = 22;
const APPLES_PER_LEVEL = 5;

const COLORS = {
  bg:        '#0a0e27',
  grid:      'rgba(255, 255, 255, 0.035)',
  border:    'rgba(255, 255, 255, 0.10)',
  snakeHead: '#7cf9ff',
  snakeTail: '#0070b8',
  food:      '#ff3b6e',
  wall:      '#5562a8',
  text:      '#e6ecff',
  dim:       '#7a83b8',
  win:       '#7cffb0',
};

const STORAGE_KEY = 'snake:best:v1';

// --- Levels ---------------------------------------------------------------
function rect(x, y, w, h) {
  const cells = [];
  for (let dx = 0; dx < w; dx++)
    for (let dy = 0; dy < h; dy++)
      cells.push({ x: x + dx, y: y + dy });
  return cells;
}

const LEVELS = [
  {
    name: 'OPEN PLAINS',
    start: { x: 10, y: 11, dir: 'right' },
    walls: [],
  },
  {
    name: 'CORNERS',
    start: { x: 10, y: 11, dir: 'right' },
    walls: [
      ...rect(2, 2, 3, 3),
      ...rect(GRID_W - 5, 2, 3, 3),
      ...rect(2, GRID_H - 5, 3, 3),
      ...rect(GRID_W - 5, GRID_H - 5, 3, 3),
    ],
  },
  {
    name: 'BEAMS',
    start: { x: 10, y: 11, dir: 'right' },
    walls: [
      ...rect(3, 6, 16, 1),
      ...rect(3, 15, 16, 1),
    ],
  },
  {
    name: 'PILLARS',
    start: { x: 8, y: 11, dir: 'up' },
    walls: [
      ...rect(5, 3, 1, 16),
      ...rect(11, 3, 1, 16),
      ...rect(16, 3, 1, 16),
    ],
  },
  {
    name: 'THE CROSS',
    start: { x: 3, y: 1, dir: 'right' },
    walls: [
      ...rect(3, 11, 16, 1),
      ...rect(11, 3, 1, 16),
    ],
  },
];

// --- Layout (HiDPI + grid centering) --------------------------------------
let viewW = 0, viewH = 0;
let cellSize = 0;
let offsetX = 0, offsetY = 0;

function fit() {
  const dpr = window.devicePixelRatio || 1;
  viewW = canvas.clientWidth;
  viewH = canvas.clientHeight;
  canvas.width = viewW * dpr;
  canvas.height = viewH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const padTop = 80;
  const padBottom = 24;
  const padX = 24;
  const maxW = viewW - padX * 2;
  const maxH = viewH - padTop - padBottom;
  cellSize = Math.floor(Math.min(maxW / GRID_W, maxH / GRID_H));
  cellSize = Math.max(8, Math.min(cellSize, 36));
  offsetX = Math.floor((viewW - cellSize * GRID_W) / 2);
  offsetY = padTop + Math.floor((maxH - cellSize * GRID_H) / 2);
}
addEventListener('resize', fit);
fit();

// --- Input ----------------------------------------------------------------
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  pressed.add(e.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
    e.preventDefault();
});

let touchStart = null;
addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });
addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.hypot(dx, dy) < 24) { pressed.add('Space'); touchStart = null; return; }
  if (Math.abs(dx) > Math.abs(dy)) pressed.add(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  else                              pressed.add(dy > 0 ? 'ArrowDown'  : 'ArrowUp');
  touchStart = null;
}, { passive: true });

// --- Game state -----------------------------------------------------------
const DIRS = Object.freeze({
  up:    Object.freeze({ x: 0,  y: -1 }),
  down:  Object.freeze({ x: 0,  y:  1 }),
  left:  Object.freeze({ x: -1, y:  0 }),
  right: Object.freeze({ x: 1,  y:  0 }),
});

const STATE = { PLAY: 'play', LEVEL_DONE: 'levelDone', GAME_OVER: 'over', WIN: 'win' };

let state;          // STATE.*
let level;          // index into LEVELS
let snake;          // [{x, y, px, py}, ...] head at index 0; px/py = position before last step
let dir;            // current direction vector
const dirQueue = []; // pending direction changes (max 2), each validated vs the previous queued/current dir
let food;           // {x, y, t}
let particles = []; // [{x, y, vx, vy, life, maxLife, color}]
let wallCells = []; // [{x, y}, ...] for rendering
let wallSet = new Set(); // "x,y" strings for collision
let score = 0;
let best = readBest();
let applesThisLevel;
let stepInterval;
let stepAcc;
let flash;          // brief white flash on death
let stateTime;      // seconds in current non-PLAY state, used for overlay timing

function readBest() {
  try { return Number.parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
function writeBest(n) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
}

function isWall(x, y) {
  return wallSet.has(`${x},${y}`);
}

function queueDir(d) {
  const last = dirQueue.length ? dirQueue.at(-1) : dir;
  if (d.x === -last.x && d.y === -last.y) return; // opposite — would reverse into self
  if (d.x ===  last.x && d.y ===  last.y) return; // duplicate
  if (dirQueue.length < 2) dirQueue.push(d);
}

function makeStartSnake(start) {
  const d = DIRS[start.dir];
  // 3 segments: head at start, two more cells behind in -dir.
  // px/py is one more cell behind so the snake "slides in" on level entry.
  const out = [];
  for (let i = 0; i < 3; i++) {
    out.push({
      x:  start.x - d.x * i,
      y:  start.y - d.y * i,
      px: start.x - d.x * (i + 1),
      py: start.y - d.y * (i + 1),
    });
  }
  return out;
}

function recalcSpeed() {
  // Faster on higher levels and with more apples eaten this level.
  const base = Math.max(0.07, 0.13 - level * 0.012);
  stepInterval = Math.max(0.05, base * 0.97 ** applesThisLevel);
}

function loadLevel(idx) {
  const def = LEVELS[idx];
  wallCells = def.walls;
  wallSet = new Set(wallCells.map((c) => `${c.x},${c.y}`));
  snake = makeStartSnake(def.start);
  dir = DIRS[def.start.dir];
  dirQueue.length = 0;
  applesThisLevel = 0;
  spawnFood();
  particles = [];
  stepAcc = 0;
  flash = 0;
  recalcSpeed();
}

function newGame() {
  level = 0;
  score = 0;
  state = STATE.PLAY;
  stateTime = 0;
  loadLevel(level);
}

function advanceLevel() {
  level++;
  state = STATE.PLAY;
  stateTime = 0;
  loadLevel(level);
}

function spawnFood() {
  // Rejection sample until a free cell is found (not snake, not wall).
  for (;;) {
    const x = (Math.random() * GRID_W) | 0;
    const y = (Math.random() * GRID_H) | 0;
    if (isWall(x, y)) continue;
    if (snake.some((s) => s.x === x && s.y === y)) continue;
    food = { x, y, t: 0 };
    return;
  }
}

function burst(cellX, cellY, color) {
  const cx = offsetX + cellX * cellSize + cellSize / 2;
  const cy = offsetY + cellY * cellSize + cellSize / 2;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 160;
    const life = 0.4 + Math.random() * 0.4;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life, maxLife: life,
      color,
    });
  }
}

newGame();

// --- Step (logic) ---------------------------------------------------------
function step() {
  if (dirQueue.length) dir = dirQueue.shift();

  const oldHead = snake[0];
  const nx = oldHead.x + dir.x;
  const ny = oldHead.y + dir.y;

  // Bounds.
  if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) { die(); return; }
  // Walls.
  if (isWall(nx, ny)) { die(); return; }

  const ate = nx === food.x && ny === food.y;
  // When eating, tail stays — collide against full body. Otherwise tail moves out.
  const checkLen = ate ? snake.length : snake.length - 1;
  for (let i = 0; i < checkLen; i++) {
    if (snake[i].x === nx && snake[i].y === ny) { die(); return; }
  }

  // Snapshot current positions as "from" for interpolation.
  for (const s of snake) { s.px = s.x; s.py = s.y; }

  if (ate) {
    snake.unshift({ x: nx, y: ny, px: oldHead.x, py: oldHead.y });
    score++;
    applesThisLevel++;
    if (score > best) { best = score; writeBest(best); }
    burst(food.x, food.y, COLORS.food);

    if (applesThisLevel >= APPLES_PER_LEVEL) {
      // Level complete — don't spawn another apple.
      flash = 0.18;
      if (level + 1 < LEVELS.length) {
        state = STATE.LEVEL_DONE;
      } else {
        state = STATE.WIN;
      }
      stateTime = 0;
    } else {
      spawnFood();
      recalcSpeed();
    }
  } else {
    // Each segment takes the previous position of the segment in front.
    for (let i = snake.length - 1; i > 0; i--) {
      snake[i].x = snake[i - 1].x;
      snake[i].y = snake[i - 1].y;
    }
    snake[0].x = nx;
    snake[0].y = ny;
  }
}

function die() {
  state = STATE.GAME_OVER;
  stateTime = 0;
  flash = 0.25;
  for (const s of snake) burst(s.x, s.y, COLORS.snakeHead);
}

// --- Update (per fixed tick) ----------------------------------------------
function update(dt) {
  // Visual effects always update.
  if (flash > 0) flash = Math.max(0, flash - dt * 2);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  if (particles.length) particles = particles.filter((p) => p.life > 0);

  if (state !== STATE.PLAY) {
    stateTime += dt;
    // Allow input to advance state after a brief grace period (so a stray Space doesn't skip).
    const canAdvance = stateTime > 0.4;
    const wantsContinue = pressed.has('Space') || pressed.has('Enter');
    if (canAdvance && wantsContinue) {
      if (state === STATE.LEVEL_DONE) advanceLevel();
      else if (state === STATE.GAME_OVER || state === STATE.WIN) newGame();
    }
    pressed.clear();
    return;
  }

  // PLAY state.
  if (pressed.has('ArrowUp')    || pressed.has('KeyW')) queueDir(DIRS.up);
  if (pressed.has('ArrowDown')  || pressed.has('KeyS')) queueDir(DIRS.down);
  if (pressed.has('ArrowLeft')  || pressed.has('KeyA')) queueDir(DIRS.left);
  if (pressed.has('ArrowRight') || pressed.has('KeyD')) queueDir(DIRS.right);
  pressed.clear();

  food.t += dt;
  stepAcc += dt;
  while (stepAcc >= stepInterval) {
    step();
    stepAcc -= stepInterval;
    if (state !== STATE.PLAY) { stepAcc = 0; break; }
  }
}

// --- Render ---------------------------------------------------------------
function lerpColor(a, b, t) {
  const ar = Number.parseInt(a.slice(1, 3), 16), ag = Number.parseInt(a.slice(3, 5), 16), ab = Number.parseInt(a.slice(5, 7), 16);
  const br = Number.parseInt(b.slice(1, 3), 16), bg = Number.parseInt(b.slice(3, 5), 16), bb = Number.parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const c = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${c})`;
}

function drawBoard() {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= GRID_W; x++) {
    const px = offsetX + x * cellSize + 0.5;
    ctx.moveTo(px, offsetY);
    ctx.lineTo(px, offsetY + GRID_H * cellSize);
  }
  for (let y = 0; y <= GRID_H; y++) {
    const py = offsetY + y * cellSize + 0.5;
    ctx.moveTo(offsetX, py);
    ctx.lineTo(offsetX + GRID_W * cellSize, py);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX - 1, offsetY - 1, GRID_W * cellSize + 2, GRID_H * cellSize + 2);
}

function drawWalls() {
  if (!wallCells.length) return;
  ctx.save();
  ctx.shadowColor = COLORS.wall;
  ctx.shadowBlur = 10;
  ctx.fillStyle = COLORS.wall;
  for (const c of wallCells) {
    const x = offsetX + c.x * cellSize;
    const y = offsetY + c.y * cellSize;
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3, 4);
    ctx.fill();
  }
  ctx.restore();
}

function drawFood() {
  if (state !== STATE.PLAY) return; // hide between levels
  const cx = offsetX + food.x * cellSize + cellSize / 2;
  const cy = offsetY + food.y * cellSize + cellSize / 2;
  const pulse = 1 + Math.sin(food.t * 6) * 0.12;
  const r = cellSize * 0.34 * pulse;

  ctx.save();
  ctx.shadowColor = COLORS.food;
  ctx.shadowBlur = 24;
  ctx.fillStyle = COLORS.food;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnake(progress) {
  for (let i = snake.length - 1; i >= 0; i--) {
    const s = snake[i];
    const ix = s.px + (s.x - s.px) * progress;
    const iy = s.py + (s.y - s.py) * progress;
    const x = offsetX + ix * cellSize;
    const y = offsetY + iy * cellSize;
    const t = i / Math.max(1, snake.length - 1);
    const color = lerpColor(COLORS.snakeHead, COLORS.snakeTail, t);
    const pad = i === 0 ? 1 : 2;
    const radius = i === 0 ? cellSize * 0.32 : cellSize * 0.26;

    ctx.save();
    ctx.shadowColor = COLORS.snakeHead;
    ctx.shadowBlur = i === 0 ? 22 : 10 * (1 - t);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
    ctx.fill();
    ctx.restore();

    if (i === 0) {
      const cx = x + cellSize / 2;
      const cy = y + cellSize / 2;
      const off = cellSize * 0.18;
      const er = Math.max(1.5, cellSize * 0.07);
      ctx.fillStyle = '#0a0e27';
      ctx.beginPath();
      ctx.arc(cx + dir.y * off,  cy - dir.x * off,  er, 0, Math.PI * 2);
      ctx.arc(cx - dir.y * off,  cy + dir.x * off,  er, 0, Math.PI * 2);
      ctx.fill();
    }
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

function drawHUD() {
  // Left: SCORE / BEST
  ctx.fillStyle = COLORS.dim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('SCORE', offsetX, offsetY - 56);
  ctx.fillText('BEST',  offsetX + 110, offsetY - 56);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 32px system-ui, sans-serif';
  ctx.fillText(String(score), offsetX,        offsetY - 38);
  ctx.fillStyle = COLORS.snakeHead;
  ctx.fillText(String(best),  offsetX + 110,  offsetY - 38);

  // Right: LEVEL N — NAME, with apple progress
  const right = offsetX + GRID_W * cellSize;
  ctx.fillStyle = COLORS.dim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`LEVEL ${level + 1} / ${LEVELS.length}`, right, offsetY - 56);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(LEVELS[level].name, right, offsetY - 38);

  // Apple progress bar
  const barW = 140;
  const barH = 6;
  const barX = right - barW;
  const barY = offsetY - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(barX, barY, barW, barH);
  const filled = Math.min(applesThisLevel, APPLES_PER_LEVEL) / APPLES_PER_LEVEL;
  ctx.fillStyle = COLORS.food;
  ctx.fillRect(barX, barY, barW * filled, barH);

  ctx.fillStyle = COLORS.dim;
  ctx.font = '500 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${applesThisLevel} / ${APPLES_PER_LEVEL}`, barX - 8, barY - 2);
}

function drawCenteredOverlay({ title, subtitle, hint, titleColor }) {
  ctx.fillStyle = 'rgba(10, 14, 39, 0.78)';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = titleColor;
  ctx.font = '800 56px system-ui, sans-serif';
  ctx.fillText(title, viewW / 2, viewH / 2 - 30);

  ctx.fillStyle = COLORS.snakeHead;
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(subtitle, viewW / 2, viewH / 2 + 14);

  if (hint) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(hint, viewW / 2, viewH / 2 + 48);
  }
}

function drawOverlay() {
  if (state === STATE.LEVEL_DONE) {
    const next = LEVELS[level + 1];
    drawCenteredOverlay({
      title: `LEVEL ${level + 1} CLEAR`,
      subtitle: `Next: ${next.name}  ·  Score ${score}`,
      hint: 'Press SPACE to continue',
      titleColor: COLORS.text,
    });
  } else if (state === STATE.GAME_OVER) {
    drawCenteredOverlay({
      title: 'GAME OVER',
      subtitle: `Reached ${LEVELS[level].name}  ·  Score ${score}  ·  Best ${best}`,
      hint: 'Press SPACE to play again',
      titleColor: COLORS.text,
    });
  } else if (state === STATE.WIN) {
    drawCenteredOverlay({
      title: 'YOU WIN',
      subtitle: `All ${LEVELS.length} levels cleared  ·  Final score ${score}`,
      hint: 'Press SPACE to play again',
      titleColor: COLORS.win,
    });
  }
}

function render(alpha) {
  const progress = state === STATE.PLAY
    ? Math.min(1, (stepAcc + alpha * STEP_MS / 1000) / stepInterval)
    : 0;

  drawBoard();
  drawWalls();
  drawFood();
  drawSnake(progress);
  drawParticles();
  drawHUD();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }
  if (state !== STATE.PLAY) drawOverlay();
}

// --- Loop -----------------------------------------------------------------
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
  render(acc / STEP_MS);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

addEventListener('focus', () => { last = performance.now(); });
