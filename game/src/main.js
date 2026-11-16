// Duskfall Bazaar — boot, loop, rounds, shooting, plant/defuse, autopilot, shot modes.
import * as THREE from 'three';
import { WEAPONS, UTILITY, ECONOMY, createLoadout, weaponOf, buyItem, applyDamage } from './weapons.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const autotest = params.get('autotest') === '1';
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);
window.__testLog = [];
function tlog(msg) {
  const line = `[${elapsed.toFixed(1)}s] ${msg}`;
  window.__testLog.push(line);
  const el = document.getElementById('testlog');
  if (el) el.textContent = window.__testLog.slice(-30).join('\n');
  if (autotest) console.log(line);
}
window.addEventListener('error', (e) => { window.__testLog.push(`JS ERROR: ${e.message}`); console.error(e.message); });

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1a3e);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
world.sites = SITES;
const effects = createEffects(scene);
const audio = createAudio();
const player = createPlayer(world);
const input = createInput(renderer.domElement, onLockChange);
const hud = createHud({
  camera, world,
  playerTeam: () => game.playerTeam,
  project: (v) => {
    const p = v.clone().project(camera);
    const visible = p.z < 1 && p.x > -1.05 && p.x < 1.05 && p.y > -1.05 && p.y < 1.05;
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible, dist: camera.position.distanceTo(v) };
  },
});

// --- game state ---
const game = {
  phase: 'menu', phaseT: 0, round: 1, maxRounds: 12, overtime: false,
  score: { emberfox: 0, ward: 0 },
  attackTeam: 'emberfox', attackSite: 'A',
  playerTeam: 'emberfox', money: ECONOMY.startMoney, lossStreak: 0,
  loadout: createLoadout(), slot: 2, switching: 0, reloading: 0, fireAt: 0,
  bomb: { state: 'none', site: null, pos: new THREE.Vector3(), timer: 40, carrier: null },
  kills: 0, deaths: 0, roundKills: 0, spectate: null,
};
const PLAYER = { name: 'You', team: 'emberfox', isPlayer: true };
const seenIds = new Set();
let elapsed = 0, frozen = false, started = false, accumulator = 0, lastTime = performance.now();
let recoil = 0, plantProg = 0, defuseProg = 0, beepAt = 0, minimapAt = 0;
const raycaster = new THREE.Raycaster(); raycaster.far = 120;
const shootDir = new THREE.Vector3();

// --- viewmodel gun ---
const viewmodel = new THREE.Group();
const vmParts = {};
function buildViewmodel(kind) {
  while (viewmodel.children.length) viewmodel.remove(viewmodel.children[0]);
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const dark = mat(0x232120), mid = mat(0x4a4238), accent = mat(0x8a6a3a), brass = mat(0xc9a24a);
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; viewmodel.add(o); return o; };
  if (kind === 'melee') {
    add(new THREE.BoxGeometry(0.03, 0.05, 0.42), mat(0xb8bcc0), 0, 0, -0.2);
  } else {
    add(new THREE.BoxGeometry(0.08, 0.11, 0.5), mid, 0, 0, -0.08); // receiver
    add(new THREE.BoxGeometry(0.085, 0.03, 0.52), dark, 0, 0.07, -0.08); // top rail
    add(new THREE.BoxGeometry(0.05, 0.05, 0.28), dark, 0, 0.01, -0.42); // barrel
    add(new THREE.BoxGeometry(0.06, 0.14, 0.09), dark, 0, -0.11, 0.06); // grip
    add(new THREE.BoxGeometry(0.015, 0.05, 0.015), brass, 0, 0.1, -0.3); // front sight post
    add(new THREE.BoxGeometry(0.06, 0.04, 0.03), dark, 0, 0.1, 0.08); // rear sight
    if (kind === 'dmr' || kind === 'rifle') {
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 8), accent, 0, 0.08, -0.26, Math.PI / 2); // scope
      add(new THREE.BoxGeometry(0.06, 0.18, 0.08), dark, 0, -0.13, -0.12, 0.25); // magazine
    }
    if (kind === 'smg' || kind === 'shotgun') add(new THREE.BoxGeometry(0.06, 0.17, 0.08), mid, 0, -0.12, -0.16, 0.15);
    if (kind === 'shotgun') add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), dark, 0, 0, -0.4, Math.PI / 2);
    if (kind === 'pistol') add(new THREE.BoxGeometry(0.05, 0.1, 0.07), dark, 0, -0.1, 0.02);
  }
  vmParts.muzzle = new THREE.Object3D(); vmParts.muzzle.position.set(0, 0.02, -0.58); viewmodel.add(vmParts.muzzle);
  viewmodel.scale.setScalar(0.8);
  viewmodel.position.set(0.3, -0.27, -0.55);
  viewmodel.rotation.set(0, 0.1, 0);
}
buildViewmodel('pistol');
camera.add(viewmodel);

// --- bots context ---
const ctx = {
  rng, time: () => elapsed, lastRadioAt: 0, effects, audio,
  playerState: player.state,
  playerAlive: () => player.state.alive,
  playerTeam: () => game.playerTeam,
  playerSpeed: () => player.state.speed,
  playerCrouched: () => player.state.crouched,
  onRadio: (name, role, line) => hud.radioAdd(name, role, line),
  onKill: (killer, victim, weapon, head, wallbang) => handleKill(killer, victim, weapon, head, wallbang),
  onBotHit: () => {},
  onPlayerDamaged: (dmg, byName) => {
    if (!player.state.alive) return;
    hud.hurtFlash();
    audio.hurt();
    if (player.state.hp <= 0) handleKill({ name: byName, team: game.playerTeam === 'emberfox' ? 'ward' : 'emberfox' }, PLAYER, WEAPONS.vesper, false, false);
  },
  onPlantStart: (bot, site) => { if (bot.team === game.playerTeam) hud.banner(`${bot.name.toUpperCase()} IS PLANTING`, `Charge going down at ${site === 'A' ? 'Spice Court' : 'Lantern Row'}`, 2200); },
  onPlantCancel: () => {},
  onPlanted: (bot, site) => plantBomb(bot, site),
  onDefused: (bot) => endRound(bot.team === 'emberfox' ? 'emberfox' : 'ward', 'defuse', bot),
};
const bots = createBots(scene, world, ctx);

