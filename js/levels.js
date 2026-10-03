// STRIKE PROTOCOL — 5 stage environments, builders, spawns, pickups
import * as THREE from 'three';

function groundTexture(base, blotch, n) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < (n || 900); i++) {
    g.fillStyle = blotch[Math.floor(Math.random() * blotch.length)];
    g.globalAlpha = 0.12 + Math.random() * 0.25;
    const s = 2 + Math.random() * 9;
    g.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 24);
  return t;
}

class LB {
  constructor(scene) {
    this.scene = scene;
    this.solids = [];     // meshes bullets / LOS test against
    this.colliders = [];  // Box3 for movement
  }
  ground(size, tex) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    return m;
  }
  box(w, h, d, color, x, yBase, z, opts) {
    opts = opts || {};
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, yBase + h / 2, z);
    if (opts.ry) m.rotation.y = opts.ry;
    this.scene.add(m);
    if (opts.collide !== false) {
      // axis-aligned colliders only; caller keeps rotations to multiples of 90deg or uses ry for visuals
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, yBase, z - d / 2),
        new THREE.Vector3(x + w / 2, yBase + h, z + d / 2)));
    }
    if (opts.solid !== false) this.solids.push(m);
    return m;
  }
  // axis-aligned wall from (x1,z1) to (x2,z2)
  wall(x1, z1, x2, z2, h, color, thick) {
    thick = thick || 0.8;
    if (Math.abs(x2 - x1) >= Math.abs(z2 - z1)) {
      const cx = (x1 + x2) / 2, len = Math.abs(x2 - x1) + thick;
      return this.box(len, h, thick, color, cx, 0, z1);
    }
    const cz = (z1 + z2) / 2, len = Math.abs(z2 - z1) + thick;
    return this.box(thick, h, len, color, x1, 0, cz);
  }
  crate(x, z, s, color) {
    s = s || 1.4; color = color || 0x8a6f4d;
    const m = this.box(s, s, s, color, x, 0, z);
    // edge trim
    const t = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.1, s + 0.04),
      new THREE.MeshLambertMaterial({ color: 0x5e4a33 }));
    t.position.set(x, s - 0.05, z); this.scene.add(t);
    return m;
  }
  crateStack(x, z, color) {
    this.crate(x, z, 1.4, color);
    this.crate(x + 0.2, z + 0.1, 1.1, color);
    this.box(1.1, 1.1, 1.1, color, x + 0.15, 1.4, z + 0.05);
  }
  barrel(x, z, color) {
    color = color || 0x7a3b2e;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12),
      new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, 0.55, z); this.scene.add(m);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.42, 0, z - 0.42),
      new THREE.Vector3(x + 0.42, 1.1, z + 0.42)));
    this.solids.push(m);
    return m;
  }
  sandbags(x, z, len, alongX, color) {
    color = color || 0xa8946a;
    const n = Math.max(2, Math.round(len / 1.2));
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 1.2;
      this.box(1.15, 0.55, 0.7, color, alongX ? x + o : x, 0, alongX ? z : z + o, { solid: false });
    }
    // one merged collider
    const w = alongX ? len : 0.8, d = alongX ? 0.8 : len;
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2),
      new THREE.Vector3(x + w / 2, 0.55, z + d / 2)));
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d));
    proxy.position.set(x, 0.275, z); proxy.visible = false;
    this.scene.add(proxy); this.solids.push(proxy);
  }
  tower(x, z, color) {
    color = color || 0x6e5a41;
    const legG = new THREE.BoxGeometry(0.3, 5, 0.3);
    const legM = new THREE.MeshLambertMaterial({ color });
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Mesh(legG, legM);
      l.position.set(x + ox, 2.5, z + oz); this.scene.add(l);
    }
    this.box(3.2, 0.25, 3.2, color, x, 5, z);            // platform
    this.box(3.2, 1.0, 0.15, color, x, 5.25, z - 1.55);  // rails
    this.box(3.2, 1.0, 0.15, color, x, 5.25, z + 1.55);
    this.box(0.15, 1.0, 3.2, color, x - 1.55, 5.25, z);
    this.box(3.8, 0.18, 3.8, 0x4a3d2d, x, 7.4, z);       // roof
    for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), legM);
      p.position.set(x + ox, 6.3, z + oz); this.scene.add(p);
    }
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.2, 0, z - 1.2),
      new THREE.Vector3(x + 1.2, 5, z + 1.2)));
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 6, 2.6));
    proxy.position.set(x, 3, z); proxy.visible = false;
    this.scene.add(proxy); this.solids.push(proxy);
  }
  hut(x, z, w, d, h, color, roofColor) {
    this.box(w, h, d, color, x, 0, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.6, 4),
      new THREE.MeshLambertMaterial({ color: roofColor || 0x4a3d2d }));
    roof.position.set(x, h + h * 0.3, z); roof.rotation.y = Math.PI / 4;
    this.scene.add(roof); this.solids.push(roof);
  }
  tree(x, z, s) {
    s = s || 1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 2.4 * s, 7),
      new THREE.MeshLambertMaterial({ color: 0x4d3a26 }));
    trunk.position.set(x, 1.2 * s, z); this.scene.add(trunk);
    const leafM = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((1.9 - i * 0.45) * s, 1.7 * s, 8), leafM);
      cone.position.set(x, (2.6 + i * 1.15) * s, z);
      this.scene.add(cone);
    }
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.35 * s, 0, z - 0.35 * s),
      new THREE.Vector3(x + 0.35 * s, 2.4 * s, z + 0.35 * s)));
    this.solids.push(trunk);
  }
  rock(x, z, s, color) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0),
      new THREE.MeshLambertMaterial({ color: color || 0x8b8f94 }));
    m.position.set(x, s * 0.55, z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(m);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - s * 0.8, 0, z - s * 0.8),
      new THREE.Vector3(x + s * 0.8, s * 1.2, z + s * 0.8)));
    this.solids.push(m);
  }
  car(x, z, ry, color) {
    const g = new THREE.Group();
    const bodyM = new THREE.MeshLambertMaterial({ color: color || 0x5a2e2e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), bodyM);
    body.position.y = 0.65; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x22262c }));
    cab.position.set(0, 1.25, -0.2); g.add(cab);
    const wg = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    const wm = new THREE.MeshLambertMaterial({ color: 0x141414 });
    for (const [ox, oz] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) {
      const w = new THREE.Mesh(wg, wm);
      w.rotation.z = Math.PI / 2; w.position.set(ox, 0.38, oz); g.add(w);
    }
    g.position.set(x, 0, z); g.rotation.y = ry || 0;
    this.scene.add(g);
    g.traverse(o => { if (o.isMesh) this.solids.push(o); });
    // approx collider (axis aligned, generous)
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 1.6, 0, z - 2.6),
      new THREE.Vector3(x + 1.6, 1.6, z + 2.6)));
  }
  building(x, z, w, h, d, color) {
    this.box(w, h, d, color, x, 0, z);
    // dark window strips
    const wm = new THREE.MeshLambertMaterial({ color: 0x14181e });
    for (let yy = 3; yy < h - 1; yy += 3.4) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 1.1, 0.1), wm);
      strip.position.set(x, yy, z + d / 2 + 0.03); this.scene.add(strip);
    }
  }
  tank(x, z, r, h, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14),
      new THREE.MeshLambertMaterial({ color: color || 0xb8c0c8 }));
    m.position.set(x, h / 2, z); this.scene.add(m);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - r, 0, z - r),
      new THREE.Vector3(x + r, h, z + r)));
    this.solids.push(m);
  }
  beacon(x, z, color) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x2c3036 }));
    pole.position.y = 1.7; g.add(pole);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 14; g.add(beam);
    const light = new THREE.PointLight(color, 30, 22, 1.6);
    light.position.y = 3; g.add(light);
    g.position.set(x, 0, z);
    this.scene.add(g);
    return { group: g, beam, light, baseY: 0 };
  }
  scatter(n, rMin, rMax, fn) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      fn(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
}

