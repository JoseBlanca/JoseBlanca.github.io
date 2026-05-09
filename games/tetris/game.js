// Tetris — entry point. Coordinates mode (solo / versus / coop), layout,
// input, networking, and rendering. The engine itself lives in tetris.js.
'use strict';

import {
  Tetris, COLS, ROWS, PIECE_DEFS, PIECE_ROTATIONS,
  LINE_LABELS, GARBAGE_FOR_CLEAR, LOCK_DELAY, GARBAGE_COLOR,
} from './tetris.js';
import { Net, selfIdSync } from './net.js';
import { Menu } from './menu.js';

// === Constants ============================================================

const STORAGE_KEY = 'tetris:best:v1';
const MODE = { SOLO: 'solo', VERSUS: 'versus', COOP: 'coop' };

const COLORS = {
  bg:          '#0a0e27',
  grid:        'rgba(255, 255, 255, 0.035)',
  border:      'rgba(255, 255, 255, 0.10)',
  panel:       'rgba(255, 255, 255, 0.025)',
  panelBorder: 'rgba(255, 255, 255, 0.08)',
  text:        '#e6ecff',
  dim:         '#7a83b8',
  accent:      '#7cf9ff',
  win:         '#4cf07c',
  lose:        '#ff4d6e',
};

const DAS = 0.15;
const ARR = 0.04;
const SOFT_DROP = 0.035;
const STATE_INTERVAL = 1 / 20;             // 20 Hz state broadcasts
const PEER_LEAVE_AUTOQUIT = 3.0;            // seconds before auto-return to menu

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  'Space','KeyP','KeyC',
]);

const ACTIONS = ['hello','ready','start','state','garbage','over','restart',
                 'input-press','input-release','line-clear'];

// === Canvas / layout ======================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewW = 0, viewH = 0;
let layout = null;

// === Game-mode state ======================================================

let mode = null;
let local = null;            // local Tetris engine
let opponent = null;         // versus: last received opponent state snapshot
let role = null;             // 'host' | 'guest'
let myPlayer = null;         // 'A' | 'B'  (multi only)
let activePlayer = 'A';      // coop only
let multiOver = false;
let multiOverInfo = null;    // { winner: 'me'|'them'|'shared', myScore, theirScore }
let peerLeftTimer = 0;
let myReady = false;
let theirReady = false;
let peerHelloMode = null;

let paused = false;          // solo only

// === Effects (renderer-side) =============================================

const fx = {
  particles: [],
  flash: 0,
  toast: null,                // { text, color, t, duration }
  remoteToast: null,          // versus: opponent line clear toast
};

// === Persistent best (solo) ==============================================

let best = readBest();