// --- helpers ---
function teamName(t) { return t === 'emberfox' ? 'EMBERFOX' : 'LANTERN WARD'; }
function otherTeam(t) { return t === 'emberfox' ? 'ward' : 'emberfox'; }
function currentWeapon() { return weaponOf(game.loadout, game.slot); }
function magState() {
  const w = currentWeapon();
  if (!w || w.kind === 'melee') return { mag: 0, reserve: 0 };
  const m = game.loadout.mags[w.id] || (game.loadout.mags[w.id] = { mag: w.mag, reserve: w.reserve });
  return m;
}
function refreshWeaponHud() {
  const w = currentWeapon();
  if (!w) { hud.setWeapon('BREACH CHARGE', 'E TO PLANT'); hud.setAmmo(0, 0, true); hud.setSlots(slotHtml()); return; }
  const m = magState();
  hud.setWeapon(w.name, `${w.kind.toUpperCase()} · ${w.dmg} DMG${w.zoom ? ' · SCOPED' : ''}`);
  hud.setAmmo(m.mag, m.reserve, w.kind === 'melee');
  hud.setSlots(slotHtml());
  const u = game.loadout.util;
  hud.setUtil(`<b>5</b> Frag ${u.frag} &nbsp; <b>Q</b> Flash ${u.flash} &nbsp; <b>G</b> Smoke ${u.smoke} &nbsp; ${game.loadout.kit ? '<b>Kit</b> ✓' : ''}`);
}
function slotHtml() {
  const l = game.loadout;
  const s = (n, label, active) => `<b>${n}</b> ${label}${active ? ' ●' : ''}`;
  const parts = [];
  parts.push(s(1, l.primary ? WEAPONS[l.primary].name : '—', game.slot === 1));
  parts.push(s(2, WEAPONS[l.sidearm].name, game.slot === 2));
  parts.push(s(3, 'Knife', game.slot === 3));
  if (game.bomb.state === 'carried' && game.bomb.carrier === PLAYER) parts.push(s(4, 'Charge', game.slot === 4));
  return parts.join(' &nbsp; ');
}
function switchSlot(n) {
  if (n === game.slot || game.switching > 0) return;
  if (n === 1 && !game.loadout.primary) return;
  if (n === 4 && !(game.bomb.state === 'carried' && game.bomb.carrier === PLAYER)) return;
  game.slot = n; game.switching = 0.35;
  const w = currentWeapon();
  buildViewmodel(w ? w.kind : 'charge');
  refreshWeaponHud();
  audio.click();
}
function reload() {
  const w = currentWeapon();
  if (!w || w.kind === 'melee' || game.reloading > 0) return;
  const m = magState();
  if (m.mag >= w.mag || m.reserve <= 0) return;
  game.reloading = w.reload; audio.reload();
}
function finishReload() {
  const w = currentWeapon(); if (!w) return;
  const m = magState();
  const need = w.mag - m.mag, take = Math.min(need, m.reserve);
  m.mag += take; m.reserve -= take;
  refreshWeaponHud();
}
function hasLOS(a, b) {
  if (effects.blockedBySmoke(a, b)) return false;
  raycaster.set(new THREE.Vector3(a.x, a.y + 1.5, a.z), new THREE.Vector3(b.x - a.x, (b.y + 1.3) - (a.y + 1.5), b.z - a.z).normalize());
  const hits = raycaster.intersectObjects(world.shootables, false);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  return !(hits.length && hits[0].distance < dist - 0.3);
}

// --- shooting (player) ---
function shoot() {
  const w = currentWeapon();
  if (!w || game.switching > 0 || game.reloading > 0 || elapsed < game.fireAt) return;
  if (w.kind === 'melee') { game.fireAt = elapsed + 60 / w.rpm; meleeSwing(); return; }
  const m = magState();
  if (m.mag <= 0) { audio.dryFire(); reload(); return; }
  m.mag -= 1;
  game.fireAt = elapsed + 60 / w.rpm;
  const spreadBase = w.spread * (player.state.crouched ? 0.7 : 1) * (1 + player.state.speed / 9) * (w.zoom && zoomed ? 0.35 : 1);
  const pellets = w.pellets || 1;
  let anyHit = false;
  for (let p = 0; p < pellets; p++) {
    camera.getWorldDirection(shootDir);
    shootDir.x += (rng() * 2 - 1) * spreadBase; shootDir.y += (rng() * 2 - 1) * spreadBase; shootDir.z += (rng() * 2 - 1) * spreadBase;
    shootDir.normalize();
    const from = camera.position.clone();
    raycaster.set(from, shootDir);
    const targets = bots.hitMeshes().concat(world.shootables);
    const hits = raycaster.intersectObjects(targets, false);
    let end = from.clone().addScaledVector(shootDir, 90);
    let dmgFactor = 1, wallbang = false, done = false;
    for (const h of hits) {
      if (done) break;
      if (h.object.userData.botRef) {
        const bot = bots.botByMeshId(h.object.userData.botRef);
        if (!bot || !bot.alive) continue;
        const head = h.object.userData.part === 'head';
        const dist = h.distance;
        const falloff = Math.max(0.45, 1 - dist / (w.range * 2.2));
        const res = applyDamage(bot, w.dmg * falloff * dmgFactor, head);
        end = h.point.clone();
        hud.hitmarker(bot.hp <= 0); audio.hit(bot.hp <= 0);
        hud.damageNumber(h.point, `${head ? 'HEAD x2 ' : ''}${res.dealt}`, head ? 'head' : '');
        effects.impact(h.point, 0xffc266);
        if (bot.hp <= 0) handleKill(PLAYER, bot, w, head, wallbang);
        anyHit = true; done = true;
      } else if (h.object.userData.pen) {
        wallbang = true; dmgFactor *= 0.55;
        if (dmgFactor < 0.2) { end = h.point.clone(); effects.impact(h.point, 0xd8c8a8); done = true; }
      } else {
        end = h.point.clone(); effects.impact(h.point, 0xd8c8a8); done = true;
      }
    }
    const muzzle = new THREE.Vector3(); vmParts.muzzle.getWorldPosition(muzzle);
    effects.tracer(muzzle, end);
    if (p === 0) { effects.muzzle(muzzle, shootDir); audio.shot(w.kind); }
  }
  recoil += w.kick;
  player.state.pitch += w.kick * 0.55;
  player.state.yaw += (rng() - 0.5) * w.kick * 0.4;
  refreshWeaponHud();
  if (!anyHit) hud.crosshairSpread(10 + w.spread * 900);
}
function meleeSwing() {
  const from = camera.position.clone();
  camera.getWorldDirection(shootDir);
  raycaster.set(from, shootDir);
  const hits = raycaster.intersectObjects(bots.hitMeshes(), false);
  audio.shot('melee');
  if (hits.length && hits[0].distance < 2.4) {
    const bot = bots.botByMeshId(hits[0].object.userData.botRef);
    if (bot && bot.alive) {
      const res = applyDamage(bot, WEAPONS.knife.dmg, false);
      hud.hitmarker(bot.hp <= 0); audio.hit(bot.hp <= 0);
      hud.damageNumber(hits[0].point, `${res.dealt}`, '');
      if (bot.hp <= 0) handleKill(PLAYER, bot, WEAPONS.knife, false, false);
    }
  }
}