// ---------------- stage builders ----------------
// Each returns { playerStart, waypoints, pickups, extraction, bounds }

function buildStage1(scene) {
  const b = new LB(scene);
  b.ground(130, groundTexture('#c2a06b', ['#a8845a', '#d8bc82', '#8f6f45']));
  const W = 52;
  // perimeter with north gate gap
  b.wall(-W, -W, W, -W, 3.2, 0x9a7f58);
  b.wall(-W, W, -6, W, 3.2, 0x9a7f58); b.wall(6, W, W, W, 3.2, 0x9a7f58);
  b.wall(-W, -W, -W, W, 3.2, 0x9a7f58); b.wall(W, -W, W, W, 3.2, 0x9a7f58);
  b.tower(0, -20, 0x6e5a41);
  b.crateStack(-14, -8); b.crateStack(12, -14); b.crateStack(16, 8);
  b.crate(-8, 14, 1.4); b.crate(8, 18, 1.4);
  b.sandbags(-6, 4, 7, true); b.sandbags(10, -2, 6, false);
  b.sandbags(-18, 20, 6, true);
  b.barrel(-11, -6, 0x7a3b2e); b.barrel(-10, -4.6, 0x4d5a6b); b.barrel(14, 10, 0x7a3b2e);
  b.hut(-24, -24, 7, 5, 2.6, 0x8a7358);
  b.hut(24, -26, 6, 6, 2.8, 0x847052);
  b.hut(-26, 26, 6, 5, 2.6, 0x8a7358);
  b.scatter(14, 8, 46, (x, z) => b.rock(x, z, 0.5 + Math.random() * 0.9, 0xb08d5f));
  const ex = b.beacon(0, 46, 0x59ff9c);
  return {
    lb: b, extractionFx: ex,
    playerStart: { x: 0, z: -44, yaw: Math.PI },
    extraction: { x: 0, z: 46 },
    pickups: [
      { kind: 'health', x: -14, z: -4 }, { kind: 'ammo', x: 12, z: -10 },
      { kind: 'health', x: 20, z: 24 }, { kind: 'ammo', x: -24, z: -20 }
    ],
    bounds: 50
  };
}

