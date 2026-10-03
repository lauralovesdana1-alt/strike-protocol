// STRIKE PROTOCOL — tracers, muzzle flash, particle bursts
import * as THREE from 'three';

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this._tracerGeoPool = [];
    // reusable muzzle light
    this.muzzleLight = new THREE.PointLight(0xffc36b, 0, 9, 1.8);
    this.scene.add(this.muzzleLight);
    this._muzzleT = 0;
    // reusable flash sprite
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.4, 'rgba(255,180,80,0.85)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    this._flashTex = new THREE.CanvasTexture(c);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._flashTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.flash.scale.set(0.001, 0.001, 1);
    this.scene.add(this.flash);
  }
  tracer(from, to, color) {
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: color || 0xffe08a, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }
  muzzle(pos, big) {
    this.flash.position.copy(pos);
    const s = big ? 1.4 : 0.8;
    this.flash.scale.set(s * (0.8 + Math.random() * 0.5), s * (0.8 + Math.random() * 0.5), 1);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = big ? 26 : 12;
    this._muzzleT = 0.06;
  }
  burst(pos, color, n, speed, life, size, gravity) {
    n = n || 14; speed = speed || 6; life = life || 0.6; size = size || 0.12;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      v.push(new THREE.Vector3(
        Math.sin(ph) * Math.cos(th) * sp,
        Math.abs(Math.cos(ph)) * sp * 0.9 + 1.5,
        Math.sin(ph) * Math.sin(th) * sp));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 1, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.particles.push({ pts, v, life, maxLife: life, gravity: gravity === undefined ? 9 : gravity });
  }
  blood(pos) { this.burst(pos, 0xa31212, 16, 5, 0.5, 0.14); }
  spark(pos) { this.burst(pos, 0xffd27f, 10, 7, 0.35, 0.09); }
  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose(); t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const arr = p.pts.geometry.attributes.position.array;
      for (let j = 0; j < p.v.length; j++) {
        p.v[j].y -= p.gravity * dt;
        arr[j * 3] += p.v[j].x * dt;
        arr[j * 3 + 1] = Math.max(0.02, arr[j * 3 + 1] + p.v[j].y * dt);
        arr[j * 3 + 2] += p.v[j].z * dt;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      p.pts.material.opacity = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.scene.remove(p.pts);
        p.pts.geometry.dispose(); p.pts.material.dispose();
        this.particles.splice(i, 1);
      }
    }
    if (this._muzzleT > 0) {
      this._muzzleT -= dt;
      if (this._muzzleT <= 0) {
        this.muzzleLight.intensity = 0;
        this.flash.scale.set(0.001, 0.001, 1);
      }
    }
  }
  clear() {
    for (const t of this.tracers) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); }
    for (const p of this.particles) { this.scene.remove(p.pts); p.pts.geometry.dispose(); p.pts.material.dispose(); }
    this.tracers.length = 0; this.particles.length = 0;
    this.muzzleLight.intensity = 0;
    this.flash.scale.set(0.001, 0.001, 1);
  }
}