// --- kills / rounds ---
function scheduleCarrierRecovery() {
  setTimeout(() => {
    if (game.bomb.state !== 'dropped') return;
    const atk = bots.bots.filter((b) => b.alive && b.side === 'attack');
    if (atk.length) { atk[0].isCarrier = true; game.bomb.state = 'carried'; game.bomb.carrier = atk[0]; }
  }, 2000);
}
function handleKill(killer, victim, weapon, head, wallbang) {
  const kName = killer.isPlayer ? 'You' : killer.name;
  const vName = victim.isPlayer ? 'You' : victim.name;
  const tags = [];
  if (head) tags.push('HS');
  if (wallbang) tags.push('WALLBANG');
  hud.killfeedAdd(kName, weapon ? weapon.name : '', vName, tags);
  if (victim.isPlayer) {
    player.state.alive = false; game.deaths += 1;
    tlog(`player died to ${kName}`);
    if (game.bomb.state === 'carried' && game.bomb.carrier === PLAYER) {
      game.bomb.state = 'dropped'; game.bomb.pos.copy(player.state.pos);
      hud.toast('Charge dropped — a teammate will recover it');
      scheduleCarrierRecovery();
    }
    game.spectate = null;
    hud.showMenu('dead', { title: 'YOU ARE DOWN', copy: 'Spectating a teammate — the round plays on.', button: 'Keep watching', hideKeys: true });
  } else {
    victim.alive = false; victim.fallT = 0; victim.state = 'dead';
    if (victim.isCarrier) { victim.isCarrier = false; game.bomb.state = 'dropped'; game.bomb.pos.copy(victim.pos); scheduleCarrierRecovery(); }
    if (killer.isPlayer) { game.money += ECONOMY.killReward; game.kills += 1; game.roundKills += 1; hud.setCash(game.money); hud.toast(`+$${ECONOMY.killReward} — ${vName} down`); }
    radioOnKill(victim);
  }
  checkRoundEnd();
}
function radioOnKill(victim) {
  const allies = bots.bots.filter((b) => b.alive && b.team === victim.team);
  if (allies.length && rng() < 0.4) {
    const b = allies[Math.floor(rng() * allies.length)];
    bots.pickLine(b, 'kill', {});
  }
}
function checkRoundEnd() {
  if (game.phase !== 'live') return;
  if (game.bomb.state === 'planted') return; // only explosion / defuse ends it
  const c = bots.aliveCounts();
  const pAlive = player.state.alive;
  const atkAlive = (game.attackTeam === 'emberfox' ? c.emberfox : c.ward) + (game.playerTeam === game.attackTeam && pAlive ? 1 : 0);
  const defAlive = (game.attackTeam === 'emberfox' ? c.ward : c.emberfox) + (game.playerTeam !== game.attackTeam && pAlive ? 1 : 0);
  if (atkAlive <= 0) endRound(otherTeam(game.attackTeam), 'elimination');
  else if (defAlive <= 0) endRound(game.attackTeam, 'elimination');
}
function plantBomb(by, site) {
  game.bomb.state = 'planted'; game.bomb.site = site;
  game.bomb.pos.set(SITES[site].x, 0, SITES[site].z);
  game.bomb.timer = 40;
  if (by.isPlayer || by === PLAYER) { game.money += ECONOMY.plantReward; hud.setCash(game.money); }
  hud.banner('CHARGE PLANTED', `${site === 'A' ? 'Spice Court' : 'Lantern Row'} · 40 seconds on the fuse`, 3000, 'red');
  audio.plantStart(); tlog(`bomb planted at ${site} by ${by.name || 'You'}`);
  const mk = document.getElementById('bomb-marker');
  if (mk) mk.classList.remove('hidden');
}
function explodeBomb() {
  effects.explosion(game.bomb.pos.clone().setY(1));
  audio.explosion();
  game.bomb.state = 'none';
  const mk = document.getElementById('bomb-marker');
  if (mk) mk.classList.add('hidden');
  endRound(game.attackTeam, 'detonation');
}
function endRound(winner, reason, byBot) {
  if (game.phase !== 'live') return;
  game.phase = 'end'; game.phaseT = 4.5;
  game.score[winner] += 1;
  const playerWon = winner === game.playerTeam;
  const winMoney = ECONOMY.winReward, lossMoney = game.lossStreak >= 1 ? Math.min(ECONOMY.lossStreakMax, ECONOMY.lossReward + game.lossStreak * ECONOMY.lossStreakBonus) : ECONOMY.lossReward;
  if (playerWon) { game.money += winMoney; game.lossStreak = 0; } else { game.money += lossMoney; game.lossStreak += 1; }
  hud.setCash(game.money);
  const reasonText = reason === 'detonation' ? 'The charge detonated' : reason === 'defuse' ? 'The charge was defused' : reason === 'time' ? 'Time expired — the sites held' : 'The other team was eliminated';
  hud.banner(playerWon ? `${teamName(winner)} WINS THE ROUND` : `${teamName(winner)} TAKES THE ROUND`, `${reasonText} · +$${playerWon ? winMoney : lossMoney}`, 4000, playerWon ? 'gold' : 'red');
  if (playerWon) audio.win(); else audio.lose();
  hud.setScore(game.score.emberfox, game.score.ward, 0, 0, 'EMBERFOX', 'LANTERN WARD');
  tlog(`round ${game.round} won by ${winner} (${reason}); score ${game.score.emberfox}-${game.score.ward}`);
  hud.plantBar(false);
  game.bomb.state = 'none';
  const mk = document.getElementById('bomb-marker');
  if (mk) mk.classList.add('hidden');
}
function startRound() {
  game.attackSite = rng() < 0.5 ? 'A' : 'B';
  game.attackTeam = game.round <= 6 ? 'emberfox' : 'ward';
  game.playerTeam = game.round <= 6 ? 'emberfox' : 'ward';
  PLAYER.team = game.playerTeam;
  const survived = player.state.alive;
  if (!survived) { game.loadout.primary = null; game.loadout.armour = 0; game.loadout.helmet = false; game.loadout.kit = false; game.loadout.util = { frag: 0, flash: 0, smoke: 0 }; }
  const spawn = SPAWNS[game.playerTeam][4];
  player.respawn(spawn[0], spawn[1], game.playerTeam === 'emberfox' ? -Math.PI / 2 : Math.PI / 2);
  player.state.armour = game.loadout.armour; player.state.helmet = game.loadout.helmet;
  game.slot = game.loadout.primary ? 1 : 2;
  game.bomb.state = game.playerTeam === game.attackTeam ? 'carried' : 'none';
  game.bomb.carrier = game.playerTeam === game.attackTeam ? PLAYER : null;
  game.bomb.site = null;
  bots.startRound(game.attackTeam, game.attackSite, game.playerTeam === game.attackTeam);
  game.phase = 'buy'; game.phaseT = 12; game.roundKills = 0; game.spectate = null;
  hud.hideMenu();
  hud.setRound(game.round, game.maxRounds);
  hud.setPhase('BUY');
  hud.setScore(game.score.emberfox, game.score.ward, 5, 5, 'EMBERFOX', 'LANTERN WARD');
  hud.setHealth(100); hud.setArmour(game.loadout.armour, game.loadout.helmet); hud.setCash(game.money);
  hud.setObjective(game.playerTeam === game.attackTeam
    ? `Plant the charge at ${game.attackSite === 'A' ? 'Spice Court' : 'Lantern Row'} — you carry it.`
    : 'Hold the sites. Defuse the charge if it is planted.');
  refreshWeaponHud();
  buildViewmodel(currentWeapon() ? currentWeapon().kind : 'pistol');
  if (!autotest && !shot) hud.showBuy(game.money, 12, game.loadout);
  hud.banner(`ROUND ${game.round}`, game.playerTeam === game.attackTeam ? `Attack ${game.attackSite === 'A' ? 'Spice Court' : 'Lantern Row'} — you carry the charge` : 'Defend the bazaar', 2200);
  tlog(`round ${game.round} start: ${game.playerTeam} ${game.playerTeam === game.attackTeam ? 'attack' : 'defend'} site ${game.attackSite}`);
}
function startMatch() {
  game.score = { emberfox: 0, ward: 0 }; game.round = 1; game.money = ECONOMY.startMoney;
  game.loadout = createLoadout(); game.overtime = false;
  startRound();
}