function buildStage2(scene) {
  const b = new LB(scene);
  b.ground(130, groundTexture('#6f6e6a', ['#5a5955', '#82817c', '#4a4945']));
  // ruined blocks
  b.building(-24, -18, 16, 14, 14, 0x7d7468);
  b.building(22, -24, 14, 20, 12, 0x6e6a63);
  b.building(-20, 22, 18, 10, 14, 0x84796b);
  b.building(26, 20, 12, 16, 16, 0x75705f);
  b.building(0, -2, 10, 24, 10, 0x6b655a);
  // rubble piles
  b.scatter(10, 6, 44, (x, z) => b.rock(x, z, 0.8 + Math.random() * 1.4, 0x5f5c57));
  // wrecked cars
  b.car(-8, -10, 0.4, 0x5a2e2e); b.car(10, 6, -0.7, 0x2e4a5a);
  b.car(-14, 12, 1.2, 0x4a4a2e); b.car(6, -22, 2.4, 0x3a3a3a);
  // barriers
  b.sandbags(-4, -18, 8, true, 0x8a8578); b.sandbags(14, 14, 7, false, 0x8a8578);
  b.crateStack(-30, 4, 0x6e6258); b.crateStack(30, -8, 0x6e6258);
  b.barrel(-26, -14, 0x5a2e2e); b.barrel(24, 24, 0x2e4a5a);
  // street lights (broken poles)
  b.scatter(6, 10, 40, (x, z) => b.box(0.3, 5, 0.3, 0x3a3d42, x, 0, z));
  const ex = b.beacon(38, 38, 0x59ff9c);
  return {
    lb: b, extractionFx: ex,
    playerStart: { x: -38, z: -38, yaw: -Math.PI * 0.75 },
    extraction: { x: 38, z: 38 },
    pickups: [
      { kind: 'health', x: -8, z: -6 }, { kind: 'armor', x: 0, z: 8 },
      { kind: 'ammo', x: 22, z: -18 }, { kind: 'ammo', x: -22, z: 16 },
      { kind: 'health', x: 30, z: 30 }
    ],
    bounds: 50
  };
}

