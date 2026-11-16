// Duskfall Bazaar — bot AI: roles, waypoint pathing, combat, plant/defuse, retreat, radio.
import * as THREE from 'three';
import { WEAPONS, applyDamage } from './weapons.js';
import { SITES, SPAWNS } from './world.js';

const ATTACK_NAMES = [
  { name: 'Asha', role: 'entry' }, { name: 'Bram', role: 'support' },
  { name: 'Cleo', role: 'lurker' }, { name: 'Dario', role: 'awper' },
];
const DEFEND_NAMES = [
  { name: 'Eda', role: 'anchor' }, { name: 'Faris', role: 'anchor' },
  { name: 'Gita', role: 'mid' }, { name: 'Hadi', role: 'awper' }, { name: 'Iman', role: 'rotator' },
];
const RADIO_LINES = {
  planA: ['Plan: hit A through Spice Court — Asha entry', 'A push, smoke Mid Arch on my mark'],
  planB: ['Plan: split B — Cleo flank, Asha entry', 'B through Lantern Row, Dario holds long'],
  contact: ['Contact at {loc}, rotating', 'Enemy {loc} — {n} spotted', 'Footsteps {loc} — rotating to flank'],
  kill: ['{loc} clear, pushing', 'One down at {loc}'],
  plant: ['Planting {site}, cover the court', 'Charge going down at {site}'],
  defuse: ['Defusing at {site}, hold them off', 'On the charge — cover me'],
  hurt: ["I'm hit, falling back", 'Taking fire at {loc}, need help'],
  rotate: ['Rotating to {site}', 'Leaving {loc}, heading {site}'],
};
const TEAM_COLOR = { emberfox: 0xd86a20, ward: 0x2e8a8a };
const SKIN = [0xd9a066, 0xc98a5a, 0xe8b88a, 0xb97a4a];

