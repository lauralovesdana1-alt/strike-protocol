// STRIKE PROTOCOL — keyboard / mouse / pointer-lock / touch input
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.firing = false;
    this.aiming = false;
    this.locked = false;
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.touchMove = { x: 0, y: 0 };
    this.touchFire = false;
    this.touchAim = false;
    this.jumpQueued = false;
    this.reloadQueued = false;
    this.cycleWeaponDir = 0;
    this.digitQueued = -1;
    this.onLockLost = null;
    this.onPauseKey = null;
    this._joyId = null; this._lookId = null;
    this._joyBase = { x: 0, y: 0 };
    this._lookLast = { x: 0, y: 0 };
    this._bind();
  }
  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.onPauseKey) this.onPauseKey();
      if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
      if (e.code === 'KeyR') this.reloadQueued = true;
      if (e.code === 'KeyQ') this.cycleWeaponDir = 1;
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 4) this.digitQueued = n;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.firing = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.onLockLost) this.onLockLost();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2) this.aiming = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.aiming = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- touch ----
    const joyBase = document.getElementById('joy-base');
    const joyKnob = document.getElementById('joy-knob');
    const lookZone = document.getElementById('touch-ui');
    document.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        if (el && el.classList && el.classList.contains('tbtn')) continue; // buttons handle themselves
        if (t.clientX < window.innerWidth * 0.45 && this._joyId === null) {
          this._joyId = t.identifier;
          this._joyBase = { x: t.clientX, y: t.clientY };
          joyBase.style.left = (t.clientX - 60) + 'px';
          joyBase.style.top = (t.clientY - 60) + 'px';
          joyBase.style.bottom = 'auto';
        } else if (this._lookId === null) {
          this._lookId = t.identifier;
          this._lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          let dx = (t.clientX - this._joyBase.x) / 48;
          let dy = (t.clientY - this._joyBase.y) / 48;
          const len = Math.hypot(dx, dy);
          if (len > 1) { dx /= len; dy /= len; }
          this.touchMove.x = dx; this.touchMove.y = dy;
          joyKnob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
        } else if (t.identifier === this._lookId) {
          this.lookDX += (t.clientX - this._lookLast.x) * 2.4;
          this.lookDY += (t.clientY - this._lookLast.y) * 2.4;
          this._lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this._joyId = null; this.touchMove.x = 0; this.touchMove.y = 0;
          joyKnob.style.transform = 'translate(-50%,-50%)';
        }
        if (t.identifier === this._lookId) this._lookId = null;
      }
    };
    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);

    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); down(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (up) up(); }, { passive: false });
    };
    hold('btn-fire', () => { this.touchFire = true; }, () => { this.touchFire = false; });
    hold('btn-ads', () => { this.touchAim = true; }, () => { this.touchAim = false; });
    hold('btn-jump', () => { this.jumpQueued = true; });
    hold('btn-reload', () => { this.reloadQueued = true; });
    hold('btn-weapon', () => { this.cycleWeaponDir = 1; });
    document.getElementById('btn-pause-m').addEventListener('touchstart', (e) => {
      e.preventDefault(); if (this.onPauseKey) this.onPauseKey();
    }, { passive: false });
  }
  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) {} });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) {} }
  }
  takeLook() {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }
  takeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }
  takeReload() { const r = this.reloadQueued; this.reloadQueued = false; return r; }
  takeCycle() { const c = this.cycleWeaponDir; this.cycleWeaponDir = 0; return c; }
  takeDigit() { const d = this.digitQueued; this.digitQueued = -1; return d; }
  moveAxes() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.touchMove.x; z -= this.touchMove.y;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z };
  }
  sprinting() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  wantFire() { return this.firing || this.touchFire; }
  wantAim() { return this.aiming || this.touchAim; }
}
