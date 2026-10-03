// STRIKE PROTOCOL — enemy types, AI (patrol/alert/combat), boss
import * as THREE from 'three';

export const ENEMY_DEFS = {
  grunt:  { label: 'Grunt',  hp: 65,  speed: 3.4, sight: 38, fov: 2.0, hear: 26,
            dmg: 9,  burst: 3, burstGap: 0.16, cooldown: 1.7, preferred: 20, range: 46,
            acc: 0.5,  score: 100, color: 0x5a6b3f, h: 1.8 },
  runner: { label: 'Runner', hp: 40,  speed: 6.8, sight: 30, fov: 2.2, hear: 22,
            dmg: 14, meleeRange: 2.3, attackCd: 1.1, score: 120, color: 0x8a3b2e, h: 1.65 },
  heavy:  { label: 'Heavy',  hp: 260, speed: 2.1, sight: 34, fov: 1.8, hear: 24,
            dmg: 12, burst: 5, burstGap: 0.13, cooldown: 2.3, preferred: 16, range: 40,
            acc: 0.45, score: 250, color: 0x3d4149, h: 2.0, bulky: true },
  sniper: { label: 'Sniper', hp: 55,  speed: 2.6, sight: 75, fov: 1.4, hear: 30,
            dmg: 26, burst: 1, burstGap: 0.2,  cooldown: 3.4, preferred: 46, range: 95,
            acc: 0.62, score: 200, color: 0x9aa39b, h: 1.8 },
  boss:   { label: 'WARLORD VEX', hp: 1700, speed: 2.7, sight: 65, fov: 2.4, hear: 60,
            dmg: 14, burst: 6, burstGap: 0.11, cooldown: 2.0, preferred: 22, range: 55,
            acc: 0.55, score: 2000, color: 0x6e1423, h: 2.75, bulky: true, boss: true, projCd: 5.0 }
};

const _rc = new THREE.Raycaster();
export function losClear(from, to, solids) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.001) return true;
  dir.normalize();
  _rc.set(from, dir);
  _rc.far = dist - 0.35;
  return _rc.intersectObjects(solids, false).length === 0;
}

function box(w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }));
}

