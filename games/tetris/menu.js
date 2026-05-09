// Menu / lobby — DOM overlay sitting above the game canvas.
// Two steps: pick a mode, then (for multiplayer) share/enter a room code and ready up.
'use strict';

const ADJECTIVES = [
  'crimson','azure','golden','silver','jade','violet','amber','indigo',
  'lunar','solar','swift','quiet','wild','brave','clever','fierce',
];
const NOUNS = [
  'tetris','block','glow','pulse','spark','wave','tower','prism',
  'echo','drift','comet','vortex','nebula','cipher','quasar','phoenix',
];

function randomRoomCode() {
  const a = ADJECTIVES[(Math.random() * ADJECTIVES.length) | 0];
  const n = NOUNS[(Math.random() * NOUNS.length) | 0];
  const num = ((Math.random() * 90) | 0) + 10;
  return `${a}-${n}-${num}`;
}

export class Menu {
  constructor() {
    this.el           = document.getElementById('menu');
    this.modeStep     = this.el.querySelector('[data-step="mode"]');
    this.lobbyStep    = this.el.querySelector('[data-step="lobby"]');
    this.modeLabel    = this.el.querySelector('#mode-label');
    this.roomInput    = this.el.querySelector('#room-code');
    this.copyBtn      = this.el.querySelector('#copy-room');
    this.statusEl     = this.el.querySelector('#lobby-status');
    this.peerLineEl   = this.el.querySelector('#lobby-peer');
    this.backBtn      = this.el.querySelector('#lobby-back');
    this.readyBtn     = this.el.querySelector('#lobby-ready');

    this.handlers = Object.create(null);
    this.currentMode = null;
    this.ready = false;

    for (const btn of this.modeStep.querySelectorAll('button[data-mode]')) {
      btn.addEventListener('click', () => this._pickMode(btn.dataset.mode));
    }

    this.backBtn.addEventListener('click', () => {
      this.currentMode = null;
      this.ready = false;
      this._showStep('mode');
      this._fire('back');
    });

    this.copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.roomInput.value.trim());
        const old = this.copyBtn.textContent;
        this.copyBtn.textContent = 'COPIED';
        setTimeout(() => { this.copyBtn.textContent = old; }, 1200);
      } catch {
        this.roomInput.select();
      }
    });

    this.readyBtn.addEventListener('click', () => {
      if (this.readyBtn.disabled) return;
      this.ready = !this.ready;
      this._refreshReadyButton();
      this._fire('ready', this.ready);
    });

    this.roomInput.addEventListener('change', () => {
      this._fire('room-change', this.roomInput.value.trim());
    });
  }

  on(event, handler) { this.handlers[event] = handler; }
  _fire(event, ...args) { this.handlers[event]?.(...args); }

  _pickMode(mode) {
    if (mode === 'solo') {
      this._fire('start', { mode: 'solo' });
      return;
    }
    this.currentMode = mode;
    this.modeLabel.textContent = mode.toUpperCase();
    this.roomInput.value = randomRoomCode();
    this.ready = false;
    this._refreshReadyButton();
    this.setReadyEnabled(false);
    this.setStatus('Connecting to peer service…', 'info');
    this.setPeer('');
    this._showStep('lobby');
    this._fire('lobby', { mode, roomCode: this.roomInput.value });
  }

  _showStep(name) {
    this.modeStep.classList.toggle('hidden', name !== 'mode');
    this.lobbyStep.classList.toggle('hidden', name !== 'lobby');
  }

  _refreshReadyButton() {
    this.readyBtn.classList.toggle('active', this.ready);
    this.readyBtn.textContent = this.ready ? 'CANCEL' : 'READY';
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  isOpen() { return !this.el.classList.contains('hidden'); }

  setStatus(text, kind = 'info') {
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${kind}`;
  }

  setPeer(text) {
    this.peerLineEl.textContent = text;
  }

  setReadyEnabled(enabled) {
    this.readyBtn.disabled = !enabled;
    if (!enabled) {
      this.ready = false;
      this._refreshReadyButton();
    }
  }

  resetReady() {
    this.ready = false;
    this._refreshReadyButton();
  }

  showMode() {
    this.currentMode = null;
    this.ready = false;
    this._refreshReadyButton();
    this._showStep('mode');
    this.show();
  }
}