// --- plant / defuse (player) ---
function updatePlantDefuse(dt) {
  const p = player.state;
  const want = input.state.keys.has('KeyE') || autotestPlant;
  let active = false;
  if (game.phase === 'live' && p.alive && want) {
    if (game.bomb.state === 'carried' && game.bomb.carrier === PLAYER && game.playerTeam === game.attackTeam) {
      const s = SITES[game.attackSite];
      if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r - 0.5) {
        plantProg += dt / 3.5; active = true;
        hud.plantBar(true, plantProg, `PLANTING THE CHARGE · ${s.name}`);
        if (plantProg >= 1) { plantProg = 0; hud.plantBar(false); plantBomb(PLAYER, game.attackSite); }
      }
    } else if (game.bomb.state === 'planted' && game.playerTeam !== game.attackTeam) {
      if (p.pos.distanceTo(game.bomb.pos) < 2.4) {
        defuseProg += dt / (game.loadout.kit ? 2.5 : 5); active = true;
        hud.plantBar(true, defuseProg, 'DEFUSING THE CHARGE');
        if (defuseProg >= 1) { defuseProg = 0; hud.plantBar(false); endRound(game.playerTeam, 'defuse'); }
      }
    }
  }
  if (!active) { plantProg = Math.max(0, plantProg - dt * 0.5); defuseProg = Math.max(0, defuseProg - dt * 0.5); if (plantProg <= 0 && defuseProg <= 0) hud.plantBar(false); }
}