function readBest() {
  try { return Number.parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
function writeBest(n) {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
}

// === Input contexts =======================================================

function makeInput() {
  return {
    pressed: new Set(),
    held: new Set(),
    dasDir: 0, dasTimer: 0, arrTimer: 0,
    softDropAcc: 0,
  };
}
const localIn  = makeInput();
const remoteIn = makeInput();   // host coop only — guest's keys
let stateBroadcastAcc = 0;

// === Net / Menu ===========================================================

const net = new Net();
const menu = new Menu();

// === Layout ===============================================================

function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  viewW = canvas.clientWidth;
  viewH = canvas.clientHeight;
  canvas.width = viewW * dpr;
  canvas.height = viewH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeLayout();
}
addEventListener('resize', fitCanvas);

function computeLayout() {
  const padTop = 92, padBottom = 24, padX = 14;
  const panelGap = 14, panelPad = 12;

  const useMirror = mode === MODE.VERSUS;
  // Cell-units across: 4 (HOLD) + 10 (board) + 4 (NEXT) [+ 5 (mirror)]
  const cellsAcross = useMirror ? 23 : 18;
  const gapsCount   = useMirror ? 3  : 2;
  const padCount    = useMirror ? 4  : 4;   // hold + next still 2 panels each side

  const fixedW = padX * 2 + panelGap * gapsCount + panelPad * padCount;
  const cellWithPanels = Math.floor(Math.min(
    (viewW - fixedW) / cellsAcross,
    (viewH - padTop - padBottom) / 20,
  ));
  const cellNoPanels = Math.floor(Math.min(
    (viewW - padX * 2) / 10,
    (viewH - padTop - padBottom) / 20,
  ));

  let cell, showPanels;
  if (cellWithPanels >= 14) {
    cell = Math.max(8, Math.min(cellWithPanels, 38));
    showPanels = true;
  } else {
    cell = Math.max(8, Math.min(cellNoPanels, 38));
    showPanels = false;
  }

  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const panelInner = cell * 4;
  const panelW = panelInner + panelPad * 2;
  const mirrorCell = Math.max(4, Math.floor(cell * 0.5));
  const mirrorW = mirrorCell * COLS;

  let totalW;
  if (showPanels && useMirror) totalW = panelW + panelGap + boardW + panelGap + panelW + panelGap + mirrorW;
  else if (showPanels)         totalW = panelW + panelGap + boardW + panelGap + panelW;
  else                          totalW = boardW;

  const startX = Math.floor((viewW - totalW) / 2);
  const boardY = padTop + Math.floor((viewH - padTop - padBottom - boardH) / 2);

  let x = startX;
  let holdX = -1, nextX = -1, mirrorX = -1;
  if (showPanels) {
    holdX = x;
    x += panelW + panelGap;
  }
  const boardX = x;
  x += boardW;
  if (showPanels) {
    x += panelGap;
    nextX = x;
    x += panelW;
    if (useMirror) {
      x += panelGap;
      mirrorX = x;
    }
  }

  layout = {
    cell, boardX, boardY, boardW, boardH,
    holdX, holdY: boardY,
    nextX, nextY: boardY,
    mirrorX, mirrorY: boardY, mirrorCell, mirrorW,
    panelInner, panelW, panelPad,
    showPanels, useMirror,
  };
}

// === Frame loop ===========================================================

const STEP_MS = 1000 / 60;
const MAX_FRAME = 250;
let acc = 0, last = performance.now();

function frame(now) {
  let dt = now - last;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  acc += dt;
  while (acc >= STEP_MS) {
    update(STEP_MS / 1000);
    acc -= STEP_MS;
  }
  render();
  requestAnimationFrame(frame);
}

addEventListener('focus', () => { last = performance.now(); });

// === Update ===============================================================

function update(dt) {
  updateFX(dt);

  if (peerLeftTimer > 0) {
    peerLeftTimer -= dt;
    if (peerLeftTimer <= 0) quitToMenu();
  }

  if (!mode) {                 // menu open, nothing to simulate
    localIn.pressed.clear();
    return;
  }

  if (mode === MODE.SOLO)        updateSolo(dt);
  else if (mode === MODE.VERSUS) updateVersus(dt);
  else if (mode === MODE.COOP)   updateCoop(dt);
}

function updateFX(dt) {
  for (const p of fx.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.94; p.vy *= 0.94;
    p.vy += 380 * dt;
    p.life -= dt;
  }
  if (fx.particles.length) fx.particles = fx.particles.filter((p) => p.life > 0);
  if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt * 2);
  for (const t of [fx.toast, fx.remoteToast]) {
    if (!t) continue;
    t.t += dt;
  }
  if (fx.toast && fx.toast.t >= fx.toast.duration) fx.toast = null;
  if (fx.remoteToast && fx.remoteToast.t >= fx.remoteToast.duration) fx.remoteToast = null;
}

function updateSolo(dt) {
  if (!local) return;

  if (local.gameOver) {
    if (consumeRestartKey()) restartLocal();
    if (consumeQuitKey()) quitToMenu();
    localIn.pressed.clear();
    return;
  }

  if (paused) {
    if (localIn.pressed.has('KeyP') || localIn.pressed.has('Escape') ||
        localIn.pressed.has('Space') || localIn.pressed.has('Enter')) paused = false;
    localIn.pressed.clear();
    return;
  }
  if (localIn.pressed.has('KeyP') || localIn.pressed.has('Escape')) {
    paused = true;
    localIn.pressed.clear();
    return;
  }

  tickInput(localIn, local, dt);
  local.tick(dt);

  if (local.score > best) { best = local.score; writeBest(best); }
}

function updateVersus(dt) {
  if (!local) return;

  if (multiOver) {
    if (consumeRestartKey() && role === 'host') {
      net.send('restart', {});
      restartMulti();
    }
    if (consumeQuitKey()) { net.send('over', { quit: true }); quitToMenu(); }
    localIn.pressed.clear();
    return;
  }
  if (consumeQuitKey()) { net.send('over', { quit: true }); quitToMenu(); return; }

  tickInput(localIn, local, dt);
  local.tick(dt);

  stateBroadcastAcc += dt;
  if (stateBroadcastAcc >= STATE_INTERVAL) {
    stateBroadcastAcc = 0;
    net.send('state', minifyVersusState(local));
  }
}

function updateCoop(dt) {
  if (!local) return;

  if (multiOver) {
    if (consumeRestartKey() && role === 'host') {
      net.send('restart', {});
      restartMulti();
    }
    if (consumeQuitKey()) { net.send('over', { quit: true }); quitToMenu(); }
    localIn.pressed.clear();
    return;
  }
  if (consumeQuitKey()) { net.send('over', { quit: true }); quitToMenu(); return; }

  if (role === 'host') {
    const activeCtx = activePlayer === myPlayer ? localIn : remoteIn;
    tickInput(activeCtx, local, dt);
    local.tick(dt);

    stateBroadcastAcc += dt;
    if (stateBroadcastAcc >= STATE_INTERVAL) {
      stateBroadcastAcc = 0;
      net.send('state', { engine: local.toJSON(), activePlayer });
    }
  } else {
    // Guest: passive engine, key forwarding done in keydown listeners.
    localIn.pressed.clear();
  }
}

