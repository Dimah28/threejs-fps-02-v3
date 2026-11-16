// Duskfall Bazaar — the map: a night bazaar at dusk, 55 x 40 m.
// Sites: A Spice Court (west) and B Lantern Row (east). Three lanes, two balconies.
import * as THREE from 'three';

export const SITES = {
  A: { name: 'SPICE COURT', x: -19, z: -11, r: 5.5 },
  B: { name: 'LANTERN ROW', x: 19, z: 11, r: 5.5 },
};
export const SPAWNS = {
  emberfox: [[-25, -3], [-25, -1], [-25, 1], [-25, 3], [-23.5, 0]],
  ward: [[25, -3], [25, -1], [25, 1], [25, 3], [23.5, 0]],
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function groundTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8a6a4e'; g.fillRect(0, 0, w, h);
    const tones = ['#937453', '#7d5f45', '#9c7c58', '#86664a'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      g.fillStyle = tones[(x * 7 + y * 3) % 4];
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x * 64 + 2, y * 64 + 58, 60, 4);
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  });
}
function awningTexture(a, b) {
  return canvasTex(256, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, h); }
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h - 10, w, 10);
  });
}
function signTexture(title, sub, bg, fg) {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(title, w / 2, 76);
    g.font = '28px system-ui, sans-serif'; g.fillText(sub, w / 2, 122);
  });
}
function letterTexture(letter, color) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color; g.font = 'bold 210px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = 0.85; g.fillText(letter, w / 2, h / 2 + 8);
  });
}
function skyTexture() {
  return canvasTex(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#241640'); gr.addColorStop(0.42, '#5a2f6e');
    gr.addColorStop(0.68, '#c65a2e'); gr.addColorStop(0.84, '#f59a4a'); gr.addColorStop(1, '#3a2233');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

export function createWorld(scene) {
  const colliders = []; // {x0,z0,x1,z1,h,pen}
  const shootables = []; // meshes the raycaster tests, userData.pen marks wallbang wood
  const lanterns = [];
  const mats = {
    plaster: new THREE.MeshLambertMaterial({ color: 0xc9a06b }),
    plaster2: new THREE.MeshLambertMaterial({ color: 0xb98d5a }),
    brick: new THREE.MeshLambertMaterial({ color: 0x8a4a34 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x5e4030 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
    woodPen: new THREE.MeshLambertMaterial({ color: 0x8f6a3e }),
    stone: new THREE.MeshLambertMaterial({ color: 0x6e6258 }),
    teal: new THREE.MeshLambertMaterial({ color: 0x2e6b6b }),
    orange: new THREE.MeshLambertMaterial({ color: 0xd86a20 }),
    rug: new THREE.MeshLambertMaterial({ color: 0x9a2e3e }),
    rug2: new THREE.MeshLambertMaterial({ color: 0x2e4a7a }),
    sack: new THREE.MeshLambertMaterial({ color: 0xc2a878 }),
    pot: new THREE.MeshLambertMaterial({ color: 0x4a7a8a }),
    pot2: new THREE.MeshLambertMaterial({ color: 0xc25e2e }),
    lantern: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    lanternRed: new THREE.MeshBasicMaterial({ color: 0xff5a3c }),
    water: new THREE.MeshLambertMaterial({ color: 0x2e6a8a, emissive: 0x0a2a3a }),
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(55, 40), new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(95, 16, 12), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0x3a2340, 26, 78);
  const hemi = new THREE.HemisphereLight(0x8a6ab0, 0x3a2a22, 0.75); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.7); sun.position.set(-34, 20, -14);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32; sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x8a7ac0, 0.35); moon.position.set(20, 30, 18); scene.add(moon);

  function box(x, z, w, d, h, mat, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, (opts.y ?? 0) + h / 2, z);
    m.castShadow = opts.shadow !== false; m.receiveShadow = true;
    m.userData.pen = !!opts.pen; scene.add(m);
    if (opts.shoot !== false) shootables.push(m);
    if (!opts.noCollide) colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h: (opts.y ?? 0) + h, pen: !!opts.pen });
    return m;
  }
  // Perimeter walls.
  box(0, -20.4, 56, 0.8, 4.6, mats.plaster); box(0, 20.4, 56, 0.8, 4.6, mats.plaster2);
  box(-27.9, 0, 0.8, 41.6, 4.6, mats.plaster2); box(27.9, 0, 0.8, 41.6, 4.6, mats.plaster);
  // Lane blocks.
  box(-20, -17.6, 12, 4.8, 4, mats.brick); box(-1, -17.8, 10, 4.4, 4, mats.plaster); box(20, -17, 12, 6, 4.5, mats.brick);
  box(-20, 17.6, 12, 4.8, 4, mats.plaster); box(1, 17.8, 10, 4.4, 4, mats.brick); box(20, 17, 12, 6, 4.5, mats.plaster2);
  box(-5, -5.5, 6, 5, 3.5, mats.plaster2); box(5, 5.5, 6, 5, 3.5, mats.brick);
  // Fountain plaza (mid).
  const fBase = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 1.0, 12), mats.stone);
  fBase.position.set(0, 0.5, 0); fBase.castShadow = true; scene.add(fBase); shootables.push(fBase);
  colliders.push({ x0: -2.3, z0: -2.3, x1: 2.3, z1: 2.3, h: 1.0, pen: false });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.2, 12), mats.water);
  water.position.set(0, 1.0, 0); scene.add(water);
  const fTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 8), mats.stone);
  fTop.position.set(0, 1.6, 0); scene.add(fTop);
  // Market stalls (thin wood = wallbangable).
  function stall(x, z, w, awn) {
    box(x, z, w, 1.1, 1.15, mats.woodPen, { pen: true });
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 1.6), new THREE.MeshLambertMaterial({ map: awningTexture(awn, '#f2e3c2'), side: THREE.DoubleSide }));
    aw.position.set(x, 2.5, z); aw.rotation.x = -0.5; aw.castShadow = true; scene.add(aw);
    for (const dx of [-w / 2 + 0.15, w / 2 - 0.15]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), mats.wood);
      post.position.set(x + dx, 1.2, z + 0.45); scene.add(post);
    }
  }
  stall(-8, -11.5, 8, '#d86a20'); stall(8, 11.5, 8, '#2e6b6b'); stall(-19, -7.5, 6, '#9a2e3e'); stall(19, 7.5, 6, '#d86a20'); stall(2, -13.5, 8, '#2e4a7a');
  // Balconies (verticality) + ramps.
  function balcony(x, z, w, d) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), mats.wood);
    top.position.set(x, 2.6, z); top.castShadow = true; top.receiveShadow = true; scene.add(top);
    for (const [px, pz] of [[-w / 2 + 0.2, -d / 2 + 0.2], [w / 2 - 0.2, -d / 2 + 0.2], [-w / 2 + 0.2, d / 2 - 0.2], [w / 2 - 0.2, d / 2 - 0.2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 0.25), mats.dark);
      leg.position.set(x + px, 1.3, z + pz); scene.add(leg);
    }
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h: 0.3, pen: false, platform: 2.6 });
  }
  balcony(-11, -17.5, 4, 3); balcony(11, 17.5, 4, 3);
  // Ramps up to the balconies.
  function ramp(x, z, w, d, dir) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), mats.wood);
    r.position.set(x, 1.3, z); r.rotation.z = dir * 0.62; r.castShadow = true; scene.add(r);
  }
  ramp(-15.2, -17.5, 4.6, 2.6, 1); ramp(15.2, 17.5, 4.6, 2.6, -1);
  // Crates, barrels, sacks, pottery.
  const crateSpots = [[-14, -3, 1.4], [-13, -4.2, 1.1], [-14.2, -4.4, 1], [14, 3, 1.4], [13, 4.2, 1.1], [14.2, 4.4, 1], [-8, 8, 1.3], [8, -8, 1.3], [-22, 4, 1.2], [22, -4, 1.2], [3, -9, 1.2], [-3, 9, 1.2]];
  for (const [x, z, s] of crateSpots) box(x, z, s, s, s, mats.wood, { y: 0 });
  const barrelSpots = [[-16, -14.5], [16, 14.5], [-6, 12], [6, -12], [24, 8], [-24, -8]];
  for (const [x, z] of barrelSpots) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10), mats.brick);
    b.position.set(x, 0.6, z); b.castShadow = true; scene.add(b); shootables.push(b);
    colliders.push({ x0: x - 0.55, z0: z - 0.55, x1: x + 0.55, z1: z + 0.55, h: 1.2, pen: false });
  }
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), i % 2 ? mats.sack : mats.pot);
    s.scale.y = 0.75; s.position.set(-21 + (i % 5) * 1.1, 0.38, -13.5 + Math.floor(i / 5) * 1.2); s.castShadow = true; scene.add(s);
  }
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), i % 2 ? mats.pot : mats.pot2);
    p.scale.y = 1.25; p.position.set(17 + (i % 4) * 1.0, 0.52, 13.5 + Math.floor(i / 4) * 1.1); p.castShadow = true; scene.add(p);
  }
  // Rugs on the ground.
  function rug(x, z, w, d, mat) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, z); r.receiveShadow = true; scene.add(r);
  }
  rug(-19, -11, 9, 7, mats.rug); rug(19, 11, 9, 7, mats.rug2); rug(0, -6, 5, 3, mats.rug); rug(0, 6, 5, 3, mats.rug2);
  // Ground site letters.
  function groundLetter(letter, x, z, color) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: letterTexture(letter, color), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); scene.add(m);
  }
  groundLetter('A', -19, -11, '#ffd27a'); groundLetter('B', 19, 11, '#ffd27a');
  // Site signs.
  function sign(tex, x, z, y, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  }
  sign(signTexture('SPICE COURT', 'SITE A', '#3a1a12', '#ffd27a'), -19, -14.6, 3.4, 0);
  sign(signTexture('LANTERN ROW', 'SITE B', '#12283a', '#ffd27a'), 19, 13.8, 3.4, Math.PI);
  sign(signTexture('MID ARCH', 'FOUNTAIN', '#2a1a3a', '#e8c8ff'), 0, -0.4, 3.4, 0);
  // Arch over mid.
  box(-3.4, 0, 0.5, 0.5, 4.4, mats.brick, { shoot: false }); box(3.4, 0, 0.5, 0.5, 4.4, mats.brick, { shoot: false });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.6, 0.6), mats.wood);
  beam.position.set(0, 4.4, 0); beam.castShadow = true; scene.add(beam);
  // Lanterns: emissive spheres on poles + a few real lights.
  function lanternPost(x, z, red) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), mats.dark);
    pole.position.set(x, 1.7, z); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), red ? mats.lanternRed : mats.lantern);
    lamp.position.set(x, 3.5, z); scene.add(lamp); lanterns.push(lamp);
  }
  lanternPost(-19, -6, false); lanternPost(-14, -11, true); lanternPost(19, 6, false); lanternPost(14, 11, true);
  lanternPost(-4, -3, false); lanternPost(4, 3, true); lanternPost(-24, -6, false); lanternPost(24, 6, false);
  for (const [x, z] of [[-19, -11], [19, 11], [0, 0]]) {
    const l = new THREE.PointLight(0xffa040, 14, 16, 1.5); l.position.set(x, 3.2, z); scene.add(l);
  }
  // String lights across mid.
  const bulbs = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = -10 + t * 20, z = -4 + Math.sin(t * Math.PI) * 1.2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mats.lantern);
    b.position.set(x, 3.6 - Math.sin(t * Math.PI) * 0.7, z); scene.add(b); bulbs.push(b);
  }
  return {
    colliders, shootables, lanterns,
    groundHeight(x, z, y = 0) {
      // Balconies only count when already up there; ramps lift you gradually.
      if (x >= -13 && x <= -9 && z >= -19 && z <= -16) return y > 1.2 ? 2.75 : 0;
      if (x >= 9 && x <= 13 && z >= 16 && z <= 19) return y > 1.2 ? 2.75 : 0;
      if (x >= -17.5 && x <= -13 && z >= -18.8 && z <= -16.2) return Math.max(0, (x + 17.5) / 4.5) * 2.75;
      if (x >= 13 && x <= 17.5 && z >= 16.2 && z <= 18.8) return Math.max(0, (17.5 - x) / 4.5) * 2.75;
      return 0;
    },
    locationAt(x, z) {
      const dA = Math.hypot(x - SITES.A.x, z - SITES.A.z), dB = Math.hypot(x - SITES.B.x, z - SITES.B.z);
      if (dA < 6.5) return 'SPICE COURT · SITE A';
      if (dB < 6.5) return 'LANTERN ROW · SITE B';
      if (Math.hypot(x, z) < 4.5) return 'FOUNTAIN · MID ARCH';
      if (x < -13 && x > -19 && z < -16) return 'ROOFTOPS · BALCONY';
      if (x > 9 && x < 13 && z > 16) return 'ROOFTOPS · BALCONY';
      if (z < -12.5) return 'A LONG';
      if (z > 12.5) return 'B LANE';
      if (x < -22) return 'EMBER SPAWN';
      if (x > 22) return 'WARD SPAWN';
      if (Math.abs(z) < 4) return 'MID ARCH';
      return 'STALLS';
    },
    waypoints: buildWaypoints(),
  };
}

