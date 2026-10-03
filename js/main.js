// STRIKE PROTOCOL — game bootstrap, player, combat loop, stage flow
import * as THREE from 'three';
import { GameAudio } from './audio.js';
import { InputManager } from './input.js';
import { FX } from './fx.js';
import { WEAPON_DEFS, UNLOCK_ORDER, WeaponSystem } from './weapons.js';
import { ENEMY_DEFS, Enemy, losClear } from './enemies.js';
import { STAGES, difficultyFor, makeWaypoints, spawnPositions } from './levels.js';
import { HUD } from './hud.js';

const EYE = 1.7, RADIUS = 0.42, GRAV = 15, JUMP_V = 6;

class Game {
  constructor() {
    this.state = 'menu';
    this.stageIdx = 0;
    this.unlockedStage = parseInt(localStorage.getItem('sp_unlocked') || '0', 10);
    this.best = parseInt(localStorage.getItem('sp_best') || '0', 10);
    this.campaignScore = 0;
    this.campaignKills = 0;
    this.campaignTime = 0;
    this.unlockedWeapons = ['pistol'];

    const container = document.getElementById('game-container');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    document.getElementById('loading').style.display = 'none';

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 500);
    this.camera.rotation.order = 'YXZ';

    this.audio = new GameAudio();
    this.input = new InputManager(this.renderer.domElement);
    this.hud = new HUD();
    this.weapons = new WeaponSystem(this.camera, this.audio, null);
    this.fx = null;
    this._ray = new THREE.Raycaster();