function tickInput(ctx, engine, dt) {
  // Edge actions
  if (ctx.pressed.has('ArrowUp') || ctx.pressed.has('KeyW') || ctx.pressed.has('KeyX')) engine.rotate(1);
  if (ctx.pressed.has('KeyZ')) engine.rotate(-1);
  if (ctx.pressed.has('Space')) engine.hardDrop();
  if (ctx.pressed.has('KeyC') || ctx.pressed.has('ShiftLeft') || ctx.pressed.has('ShiftRight')) engine.doHold();

  // Horizontal DAS / ARR
  let dir = 0;
  if (ctx.held.has('ArrowLeft')  || ctx.held.has('KeyA')) dir = -1;
  if (ctx.held.has('ArrowRight') || ctx.held.has('KeyD')) dir =  1;
  if (dir !== ctx.dasDir) {
    ctx.dasDir = dir;
    ctx.dasTimer = 0;
    ctx.arrTimer = 0;
    if (dir !== 0) engine.tryMove(dir, 0);
  } else if (dir !== 0) {
    ctx.dasTimer += dt;
    if (ctx.dasTimer >= DAS) {
      ctx.arrTimer += dt;
      while (ctx.arrTimer >= ARR) {
        if (!engine.tryMove(dir, 0)) { ctx.arrTimer = 0; break; }
        ctx.arrTimer -= ARR;
      }
    }
  }

  // Soft drop
  if (ctx.held.has('ArrowDown') || ctx.held.has('KeyS')) {
    ctx.softDropAcc += dt;
    while (ctx.softDropAcc >= SOFT_DROP) {
      ctx.softDropAcc -= SOFT_DROP;
      if (!engine.softDropTick()) { ctx.softDropAcc = 0; break; }
    }
  } else {
    ctx.softDropAcc = 0;
  }

  ctx.pressed.clear();
}

function consumeRestartKey() {
  return localIn.pressed.has('Enter') || localIn.pressed.has('Space') || localIn.pressed.has('KeyR');
}
function consumeQuitKey() {
  return localIn.pressed.has('Escape');
}

// === Mode lifecycle =======================================================

function startSolo() {
  mode = MODE.SOLO;
  paused = false;
  multiOver = false;
  multiOverInfo = null;
  local = createSoloEngine();
  computeLayout();
  menu.hide();
}

function startMulti() {
  paused = false;
  multiOver = false;
  multiOverInfo = null;
  peerLeftTimer = 0;
  role = ((selfIdSync() ?? '') < (net.peerId ?? '~~~')) ? 'host' : 'guest';
  myPlayer = role === 'host' ? 'A' : 'B';
  activePlayer = 'A';
  opponent = null;

  if (mode === MODE.VERSUS) {
    local = createVersusEngine();
  } else if (mode === MODE.COOP) {
    if (role === 'host') local = createCoopHostEngine();
    else                 local = new Tetris({});  // passive
  }
  computeLayout();
  menu.hide();
}

function restartLocal() {
  paused = false;
  multiOver = false;
  multiOverInfo = null;
  fx.particles = [];
  fx.toast = null;
  fx.remoteToast = null;
  fx.flash = 0;
  if (mode === MODE.SOLO) local = createSoloEngine();
}

function restartMulti() {
  paused = false;
  multiOver = false;
  multiOverInfo = null;
  fx.particles = [];
  fx.toast = null;
  fx.remoteToast = null;
  fx.flash = 0;
  opponent = null;
  activePlayer = 'A';
  if (mode === MODE.VERSUS) {
    local = createVersusEngine();
  } else if (mode === MODE.COOP) {
    if (role === 'host') local = createCoopHostEngine();
    else                 local = new Tetris({});
  }
}

function quitToMenu() {
  net.leave();
  mode = null;
  local = null;
  opponent = null;
  role = null;
  myPlayer = null;
  multiOver = false;
  multiOverInfo = null;
  peerLeftTimer = 0;
  fx.particles = [];
  fx.toast = null;
  fx.remoteToast = null;
  fx.flash = 0;
  paused = false;
  myReady = false;
  theirReady = false;
  peerHelloMode = null;
  computeLayout();
  menu.showMode();
}

// === Engine handler bundles ==============================================

function createSoloEngine() {
  return new Tetris({
    onLineClearStart: (rows) => burstRows(rows, layout, COLORS.text),
    onLineClearEnd:   ({ rows, count }) => onLineClearLocalFx(rows, count),
    onGameOver:       () => onLocalGameOver(),
  });
}

