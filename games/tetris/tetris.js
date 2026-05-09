// Tetris engine — pure game state, framework-agnostic.
// Emits events through the `handlers` object passed to the constructor.
'use strict';

export const COLS = 10;
export const ROWS = 20;

export const PIECE_DEFS = {
  I: { box: 4, color: '#00f0ff', cells: [[0,1],[1,1],[2,1],[3,1]] },
  O: { box: 2, color: '#ffd000', cells: [[0,0],[1,0],[0,1],[1,1]] },
  T: { box: 3, color: '#b46aff', cells: [[1,0],[0,1],[1,1],[2,1]] },
  S: { box: 3, color: '#4cf07c', cells: [[1,0],[2,0],[0,1],[1,1]] },
  Z: { box: 3, color: '#ff4d6e', cells: [[0,0],[1,0],[1,1],[2,1]] },
  J: { box: 3, color: '#4a8cff', cells: [[0,0],[0,1],[1,1],[2,1]] },
  L: { box: 3, color: '#ff9344', cells: [[2,0],[0,1],[1,1],[2,1]] },
};
export const PIECE_TYPES = Object.keys(PIECE_DEFS);

// Pre-compute 4 rotation states (90° CW each) for every piece.
export const PIECE_ROTATIONS = (() => {
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

const KICKS = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1]];
const LINE_SCORES = [0, 100, 300, 500, 800];
export const LINE_LABELS = ['', '', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
// Garbage rows to send for an N-line clear (versus mode).
export const GARBAGE_FOR_CLEAR = [0, 0, 1, 2, 4];
export const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;

export const GARBAGE_COLOR = '#3a3f5f';

export class Tetris {
  constructor(handlers = {}) {
    this.h = handlers;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.nextQueue = [];
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropTimer = 0;
    this.dropInterval = 0.8;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.gameOver = false;
    this.clearAnim = null;
    this.piece = null;
    this.pendingGarbage = 0;
    this.refillNext();
    this.updateGravity();
    this.spawnNext();
  }

  refillBag() {
    this.bag = [...PIECE_TYPES];
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
  }

  refillNext() {
    while (this.nextQueue.length < 5) {
      if (this.bag.length === 0) this.refillBag();
      this.nextQueue.push(this.bag.shift());
    }
  }

  updateGravity() {
    this.dropInterval = Math.max(0.05, Math.pow(0.85, this.level - 1) * 0.8);
  }

  spawnNext(typeOverride = null) {
    this.refillNext();
    const type = typeOverride ?? this.nextQueue.shift();
    this.refillNext();
    const def = PIECE_DEFS[type];
    const x = Math.floor((COLS - def.box) / 2);
    const y = -1;
    if (this.collides(type, 0, x, y)) {
      this.gameOver = true;
      this.piece = null;
      this.h.onGameOver?.();
      return;
    }
    this.piece = { type, rot: 0, x, y };
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.h.onSpawn?.(this.piece);
  }

  collides(type, rot, px, py) {
    for (const [dx, dy] of PIECE_ROTATIONS[type][rot]) {
      const cx = px + dx;
      const cy = py + dy;
      if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
      if (cy >= 0 && this.board[cy][cx]) return true;
    }
    return false;
  }

  tryMove(dx, dy) {
    if (!this.piece || this.gameOver || this.clearAnim) return false;
    if (this.collides(this.piece.type, this.piece.rot, this.piece.x + dx, this.piece.y + dy)) return false;
    this.piece.x += dx;
    this.piece.y += dy;
    this._noteMovement();
    return true;
  }

  rotate(dir) {
    if (!this.piece || this.gameOver || this.clearAnim) return;
    if (PIECE_DEFS[this.piece.type].box === 2) return;
    const newRot = (this.piece.rot + (dir > 0 ? 1 : 3)) % 4;
    for (const [kx, ky] of KICKS) {
      if (!this.collides(this.piece.type, newRot, this.piece.x + kx, this.piece.y + ky)) {
        this.piece.x += kx;
        this.piece.y += ky;
        this.piece.rot = newRot;
        this._noteMovement();
        return;
      }
    }
  }

  _noteMovement() {
    if (!this.piece) return;
    if (this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y + 1)) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    } else {
      this.lockTimer = 0;
    }
  }

  ghostY() {
    if (!this.piece) return 0;
    let dy = 0;
    while (!this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y + dy + 1)) dy++;
    return this.piece.y + dy;
  }

  hardDrop() {
    if (!this.piece || this.gameOver || this.clearAnim) return;
    const target = this.ghostY();
    const drop = target - this.piece.y;
    this.piece.y = target;
    this.score += drop * 2;
    this.lockPiece();
  }

  // Returns true if the piece moved down by one cell.
  softDropTick() {
    if (!this.piece || this.gameOver || this.clearAnim) return false;
    if (this.tryMove(0, 1)) {
      this.score += 1;
      return true;
    }
    return false;
  }

  doHold() {
    if (!this.canHold || !this.piece || this.gameOver || this.clearAnim) return;
    const swap = this.hold;
    this.hold = this.piece.type;
    this.piece = null;
    if (swap) this.spawnNext(swap);
    else this.spawnNext();
    this.canHold = false;
  }

  lockPiece() {
    if (!this.piece) return;
    const lockedType = this.piece.type;
    for (const [dx, dy] of PIECE_ROTATIONS[this.piece.type][this.piece.rot]) {
      const cx = this.piece.x + dx;
      const cy = this.piece.y + dy;
      if (cy >= 0) this.board[cy][cx] = PIECE_DEFS[this.piece.type].color;
    }
    this.piece = null;
    this.canHold = true;
    this.h.onLock?.(lockedType);

    const fullRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every((c) => c)) fullRows.push(y);
    }

    if (fullRows.length === 0) {
      this.applyPendingGarbage();
      this.spawnNext();
    } else {
      this.clearAnim = { rows: fullRows, t: 0, duration: 0.32 };
      this.h.onLineClearStart?.(fullRows);
    }
  }

  finishClear() {
    if (!this.clearAnim) return;
    const rows = this.clearAnim.rows.slice();
    const rowSet = new Set(rows);
    const newRows = [];
    for (let y = 0; y < ROWS; y++) {
      if (!rowSet.has(y)) newRows.push(this.board[y]);
    }
    while (newRows.length < ROWS) newRows.unshift(Array(COLS).fill(null));
    this.board = newRows;

    const n = rows.length;
    this.lines += n;
    const scoreDelta = LINE_SCORES[n] * this.level;
    this.score += scoreDelta;

    const newLevel = 1 + Math.floor(this.lines / 10);
    if (newLevel > this.level) {
      this.level = newLevel;
      this.updateGravity();
    }

    this.clearAnim = null;
    this.h.onLineClearEnd?.({ rows, count: n });

    this.applyPendingGarbage();
    this.spawnNext();
  }

  applyPendingGarbage() {
    const n = this.pendingGarbage;
    if (n <= 0) return;
    this.pendingGarbage = 0;
    this.addGarbage(n);
  }

  // Push n garbage rows up from the bottom; each row has a single hole.
  addGarbage(n) {
    if (n <= 0) return;
    const holeCol = (Math.random() * COLS) | 0;
    // If any cells in the top n rows are filled, pushing them up means losing them — top out.
    let toppedOut = false;
    for (let i = 0; i < n; i++) {
      if (this.board[i].some((c) => c)) { toppedOut = true; break; }
    }
    for (let i = 0; i < n; i++) {
      this.board.shift();
      const row = Array(COLS).fill(GARBAGE_COLOR);
      row[holeCol] = null;
      this.board.push(row);
    }
    if (toppedOut) {
      this.gameOver = true;
      this.piece = null;
      this.h.onGameOver?.();
    } else if (this.piece && this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y)) {
      // Try to push the piece up one row at a time.
      let dy = 0;
      while (this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y + dy)
             && this.piece.y + dy > -2) {
        dy--;
      }
      if (this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y + dy)) {
        this.gameOver = true;
        this.piece = null;
        this.h.onGameOver?.();
      } else {
        this.piece.y += dy;
      }
    }
  }

  receiveGarbage(n) {
    this.pendingGarbage += n;
  }

  tick(dt) {
    if (this.gameOver) return;

    if (this.clearAnim) {
      this.clearAnim.t += dt;
      if (this.clearAnim.t >= this.clearAnim.duration) this.finishClear();
      return;
    }

    if (!this.piece) return;

    this.dropTimer += dt;
    while (this.piece && this.dropTimer >= this.dropInterval) {
      this.dropTimer -= this.dropInterval;
      if (this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y + 1)) break;
      this.piece.y++;
    }

    if (this.piece && this.collides(this.piece.type, this.piece.rot, this.piece.x, this.piece.y + 1)) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
    } else {
      this.lockTimer = 0;
      this.lockResets = 0;
    }
  }

  // Snapshot — small enough to broadcast at 20Hz.
  toJSON() {
    return {
      board: this.board.map((r) => r.slice()),
      piece: this.piece ? { ...this.piece } : null,
      score: this.score,
      level: this.level,
      lines: this.lines,
      hold: this.hold,
      canHold: this.canHold,
      nextQueue: this.nextQueue.slice(0, 5),
      gameOver: this.gameOver,
      clearAnim: this.clearAnim ? { ...this.clearAnim } : null,
      lockTimer: this.lockTimer,
    };
  }

  fromJSON(s) {
    this.board = s.board.map((r) => r.slice());
    this.piece = s.piece ? { ...s.piece } : null;
    this.score = s.score;
    this.level = s.level;
    this.lines = s.lines;
    this.hold = s.hold;
    this.canHold = s.canHold;
    this.nextQueue = [...s.nextQueue];
    this.gameOver = s.gameOver;
    this.clearAnim = s.clearAnim ? { ...s.clearAnim } : null;
    this.lockTimer = s.lockTimer ?? 0;
  }
}
