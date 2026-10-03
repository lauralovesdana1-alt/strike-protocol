// STRIKE PROTOCOL — HUD, killfeed, compass, screens
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      healthFill: $('health-bar-fill'), healthNum: $('health-num'),
      armorFill: $('armor-bar-fill'), armorNum: $('armor-num'),
      weaponName: $('weapon-name'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
      stageLabel: $('stage-label'), objectiveLabel: $('objective-label'),
      scoreVal: $('score-val'), killfeed: $('killfeed'),
      compassStrip: $('compass-strip'), banner: $('banner'),
      bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      dmg: $('dmg-vignette'), lowhp: $('lowhp'), tip: $('interact-tip'),
      bossWrap: $('boss-bar-wrap'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      scope: $('scope-overlay')
    };
    this._buildCompass();
    this._feedCount = 0;
  }
  _buildCompass() {
    const marks = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    let html = '';
    for (let r = 0; r < 3; r++) {
      for (const [deg, label] of marks) {
        const x = 0;
        const minor = label.length > 1;
        html += `<div class="tick${minor ? ' minor' : ''}" data-deg="${deg + r * 360}" style="left:${x}px">${label}</div>`;
      }
    }
    this.el.compassStrip.innerHTML = html;
    this._ticks = [...this.el.compassStrip.children];
  }
  showHud(b) { this.el.hud.classList.toggle('visible', b); }
  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('visible');
    if (id) $(id).classList.add('visible');
  }
  onButton(id, cb) { $(id).addEventListener('click', (e) => { e.stopPropagation(); cb(); }); }
  setHealth(v, max) {
    const f = Math.max(0, v / max);
    this.el.healthFill.style.width = (f * 100) + '%';
    this.el.healthNum.textContent = Math.ceil(Math.max(0, v));
    this.el.lowhp.classList.toggle('on', f < 0.32 && f > 0);
  }
  setArmor(v) {
    this.el.armorFill.style.width = Math.min(100, v) + '%';
    this.el.armorNum.textContent = Math.ceil(Math.max(0, v));
  }
  setAmmo(mag, reserve, name, reloading) {
    this.el.ammoMag.textContent = reloading ? '--' : mag;
    this.el.ammoMag.classList.toggle('low', mag <= 4 && !reloading);
    this.el.ammoReserve.textContent = '/ ' + reserve;
    this.el.weaponName.textContent = name + (reloading ? ' — RELOADING' : '');
  }
  setStage(name, objective) {
    this.el.stageLabel.textContent = name;
    this.el.objectiveLabel.textContent = objective;
  }
  setScore(v) { this.el.scoreVal.textContent = v.toLocaleString(); }
  killfeed(html, head) {
    const d = document.createElement('div');
    if (head) d.className = 'head';
    d.innerHTML = html;
    this.el.killfeed.prepend(d);
    this._feedCount++;
    while (this.el.killfeed.children.length > 4) this.el.killfeed.lastChild.remove();
    setTimeout(() => { if (d.parentNode) d.remove(); }, 6000);
  }
  hitmarker(head) {
    const h = this.el.hitmarker;
    h.classList.remove('show', 'head');
    void h.offsetWidth;
    if (head) h.classList.add('head');
    h.classList.add('show');
  }
  damageFlash() {
    const d = this.el.dmg;
    d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
  }
  banner(title, sub) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    const b = this.el.banner;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  compass(yawDeg) {
    // yawDeg: 0 = facing -Z (north). center strip on heading.
    const center = 170;
    for (const t of this._ticks) {
      const deg = parseFloat(t.dataset.deg);
      let diff = ((deg - yawDeg) % 360 + 540) % 360 - 180;
      t.style.transform = `translateX(${center + diff * 2.2 - 15}px)`;
      t.style.opacity = Math.abs(diff) > 75 ? '0' : '1';
    }
  }
  crosshair(spreadPx, ads, scoped) {
    const c = this.el.crosshair;
    c.classList.toggle('hidden', scoped);
    c.style.setProperty('--sp', (ads ? spreadPx * 0.4 : spreadPx) + 'px');
  }
  tip(text) {
    if (text) { this.el.tip.textContent = text; this.el.tip.style.display = 'block'; }
    else this.el.tip.style.display = 'none';
  }
  bossBar(name, frac) {
    if (name === null) { this.el.bossWrap.classList.remove('visible'); return; }
    this.el.bossWrap.classList.add('visible');
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = Math.max(0, frac * 100) + '%';
  }
  scope(b) { this.el.scope.classList.toggle('visible', b); }
  // ---- screens ----
  buildStageList(stages, unlocked, onPick) {
    const list = $('stage-list');
    list.innerHTML = '';
    stages.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'stage-chip' + (i <= unlocked ? '' : ' locked');
      d.innerHTML = `${i + 1}. ${s.short}<small>${i <= unlocked ? 'READY' : '🔒 LOCKED'}</small>`;
      if (i <= unlocked) d.addEventListener('click', () => onPick(i));
      list.appendChild(d);
    });
  }
  fillBriefing(stage, loadout) {
    $('brief-name').textContent = stage.name;
    $('brief-sub').textContent = stage.sub;
    $('brief-intel').innerHTML = stage.intel.map(l => `<div>▸ ${l}</div>`).join('');
    $('brief-loadout').textContent = 'LOADOUT: ' + loadout;
  }
  fillDebrief(stats) {
    $('debrief-sub').textContent = stats.sub;
    $('debrief-stats').innerHTML = stats.rows.map(r =>
      `<div class="row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  }
  fillGameOver(rows) {
    $('gameover-stats').innerHTML = rows.map(r =>
      `<div class="row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  }
  fillVictory(rows) {
    $('victory-stats').innerHTML = rows.map(r =>
      `<div class="row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
  }
  setMenuBest(text) { $('menu-best').textContent = text; }
}
