// STRIKE PROTOCOL — weapons: defs, viewmodel, firing, reload, ADS
import * as THREE from 'three';

export const WEAPON_DEFS = {
  pistol: {
    key: 'pistol', name: 'P-9 SIDEARM', slot: 1,
    damage: 30, headMult: 2.0, magSize: 12, startReserve: 60, maxReserve: 240,
    rof: 0.24, auto: false, spread: 0.014, moveSpread: 0.022, pellets: 1,
    range: 70, falloffStart: 25, falloffEnd: 60, reloadTime: 1.1,
    tracer: 0xffd27f, kick: 0.014, flashBig: false, sfx: 'pistol'
  },
  rifle: {
    key: 'rifle', name: 'AR-77 CARBINE', slot: 2,
    damage: 24, headMult: 2.0, magSize: 30, startReserve: 150, maxReserve: 420,
    rof: 0.105, auto: true, spread: 0.02, moveSpread: 0.026, pellets: 1,
    range: 95, falloffStart: 30, falloffEnd: 85, reloadTime: 1.7,
    tracer: 0xffe08a, kick: 0.011, flashBig: false, sfx: 'rifle'
  },
  shotgun: {
    key: 'shotgun', name: 'M500 BREACHER', slot: 3,
    damage: 12, headMult: 1.75, magSize: 6, startReserve: 30, maxReserve: 84,
    rof: 0.95, auto: false, spread: 0.06, moveSpread: 0.02, pellets: 8,
    range: 38, falloffStart: 10, falloffEnd: 30, reloadTime: 2.3,
    tracer: 0xff9a5f, kick: 0.055, flashBig: true, sfx: 'shotgun'
  },
  sniper: {
    key: 'sniper', name: 'LR-8 LONGSHOT', slot: 4,
    damage: 140, headMult: 2.5, magSize: 5, startReserve: 20, maxReserve: 55,
    rof: 1.2, auto: false, spread: 0.0012, moveSpread: 0.035, pellets: 1,
    range: 220, falloffStart: 90, falloffEnd: 200, reloadTime: 2.8,
    tracer: 0xbfe3ff, kick: 0.07, flashBig: true, sfx: 'sniper', scope: true
  }
};
export const UNLOCK_ORDER = ['pistol', 'rifle', 'shotgun', 'sniper'];

function buildViewmodel(key) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2026 });
  const mid = new THREE.MeshLambertMaterial({ color: 0x3a4149 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x8a5f28 });
  const add = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); g.add(mesh); return mesh;
  };
  if (key === 'pistol') {
    add(0.06, 0.09, 0.24, dark, 0, 0, 0);
    add(0.05, 0.12, 0.07, mid, 0, -0.09, 0.07);
    add(0.02, 0.02, 0.02, accent, 0, 0.055, -0.1);
  } else if (key === 'rifle') {
    add(0.07, 0.1, 0.55, dark, 0, 0, -0.05);
    add(0.06, 0.13, 0.09, mid, 0, -0.1, 0.12);
    add(0.05, 0.1, 0.07, mid, 0, -0.09, -0.12);
    add(0.03, 0.05, 0.16, dark, 0, 0.07, 0.02);
    add(0.025, 0.025, 0.3, mid, 0, 0.01, -0.42);
    add(0.02, 0.03, 0.02, accent, 0, 0.06, -0.2);
  } else if (key === 'shotgun') {
    add(0.08, 0.1, 0.5, mid, 0, 0, -0.02);
    add(0.06, 0.06, 0.42, dark, 0, -0.045, -0.05);
    add(0.06, 0.12, 0.1, dark, 0, -0.09, 0.14);
    add(0.03, 0.03, 0.1, accent, 0, 0.065, -0.15);
  } else {
    add(0.06, 0.09, 0.7, dark, 0, 0, -0.1);
    add(0.05, 0.12, 0.08, mid, 0, -0.09, 0.14);
    add(0.04, 0.06, 0.2, mid, 0, 0.075, 0.0);
    add(0.015, 0.015, 0.09, dark, 0, 0.075, -0.14);
    add(0.05, 0.05, 0.05, accent, 0, 0.075, 0.1);
  }
  const tip = new THREE.Object3D();
  const barrelLen = key === 'pistol' ? 0.16 : key === 'rifle' ? 0.6 : key === 'shotgun' ? 0.32 : 0.55;
  tip.position.set(0, 0.01, -barrelLen);
  g.add(tip);
  g.userData.tip = tip;
  return g;
}

