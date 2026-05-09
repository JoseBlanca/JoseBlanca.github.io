// Tiny wrapper around Trystero. The library is loaded lazily — we don't want
// the entire page (including solo mode) to depend on a CDN fetch.
'use strict';

const APP_ID = 'tetris-jose-blanca-2026';
const TRYSTERO_URL = 'https://esm.sh/@trystero-p2p/torrent';

let _lib = null;
let _libPromise = null;

async function loadLib() {
  if (_lib) return _lib;
  if (!_libPromise) {
    _libPromise = import(TRYSTERO_URL).then((mod) => { _lib = mod; return mod; });
  }
  return _libPromise;
}

// selfId is only valid after the lib has loaded at least once.
export function selfIdSync() {
  return _lib?.selfId ?? null;
}

export class Net {
  constructor() {
    this.room = null;
    this.actions = Object.create(null);
    this.handlers = new Map();
    this.peerId = null;
  }

  async join(roomCode) {
    const { joinRoom } = await loadLib();
    if (this.room) this.leave();
    this.room = joinRoom({ appId: APP_ID }, roomCode);
    this.room.onPeerJoin((id) => {
      this.peerId = id;
      this._emit('peer-join', id);
    });
    this.room.onPeerLeave((id) => {
      if (this.peerId === id) this.peerId = null;
      this._emit('peer-leave', id);
    });
  }

  defineActions(names) {
    if (!this.room) return;
    for (const name of names) {
      const [send, listen] = this.room.makeAction(name);
      this.actions[name] = send;
      listen((data, peerId) => this._emit(name, data, peerId));
    }
  }

  send(action, data, target = null) {
    const fn = this.actions[action];
    if (!fn) return;
    if (target) fn(data, target);
    else fn(data);
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  off(event, handler) {
    const list = this.handlers.get(event);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  }

  _emit(event, ...args) {
    const list = this.handlers.get(event);
    if (list) for (const h of list.slice()) h(...args);
  }

  leave() {
    if (!this.room) return;
    try { this.room.leave(); } catch {}
    this.room = null;
    this.peerId = null;
    this.actions = Object.create(null);
  }
}