function createVersusEngine() {
  return new Tetris({
    onLineClearStart: (rows) => burstRows(rows, layout, COLORS.text),
    onLineClearEnd:   ({ rows, count }) => {
      onLineClearLocalFx(rows, count);
      const g = GARBAGE_FOR_CLEAR[count] || 0;
      if (g > 0) net.send('garbage', { count: g });
      net.send('line-clear', { count });
    },
    onGameOver:       () => {
      onLocalGameOver();
      net.send('over', { score: local.score });
      // If the opponent already topped out, we lost the race-to-survive — they win.
      // If they haven't, we top out first → they win.
      if (!opponent || !opponent.gameOver) {
        multiOverInfo = { winner: 'them', myScore: local.score, theirScore: opponent?.score ?? 0 };
      } else {
        multiOverInfo = { winner: 'me', myScore: local.score, theirScore: opponent.score };
      }
      multiOver = true;
    },
  });
}

function createCoopHostEngine() {
  return new Tetris({
    onLock:           () => { activePlayer = activePlayer === 'A' ? 'B' : 'A'; },
    onLineClearStart: (rows) => burstRows(rows, layout, COLORS.text),
    onLineClearEnd:   ({ rows, count }) => {
      onLineClearLocalFx(rows, count);
      net.send('line-clear', { rows, count });
    },
    onGameOver:       () => {
      onLocalGameOver();
      net.send('over', { score: local.score });
      multiOverInfo = { winner: 'shared', myScore: local.score, theirScore: local.score };
      multiOver = true;
    },
  });
}

// === FX helpers ==========================================================

function onLineClearLocalFx(rows, count) {
  if (LINE_LABELS[count]) {
    fx.toast = {
      text: LINE_LABELS[count],
      color: count === 4 ? COLORS.accent : COLORS.text,
      t: 0, duration: 1.0,
    };
  }
  if (count === 4) fx.flash = 0.18;
}

function onLocalGameOver() {
  fx.flash = 0.45;
  if (!local) return;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (local.board[y][x] && Math.random() < 0.18) burstAt(layout, x, y, local.board[y][x]);
    }
  }
}

function burstRows(rows, lay, color) {
  for (const r of rows) {
    for (let x = 0; x < COLS; x++) burstAt(lay, x, r, color);
  }
}

function burstAt(lay, cellX, cellY, color, scale = 1) {
  const cx = lay.boardX + cellX * lay.cell + lay.cell / 2;
  const cy = lay.boardY + cellY * lay.cell + lay.cell / 2;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = (90 + Math.random() * 180) * scale;
    const life = 0.35 + Math.random() * 0.4;
    fx.particles.push({
      x: cx, y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 30,
      life, maxLife: life, color,
    });
  }
}

// === Network handlers ====================================================

// Called once at boot. Net.on() pushes onto a persistent map; calling these
// per-join would duplicate each handler.
function attachNetHandlers() {
  net.on('peer-join',     onPeerJoin);
  net.on('peer-leave',    onPeerLeave);
  net.on('hello',         onPeerHello);
  net.on('ready',         onPeerReady);
  net.on('start',         onPeerStart);
  net.on('state',         onPeerState);
  net.on('garbage',       onPeerGarbage);
  net.on('over',          onPeerOver);
  net.on('restart',       onPeerRestart);
  net.on('input-press',   onPeerInputPress);
  net.on('input-release', onPeerInputRelease);
  net.on('line-clear',    onPeerLineClear);
}

// Trystero actions live on the room — re-defined on every join.
async function joinRoom(code) {
  try {
    await net.join(code);
    net.defineActions(ACTIONS);
  } catch (err) {
    console.error('joinRoom failed', err);
    menu.setStatus('Failed to load peer service. Check your network and refresh.', 'error');
    menu.setReadyEnabled(false);
  }
}

function onPeerJoin(id) {
  if (!menu.isOpen()) return;
  menu.setStatus('Connected. Pick READY when both of you are ready.', 'success');
  menu.setPeer(`Peer: ${shortId(id)}`);
  menu.setReadyEnabled(true);
  net.send('hello', { mode });
  if (myReady) net.send('ready', { ready: true });
}

function onPeerLeave() {
  if (menu.isOpen()) {
    menu.setStatus('Peer disconnected.', 'error');
    menu.setPeer('');
    menu.setReadyEnabled(false);
    theirReady = false;
    return;
  }
  // In-game: announce, auto-quit shortly.
  fx.toast = { text: 'PEER DISCONNECTED', color: COLORS.lose, t: 0, duration: 4 };
  peerLeftTimer = PEER_LEAVE_AUTOQUIT;
}

function onPeerHello(data) {
  peerHelloMode = data?.mode;
  if (mode && peerHelloMode && peerHelloMode !== mode) {
    menu.setStatus(`Peer is in ${peerHelloMode.toUpperCase()} mode — modes don't match.`, 'error');
    menu.setReadyEnabled(false);
  }
}

function onPeerReady(data) {
  theirReady = !!data?.ready;
  refreshLobbyStatus();
  if (myReady && theirReady && (selfIdSync() ?? '') < (net.peerId ?? '~~~')) {
    net.send('start', { mode });
    startMulti();
  }
}

function onPeerStart() {
  if (!menu.isOpen()) return;
  startMulti();
}