export class WeaponSystem {
  constructor(camera, audio, fx) {
    this.camera = camera;
    this.audio = audio;
    this.fx = fx;
    this.unlocked = ['pistol'];
    this.state = {}; // key -> {mag, reserve}
    this.current = 'pistol';
    this.lastShot = -10;
    this.reloading = false;
    this.reloadEnd = 0;
    this.aiming = false;
    this.kickPitch = 0;
    this.vmRoot = new THREE.Group();
    this.vmRoot.position.set(0.28, -0.26, -0.5);
    camera.add(this.vmRoot);
    this.vm = null;
    this._equip('pistol');
    this.switchCooldown = 0;
  }
  reset(unlockedList) {
    this.unlocked = unlockedList.slice();
    this.state = {};
    for (const k of this.unlocked) {
      const d = WEAPON_DEFS[k];
      this.state[k] = { mag: d.magSize, reserve: d.startReserve };
    }
    this.reloading = false;
    this._equip(this.unlocked[0]);
  }
  unlock(key) {
    if (this.unlocked.includes(key)) return false;
    const d = WEAPON_DEFS[key];
    this.unlocked.push(key);
    this.state[key] = { mag: d.magSize, reserve: d.startReserve };
    return true;
  }
  refillAmmo(frac) {
    for (const k of this.unlocked) {
      const d = WEAPON_DEFS[k], s = this.state[k];
      s.reserve = Math.min(d.maxReserve, s.reserve + Math.ceil(d.maxReserve * frac));
    }
  }
  refillAll() {
    for (const k of this.unlocked) {
      const d = WEAPON_DEFS[k];
      this.state[k] = { mag: d.magSize, reserve: d.startReserve };
    }
  }
  _equip(key) {
    if (this.vm) this.vmRoot.remove(this.vm);
    this.current = key;
    this.vm = buildViewmodel(key);
    this.vmRoot.add(this.vm);
    this.reloading = false;
    this.switchCooldown = 0.25;
  }
  select(key) {
    if (!this.unlocked.includes(key) || key === this.current || this.switchCooldown > 0) return false;
    this.audio.uiClick();
    this._equip(key);
    return true;
  }
  cycle() {
    const i = this.unlocked.indexOf(this.current);
    const nxt = this.unlocked[(i + 1) % this.unlocked.length];
    this.select(nxt);
  }
  selectSlot(n) {
    const k = UNLOCK_ORDER[n - 1];
    if (k) this.select(k);
  }
  def() { return WEAPON_DEFS[this.current]; }
  ammo() { return this.state[this.current]; }
  startReload(now) {
    const d = this.def(), s = this.ammo();
    if (this.reloading || s.mag >= d.magSize || s.reserve <= 0) return false;
    this.reloading = true;
    this.reloadEnd = now + d.reloadTime;
    this.audio.reload();
    return true;
  }
  tryFire(now, origin, baseDir, moving) {
    const d = this.def(), s = this.ammo();
    if (this.reloading || now < this.reloadEnd) return { fired: false };
    if (this.switchCooldown > 0) return { fired: false };
    if (now - this.lastShot < d.rof) return { fired: false };
    if (s.mag <= 0) { this.audio.dryFire(); this.lastShot = now; return { fired: false, dry: true }; }
    this.lastShot = now;
    s.mag -= 1;
    const spread = (d.spread + (moving ? d.moveSpread : 0)) * (this.aiming ? 0.35 : 1);
    const dirs = [];
    for (let i = 0; i < d.pellets; i++) {
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      dir.normalize();
      dirs.push(dir);
    }
    // world-space muzzle position
    const tip = new THREE.Vector3();
    this.vm.userData.tip.getWorldPosition(tip);
    this.fx.muzzle(tip, d.flashBig);
    this.audio.shoot(d.sfx);
    this.kickPitch += d.kick;
    // viewmodel kickback
    this.vm.position.z = 0.09;
    return { fired: true, dirs, muzzle: tip, def: d };
  }
  damageAt(dist) {
    const d = this.def();
    if (dist <= d.falloffStart) return d.damage;
    if (dist >= d.falloffEnd) return d.damage * 0.45;
    const t = (dist - d.falloffStart) / (d.falloffEnd - d.falloffStart);
    return d.damage * (1 - 0.55 * t);
  }
  update(now, dt) {
    if (this.switchCooldown > 0) this.switchCooldown -= dt;
    if (this.reloading && now >= this.reloadEnd) {
      const d = this.def(), s = this.ammo();
      const need = d.magSize - s.mag;
      const take = Math.min(need, s.reserve);
      s.mag += take; s.reserve -= take;
      this.reloading = false;
    }
    // viewmodel recover + sway
    if (this.vm) {
      this.vm.position.z += (0 - this.vm.position.z) * Math.min(1, dt * 10);
      this.vm.position.y = Math.sin(now * 1.7) * 0.004;
    }
    if (this.kickPitch > 0) this.kickPitch = Math.max(0, this.kickPitch - dt * 0.25);
    // ADS positioning
    const target = this.aiming && !this.def().scope
      ? { x: 0, y: -0.185, z: -0.42 }
      : { x: 0.28, y: -0.26, z: -0.5 };
    const k = Math.min(1, dt * 12);
    this.vmRoot.position.x += (target.x - this.vmRoot.position.x) * k;
    this.vmRoot.position.y += (target.y - this.vmRoot.position.y) * k;
    this.vmRoot.position.z += (target.z - this.vmRoot.position.z) * k;
    this.vmRoot.visible = !(this.aiming && this.def().scope);
  }
  setAiming(b) { this.aiming = b; }
  muzzleWorld(out) {
    if (!this.vm) return null;
    this.vm.userData.tip.getWorldPosition(out);
    return out;
  }
}