    // player
    this.p = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, hp: 100, armor: 0,
               alive: true, lastHurt: -10, grounded: true, stepT: 0 };
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.hearShots = [];
    this.solids = [];
    this.colliders = [];
    this.stats = null;
    this.boss = null;
    this.extraction = null;
    this.extractFx = null;
    this.bounds = 50;
    this.stageTime = 0;

    this._wireUI();
    window.addEventListener('resize', () => this._resize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked && !this.input.isTouch) this.input.requestLock();
    });
    this.input.onLockLost = () => { if (this.state === 'playing') this.pause(); };
    this.input.onPauseKey = () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    };
    this.hud.setMenuBest(this.best > 0 ? 'BEST: ' + this.best.toLocaleString() : 'NO RECORD YET');
    this.hud.buildStageList(STAGES, this.unlockedStage, (i) => this.showBriefing(i));
    this.hud.showScreen('screen-menu');
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._loop());
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _wireUI() {
    const H = this.hud, A = this.audio;
    H.onButton('btn-deploy', () => { A.unlock(); A.uiClick(); this.showBriefing(Math.min(this.unlockedStage, STAGES.length - 1)); });
    H.onButton('btn-start-stage', () => { A.unlock(); A.uiClick(); this.beginStage(); });
    H.onButton('btn-brief-back', () => { A.uiClick(); H.showScreen('screen-menu'); this.state = 'menu'; });
    H.onButton('btn-resume', () => this.resume());
    H.onButton('btn-restart-stage', () => { A.uiClick(); this.loadStage(this.stageIdx); this._enterPlay(); });
    const quit = () => { A.uiClick(); this._toMenu(); };
    H.onButton('btn-quit-menu', quit); H.onButton('btn-quit-menu2', quit); H.onButton('btn-quit-menu3', quit);
    H.onButton('btn-next-stage', () => { A.uiClick(); this.showBriefing(this.stageIdx + 1); });
    H.onButton('btn-retry', () => { A.uiClick(); this.loadStage(this.stageIdx); this._enterPlay(); });
    H.onButton('btn-again', () => {
      A.uiClick();
      this.campaignScore = 0; this.campaignKills = 0; this.campaignTime = 0;
      this.unlockedWeapons = ['pistol'];
      this.showBriefing(0);
    });
    if (this.input.isTouch) document.getElementById('touch-ui').classList.add('visible');
  }

  _toMenu() {
    this.state = 'menu';
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showHud(false);
    this.hud.bossBar(null);
    this.hud.scope(false);
    this.hud.buildStageList(STAGES, this.unlockedStage, (i) => this.showBriefing(i));
    this.hud.setMenuBest(this.best > 0 ? 'BEST: ' + this.best.toLocaleString() : 'NO RECORD YET');
    this.hud.showScreen('screen-menu');
  }

  showBriefing(i) {
    this.stageIdx = i;
    this.state = 'briefing';
    const st = STAGES[i];
    const names = this.unlockedWeapons.map(k => WEAPON_DEFS[k].name);
    let loadout = names.join(' · ');
    if (st.unlock) loadout += '  ★ NEW: ' + WEAPON_DEFS[st.unlock].name;
    this.hud.fillBriefing(st, loadout);
    this.hud.showScreen('screen-briefing');
  }

  beginStage() {
    const st = STAGES[this.stageIdx];
    if (st.unlock && !this.unlockedWeapons.includes(st.unlock)) {
      this.unlockedWeapons.push(st.unlock);
    }
    this.loadStage(this.stageIdx);
    this._enterPlay();
  }

  _enterPlay() {
    this.state = 'playing';
    this.hud.showScreen(null);
    this.hud.showHud(true);
    if (!this.input.isTouch) this.input.requestLock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showScreen('screen-pause');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.audio.uiClick();
    this._enterPlay();
  }

  loadStage(i) {
    // dispose previous
    if (this.scene) {
      this.scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }
      });
    }
    const st = STAGES[i];
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(st.sky);
    scene.fog = new THREE.Fog(st.fog[0], st.fog[1], st.fog[2]);
    scene.add(new THREE.HemisphereLight(st.hemi[0], st.hemi[1], st.hemi[2]));
    const sun = new THREE.DirectionalLight(st.sun[0], st.sun[1]);
    sun.position.set(40, 60, 25);
    scene.add(sun);
    scene.add(this.camera);

    this.fx = new FX(scene);
    this.weapons.fx = this.fx;
    this.weapons.reset(this.unlockedWeapons);

    const layout = st.build(scene);
    const lb = layout.lb;
    this.solids = lb.solids;
    this.colliders = lb.colliders;
    this.bounds = layout.bounds;
    this.extraction = layout.extraction;
    this.extractFx = layout.extractionFx;

    // player reset
    const ps = layout.playerStart;
    Object.assign(this.p, { x: ps.x, y: 0, z: ps.z, vy: 0, yaw: ps.yaw, pitch: 0,
      hp: 100, armor: 0, alive: true, lastHurt: -10, grounded: true });
    this.camera.position.set(ps.x, EYE, ps.z);

    // enemies
    this.enemies = [];
    this.boss = null;
    const mods = difficultyFor(i);
    const wps = makeWaypoints(this.bounds, 12, ps);
    const defs = [];
    for (const e of st.enemies) {
      if (e.type === 'boss' && layout.bossSpawn) {
        defs.push({ type: 'boss', x: layout.bossSpawn.x, z: layout.bossSpawn.z, wps });
      } else {
        defs.push(...spawnPositions([{ type: e.type, n: e.n }], this.bounds, ps, wps));
      }
    }
    for (const d of defs) {
      const en = new Enemy(scene, d.type, d.x, d.z, mods, d.wps);
      this.enemies.push(en);
      if (d.type === 'boss') this.boss = en;
    }

    // pickups
    this.pickups = [];
    for (const pk of layout.pickups) this._spawnPickup(pk.kind, pk.x, pk.z);
    this.projectiles = [];
    this.hearShots = [];
    this.stats = { kills: 0, shots: 0, hits: 0, heads: 0, t0: performance.now() };
    this.stageTime = 0;
    this.extracted = false;

    this.hud.setStage(st.name, 'ELIMINATE ALL HOSTILES (' + this.enemies.length + ')');
    this.hud.setScore(this.campaignScore);
    this.hud.setHealth(100, 100);
    this.hud.setArmor(0);
    this.hud.bossBar(null);
    this.hud.tip(null);
    this.hud.banner('STAGE ' + (i + 1), st.short);
    if (st.unlock) {
      setTimeout(() => this.hud.killfeed('★ UNLOCKED: ' + WEAPON_DEFS[st.unlock].name), 1200);
    }
    if (this.boss) {
      setTimeout(() => {
        this.hud.banner('⚠ WARLORD VEX ⚠', 'ELIMINATE THE WARLORD');
        this.hud.bossBar('WARLORD VEX', 1);
        this.audio.bossRoar();
      }, 2500);
    }
  }

  _spawnPickup(kind, x, z) {
    const g = new THREE.Group();
    const colors = { health: 0xff4d4d, armor: 0x3fa9ff, ammo: 0x59ff9c };
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x22262c }));
    base.position.y = 0.8; g.add(base);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4),
      new THREE.MeshBasicMaterial({ color: colors[kind] }));
    glow.position.y = 0.8; g.add(glow);
    if (kind === 'health') {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      c1.position.set(0, 0.8, 0.29); c2.position.set(0, 0.8, 0.29); g.add(c1, c2);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 24),
      new THREE.MeshBasicMaterial({ color: colors[kind], transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.pickups.push({ kind, mesh: g, x, z, taken: false, phase: Math.random() * 6 });
  }

  collide(x, z, r, feetY, height) {
    for (const b of this.colliders) {
      if (feetY + height < b.min.y || feetY > b.max.y) continue;
      const nx = Math.max(b.min.x, Math.min(x, b.max.x));
      const nz = Math.max(b.min.z, Math.min(z, b.max.z));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = nx + dx / d * r; z = nz + dz / d * r;
        } else {
          const pl = x - b.min.x, pr = b.max.x - x, pt = z - b.min.z, pb = b.max.z - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.min.x - r; else if (m === pr) x = b.max.x + r;
          else if (m === pt) z = b.min.z - r; else z = b.max.z + r;
        }
      }
    }
    return { x, z };
  }

  playerChest() { return new THREE.Vector3(this.p.x, 1.25, this.p.z); }
  playerEye() { return new THREE.Vector3(this.p.x, this.p.y + EYE, this.p.z); }

  // ---------- combat ----------
  _enemyHitMeshes() {
    const arr = [];
    for (const e of this.enemies) if (!e.dead) arr.push(...e.hitMeshes);
    return arr;
  }

  _fireWeapon(now) {
    const W = this.weapons;
    const moving = Math.hypot(this.input.moveAxes().x, this.input.moveAxes().z) > 0.15;
    const origin = this.playerEye();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const res = W.tryFire(now, origin, dir, moving);
    if (!res.fired) {
      if (res.dry) {
        // auto-reload on empty trigger pull
        if (W.ammo().reserve > 0) W.startReload(now);
      }
      return;
    }
    const def = res.def;
    this.stats.shots += res.dirs.length;
    this.hearShots.push({ x: this.p.x, z: this.p.z, t: now });
    if (this.hearShots.length > 12) this.hearShots.shift();
    const targets = this.solids.concat(this._enemyHitMeshes());
    for (const pdir of res.dirs) {
      this._ray.set(origin, pdir);
      this._ray.far = def.range;
      const hits = this._ray.intersectObjects(targets, false);
      const end = hits.length ? hits[0].point.clone() : origin.clone().add(pdir.clone().multiplyScalar(def.range));
      this.fx.tracer(res.muzzle, end, def.tracer);
      if (hits.length) {
        const h = hits[0];
        const dist = h.distance;
        if (h.object.userData.enemy) {
          const en = h.object.userData.enemy;
          const head = h.object.userData.part === 'head';
          let dmg = W.damageAt(dist) * (head ? def.headMult : 1);
          dmg = Math.round(dmg * (0.92 + Math.random() * 0.16));
          this.stats.hits++;
          if (head) this.stats.heads++;
          this.hud.hitmarker(head);
          this.audio.hit(head);
          const died = en.damage(dmg, head, this._enemyCtx());
          this.fx.blood(h.point);
          if (died) this._onKill(en, head);
        } else {
          this.fx.spark(h.point);
        }
      }
    }
  }

  _onKill(en, head) {
    const pts = Math.round(en.def.score * (head ? 1.5 : 1) * (1 + this.stageIdx * 0.25));
    this.campaignScore += pts;
    this.stats.kills++;
    this.campaignKills++;
    this.hud.setScore(this.campaignScore);
    this.hud.killfeed(`YOU ▸ ${en.def.label}${head ? ' <b style="color:#ff4d4d">HEADSHOT</b>' : ''} <span style="color:#ffb454">+${pts}</span>`, head);
    this.audio.kill();
    if (en.def.boss) {
      this.hud.bossBar(null);
      this.hud.banner('WARLORD DOWN', 'TARGET ELIMINATED');
      this.fx.burst(en.pos.clone().setY(1.5), 0xff9a5f, 40, 10, 1.1, 0.2);
      this.audio.boom(true);
    }
    const alive = this.enemies.filter(e => !e.dead).length;
    if (alive > 0) {
      this.hud.setStage(STAGES[this.stageIdx].name, `ELIMINATE ALL HOSTILES (${alive} LEFT)`);
    } else {
      this.hud.setStage(STAGES[this.stageIdx].name, 'ALL HOSTILES DOWN — REACH THE EXTRACTION BEACON');
      this.hud.banner('AREA CLEAR', 'MOVE TO THE GREEN BEACON');
      this.hud.tip('FOLLOW THE GREEN BEACON');
      this.audio.sting(true);
    }
  }

  _enemyCtx() {
    return {
      playerPos: new THREE.Vector3(this.p.x, 0, this.p.z),
      playerAlive: this.p.alive,
      playerMoving: Math.hypot(this.input.moveAxes().x, this.input.moveAxes().z) > 0.15,
      time: this.stageTime,
      solids: this.solids,
      bounds: this.bounds,
      hearShots: this.hearShots,
      enemies: this.enemies,
      camera: this.camera,
      fx: this.fx,
      audio: this.audio,
      collide: (x, z, r) => this.collide(x, z, r, 0, 1.8),
      enemyFire: (en, hit, dmg) => this._onEnemyFire(en, hit, dmg),
      spawnProjectile: (from, tgt) => this._spawnProjectile(from, tgt)
    };
  }

  _onEnemyFire(en, hit, dmg, silent) {
    if (!this.p.alive || this.state !== 'playing') return;
    if (!silent) {
      const from = en.muzzle(new THREE.Vector3());
      const chest = this.playerChest();
      let end;
      if (hit) end = chest;
      else end = chest.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5));
      this.fx.tracer(from, end, en.def.boss ? 0xff5f5f : 0xff8a6b);
      this.audio.shoot(en.def.boss ? 'bossgun' : 'enemy');
    }
    if (!hit) return;
    let rem = dmg;
    if (this.p.armor > 0) {
      const ab = Math.min(this.p.armor, rem * 0.6);
      this.p.armor -= ab; rem -= ab;
    }
    this.p.hp -= rem;
    this.p.lastHurt = this.stageTime;
    this.hud.damageFlash();
    this.audio.hurt();
    this.hud.setHealth(this.p.hp, 100);
    this.hud.setArmor(this.p.armor);
    if (this.p.hp <= 0) this._onDeath();
  }

  _spawnProjectile(from, target) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7a2e }));
    mesh.position.copy(from);
    this.scene.add(mesh);
    const dir = target.clone().sub(from).normalize();
    this.projectiles.push({ mesh, vel: dir.multiplyScalar(17), life: 6 });
    this.audio.shoot('bossgun');
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.mesh.position.addScaledVector(pr.vel, dt);
      if (Math.random() < 0.5) this.fx.burst(pr.mesh.position, 0xff7a2e, 2, 1.5, 0.3, 0.12, 2);
      const mp = pr.mesh.position;
      const dp = Math.hypot(mp.x - this.p.x, mp.z - this.p.z);
      let boom = pr.life <= 0 || mp.y <= 0.15 || (dp < 1.4 && Math.abs(mp.y - 1.2) < 1.6);
      if (!boom) {
        this._ray.set(mp, pr.vel.clone().normalize());
        this._ray.far = 1.2;
        if (this._ray.intersectObjects(this.solids, false).length) boom = true;
      }
      if (boom) {
        this.fx.burst(mp.clone(), 0xff8a3d, 26, 9, 0.7, 0.18);
        this.fx.burst(mp.clone(), 0x3a3a3a, 14, 5, 1.0, 0.22, 3);
        this.audio.boom(false);
        if (this.p.alive && dp < 4.5) {
          const dmg = Math.round(34 - dp * 5.5);
          this._damagePlayer(dmg);
        }
        this.scene.remove(pr.mesh);
        pr.mesh.geometry.dispose(); pr.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  _damagePlayer(dmg) {
    if (!this.p.alive || this.state !== 'playing') return;
    let rem = dmg;
    if (this.p.armor > 0) { const ab = Math.min(this.p.armor, rem * 0.6); this.p.armor -= ab; rem -= ab; }
    this.p.hp -= rem;
    this.p.lastHurt = this.stageTime;
    this.hud.damageFlash(); this.audio.hurt();
    this.hud.setHealth(this.p.hp, 100); this.hud.setArmor(this.p.armor);
    if (this.p.hp <= 0) this._onDeath();
  }

  _onDeath() {
    if (!this.p.alive) return;
    this.p.alive = false;
    this.state = 'gameover';
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.sting(false);
    const s = this.stats;
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    this.hud.fillGameOver([
      ['STAGE', STAGES[this.stageIdx].short],
      ['KILLS THIS ATTEMPT', s.kills],
      ['ACCURACY', acc + '%'],
      ['SCORE', this.campaignScore.toLocaleString()]
    ]);
    this.hud.showScreen('screen-gameover');
    this.hud.showHud(false);
    this.hud.bossBar(null); this.hud.scope(false);
  }

  _stageComplete() {
    this.extracted = true;
    this.state = 'debrief';
    if (document.pointerLockElement) document.exitPointerLock();
    const s = this.stats;
    const timeS = Math.round((performance.now() - s.t0) / 1000);
    this.campaignTime += timeS;
    const timeBonus = Math.max(0, 3000 - timeS * 8);
    this.campaignScore += timeBonus;
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    if (this.stageIdx >= this.unlockedStage && this.stageIdx + 1 < STAGES.length) {
      this.unlockedStage = this.stageIdx + 1;
      localStorage.setItem('sp_unlocked', String(this.unlockedStage));
    }
    if (this.campaignScore > this.best) {
      this.best = this.campaignScore;
      localStorage.setItem('sp_best', String(this.best));
    }
    const isLast = this.stageIdx === STAGES.length - 1;
    this.audio.sting(true);
    const rows = [
      ['TIME', timeS + 's'], ['KILLS', s.kills], ['HEADSHOTS', s.heads],
      ['ACCURACY', acc + '%'], ['TIME BONUS', '+' + timeBonus],
      ['CAMPAIGN SCORE', this.campaignScore.toLocaleString()]
    ];
    if (isLast) {
      this.hud.fillVictory([
        ['TOTAL KILLS', this.campaignKills], ['TOTAL TIME', Math.round(this.campaignTime) + 's'],
        ['FINAL SCORE', this.campaignScore.toLocaleString()],
        ['BEST', this.best.toLocaleString()]
      ]);
      this.hud.showScreen('screen-victory');
      this.state = 'victory';
    } else {
      this.hud.fillDebrief({ sub: STAGES[this.stageIdx].short + ' SECURED', rows });
      const btn = document.getElementById('btn-next-stage');
      btn.textContent = 'NEXT STAGE ▶';
      this.hud.showScreen('screen-debrief');
    }
    this.hud.showHud(false);
    this.hud.bossBar(null); this.hud.scope(false);
  }

  // ---------- per-frame ----------
  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now() / 1000;
    if (this.state === 'playing') this._updatePlay(dt, now);
    else if (this.state === 'paused' || this.state === 'menu') { /* frozen */ }
    if (this.scene) this.renderer.render(this.scene, this.camera);
  }

  _updatePlay(dt, now) {
    this.stageTime += dt;
    const P = this.p, I = this.input;

    // look
    const lk = I.takeLook();
    P.yaw -= lk.dx * 0.0023;
    P.pitch -= lk.dy * 0.0023;
    P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch));
    P.pitch += this.weapons.kickPitch;
    this.weapons.kickPitch = 0;

    // move (yaw=0 faces -Z; strafe right = +X)
    const ax = I.moveAxes();
    const sprint = I.sprinting() && ax.z > 0.1 && !I.wantAim();
    const speed = sprint ? 7.4 : 4.9;
    const sin = Math.sin(P.yaw), cos = Math.cos(P.yaw);
    const nx = P.x + (-sin * ax.z + cos * ax.x) * speed * dt;
    const nz = P.z + (-cos * ax.z - sin * ax.x) * speed * dt;
    const res = this.collide(nx, nz, RADIUS, P.y, 1.8);
    const bd = Math.hypot(res.x, res.z);
    P.x = res.x; P.z = res.z;
    if (bd > this.bounds) { P.x *= this.bounds / bd; P.z *= this.bounds / bd; }

    // jump / gravity
    if (I.takeJump() && P.grounded) { P.vy = JUMP_V; P.grounded = false; }
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= 0) { P.y = 0; P.vy = 0; P.grounded = true; }

    // footsteps
    const movingAmt = Math.hypot(ax.x, ax.z);
    if (movingAmt > 0.2 && P.grounded) {
      P.stepT -= dt * (sprint ? 2 : 1.3);
      if (P.stepT <= 0) { P.stepT = 0.42; this.audio.step(); }
    }

    this.camera.position.set(P.x, P.y + EYE, P.z);
    this.camera.rotation.set(P.pitch, P.yaw, 0);

    // weapons
    const d = I.takeDigit();
    if (d > 0) this.weapons.selectSlot(d);
    const cyc = I.takeCycle();
    if (cyc) this.weapons.cycle();
    if (I.takeReload()) this.weapons.startReload(now);
    const wantAim = I.wantAim() && !sprint && !this.weapons.reloading;
    const scoped = wantAim && this.weapons.def().scope;
    this.weapons.setAiming(wantAim);
    if (scoped) this.camera.fov += (20 - this.camera.fov) * Math.min(1, dt * 14);
    else if (wantAim) this.camera.fov += (55 - this.camera.fov) * Math.min(1, dt * 14);
    else this.camera.fov += (75 - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();
    this.hud.scope(scoped);
    if (I.wantFire()) this._fireWeapon(now);
    this.weapons.update(now, dt);
    const am = this.weapons.ammo();
    this.hud.setAmmo(am.mag, am.reserve, this.weapons.def().name, this.weapons.reloading);

    // health regen
    if (P.alive && P.hp < 100 && this.stageTime - P.lastHurt > 4.5) {
      P.hp = Math.min(100, P.hp + 11 * dt);
      this.hud.setHealth(P.hp, 100);
    }

    // enemies
    const ctx = this._enemyCtx();
    for (const e of this.enemies) e.update(dt, ctx);
    // remove long-dead
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i]._gone) { this.enemies[i].dispose(); this.enemies.splice(i, 1); }
    }
    if (this.boss && !this.boss.dead) this.hud.bossBar('WARLORD VEX', this.boss.hp / this.boss.maxHp);

    this._updateProjectiles(dt);

    // pickups
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.phase += dt * 2;
      pk.mesh.rotation.y += dt * 1.6;
      pk.mesh.position.y = Math.sin(pk.phase) * 0.12;
      const dp = Math.hypot(P.x - pk.x, P.z - pk.z);
      if (dp < 1.4 && P.alive) {
        let used = false;
        if (pk.kind === 'health' && P.hp < 100) { P.hp = Math.min(100, P.hp + 45); used = true; }
        else if (pk.kind === 'armor' && P.armor < 100) { P.armor = Math.min(100, P.armor + 50); used = true; }
        else if (pk.kind === 'ammo') { this.weapons.refillAmmo(0.5); used = true; }
        if (used) {
          pk.taken = true;
          this.scene.remove(pk.mesh);
          this.audio.pickup(pk.kind);
          this.hud.killfeed({ health: '✚ HEALTH RESTORED', armor: '⛨ ARMOR +50', ammo: '▸ AMMO RESTOCKED' }[pk.kind]);
          this.hud.setHealth(P.hp, 100); this.hud.setArmor(P.armor);
        }
      }
    }

    // extraction beacon pulse + win check
    if (this.extractFx) {
      const s = 1 + Math.sin(now * 4) * 0.12;
      this.extractFx.beam.scale.set(s, 1, s);
    }
    const alive = this.enemies.some(e => !e.dead);
    if (!alive && !this.extracted) {
      const de = Math.hypot(P.x - this.extraction.x, P.z - this.extraction.z);
      if (de < 3.2) this._stageComplete();
    }

    // HUD
    const spreadPx = 6 + this.weapons.def().spread * 900 + movingAmt * 9;
    this.hud.crosshair(spreadPx, wantAim, scoped);
    // HUD: +Z is north, so yaw=PI (facing +Z) reads 0 degrees
    const heading = ((180 - P.yaw * 180 / Math.PI) % 360 + 360) % 360;
    this.hud.compass(heading);
    this.fx.update(dt);
  }
}
new Game();