function onPeerState(data) {
  if (mode === MODE.VERSUS) {
    opponent = data;
  } else if (mode === MODE.COOP && role === 'guest' && local) {
    if (data?.engine) local.fromJSON(data.engine);
    if (typeof data?.activePlayer === 'string') activePlayer = data.activePlayer;
  }
}

function onPeerGarbage(data) {
  if (mode !== MODE.VERSUS || !local) return;
  const n = Math.max(0, Math.min(20, data?.count | 0));
  if (n > 0) local.receiveGarbage(n);
}

function onPeerOver(data) {
  if (mode === MODE.VERSUS) {
    if (multiOver) return;
    multiOver = true;
    if (data?.quit) {
      multiOverInfo = { winner: 'me', myScore: local?.score ?? 0, theirScore: data.score ?? 0, quit: true };
    } else {
      multiOverInfo = { winner: 'me', myScore: local?.score ?? 0, theirScore: data?.score ?? 0 };
    }
  } else if (mode === MODE.COOP) {
    if (multiOver) return;
    multiOver = true;
    multiOverInfo = { winner: 'shared', myScore: local?.score ?? 0, theirScore: data?.score ?? 0, quit: !!data?.quit };
  }
}

function onPeerRestart() {
  if (multiOver) restartMulti();
}

function onPeerInputPress(data) {
  if (mode !== MODE.COOP || role !== 'host' || !data?.code) return;
  if (activePlayer === myPlayer) return; // not their turn
  if (!remoteIn.held.has(data.code)) remoteIn.pressed.add(data.code);
  remoteIn.held.add(data.code);
}
function onPeerInputRelease(data) {
  if (mode !== MODE.COOP || role !== 'host' || !data?.code) return;
  remoteIn.held.delete(data.code);
}

function onPeerLineClear(data) {
  const count = data?.count | 0;
  if (mode === MODE.COOP && role === 'guest' && local && Array.isArray(data?.rows)) {
    burstRows(data.rows, layout, count === 4 ? COLORS.accent : COLORS.text);
    onLineClearLocalFx(data.rows, count);
  } else if (mode === MODE.VERSUS) {
    if (LINE_LABELS[count]) {
      fx.remoteToast = {
        text: LINE_LABELS[count],
        color: count === 4 ? COLORS.accent : COLORS.text,
        t: 0, duration: 0.9,
      };
    }
  }
}

function shortId(id) {
  return id ? id.slice(0, 6) : '?';
}

// === Menu plumbing ========================================================

function setupMenu() {
  menu.on('start', ({ mode: m }) => {
    if (m === MODE.SOLO) startSolo();
  });
  menu.on('lobby', ({ mode: m, roomCode }) => {
    mode = m;
    myReady = false;
    theirReady = false;
    peerHelloMode = null;
    joinRoom(roomCode);
    menu.setStatus('Waiting for peer to join the room…', 'info');
  });
  menu.on('back', () => {
    net.leave();
    mode = null;
    myReady = false;
    theirReady = false;
    peerHelloMode = null;
  });
  menu.on('ready', (ready) => {
    myReady = ready;
    net.send('ready', { ready });
    refreshLobbyStatus();
    if (myReady && theirReady && (selfIdSync() ?? '') < (net.peerId ?? '~~~')) {
      net.send('start', { mode });
      startMulti();
    }
  });
  menu.on('room-change', (newCode) => {
    net.leave();
    myReady = false;
    theirReady = false;
    peerHelloMode = null;
    joinRoom(newCode);
    menu.setStatus('Waiting for peer to join the room…', 'info');
    menu.setPeer('');
    menu.setReadyEnabled(false);
    menu.resetReady();
  });
}

function refreshLobbyStatus() {
  if (!menu.isOpen()) return;
  if (peerHelloMode && peerHelloMode !== mode) return;
  if (myReady && theirReady) menu.setStatus('Both ready — starting…', 'success');
  else if (myReady)          menu.setStatus('You are ready. Waiting for peer…', 'info');
  else if (theirReady)       menu.setStatus('Peer is ready. Press READY to begin.', 'info');
  else                        menu.setStatus('Connected. Pick READY when both of you are ready.', 'success');
}

// === Input listeners ======================================================

addEventListener('keydown', (e) => {
  // While the menu is open, let the DOM handle everything (input typing, button focus).
  if (menu.isOpen()) return;
  if (e.repeat) return;
  const wasHeld = localIn.held.has(e.code);
  if (!wasHeld) localIn.pressed.add(e.code);
  localIn.held.add(e.code);
  // Forward to host as guest in coop, when active.
  if (mode === MODE.COOP && role === 'guest' && activePlayer === myPlayer && !wasHeld) {
    net.send('input-press', { code: e.code });
  }
  if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
});

addEventListener('keyup', (e) => {
  const wasHeld = localIn.held.has(e.code);
  localIn.held.delete(e.code);
  if (mode === MODE.COOP && role === 'guest' && activePlayer === myPlayer && wasHeld) {
    net.send('input-release', { code: e.code });
  }
});