// --- utility throws ---
const projectiles = [];
function throwUtility(kind) {
  const u = game.loadout.util;
  if (!UTILITY[kind] || u[kind] <= 0) { hud.toast(`No ${UTILITY[kind] ? UTILITY[kind].name : kind} left`); return; }
  u[kind] -= 1;
  camera.getWorldDirection(shootDir);
  const pos = camera.position.clone().addScaledVector(shootDir, 0.5);
  projectiles.push({ kind, pos, vel: shootDir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.5, 0)), t: 0 });
  audio.throwWhoosh(); refreshWeaponHud();
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.t += dt; pr.vel.y -= 9.5 * dt;
    pr.pos.addScaledVector(pr.vel, dt);
    if (pr.pos.y <= 0.15 || pr.t > 1.1) {
      projectiles.splice(i, 1);
      if (pr.kind === 'smoke') { effects.smoke(pr.pos); hud.toast('Smoke out'); }
      else if (pr.kind === 'flash') { flashBurst(pr.pos); }
      else if (pr.kind === 'frag') { fragBurst(pr.pos); }
    }
  }
}
function flashBurst(pos) {
  effects.impact(pos, 0xffffff);
  // Player blind if facing it with line of sight.
  const toFlash = pos.clone().sub(camera.position);
  const dist = toFlash.length();
  if (dist < 30) {
    camera.getWorldDirection(shootDir);
    const facing = shootDir.dot(toFlash.clone().normalize());
    if (facing > 0.25 && hasLOS(camera.position, pos)) { hud.flashWhite(); }
  }
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = b.pos.distanceTo(pos);
    if (d < 22 && hasLOS(b.pos, pos)) b.blindUntil = elapsed + 2;
  }
  audio.beep(1, 1400);
}
function fragBurst(pos) {
  effects.explosion(pos.clone()); audio.explosion();
  const hurt = (target, isPlayer) => {
    const d = target.pos.distanceTo(pos);
    if (d > 9) return;
    const dmg = Math.round(95 * (1 - d / 10));
    const res = applyDamage(target, dmg, false);
    if (isPlayer) { hud.hurtFlash(); if (target.hp <= 0) handleKill({ name: 'Frag', team: otherTeam(game.playerTeam) }, PLAYER, null, false, false); }
    else if (target.hp <= 0) handleKill(PLAYER, target, null, false, false);
    else hud.damageNumber(target.pos.clone().setY(target.pos.y + 1.5), `${res.dealt}`, '');
  };
  for (const b of bots.bots) if (b.alive) hurt(b, false);
  if (player.state.alive) hurt(player.state, true);
}

// --- zoom ---
let zoomed = false;
function updateZoom() {
  const want = input.state.keys.has('ShiftLeft') && currentWeapon() && currentWeapon().zoom;
  if (want && !zoomed) { zoomed = true; camera.fov = 74 / currentWeapon().zoom; camera.updateProjectionMatrix(); }
  else if (!want && zoomed) { zoomed = false; camera.fov = 74; camera.updateProjectionMatrix(); }
}

// --- autopilot (headless test) ---
let autotestPlant = false;
function autopilot(dt) {
  const p = player.state;
  if (!p.alive || game.phase !== 'live') { autotestPlant = false; return; }
  // Find nearest visible enemy.
  let best = null, bestD = 1e9;
  for (const b of bots.bots) {
    if (!b.alive || b.team === game.playerTeam) continue;
    const d = p.pos.distanceTo(b.pos);
    if (d < bestD && hasLOS(p.pos, b.pos)) { best = b; bestD = d; }
  }
  const targetSite = game.playerTeam === game.attackTeam ? SITES[game.attackSite] : (game.bomb.state === 'planted' ? { x: game.bomb.pos.x, z: game.bomb.pos.z } : SITES[game.attackSite]);
  const keys = input.state.keys;
  keys.delete('KeyW'); keys.delete('KeyA'); keys.delete('KeyS'); keys.delete('KeyD');
  autotestPlant = false;
  if (game.bomb.state === 'carried' && game.bomb.carrier === PLAYER && game.playerTeam === game.attackTeam) {
    const dSite = Math.hypot(p.pos.x - targetSite.x, p.pos.z - targetSite.z);
    if (dSite < 4.5) { autotestPlant = true; }
    else moveToward(targetSite.x, targetSite.z, keys);
  } else if (game.bomb.state === 'planted' && game.playerTeam !== game.attackTeam) {
    const d = p.pos.distanceTo(game.bomb.pos);
    if (d < 2.2) { keys.add('KeyE'); }
    else moveToward(game.bomb.pos.x, game.bomb.pos.z, keys);
  } else if (best) {
    moveToward(best.pos.x, best.pos.z, keys);
  } else {
    moveToward(targetSite.x, targetSite.z, keys);
  }
  if (best) {
    const tp = best.pos.clone(); tp.y += 1.3;
    const dx = tp.x - p.pos.x, dy = tp.y - (p.pos.y + p.eye), dz = tp.z - p.pos.z;
    const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.asin(Math.max(-1, Math.min(1, dy / Math.hypot(dx, dy, dz))));
    p.yaw += (wantYaw - p.yaw) * Math.min(1, dt * 10);
    p.pitch += (wantPitch - p.pitch) * Math.min(1, dt * 10);
    const ang = Math.abs(wantYaw - p.yaw) + Math.abs(wantPitch - p.pitch);
    input.state.firing = ang < 0.12 && bestD < 55;
    if (currentWeapon() && currentWeapon().kind !== 'melee' && magState().mag === 0) reload();
  } else input.state.firing = false;
  function moveToward(x, z, k) {
    const dx = x - p.pos.x, dz = z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const dir = new THREE.Vector3(dx / d, 0, dz / d);
    if (dir.dot(fwd) > 0.3) k.add('KeyW');
    if (dir.dot(right) > 0.4) k.add('KeyD');
    if (dir.dot(right) < -0.4) k.add('KeyA');
    // Face the movement direction when no enemy.
    if (!best) {
      const wantYaw = Math.atan2(-dx, -dz);
      p.yaw += (wantYaw - p.yaw) * Math.min(1, dt * 4);
    }
  }
}