function buildWaypoints() {
  const pts = [
    [-24, -13], [-16, -13], [-8, -13], [0, -13], [8, -13], [16, -13], [24, -13], // 0-6 A Long
    [-24, 0], [-14, 0], [-8, -3], [8, 3], [14, 0], [24, 0], // 7-12 Mid
    [-24, 13], [-16, 13], [-8, 13], [0, 13], [8, 13], [16, 13], [24, 13], // 13-19 B Lane
    [-19, -11], [-19, -6], [19, 11], [19, 6], [-11, -17.5], [11, 17.5], // 20-25 sites+balconies
  ];
  const edges = {};
  function link(a, b) { (edges[a] ??= []).push(b); (edges[b] ??= []).push(a); }
  for (let i = 0; i < 6; i++) link(i, i + 1);
  for (let i = 7; i < 12; i++) link(i, i + 1);
  for (let i = 13; i < 19; i++) link(i, i + 1);
  link(0, 7); link(1, 8); link(3, 9); link(5, 11); link(6, 12);
  link(7, 13); link(8, 14); link(10, 16); link(11, 18); link(12, 19);
  link(1, 20); link(20, 21); link(21, 8); link(5, 22); link(22, 23); link(23, 11);
  link(0, 24); link(24, 1); link(6, 25); link(25, 19);
  link(9, 10); link(2, 9); link(4, 10);
  return { pts: pts.map(([x, z]) => ({ x, z })), edges };
}