addEventListener('blur', () => {
  if (mode === MODE.COOP && role === 'guest' && activePlayer === myPlayer) {
    for (const code of localIn.held) net.send('input-release', { code });
  }
  localIn.held.clear();
  localIn.pressed.clear();
  if (mode === MODE.SOLO && local && !local.gameOver) paused = true;
});

// === Versus state minification ============================================

function minifyVersusState(engine) {
  // Send a compact view: just what the mirror needs.
  return {
    board: engine.board.map((r) => r.slice()),
    piece: engine.piece ? { ...engine.piece } : null,
    score: engine.score,
    level: engine.level,
    lines: engine.lines,
    gameOver: engine.gameOver,
    clearAnim: engine.clearAnim ? { rows: engine.clearAnim.rows.slice(), t: engine.clearAnim.t, duration: engine.clearAnim.duration } : null,
  };
}

// === Render ===============================================================

function render() {
  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, viewW, viewH);

  if (!mode || !local || !layout) {
    drawParticles();
    if (fx.flash > 0) drawFlash();
    return;
  }

  drawBoardArea(layout, local, { withGhost: !isPassiveCoopGuest(), withPiece: true });
  if (layout.showPanels) {
    drawHoldPanel(layout, local);
    drawNextPanel(layout, local);
  }

  if (mode === MODE.VERSUS && layout.showPanels && layout.mirrorX >= 0) {
    drawMirror(layout, opponent);
  }

  drawParticles();
  drawHUD();

  if (mode === MODE.COOP) drawCoopBanner();

  if (fx.toast) drawToast(fx.toast, layout.boardX + layout.boardW / 2, layout.boardY + 130);
  if (fx.remoteToast && layout.mirrorX >= 0) {
    drawToast(fx.remoteToast, layout.mirrorX + layout.mirrorW / 2, layout.mirrorY + 100, 0.7);
  }

  if (fx.flash > 0) drawFlash();

  if (mode === MODE.SOLO && local.gameOver) {
    drawOverlay('GAME OVER',
      `Score ${local.score.toLocaleString()}  ·  Best ${best.toLocaleString()}`,
      'SPACE play again · ESC quit');
  } else if (mode === MODE.SOLO && paused) {
    drawOverlay('PAUSED', '', 'Press P to resume');
  } else if ((mode === MODE.VERSUS || mode === MODE.COOP) && multiOver) {
    drawMultiOverlay();
  } else if (peerLeftTimer > 0) {
    drawOverlay('PEER DISCONNECTED', '', `Returning to menu in ${Math.ceil(peerLeftTimer)}s`);
  }
}

function isPassiveCoopGuest() {
  return mode === MODE.COOP && role === 'guest';
}

function drawBlock(x, y, color, size, options = {}) {
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
    const grad = ctx.createLinearGradient(x, y, x, y + size);
    grad.addColorStop(0,   'rgba(255,255,255,0.30)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + pad, y + pad, size - pad * 2, size - pad * 2, size * 0.2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoardArea(lay, state, opts = {}) {
  // Subtle inset
  ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
  ctx.fillRect(lay.boardX, lay.boardY, lay.boardW, lay.boardH);

  // Grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= COLS; x++) {
    const px = lay.boardX + x * lay.cell + 0.5;
    ctx.moveTo(px, lay.boardY); ctx.lineTo(px, lay.boardY + lay.boardH);
  }
  for (let y = 0; y <= ROWS; y++) {
    const py = lay.boardY + y * lay.cell + 0.5;
    ctx.moveTo(lay.boardX, py); ctx.lineTo(lay.boardX + lay.boardW, py);
  }
  ctx.stroke();

  // Border — color it by mode/turn ownership for coop.
  ctx.strokeStyle = coopBorderColor() ?? COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(lay.boardX - 1, lay.boardY - 1, lay.boardW + 2, lay.boardH + 2);

  // Locked board
  drawLockedBoard(lay, state);

  // Ghost + piece
  if (opts.withGhost && state.piece && !state.gameOver && !state.clearAnim) drawGhost(lay, state);
  if (opts.withPiece && state.piece && !state.gameOver) drawActivePiece(lay, state);
}

function coopBorderColor() {
  if (mode !== MODE.COOP) return null;
  if (multiOver) return COLORS.dim;
  return activePlayer === myPlayer ? COLORS.accent : 'rgba(180, 106, 255, 0.55)';
}

function drawLockedBoard(lay, state) {
  const flashRows = state.clearAnim ? new Set(state.clearAnim.rows) : null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = state.board[y][x];
      if (!c) continue;
      const px = lay.boardX + x * lay.cell;
      const py = lay.boardY + y * lay.cell;
      if (flashRows && flashRows.has(y)) {
        const t = state.clearAnim.t / state.clearAnim.duration;
        const a = Math.max(0, 1 - t);
        const blend = Math.min(1, t * 2);
        ctx.save(); ctx.globalAlpha = 1 - blend * 0.4;
        drawBlock(px, py, c, lay.cell);
        ctx.restore();
        ctx.save(); ctx.globalAlpha = a;
        drawBlock(px, py, '#ffffff', lay.cell, { glow: 36 });
        ctx.restore();
      } else {
        drawBlock(px, py, c, lay.cell);
      }
    }
  }
}