// --- main loop ---
function syncCamera() {
  const p = player.state;
  if (!p.alive && game.spectate) {
    const ally = game.spectate;
    camera.position.set(ally.pos.x, ally.pos.y + 1.6, ally.pos.z);
    const e = nearestEnemy(ally);
    if (e) camera.lookAt(e.pos.x, e.pos.y + 1.3, e.pos.z);
    else camera.rotation.set(0, ally.yaw, 0, 'YXZ');
    return;
  }
  recoil = Math.max(0, recoil - 0.03);
  camera.position.set(p.pos.x, p.pos.y + p.eye + Math.sin(performance.now() * 0.001) * 0, p.pos.z);
  camera.rotation.set(p.pitch + recoil * 0.4, p.yaw, 0, 'YXZ');
}
function nearestEnemy(from) {
  let best = null, bd = 1e9;
  for (const b of bots.bots) {
    if (!b.alive || b.team === from.team) continue;
    const d = from.pos.distanceTo(b.pos);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function hudTail() {
  // Per-frame HUD overlays: location, nametags, minimap, bomb marker, viewmodel sway.
  hud.setLocation(world.locationAt(player.state.pos.x, player.state.pos.z));
  hud.updateNametags(bots.bots);
  hud.crosshairSpread(7 + player.state.speed * 1.2 + recoil * 90);
  if (elapsed - minimapAt > 0.12) {
    minimapAt = elapsed;
    hud.drawMinimap(bots.bots, player.state, seenIds);
    hud.setScore(game.score.emberfox, game.score.ward,
      bots.aliveCounts().emberfox + (player.state.alive && game.playerTeam === 'emberfox' ? 1 : 0),
      bots.aliveCounts().ward + (player.state.alive && game.playerTeam === 'ward' ? 1 : 0), 'EMBERFOX', 'LANTERN WARD');
    if (game.bomb.state === 'planted') {
      const mk = document.getElementById('bomb-marker');
      if (mk) {
        const pr = hudProject(game.bomb.pos.clone().setY(1.4));
        if (pr.visible) { mk.style.left = `${pr.x}px`; mk.style.top = `${pr.y}px`; mk.textContent = `CHARGE ${Math.ceil(game.bomb.timer)}`; }
        else mk.style.left = '-999px';
      }
    }
  }
  viewmodel.position.y = -0.27 + Math.sin(elapsed * 9) * (player.state.speed > 0 ? 0.008 : 0.002);
  viewmodel.position.x = 0.3 - recoil * 0.05;
  viewmodel.rotation.x = recoil * 0.35;
}
function step(dt) {
  elapsed += dt;
  if (shot) { effects.update(dt); hudTail(); return; } // deterministic capture: freeze logic, keep effects + HUD live
  if (game.phase === 'buy') {
    game.phaseT -= dt;
    hud.setTimer(`0:${String(Math.max(0, Math.ceil(game.phaseT))).padStart(2, '0')}`, game.phaseT < 5);
    if (autotest && game.phaseT < 11) {
      // Auto-buy once per round.
      if (game.money >= WEAPONS.vesper.price && !game.loadout.primary) { const r = buyItem(game.loadout, game.money, 'vesper'); if (r.ok) game.money -= r.cost; }
      if (game.money >= UTILITY.kevlar.price && game.loadout.armour < 100) { const r = buyItem(game.loadout, game.money, 'kevlar'); if (r.ok) game.money -= r.cost; }
      game.slot = game.loadout.primary ? 1 : 2;
      refreshWeaponHud();
    }
    if (game.phaseT <= 0) {
      game.phase = 'live'; game.phaseT = 100;
      hud.hideBuy(); hud.setPhase('LIVE');
      hud.banner('GO', 'Take the site', 1200);
      tlog('live phase');
    }
  } else if (game.phase === 'live') {
    game.phaseT -= dt;
    hud.setTimer(`${Math.floor(Math.max(0, game.phaseT) / 60)}:${String(Math.floor(Math.max(0, game.phaseT)) % 60).padStart(2, '0')}`, game.phaseT < 10);
    if (game.bomb.state === 'planted') {
      game.bomb.timer -= dt;
      hud.setTimer(`0:${String(Math.max(0, Math.ceil(game.bomb.timer))).padStart(2, '0')}`, true);
      hud.plantBar(true, game.bomb.timer / 40, `DEFUSE AT ${game.bomb.site}: ${Math.ceil(game.bomb.timer)} S`);
      if (elapsed > beepAt) { audio.beep(1, 990); beepAt = elapsed + Math.max(0.4, game.bomb.timer / 40); }
      if (game.bomb.timer <= 0) { hud.plantBar(false); explodeBomb(); return; }
    } else if (game.phaseT <= 0) {
      endRound(otherTeam(game.attackTeam), 'time');
      return;
    }
  } else if (game.phase === 'end') {
    game.phaseT -= dt;
    if (game.phaseT <= 0) {
      const e = game.score.emberfox, w = game.score.ward;
      if (e >= 7 || w >= 7 || (game.round >= 12 && e !== w)) return endMatch();
      if (game.round >= 12 && e === w && !game.overtime) { game.overtime = true; game.maxRounds = 13; hud.toast('Overtime — next round wins'); }
      game.round += 1;
      startRound();
    }
  }
  if (game.phase === 'live' || game.phase === 'buy') {
    // Player.
    if (player.state.alive) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      player.step(dt, input.state.keys, input.takeJump());
      if (game.switching > 0) game.switching -= dt;
      if (game.reloading > 0) { game.reloading -= dt; if (game.reloading <= 0) finishReload(); }
      if (input.state.firing) shoot();
      updatePlantDefuse(dt);
      updateZoom();
      // Footsteps.
      if (player.state.speed > 0 && Math.random() < dt * 2.2) audio.step();
    } else if (!game.spectate) {
      const allies = bots.bots.filter((b) => b.alive && b.team === game.playerTeam);
      if (allies.length) game.spectate = allies[0];
    }
    // Keys.
    if (input.state.keys.has('Digit1')) switchSlot(1);
    if (input.state.keys.has('Digit2')) switchSlot(2);
    if (input.state.keys.has('Digit3')) switchSlot(3);
    if (input.state.keys.has('Digit4')) switchSlot(4);
    if (input.state.keys.has('KeyR')) reload();
    if (input.state.keys.has('KeyQ') && !step._q) { throwUtility('flash'); step._q = true; }
    if (!input.state.keys.has('KeyQ')) step._q = false;
    if (input.state.keys.has('KeyG') && !step._g) { throwUtility('smoke'); step._g = true; }
    if (!input.state.keys.has('KeyG')) step._g = false;
    if (input.state.keys.has('Digit5') && !step._5) { throwUtility('frag'); step._5 = true; }
    if (!input.state.keys.has('Digit5')) step._5 = false;
    if (input.state.keys.has('KeyB') && !step._b) {
      if (hud.isBuyOpen()) hud.hideBuy(); else if (game.phase === 'buy') hud.showBuy(game.money, Math.ceil(game.phaseT), game.loadout);
      step._b = true;
    }
    if (!input.state.keys.has('KeyB')) step._b = false;
    if (input.state.keys.has('KeyM') && !step._m) { audio.setMuted(!(step._muted = !step._muted)); step._m = true; }
    if (!input.state.keys.has('KeyM')) step._m = false;
    if (autotest) autopilot(dt);
    // Bots.
    const G = { phase: game.phase, planted: game.bomb.state === 'planted', plantedSite: game.bomb.site, bombPos: game.bomb.pos, attackSite: game.attackSite };
    bots.update(dt, G);
    updateProjectiles(dt);
    // Seen set for the minimap.
    seenIds.clear();
    for (const b of bots.bots) {
      if (!b.alive || b.team === game.playerTeam) continue;
      if (player.state.alive && hasLOS(player.state.pos, b.pos) && player.state.pos.distanceTo(b.pos) < 45) seenIds.add(b.id);
      if (b.seenAt && elapsed - b.seenAt < 3) seenIds.add(b.id);
    }
  }
  effects.update(dt);
  hudTail();
}
function hudProject(v) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
}
function endMatch() {
  game.phase = 'match';
  const e = game.score.emberfox, w = game.score.ward;
  const winner = e > w ? 'emberfox' : 'ward';
  const playerWon = winner === game.playerTeam;
  hud.showMenu('match', {
    title: playerWon ? 'VICTORY' : 'DEFEAT',
    copy: `${teamName(winner)} takes the bazaar ${e}–${w}. ${game.kills} eliminations, ${game.deaths} deaths. Thanks for playing Duskfall Bazaar.`,
    button: 'Play again',
  });
  if (playerWon) audio.win(); else audio.lose();
  tlog(`match end ${e}-${w}`);
  if (document.pointerLockElement) document.exitPointerLock();
  if (autotest) { setTimeout(() => { if (game.phase === 'match') startMatch(); }, 3000); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    if (autotest) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 40) { step(FIXED_STEP); accumulator -= FIXED_STEP; steps += 1; }
      if (accumulator > FIXED_STEP * 40) accumulator = 0;
    } else {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) { step(FIXED_STEP); accumulator -= FIXED_STEP; steps += 1; }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
    }
    syncCamera();
  }
  renderer.render(scene, camera);
}
function onLockChange(locked) {
  if (shot) return;
  if (locked) { started = true; hud.hideMenu(); audio.unlock(); }
  else if (game.phase === 'live' || game.phase === 'buy') hud.showMenu('paused', { title: 'PAUSED', copy: 'Click to resume the round.', button: 'Resume' });
}
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.phase === 'menu') { startMatch(); input.requestLock(); }
  else if (game.phase === 'match') { startMatch(); input.requestLock(); }
  else input.requestLock();
});
hud.onBuy((id, item) => {
  const r = buyItem(game.loadout, game.money, id);
  if (r.ok) {
    game.money -= r.cost;
    if (WEAPONS[id]) { game.slot = WEAPONS[id].slot === 1 ? 1 : game.slot; buildViewmodel(WEAPONS[id].kind); }
    if (id === 'kevlar' || id === 'helmet') { player.state.armour = 100; player.state.helmet = id === 'helmet'; }
    audio.click(); hud.setCash(game.money); hud.setArmour(player.state.armour, player.state.helmet);
    refreshWeaponHud();
  } else hud.toast(r.msg);
  hud.refreshBuy(game.loadout, game.money);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
// Bomb marker element (created once).
const bombMarker = document.createElement('div');
bombMarker.id = 'bomb-marker'; bombMarker.className = 'nametag hidden';
bombMarker.style.cssText = 'position:fixed;transform:translate(-50%,-100%);z-index:5;color:#ff5a3c;border:1px solid #ff5a3c;';
document.getElementById('nametags').appendChild(bombMarker);

// --- deterministic screenshot modes ---
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    hudTail();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) { window.__shotReady = true; frozen = true; }
  }
  requestAnimationFrame(paint);
}
function settle(steps) { for (let i = 0; i < steps; i++) step(FIXED_STEP); }
function runShot(name) {
  hud.hideMenu(); hud.hideBuy();
  audio.unlock();
  startMatch();
  // Force the round into a scripted state.
  const p = player.state;
  // From round 2 on the player carries the Vesper AR they bought.
  function giveVesper() {
    game.loadout.primary = 'vesper';
    game.loadout.mags.vesper = { mag: 24, reserve: 90 };
    game.slot = 1; buildViewmodel('rifle'); refreshWeaponHud();
  }
  if (name === 'start') {
    game.phase = 'buy'; game.phaseT = 12;
    p.pos.set(-24, 0, -2); p.yaw = -1.65; p.pitch = 0.02;
    hud.setTimer('0:12', false);
    hud.showMenu('start', { title: 'DUSKFALL BAZAAR', copy: 'A night bazaar at dusk, lit by lanterns. Five versus five, first to 7 rounds. Plant the charge at Spice Court or Lantern Row — or hold the stalls and defuse it.', button: 'Click to play' });
    settle(10);
  } else if (name === 'play') {
    giveVesper();
    game.phase = 'live'; game.phaseT = 74; game.round = 6;
    game.score = { emberfox: 3, ward: 2 };
    game.attackSite = 'B';
    hud.setObjective('Plant the charge at Lantern Row — you carry it.');
    p.pos.set(-8, 0, -4); p.yaw = -1.95; p.pitch = 0;
    // Stage two enemies in view, one mid-range, one far.
    const enemies = bots.bots.filter((b) => b.team !== game.playerTeam && b.alive);
    if (enemies[0]) { enemies[0].pos.set(6, 0, 2); enemies[0].yaw = Math.PI / 2; enemies[0].mesh.position.copy(enemies[0].pos); enemies[0].mesh.rotation.y = enemies[0].yaw; }
    if (enemies[1]) { enemies[1].pos.set(12, 0, -8); enemies[1].yaw = Math.PI / 2; enemies[1].mesh.position.copy(enemies[1].pos); enemies[1].mesh.rotation.y = enemies[1].yaw; }
    if (enemies[2]) { enemies[2].pos.set(2, 0, 10); enemies[2].yaw = Math.PI; enemies[2].mesh.position.copy(enemies[2].pos); }
    effects.smoke(new THREE.Vector3(0, 0, -6));
    hud.killfeedAdd('You', 'Vesper AR', 'Faris', ['HS']);
    hud.killfeedAdd('Asha', 'Moth SMG', 'Gita', []);
    hud.killfeedAdd('Dario', 'Heron DMR', 'Hadi', ['WALLBANG']);
    hud.radioAdd('Asha', 'Entry', 'Contact at Lantern Row, rotating');
    hud.radioAdd('Bram', 'Support', 'Smoke out — pushing B');
    hud.radioAdd('Cleo', 'Lurker', 'Footsteps Mid Arch — flanking');
    hud.setHealth(86); hud.setArmour(100, true); hud.setCash(2350);
    game.money = 2350;
    hud.setTimer('1:14', false); hud.setRound(6, 12); hud.setPhase('LIVE');
    hud.setScore(3, 2, 4, 3, 'EMBERFOX', 'LANTERN WARD');
    settle(6);
    // Transient combat effects last: created fresh so they are at full strength in the capture.
    // A tracer ACROSS the view (enemy firing past the player) reads far better than one
    // fired along the view direction, which foreshortens to a dot.
    const farEnemy = new THREE.Vector3(12, 1.45, -8);
    const crossTo = new THREE.Vector3(-2, 1.2, -6);
    effects.tracer(farEnemy, crossTo);
    effects.muzzle(farEnemy, crossTo.clone().sub(farEnemy).normalize());
    syncCamera();
    hud.damageNumber(new THREE.Vector3(6, 2.5, 2), 'HEAD x2 72', 'head', true);
  } else if (name === 'plant') {
    giveVesper();
    game.phase = 'live'; game.phaseT = 47; game.round = 7;
    game.score = { emberfox: 3, ward: 3 };
    game.attackSite = 'B';
    p.pos.set(16.5, 0, 8.5); p.yaw = -2.36; p.pitch = 0;
    const ally = bots.bots.find((b) => b.team === game.playerTeam && b.alive && b.name === 'Asha');
    if (ally) { ally.pos.set(18, 0, 13.5); ally.yaw = Math.PI / 2; ally.mesh.position.copy(ally.pos); ally.mesh.rotation.y = ally.yaw; }
    const enemy = bots.bots.find((b) => b.team !== game.playerTeam && b.alive);
    if (enemy) { enemy.pos.set(21, 0, 10); enemy.yaw = Math.PI / 2; enemy.mesh.position.copy(enemy.pos); enemy.mesh.rotation.y = enemy.yaw; }
    hud.banner('PLANT THE CHARGE AT B · YOU CARRY IT', '', 0);
    hud.plantBar(true, 0.55, 'PLANTING THE CHARGE · LANTERN ROW');
    hud.killfeedAdd('Dace', 'Harrow AR', 'Juno', ['HS']);
    hud.radioAdd('Asha', 'Entry', 'Plant B through Lantern Row');
    hud.radioAdd('Bram', 'Support', 'Smoke out');
    hud.radioAdd('Asha', 'Entry', 'Planting B, cover the yard');
    hud.setHealth(83); hud.setArmour(100, true); hud.setCash(1250);
    game.money = 1250;
    hud.setTimer('0:47', false); hud.setRound(7, 12); hud.setPhase('LIVE');
    hud.setScore(3, 3, 4, 4, 'EMBERFOX', 'LANTERN WARD');
    settle(6);
  } else { // end
    giveVesper();
    game.phase = 'end'; game.phaseT = 4.5; game.round = 8;
    game.score = { emberfox: 4, ward: 3 };
    p.pos.set(14, 0, 6); p.yaw = -Math.PI / 2.2; p.pitch = 0;
    effects.explosion(new THREE.Vector3(19, 1, 11));
    hud.banner('EMBERFOX WINS THE ROUND', 'The charge detonated at Lantern Row · +$3,250', 0, 'gold');
    hud.killfeedAdd('You', 'Vesper AR', 'Iman', ['HS']);
    hud.killfeedAdd('Cleo', 'Moth SMG', 'Eda', []);
    hud.radioAdd('Bram', 'Support', 'Site clear — nice plant');
    hud.setHealth(64); hud.setArmour(62, true); hud.setCash(5600);
    game.money = 5600;
    hud.setTimer('0:00', false); hud.setRound(8, 12); hud.setPhase('ROUND END');
    hud.setScore(4, 3, 3, 0, 'EMBERFOX', 'LANTERN WARD');
    settle(6);
  }
  refreshWeaponHud();
  syncCamera();
  paintTwiceThenReady();
}
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
if (autotest) { audio.unlock(); startMatch(); tlog('autotest started'); }