export function createBots(scene, world, ctx) {
  const bots = [];
  const raycaster = new THREE.Raycaster(); raycaster.far = 90;
  let botSeq = 0;
  const rnd = ctx.rng || Math.random;

  function buildMesh(team, role, idx) {
    const g = new THREE.Group();
    const tc = TEAM_COLOR[team];
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), mat(tc));
    torso.position.y = 1.12; torso.castShadow = true; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.4), mat(0x2a2320));
    vest.position.y = 1.18; g.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), mat(SKIN[idx % 4]));
    head.position.y = 1.68; head.castShadow = true; g.add(head);
    if (role === 'awper') {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 10), mat(0x3a2a1a));
      hat.position.y = 1.9; g.add(hat);
    } else if (role === 'entry' || role === 'anchor') {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(team === 'emberfox' ? 0x8a4a1a : 0x1a4a4a));
      helm.position.y = 1.8; g.add(helm);
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), mat(0x4a2a1a));
      cap.position.y = 1.88; g.add(cap);
    }
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), mat(0x2e2620));
    legL.position.set(-0.16, 0.39, 0); const legR = legL.clone(); legR.position.x = 0.16;
    g.add(legL); g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.18), mat(tc));
    armL.position.set(-0.4, 1.25, 0.18); armL.rotation.x = -1.1; g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), mat(0x1c1a18));
    gun.position.set(0.1, 1.3, 0.45); g.add(gun);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.38), mat(team === 'emberfox' ? 0xffd27a : 0x7ad7d7));
    band.position.y = 1.42; g.add(band);
    g.traverse((o) => { if (o.isMesh) o.userData.botRef = null; });
    torso.userData.part = 'body'; head.userData.part = 'head'; legL.userData.part = 'body'; legR.userData.part = 'body';
    return { group: g, hitMeshes: [torso, head, legL, legR], legL, legR };
  }

  function spawnBot(def, team, side, pos, yaw) {
    const id = ++botSeq;
    const { group, hitMeshes, legL, legR } = buildMesh(team, def.role, id);
    group.position.set(pos[0], world.groundHeight(pos[0], pos[1]), pos[1]);
    group.rotation.y = yaw;
    scene.add(group);
    hitMeshes.forEach((m) => { m.userData.botRef = id; });
    const weaponId = def.role === 'awper' ? 'heron' : def.role === 'lurker' ? 'moth' : 'vesper';
    const bot = {
      id, name: def.name, team, role: def.role, side,
      pos: group.position, yaw, hp: 100, armour: def.role === 'lurker' ? 50 : 100,
      helmet: def.role !== 'lurker', alive: true, weapon: WEAPONS[weaponId],
      mag: WEAPONS[weaponId].mag, reserve: WEAPONS[weaponId].reserve,
      mesh: group, hitMeshes, legL, legR,
      state: 'move', path: [], pathI: 0, targetNode: -1, holdNode: -1,
      repathAt: 0, thinkAt: rnd() * 0.2, shootAt: 0, burstLeft: 0, burstAt: 0,
      reactAt: 0, seenPos: null, seenAt: -10, lastShotAt: -10, stuckAt: 0, lastPos: new THREE.Vector3(),
      plantAt: 0, defuseAt: 0, radioAt: 0, isCarrier: false, walkPhase: rnd() * 6,
      aimYaw: yaw, aimPitch: 0, fallT: 0,
    };
    bots.push(bot);
    return bot;
  }

  function nearestNode(x, z) {
    let best = 0, bd = 1e9;
    world.waypoints.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function bfsPath(from, to) {
    if (from === to) return [];
    const prev = new Map([[from, -1]]); const q = [from];
    while (q.length) {
      const n = q.shift();
      for (const m of world.waypoints.edges[n] || []) {
        if (!prev.has(m)) { prev.set(m, n); if (m === to) { const path = [to]; let c = to; while (prev.get(c) !== -1) { c = prev.get(c); path.unshift(c); } return path.slice(1); } q.push(m); }
      }
    }
    return [];
  }
  function setPath(bot, node) {
    bot.targetNode = node;
    bot.path = bfsPath(nearestNode(bot.pos.x, bot.pos.z), node);
    bot.pathI = 0;
  }
  function collide(p) {
    for (const c of world.colliders) {
      if (c.platform !== undefined) continue;
      if (p.y >= c.h) continue;
      const nx = Math.max(c.x0, Math.min(p.x, c.x1)), nz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < 0.45 * 0.45) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = nx + (dx / d) * 0.45; p.z = nz + (dz / d) * 0.45; }
        else p.x = c.x1 + 0.46;
      }
    }
    p.x = Math.max(-27.2, Math.min(27.2, p.x)); p.z = Math.max(-19.7, Math.min(19.7, p.z));
  }
  function hasLOS(a, b) {
    if (ctx.effects.blockedBySmoke(a, b)) return false;
    raycaster.set(new THREE.Vector3(a.x, a.y + 1.45, a.z), new THREE.Vector3(b.x - a.x, (b.y + 1.3) - (a.y + 1.45), b.z - a.z).normalize());
    const hits = raycaster.intersectObjects(world.shootables, false);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    return !(hits.length && hits[0].distance < dist - 0.3);
  }
  function radio(bot, kind, vars = {}) {
    const now = ctx.time();
    if (now - bot.radioAt < 4 || now - ctx.lastRadioAt < 1.6) return;
    bot.radioAt = now; ctx.lastRadioAt = now;
    const lines = RADIO_LINES[kind]; if (!lines) return;
    let line = lines[Math.floor(rnd() * lines.length)];
    line = line.replace('{loc}', vars.loc || world.locationAt(bot.pos.x, bot.pos.z).split(' · ')[0])
      .replace('{n}', vars.n || '2').replace('{site}', vars.site || 'A');
    ctx.onRadio(bot.name, bot.role, line);
  }
  function pickLine(bot, kind, vars) { radio(bot, kind, vars); }

  function fireAt(bot, target, isPlayer) {
    const now = ctx.time();
    if (now < bot.shootAt) return;
    const w = bot.weapon;
    const dist = bot.pos.distanceTo(target.pos);
    if (dist > w.range) return;
    // Burst pacing.
    if (bot.burstLeft <= 0) {
      bot.burstLeft = w.kind === 'dmr' ? 1 : 3 + Math.floor(rnd() * 3);
      bot.shootAt = now + 0.45 + rnd() * 0.5;
      return;
    }
    bot.burstLeft -= 1;
    bot.shootAt = now + 60 / w.rpm + (w.kind === 'dmr' ? 0.9 : 0);
    if (bot.mag <= 0) { bot.mag = w.mag; bot.reserve = Math.max(0, bot.reserve - w.mag); bot.shootAt = now + w.reload; return; }
    bot.mag -= 1; bot.lastShotAt = now;
    const from = bot.pos.clone(); from.y += 1.45;
    const to = target.pos.clone(); to.y += target === ctx.playerState ? 1.35 : 1.25;
    const spread = w.spread * 2.2;
    to.x += (rnd() - 0.5) * spread * dist; to.y += (rnd() - 0.5) * spread * dist; to.z += (rnd() - 0.5) * spread * dist;
    ctx.effects.muzzle(from, to.clone().sub(from).normalize());
    ctx.effects.tracer(from, to);
    ctx.audio.shot(w.kind);
    // Hit roll: accuracy falls with distance, target speed and crouch.
    let p = Math.max(0.1, 0.52 - dist * 0.0055);
    if (isPlayer) { if (ctx.playerSpeed() > 3) p *= 0.75; if (ctx.playerCrouched()) p *= 0.8; }
    if (bot.role === 'awper') p = Math.max(0.14, 0.42 - dist * 0.002);
    if (rnd() < p) {
      const head = rnd() < 0.12;
      const res = applyDamage(target, w.dmg * Math.max(0.45, 1 - dist / (w.range * 2.2)), head);
      ctx.effects.impact(to, 0xffc266);
      if (isPlayer) ctx.onPlayerDamaged(res.hpDmg, bot.name);
      else if (target.hp <= 0) ctx.onKill(bot, target, w, head, false);
      else ctx.onBotHit(bot, target, res.dealt, head);
    } else {
      // Near miss: impact on the wall/floor behind.
      const miss = to.clone().add(new THREE.Vector3((rnd() - 0.5) * 2, (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 2));
      ctx.effects.impact(miss, 0xd8c8a8);
    }
  }

  function updateBot(bot, dt, G) {
    if (!bot.alive) { // fall + fade
      bot.fallT += dt;
      bot.mesh.rotation.x = Math.max(-Math.PI / 2, bot.mesh.rotation.x - dt * 4);
      if (bot.fallT > 5) bot.mesh.visible = false;
      return;
    }
    const now = ctx.time();
    const isAttacker = bot.side === 'attack';
    const combat = G.phase === 'live'; // no shooting during the buy phase
    // --- choose target: nearest visible enemy ---
    let target = null, targetIsPlayer = false;
    if (combat && now >= bot.thinkAt) {
      bot.thinkAt = now + 0.15 + rnd() * 0.1;
      let bestD = 1e9;
      const enemies = bots.filter((b) => b.alive && b.team !== bot.team);
      for (const e of enemies) {
        const d = bot.pos.distanceTo(e.pos);
        if (d < bestD && hasLOS(bot.pos, e.pos)) { bestD = d; target = e; }
      }
      if (ctx.playerAlive() && ctx.playerTeam() !== bot.team) {
        const d = bot.pos.distanceTo(ctx.playerState.pos);
        if (d < bestD && hasLOS(bot.pos, ctx.playerState.pos)) { target = ctx.playerState; targetIsPlayer = true; bestD = d; }
      }
      if (target) {
        if (!bot.seenPos || bot.seenAt < now - 1.2) bot.reactAt = now + 0.35 + rnd() * 0.45;
        bot.seenPos = target.pos.clone(); bot.seenAt = now;
        if (rnd() < 0.3) radio(bot, 'contact', { n: String(1 + Math.floor(rnd() * 2)) });
      }
    }
    const seen = combat && bot.seenPos && now - bot.seenAt < 1.4;
    // --- plant / defuse ---
    if (G.phase === 'live' && G.planted) {
      if (!isAttacker) {
        // Defenders converge on the planted site.
        if (bot.state !== 'defuse' && bot.pos.distanceTo(G.bombPos) < 2.2) {
          bot.state = 'defuse'; bot.defuseAt = now + (bot.kit ? 2.5 : 5);
          radio(bot, 'defuse', { site: G.plantedSite });
        } else if (bot.state !== 'defuse') {
          if (bot.targetNode !== (G.plantedSite === 'A' ? 20 : 22)) setPath(bot, G.plantedSite === 'A' ? 20 : 22);
          bot.state = 'move';
        }
        if (bot.state === 'defuse') {
          if (now >= bot.defuseAt) { ctx.onDefused(bot); return; }
          if (seen && target) { bot.state = 'move'; bot.defuseAt = 0; }
        }
      }
    } else if (G.phase === 'live' && isAttacker && bot.isCarrier) {
      const site = G.attackSite;
      const sp = site === 'A' ? SITES.A : SITES.B;
      const d = Math.hypot(bot.pos.x - sp.x, bot.pos.z - sp.z);
      if (d < sp.r - 0.5 && !seen) {
        if (bot.state !== 'plant') { bot.state = 'plant'; bot.plantAt = now + 3.5; radio(bot, 'plant', { site }); ctx.onPlantStart(bot, site); }
        if (now >= bot.plantAt) { ctx.onPlanted(bot, site); return; }
      } else if (bot.state === 'plant') { bot.state = 'move'; bot.plantAt = 0; ctx.onPlantCancel(bot); }
    }
    // --- retreat on low HP ---
    if (bot.hp < 30 && bot.state !== 'retreat' && !seen) {
      bot.state = 'retreat';
      const back = bot.side === 'attack' ? nearestNode(bot.pos.x + (bot.team === 'emberfox' ? -8 : 8), bot.pos.z) : nearestNode(bot.pos.x, bot.pos.z);
      setPath(bot, back); radio(bot, 'hurt');
      setTimeout(() => { if (bot.alive && bot.state === 'retreat') bot.state = 'move'; }, 3500);
    }
    // --- movement ---
    let moveTarget = null;
    if (bot.state === 'move' || bot.state === 'retreat') {
      if (bot.pathI < bot.path.length) {
        const n = world.waypoints.pts[bot.path[bot.pathI]];
        moveTarget = new THREE.Vector3(n.x, bot.pos.y, n.z);
        if (Math.hypot(bot.pos.x - n.x, bot.pos.z - n.z) < 0.9) bot.pathI += 1;
      } else if (bot.targetNode >= 0) {
        const n = world.waypoints.pts[bot.targetNode];
        moveTarget = new THREE.Vector3(n.x, bot.pos.y, n.z);
      }
    }
    if (seen && target) {
      // Face and shoot; strafe a little.
      const tp = target.pos;
      bot.aimYaw = Math.atan2(-(tp.x - bot.pos.x), -(tp.z - bot.pos.z));
      bot.yaw += (bot.aimYaw - bot.yaw) * Math.min(1, dt * 8);
      if (now >= bot.reactAt) fireAt(bot, target, targetIsPlayer);
      if (bot.state === 'move' && rnd() < dt * 0.5) { /* hold ground while engaging */ }
    } else if (moveTarget) {
      const dx = moveTarget.x - bot.pos.x, dz = moveTarget.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const speed = bot.role === 'awper' ? 3.1 : 3.8;
        bot.pos.x += (dx / d) * speed * dt; bot.pos.z += (dz / d) * speed * dt;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.walkPhase += dt * 9;
        bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.45; bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.45;
      }
      // Stuck detection.
      if (now - bot.stuckAt > 2) {
        if (bot.lastPos.distanceTo(bot.pos) < 0.4 && bot.path.length) setPath(bot, bot.targetNode);
        bot.lastPos.copy(bot.pos); bot.stuckAt = now;
      }
    } else {
      bot.legL.rotation.x *= 0.8; bot.legR.rotation.x *= 0.8;
    }
    if (!seen && moveTarget) bot.yaw += (Math.atan2(-(moveTarget.x - bot.pos.x), -(moveTarget.z - bot.pos.z)) - bot.yaw) * Math.min(1, dt * 6);
    collide(bot.pos);
    bot.pos.y = world.groundHeight(bot.pos.x, bot.pos.z, bot.pos.y);
    bot.mesh.position.copy(bot.pos);
    bot.mesh.rotation.y = bot.yaw;
    // Keep the gun level: small aim pitch on the torso is skipped for stability.
  }

  function startRound(attackTeam, attackSite, playerIsCarrier) {
    // Clear old bots.
    for (const b of bots) { scene.remove(b.mesh); }
    bots.length = 0; botSeq = 0;
    const atkDefs = attackTeam === 'emberfox' ? ATTACK_NAMES : DEFEND_NAMES;
    const defDefs = attackTeam === 'emberfox' ? DEFEND_NAMES : ATTACK_NAMES;
    const atkTeam = attackTeam, defTeam = attackTeam === 'emberfox' ? 'ward' : 'emberfox';
    // Attackers: 4 bots + player. One bot carries if the player does not.
    atkDefs.forEach((def, i) => {
      const sp = SPAWNS[atkTeam][i];
      const b = spawnBot(def, atkTeam, 'attack', sp, atkTeam === 'emberfox' ? -Math.PI / 2 : Math.PI / 2);
      b.isCarrier = !playerIsCarrier && def.role === 'entry';
      setPath(b, attackSite === 'A' ? (def.role === 'lurker' ? 22 : 20) : (def.role === 'lurker' ? 20 : 22));
      if (def.role === 'awper') setPath(b, attackSite === 'A' ? 9 : 10);
    });
    // Defenders: 5 bots hold.
    const holdNodes = attackSite === 'A' ? [20, 21, 9, 24, 11] : [22, 23, 10, 25, 8];
    defDefs.forEach((def, i) => {
      const sp = SPAWNS[defTeam][i];
      const b = spawnBot(def, defTeam, 'defend', sp, defTeam === 'emberfox' ? -Math.PI / 2 : Math.PI / 2);
      b.kit = def.role === 'anchor';
      setPath(b, holdNodes[i]);
      b.holdNode = holdNodes[i];
    });
    return bots;
  }

  function aliveCounts() {
    let e = 0, w = 0;
    for (const b of bots) if (b.alive) { if (b.team === 'emberfox') e++; else w++; }
    return { emberfox: e, ward: w };
  }
  function update(dt, G) { for (const b of bots) updateBot(b, dt, G); }
  function hitMeshes() { const out = []; for (const b of bots) if (b.alive) out.push(...b.hitMeshes); return out; }
  function botByMeshId(id) { return bots.find((b) => b.id === id); }
  function carrierBot() { return bots.find((b) => b.isCarrier && b.alive); }

  return { bots, startRound, update, aliveCounts, hitMeshes, botByMeshId, carrierBot, pickLine, SITES };
}