function drawGhost(lay, state) {
  // Compute ghost Y by simulating against the state's board.
  const p = state.piece;
  const cells = PIECE_ROTATIONS[p.type][p.rot];
  let dy = 0;
  while (!cellsCollide(state.board, cells, p.x, p.y + dy + 1)) dy++;
  if (dy === 0) return;
  const color = PIECE_DEFS[p.type].color;
  for (const [cx, cy] of cells) {
    const yy = p.y + dy + cy;
    if (yy < 0) continue;
    drawBlock(lay.boardX + (p.x + cx) * lay.cell, lay.boardY + yy * lay.cell, color, lay.cell, {
      ghost: true, alpha: 0.42,
    });
  }
}

function drawActivePiece(lay, state) {
  const p = state.piece;
  const cells = PIECE_ROTATIONS[p.type][p.rot];
  const color = PIECE_DEFS[p.type].color;
  // Pulse glow on lock-delay.
  const onGround = cellsCollide(state.board, cells, p.x, p.y + 1);
  const lockProg = onGround ? Math.min(1, (state.lockTimer ?? 0) / LOCK_DELAY) : 0;
  const glow = 22 + lockProg * 14;
  for (const [cx, cy] of cells) {
    const yy = p.y + cy;
    if (yy < 0) continue;
    drawBlock(lay.boardX + (p.x + cx) * lay.cell, lay.boardY + yy * lay.cell, color, lay.cell, { glow });
  }
}

function cellsCollide(board, cells, px, py) {
  for (const [dx, dy] of cells) {
    const cx = px + dx, cy = py + dy;
    if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
    if (cy >= 0 && board[cy][cx]) return true;
  }
  return false;
}

function drawPanelFrame(x, y, w, h, label) {
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.dim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + 12, y + 9);
}

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
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const block = Math.floor(Math.min(size / Math.max(w, h), size / 4) * 0.95);
  const px = x + (size - w * block) / 2 - minX * block;
  const py = y + (size - h * block) / 2 - minY * block;
  for (const [dx, dy] of cells) {
    drawBlock(px + dx * block, py + dy * block, def.color, block, { glow: 14 });
  }
}

function drawHoldPanel(lay, state) {
  const slot = lay.panelInner;
  const h = 26 + lay.panelPad * 2 + slot;
  drawPanelFrame(lay.holdX, lay.holdY, lay.panelW, h, 'HOLD');
  if (state.hold) {
    ctx.save();
    ctx.globalAlpha = state.canHold ? 1 : 0.4;
    drawPieceInBox(state.hold, lay.holdX + lay.panelPad, lay.holdY + 26 + lay.panelPad, slot);
    ctx.restore();
  }
  ctx.fillStyle = COLORS.dim;
  ctx.font = '500 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('C / SHIFT', lay.holdX + lay.panelW / 2, lay.holdY + h + 6);
}

function drawNextPanel(lay, state) {
  const slot = Math.max(36, lay.panelInner * 0.7);
  const h = 26 + lay.panelPad * 2 + slot * 3;
  drawPanelFrame(lay.nextX, lay.nextY, lay.panelW, h, 'NEXT');
  const queue = state.nextQueue || [];
  for (let i = 0; i < 3 && i < queue.length; i++) {
    const py = lay.nextY + 26 + lay.panelPad + i * slot;
    ctx.save();
    if (i > 0) ctx.globalAlpha = 0.7 - (i - 1) * 0.25;
    drawPieceInBox(queue[i], lay.nextX + lay.panelPad, py, slot);
    ctx.restore();
  }
}

function drawMirror(lay, op) {
  const x = lay.mirrorX, y = lay.mirrorY, c = lay.mirrorCell;
  const w = c * COLS, h = c * ROWS;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= COLS; i++) {
    ctx.moveTo(x + i * c + 0.5, y); ctx.lineTo(x + i * c + 0.5, y + h);
  }
  for (let i = 0; i <= ROWS; i++) {
    ctx.moveTo(x, y + i * c + 0.5); ctx.lineTo(x + w, y + i * c + 0.5);
  }
  ctx.stroke();

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);

  // Header
  ctx.fillStyle = COLORS.dim;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('OPPONENT', x, y - 6);

  if (!op) return;
  // Locked board
  for (let py = 0; py < ROWS; py++) {
    const row = op.board?.[py];
    if (!row) continue;
    for (let px = 0; px < COLS; px++) {
      const col = row[px];
      if (!col) continue;
      drawBlock(x + px * c, y + py * c, col, c, { glow: 6, pad: 0.5 });
    }
  }
  // Active piece
  if (op.piece && !op.gameOver) {
    const cells = PIECE_ROTATIONS[op.piece.type][op.piece.rot];
    const color = PIECE_DEFS[op.piece.type].color;
    for (const [dx, dy] of cells) {
      const yy = op.piece.y + dy;
      if (yy < 0) continue;
      drawBlock(x + (op.piece.x + dx) * c, y + yy * c, color, c, { glow: 8, pad: 0.5 });
    }
  }

  // Footer: opponent stats
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText((op.score ?? 0).toLocaleString(), x, y + h + 6);

  ctx.fillStyle = COLORS.dim;
  ctx.font = '500 10px system-ui, sans-serif';
  ctx.fillText('SCORE', x, y + h + 22);

  if (op.gameOver) {
    ctx.fillStyle = COLORS.lose;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TOPPED OUT', x + w / 2, y + h / 2 - 8);
  }
}