function buildStage3(scene) {
  const b = new LB(scene);
  b.ground(130, groundTexture('#dfe8ee', ['#c8d4de', '#f4f8fb', '#b8c8d4']));
  // research modules
  b.box(16, 4, 6, 0xb8c4ce, -18, 0, -14);
  b.box(6, 4, 14, 0xaebac6, 14, 0, -18);
  b.box(12, 3.4, 8, 0xc2ccd6, 20, 0, 14);
  b.box(8, 3.4, 10, 0xb0bcc8, -22, 0, 18);
  // fuel tanks
  b.tank(-4, -26, 2.2, 4.5, 0xd8b13c); b.tank(2, -26, 2.2, 4.5, 0xc8c8c8);
  b.tank(28, -4, 1.8, 3.6, 0xb8c0c8);
  // ice rocks
  b.scatter(16, 10, 46, (x, z) => b.rock(x, z, 0.8 + Math.random() * 1.8, 0xcfe0ea));
  // crates + barrels
  b.crateStack(-10, 4, 0x7a8a96); b.crateStack(8, 22, 0x7a8a96);
  b.barrel(-16, -8, 0x2e4a5a); b.barrel(26, 8, 0x7a3b2e);
  // comms tower
  b.box(0.5, 12, 0.5, 0x8a949e, 0, 0, 0);
  b.box(3, 0.4, 3, 0x8a949e, 0, 12, 0);
  // low ice walls
  b.wall(-30, 30, -10, 30, 1.6, 0xd8e4ec);
  b.wall(10, -30, 30, -30, 1.6, 0xd8e4ec);
  const ex = b.beacon(-34, 34, 0x59ff9c);
  return {
    lb: b, extractionFx: ex,
    playerStart: { x: 34, z: -34, yaw: Math.PI * 0.75 },
    extraction: { x: -34, z: 34 },
    pickups: [
      { kind: 'health', x: -18, z: -8 }, { kind: 'armor', x: 14, z: -12 },
      { kind: 'ammo', x: 4, z: 6 }, { kind: 'ammo', x: -26, z: 22 },
      { kind: 'health', x: 24, z: 18 }, { kind: 'armor', x: -6, z: -22 }
    ],
    bounds: 50
  };
}

function buildStage4(scene) {
  const b = new LB(scene);
  b.ground(130, groundTexture('#3d5a2e', ['#2d4422', '#4d6a3a', '#33502a']));
  // compound walls with north gate
  const W = 46, H = 3.4, C = 0x6e6a5a;
  b.wall(-W, -W, W, -W, H, C);
  b.wall(-W, W, -5, W, H, C); b.wall(5, W, W, W, H, C);
  b.wall(-W, -W, -W, W, H, C); b.wall(W, -W, W, W, H, C);
  // jungle canopy trees (dense outside + inside)
  b.scatter(46, 6, 58, (x, z) => { if (Math.abs(x) > W + 2 || Math.abs(z) > W + 2 || Math.random() < 0.45) b.tree(x, z, 0.9 + Math.random() * 0.9); });
  // inner huts
  b.hut(-20, -16, 7, 6, 2.8, 0x5e4f3a);
  b.hut(18, -20, 6, 7, 2.8, 0x55462f);
  b.hut(-16, 20, 8, 6, 3.0, 0x5e4f3a);
  b.hut(22, 18, 6, 6, 2.8, 0x4d4030);
  // watchtowers at corners
  b.tower(-W + 4, -W + 4, 0x5e4f3a); b.tower(W - 4, W - 4, 0x5e4f3a);
  // supply crates, rocks
  b.crateStack(-6, -6); b.crateStack(10, 10); b.crateStack(-26, 2);
  b.scatter(8, 8, 40, (x, z) => b.rock(x, z, 0.6 + Math.random() * 1.1, 0x5a5a4a));
  b.sandbags(0, -30, 8, true, 0x6a7a4a);
  const ex = b.beacon(0, 40, 0x59ff9c);
  return {
    lb: b, extractionFx: ex,
    playerStart: { x: 0, z: -40, yaw: Math.PI },
    extraction: { x: 0, z: 40 },
    pickups: [
      { kind: 'health', x: -20, z: -10 }, { kind: 'armor', x: 18, z: -14 },
      { kind: 'ammo', x: -6, z: 0 }, { kind: 'ammo', x: 14, z: 16 },
      { kind: 'health', x: -28, z: 24 }, { kind: 'armor', x: 26, z: -26 },
      { kind: 'ammo', x: 0, z: -34 }
    ],
    bounds: 52
  };
}