export class Enemy {
  constructor(scene, type, x, z, mods, waypoints) {
    this.scene = scene;
    this.type = type;
    this.def = ENEMY_DEFS[type];
    this.maxHp = Math.round(this.def.hp * (mods.hpMul || 1));
    this.hp = this.maxHp;
    this.dmgMul = mods.dmgMul || 1;
    this.accMul = mods.accMul || 1;
    this.waypoints = waypoints || [[x, z]];
    this.wpIndex = Math.floor(Math.random() * this.waypoints.length);
    this.state = 'patrol'; // patrol | alert | combat | dead
    this.waitT = Math.random() * 2;
    this.thinkT = Math.random() * 0.2;
    this.fireCd = 1 + Math.random();
    this.burstLeft = 0; this.burstT = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.meleeCd = 0; this.lungeT = 0;
    this.projT = this.def.projCd || 0;
    this.alertPos = null; this.alertT = 0;
    this.lastSeen = new THREE.Vector3();
    this.dead = false; this.deathT = 0;
    this.walkPhase = Math.random() * 10;
    this.hitMeshes = [];
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this._buildMesh();
    scene.add(this.group);
    // floating health bar (scene-level for clean billboarding)
    this.barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x140a0a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.95, depthWrite: false }));
    this.barBg.visible = this.barFg.visible = false;
    if (!this.def.boss) { scene.add(this.barBg); scene.add(this.barFg); }
  }
  _buildMesh() {
    const c = this.def.color, s = this.def.boss ? 1.5 : this.def.bulky ? 1.18 : 1;
    const h = this.def.h;
    const reg = (mesh, part) => {
      mesh.userData.enemy = this; mesh.userData.part = part;
      this.hitMeshes.push(mesh); return mesh;
    };
    // legs
    const legG = new THREE.BoxGeometry(0.22 * s, 0.75 * s, 0.24 * s);
    const legM = new THREE.MeshLambertMaterial({ color: 0x24282e });
    this.legL = new THREE.Mesh(legG, legM); this.legL.position.set(-0.16 * s, 0.375 * s, 0);
    this.legR = new THREE.Mesh(legG, legM); this.legR.position.set(0.16 * s, 0.375 * s, 0);
    this.group.add(this.legL, this.legR);
    for (const leg of [this.legL, this.legR]) {
      leg.userData.enemy = this; leg.userData.part = 'body';
      this.hitMeshes.push(leg);
    }
    // torso
    const torso = reg(box(0.62 * s, 0.72 * s, 0.36 * s, c), 'body');
    torso.position.y = 0.75 * s + 0.36 * s;
    this.group.add(torso);
    // vest / accents
    const vest = box(0.66 * s, 0.3 * s, 0.4 * s, 0x1c1f24);
    vest.position.y = torso.position.y - 0.1; this.group.add(vest);
    if (this.def.boss || this.def.bulky) {
      const pad = box(0.24 * s, 0.18 * s, 0.4 * s, this.def.boss ? 0xa31212 : 0x2c3036);
      pad.position.set(-0.42 * s, torso.position.y + 0.32 * s, 0); this.group.add(pad);
      const pad2 = pad.clone(); pad2.position.x = 0.42 * s; this.group.add(pad2);
    }
    // head
    this.headMat = new THREE.MeshLambertMaterial({ color: 0xc9a07a });
    const head = reg(new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.3 * s, 0.3 * s), this.headMat), 'head');
    head.position.y = torso.position.y + 0.36 * s + 0.17 * s;
    this.group.add(head);
    // visor (glows red in combat)
    this.visorMat = new THREE.MeshBasicMaterial({ color: 0x331111 });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.07 * s, 0.02), this.visorMat);
    visor.position.set(0, head.position.y + 0.02, 0.16 * s);
    this.group.add(visor);
    // gun for ranged types
    if (this.type !== 'runner') {
      const gunLen = this.type === 'sniper' ? 1.15 : 0.75;
      const gun = box(0.09, 0.12, gunLen, 0x14161a);
      gun.position.set(0.3 * s, torso.position.y + 0.05, -0.3);
      this.group.add(gun);
      this.gunTip = new THREE.Object3D();
      this.gunTip.position.set(0.3 * s, torso.position.y + 0.08, -0.3 - gunLen / 2);
      this.group.add(this.gunTip);
    } else {
      // runner claws
      const claw = box(0.1, 0.1, 0.4, 0xd8d8d8);
      claw.position.set(-0.36 * s, torso.position.y, -0.25); this.group.add(claw);
      const claw2 = claw.clone(); claw2.position.x = 0.36 * s; this.group.add(claw2);
      this.gunTip = new THREE.Object3D();
      this.gunTip.position.set(0, torso.position.y + 0.1, -0.4);
      this.group.add(this.gunTip);
    }
    this.eyeY = head.position.y;
  }
  get pos() { return this.group.position; }
  muzzle(out) { this.gunTip.getWorldPosition(out); return out; }
  damage(amount, head, ctx) {
    if (this.dead) return false;
    this.hp -= amount;
    this.barBg.visible = this.barFg.visible = true;
    if (this.hp <= 0) {
      this.dead = true; this.deathT = 0; this.state = 'dead';
      ctx.fx.blood(new THREE.Vector3(this.pos.x, 1.2, this.pos.z));
      this.barBg.visible = this.barFg.visible = false;
      return true;
    }
    // getting shot alerts the enemy
    if (this.state === 'patrol') {
      this.state = 'alert';
      this.alertPos = ctx.playerPos.clone();
      this.alertT = 2.5;
    }
    return false;
  }
  _perceive(ctx) {
    const dx = ctx.playerPos.x - this.pos.x, dz = ctx.playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!ctx.playerAlive || dist > this.def.sight) {
      if (this.state === 'combat') { // lost sight -> hunt last known
        this.state = 'alert'; this.alertPos = this.lastSeen.clone(); this.alertT = 4;
      }
      return;
    }
    // hearing gunshots
    for (const s of ctx.hearShots) {
      if (ctx.time - s.t < 1.2 && Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < this.def.hear) {
        if (this.state === 'patrol') { this.state = 'alert'; this.alertPos = new THREE.Vector3(s.x, 0, s.z); this.alertT = 3.5; }
      }
    }
    const fx = Math.sin(this.group.rotation.y), fz = Math.cos(this.group.rotation.y);
    const dot = (dx * fx + dz * fz) / (dist || 1);
    const inFov = Math.acos(Math.max(-1, Math.min(1, dot))) < this.def.fov / 2;
    if (inFov || dist < 7) {
      const eye = new THREE.Vector3(this.pos.x, this.eyeY, this.pos.z);
      const chest = new THREE.Vector3(ctx.playerPos.x, 1.25, ctx.playerPos.z);
      if (losClear(eye, chest, ctx.solids)) {
        if (this.state !== 'combat') {
          this.state = 'combat';
          // alert nearby allies
          for (const o of ctx.enemies) {
            if (o !== this && !o.dead && o.state === 'patrol' &&
                Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 14) {
              o.state = 'alert'; o.alertPos = ctx.playerPos.clone(); o.alertT = 3;
            }
          }
        }
        this.lastSeen.copy(ctx.playerPos);
        this.visorMat.color.setHex(0xff2222);
        return;
      }
    }
    if (this.state === 'combat') { this.state = 'alert'; this.alertPos = this.lastSeen.clone(); this.alertT = 4; }
    this.visorMat.color.setHex(0x331111);
  }
  _moveToward(tx, tz, dt, ctx, speedMul) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const sp = this.def.speed * (speedMul || 1);
    let nx = this.pos.x + (dx / d) * sp * dt;
    let nz = this.pos.z + (dz / d) * sp * dt;
    const res = ctx.collide(nx, nz, 0.45);
    nx = res.x; nz = res.z;
    // level bounds
    const bd = Math.hypot(nx, nz);
    if (bd > ctx.bounds) { nx *= ctx.bounds / bd; nz *= ctx.bounds / bd; }
    // separation
    for (const o of ctx.enemies) {
      if (o === this || o.dead) continue;
      const ox = nx - o.pos.x, oz = nz - o.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.1 && od > 0.001) { nx += (ox / od) * dt * 2.2; nz += (oz / od) * dt * 2.2; }
    }
    this.pos.x = nx; this.pos.z = nz;
    this.group.rotation.y = Math.atan2(dx, dz);
    this.walkPhase += dt * sp * 2.4;
    this.pos.y = Math.abs(Math.sin(this.walkPhase)) * 0.07;
    return d < 0.6;
  }
  _facePlayer(ctx) {
    const dx = ctx.playerPos.x - this.pos.x, dz = ctx.playerPos.z - this.pos.z;
    this.group.rotation.y = Math.atan2(dx, dz);
  }
  _shootOnce(ctx, dist) {
    const movePenalty = ctx.playerMoving ? 0.72 : 1;
    const distF = Math.max(0.22, Math.min(1, 1.25 - dist / this.def.range));
    const chance = Math.min(0.92, this.def.acc * this.accMul * distF * movePenalty);
    const hit = Math.random() < chance;
    const dmg = Math.round(this.def.dmg * this.dmgMul * (0.9 + Math.random() * 0.25));
    ctx.enemyFire(this, hit, dmg, false);
  }
  update(dt, ctx) {
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.35);
      this.group.rotation.x = -Math.PI / 2 * k;
      if (this.deathT > 2.2) { this._gone = true; }
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this._perceive(ctx); this.thinkT = 0.15; }
    this.fireCd -= dt; this.meleeCd -= dt;
    const px = ctx.playerPos.x, pz = ctx.playerPos.z;
    const distP = Math.hypot(px - this.pos.x, pz - this.pos.z);

    if (this.state === 'patrol') {
      const wp = this.waypoints[this.wpIndex % this.waypoints.length];
      if (this.waitT > 0) { this.waitT -= dt; this.pos.y = 0; }
      else if (this._moveToward(wp[0], wp[1], dt, ctx, 0.45)) {
        this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
        this.waitT = 1 + Math.random() * 2;
      }
    } else if (this.state === 'alert') {
      this.alertT -= dt;
      if (this.alertPos) {
        if (this._moveToward(this.alertPos.x, this.alertPos.z, dt, ctx, 0.8)) {
          // arrived: scan around
          this.group.rotation.y += dt * 2.2;
          if (this.alertT <= 0) { this.state = 'patrol'; this.visorMat.color.setHex(0x331111); }
        }
      } else if (this.alertT <= 0) this.state = 'patrol';
    } else if (this.state === 'combat') {
      this._facePlayer(ctx);
      if (this.type === 'runner') {
        if (distP > this.def.meleeRange) {
          this._moveToward(px, pz, dt, ctx, 1);
        } else if (this.meleeCd <= 0) {
          this.meleeCd = this.def.attackCd;
          this.lungeT = 0.22;
          ctx.enemyFire(this, true, Math.round(this.def.dmg * this.dmgMul), true);
        }
      } else {
        const pref = this.def.preferred;
        if (distP > pref + 5) this._moveToward(px, pz, dt, ctx, 0.85);
        else if (distP < pref - 7) {
          const ax = this.pos.x + (this.pos.x - px), az = this.pos.z + (this.pos.z - pz);
          this._moveToward(ax, az, dt, ctx, 0.6);
        } else {
          // strafe
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = 1 + Math.random() * 1.4; }
          const ang = Math.atan2(px - this.pos.x, pz - this.pos.z) + Math.PI / 2 * this.strafeDir;
          this._moveToward(this.pos.x + Math.sin(ang) * 3, this.pos.z + Math.cos(ang) * 3, dt, ctx, 0.5);
          this._facePlayer(ctx);
        }
        // firing
        if (this.fireCd <= 0 && this.burstLeft <= 0) this.burstLeft = this.def.burst;
        if (this.burstLeft > 0) {
          this.burstT -= dt;
          if (this.burstT <= 0) {
            this.burstT = this.def.burstGap;
            this.burstLeft--;
            this._shootOnce(ctx, distP);
            this.lungeT = 0.12; // gun kick visual
            if (this.burstLeft <= 0) this.fireCd = this.def.cooldown * (0.75 + Math.random() * 0.6);
          }
        }
        // boss projectile volley
        if (this.def.boss) {
          this.projT -= dt;
          if (this.projT <= 0 && distP < 60) {
            this.projT = this.def.projCd;
            const m = this.muzzle(new THREE.Vector3());
            for (let i = 0; i < 3; i++) {
              const tgt = new THREE.Vector3(px + (Math.random() - 0.5) * 6, 1.2, pz + (Math.random() - 0.5) * 6);
              ctx.spawnProjectile(m, tgt);
            }
            ctx.audio.bossRoar();
          }
        }
      }
    }
    if (this.lungeT > 0) this.lungeT -= dt;
    // health bar billboard
    if (this.barBg.visible) {
      const f = Math.max(0, this.hp / this.maxHp);
      this.barFg.scale.x = Math.max(0.001, f);
      this.barFg.position.set(this.pos.x - 0.45 * (1 - f), this.eyeY + 0.55, this.pos.z);
      this.barBg.position.set(this.pos.x, this.eyeY + 0.55, this.pos.z);
      this.barBg.lookAt(ctx.camera.position);
      this.barFg.lookAt(ctx.camera.position);
    }
  }
  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.barBg); this.scene.remove(this.barFg);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); }
    });
    this.barBg.geometry.dispose(); this.barBg.material.dispose();
    this.barFg.geometry.dispose(); this.barFg.material.dispose();
  }
}