function drawHUD() {
  if (!local) return;
  let stats;
  if (mode === MODE.SOLO) {
    stats = [
      { label: 'SCORE', value: local.score.toLocaleString(), color: COLORS.text },
      { label: 'BEST',  value: best.toLocaleString(),        color: COLORS.accent },
      { label: 'LEVEL', value: String(local.level),          color: COLORS.text },
      { label: 'LINES', value: String(local.lines),          color: COLORS.text },
    ];
  } else if (mode === MODE.VERSUS) {
    stats = [
      { label: 'SCORE',    value: local.score.toLocaleString(),  color: COLORS.text },
      { label: 'LEVEL',    value: String(local.level),           color: COLORS.text },
      { label: 'LINES',    value: String(local.lines),           color: COLORS.text },
    ];
  } else { // COOP
    stats = [
      { label: 'SCORE',    value: local.score.toLocaleString(),  color: COLORS.text },
      { label: 'LEVEL',    value: String(local.level),           color: COLORS.text },
      { label: 'LINES',    value: String(local.lines),           color: COLORS.text },
    ];
  }

  const labelY = layout.boardY - 60;
  const valueY = layout.boardY - 42;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let x = layout.boardX;
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

  // Right hint
  if (layout.boardX + layout.boardW - x > 100) {
    ctx.fillStyle = COLORS.dim;
    ctx.font = '500 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const hint = mode === MODE.SOLO
      ? '← → · ↑/X rotate · ⎵ drop · C hold · P pause · ESC menu'
      : '← → · ↑/X rotate · ⎵ drop · C hold · ESC quit';
    ctx.fillText(hint, layout.boardX + layout.boardW, valueY + 8);
  }
}

function drawCoopBanner() {
  const me = activePlayer === myPlayer;
  const text = me ? 'YOUR TURN' : "PEER'S TURN";
  const color = me ? COLORS.accent : '#b46aff';
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, layout.boardX + layout.boardW / 2, layout.boardY - 18);
  ctx.restore();
}

function drawParticles() {
  for (const p of fx.particles) {
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

function drawToast(t, cx, cy, scale = 1) {
  const k = t.t / t.duration;
  const fadeIn = Math.min(1, k / 0.18);
  const fadeOut = Math.min(1, (1 - k) / 0.4);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  const yOffset = -28 * k * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.color;
  ctx.shadowColor = t.color;
  ctx.shadowBlur = 26 * scale;
  ctx.font = `800 ${Math.round(44 * scale)}px system-ui, sans-serif`;
  ctx.fillText(t.text, cx, cy + yOffset);
  ctx.restore();
}

function drawFlash() {
  ctx.fillStyle = `rgba(255, 255, 255, ${fx.flash})`;
  ctx.fillRect(0, 0, viewW, viewH);
}

function drawOverlay(title, subtitle, hint, titleColor = COLORS.text) {
  ctx.fillStyle = 'rgba(10, 14, 39, 0.78)';
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = titleColor;
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

function drawMultiOverlay() {
  const info = multiOverInfo || {};
  let title, color, subtitle;
  if (mode === MODE.VERSUS) {
    if (info.winner === 'me') { title = 'YOU WIN';  color = COLORS.win;  }
    else if (info.winner === 'them') { title = 'YOU LOSE'; color = COLORS.lose; }
    else { title = 'DRAW'; color = COLORS.text; }
    subtitle = `You ${info.myScore?.toLocaleString() ?? 0}  ·  Peer ${info.theirScore?.toLocaleString() ?? 0}`;
  } else {
    title = 'GAME OVER';
    color = COLORS.text;
    subtitle = `Together: ${info.myScore?.toLocaleString() ?? 0}`;
  }
  const hint = role === 'host'
    ? 'SPACE rematch · ESC quit'
    : 'Waiting for host to rematch · ESC quit';
  drawOverlay(title, subtitle, hint, color);
}

// === Boot =================================================================

attachNetHandlers();
setupMenu();
fitCanvas();
menu.showMode();
requestAnimationFrame(frame);