function buildStage5(scene) {
  const b = new LB(scene);
  b.ground(140, groundTexture('#3a3d44', ['#2e3138', '#484c55', '#26282e']));
  // fortress outer walls
  const W = 50, H = 6, C = 0x4a4e57;
  b.wall(-W, -W, W, -W, H, C, 1.4);
  b.wall(-W, W, -7, W, H, C, 1.4); b.wall(7, W, W, W, H, C, 1.4);
  b.wall(-W, -W, -W, W, H, C, 1.4); b.wall(W, -W, W, W, H, C, 1.4);
  // corner bastions
  for (const [x, z] of [[-W, -W], [W, -W], [-W, W], [W, W]]) {
    b.box(7, 9, 7, 0x565b66, x, 0, z);
  }
  // inner courtyard structures
  b.building(-22, -14, 14, 12, 12, 0x555a64);
  b.building(22, -16, 12, 10, 14, 0x4e535c);
  b.building(-20, 18, 12, 9, 10, 0x555a64);
  // central command spire (boss arena)
  b.box(10, 16, 10, 0x3c4048, 0, 0, 8);
  b.box(12, 1.2, 12, 0x6e1423, 0, 16, 8);
  b.beacon(0, 8, 0xff4d4d); // red marker on the spire — boss territory
  // barricades + supplies
  b.sandbags(-10, -6, 8, true, 0x5a5e66); b.sandbags(12, 2, 8, false, 0x5a5e66);
  b.sandbags(0, 24, 9, true, 0x5a5e66);
  b.crateStack(-30, 6, 0x4a4438); b.crateStack(30, -4, 0x4a4438);
  b.crateStack(-8, 32, 0x4a4438); b.crateStack(14, 30, 0x4a4438);
  b.barrel(-14, 10, 0x6e1423); b.barrel(16, -10, 0x2e4a5a);
  b.tank(-34, -30, 2.4, 5, 0x707880);
  const ex = b.beacon(0, 44, 0x59ff9c);
  return {
    lb: b, extractionFx: ex,
    playerStart: { x: 0, z: -44, yaw: Math.PI },
    extraction: { x: 0, z: 44 },
    bossSpawn: { x: 0, z: 8 },
    pickups: [
      { kind: 'health', x: -22, z: -8 }, { kind: 'health', x: 22, z: -10 },
      { kind: 'armor', x: -10, z: 0 }, { kind: 'armor', x: 12, z: 8 },
      { kind: 'ammo', x: -30, z: 12 }, { kind: 'ammo', x: 30, z: 2 },
      { kind: 'ammo', x: -8, z: 36 }, { kind: 'health', x: 8, z: 36 },
      { kind: 'armor', x: 0, z: -34 }
    ],
    bounds: 54
  };
}

function makeWaypoints(bounds, n, avoid) {
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < 200) {
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * (bounds - 14);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 12) continue;
    pts.push([x, z]);
  }
  return pts;
}

function spawnPositions(list, bounds, avoid, per) {
  const out = [];
  for (const e of list) {
    for (let i = 0; i < e.n; i++) {
      let x = 0, z = 0, guard = 0;
      do {
        const a = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * (bounds - 18);
        x = Math.cos(a) * r; z = Math.sin(a) * r;
        guard++;
      } while (guard < 60 && Math.hypot(x - avoid.x, z - avoid.z) < 16);
      out.push({ type: e.type, x, z, wps: per });
    }
  }
  return out;
}

export const STAGES = [
  {
    name: 'STAGE 1 — DUSTLINE OUTPOST', short: 'DUSTLINE OUTPOST',
    sub: 'ARID SECTOR // 0600 HRS',
    sky: 0xd8c39a, fog: [0xd8c39a, 40, 130], hemi: [0xfff2d8, 0x8a6f45, 0.9], sun: [0xffe8c0, 1.1],
    intel: ['Intel reports a hostile forward outpost running drone relays across the arid sector.',
      'Sweep the compound. Eliminate all hostiles, then reach the green extraction beacon at the north gate.',
      'Sidearm only for this op — make every round count.'],
    build: buildStage1,
    enemies: [{ type: 'grunt', n: 6 }, { type: 'runner', n: 2 }],
    unlock: null
  },
  {
    name: 'STAGE 2 — ASHFALL DISTRICT', short: 'ASHFALL DISTRICT',
    sub: 'URBAN RUINS // 1430 HRS',
    sky: 0x8a8d94, fog: [0x8a8d94, 35, 115], hemi: [0xd8dce2, 0x4a4a48, 0.85], sun: [0xcfd4da, 0.9],
    intel: ['The enemy has fortified a ruined city district. Expect runners in the rubble and a heavy weapons team.',
      'New hardware inbound: the AR-77 CARBINE is now unlocked for this stage.',
      'Clear every hostile, then exfiltrate at the green beacon, north-east corner.'],
    build: buildStage2,
    enemies: [{ type: 'grunt', n: 7 }, { type: 'runner', n: 3 }, { type: 'heavy', n: 1 }],
    unlock: 'rifle'
  },
  {
    name: 'STAGE 3 — WHITEOUT STATION', short: 'WHITEOUT STATION',
    sub: 'ARCTIC RESEARCH SITE // 0930 HRS',
    sky: 0xcfe0ee, fog: [0xcfe0ee, 30, 110], hemi: [0xffffff, 0x9ab0c4, 1.0], sun: [0xe8f2ff, 1.0],
    intel: ['A hijacked arctic research station is broadcasting jamming signals. Snipers hold the high ground — keep moving.',
      'New hardware: the M500 BREACHER shotgun is now unlocked. Devastating up close.',
      'Eliminate all hostiles, then reach the extraction beacon on the west ridge.'],
    build: buildStage3,
    enemies: [{ type: 'grunt', n: 7 }, { type: 'runner', n: 3 }, { type: 'heavy', n: 2 }, { type: 'sniper', n: 2 }],
    unlock: 'shotgun'
  },
  {
    name: 'STAGE 4 — VERDANT STRONGHOLD', short: 'VERDANT STRONGHOLD',
    sub: 'JUNGLE COMPOUND // 1715 HRS',
    sky: 0x9fc48a, fog: [0x87a86f, 28, 105], hemi: [0xe8ffd8, 0x2d4a22, 0.9], sun: [0xfff0c8, 0.85],
    intel: ['Deep in the jungle canopy: the enemy\'s regional stronghold. Heavy patrols, sniper nests in the towers.',
      'New hardware: the LR-8 LONGSHOT sniper rifle is now unlocked. Right-click to scope.',
      'Wipe the compound, then exfiltrate at the north gate beacon.'],
    build: buildStage4,
    enemies: [{ type: 'grunt', n: 9 }, { type: 'runner', n: 4 }, { type: 'heavy', n: 2 }, { type: 'sniper', n: 3 }],
    unlock: 'sniper'
  },
  {
    name: 'STAGE 5 — IRON BASTION', short: 'IRON BASTION',
    sub: 'ENEMY FORTRESS // 0400 HRS',
    sky: 0x2a2d36, fog: [0x2a2d36, 30, 120], hemi: [0x8a94a8, 0x1a1c22, 0.8], sun: [0xff9a5f, 0.7],
    intel: ['This is it. The Iron Bastion — WARLORD VEX commands from the central spire.',
      'Vex is heavily armored, fields a rotary cannon, and calls down mortar strikes. Do not stand still.',
      'Kill every hostile including Vex, then reach the extraction beacon. End the protocol.'],
    build: buildStage5,
    enemies: [{ type: 'grunt', n: 8 }, { type: 'runner', n: 3 }, { type: 'heavy', n: 2 }, { type: 'sniper', n: 2 }, { type: 'boss', n: 1 }],
    unlock: null, boss: true
  }
];

export function difficultyFor(stageIdx) {
  return {
    hpMul: 1 + 0.3 * stageIdx,
    dmgMul: 1 + 0.22 * stageIdx,
    accMul: 0.8 + 0.12 * stageIdx
  };
}
export { makeWaypoints, spawnPositions };
