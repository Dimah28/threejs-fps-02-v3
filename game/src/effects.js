// Duskfall Bazaar — tracers, muzzle flash, smoke, impacts, explosion.
import * as THREE from 'three';

export function createEffects(scene) {
  const tracers = [], smokes = [], bursts = [], flashes = [];
  const flashLight = new THREE.PointLight(0xffc266, 0, 9, 1.6);
  scene.add(flashLight);
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });

  function tracer(a, b) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    scene.add(line); tracers.push({ line, life: 0.07 });
  }
  function muzzle(pos, dir) {
    const tip = pos.clone().addScaledVector(dir, 0.55);
    const geo = new THREE.ConeGeometry(0.09, 0.34, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95 });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.copy(tip);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(cone); flashes.push({ mesh: cone, life: 0.045 });
    flashLight.position.copy(tip); flashLight.intensity = 26;
  }
  function impact(p, color = 0xffd27a) {
    const n = 7, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.95 }));
    scene.add(pts); bursts.push({ pts, vel, life: 0.3 });
  }
  function smoke(p) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfd4d8, transparent: true, opacity: 0.34, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.6, 8, 6), mat.clone());
      s.position.set((Math.random() - 0.5) * 3.2, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 3.2);
      s.material.opacity = 0.2 + Math.random() * 0.1;
      group.add(s);
    }
    group.position.copy(p); group.position.y = Math.max(0.2, p.y);
    scene.add(group); smokes.push({ group, life: 15, x: p.x, z: p.z, r: 3.1 });
    return group;
  }
  function explosion(p) {
    const geo = new THREE.SphereGeometry(1, 18, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8c2e, transparent: true, opacity: 0.95 });
    const ball = new THREE.Mesh(geo, mat); ball.position.copy(p); ball.position.y = Math.max(1, p.y);
    scene.add(ball);
    const light = new THREE.PointLight(0xff7a1a, 90, 30, 1.4); light.position.copy(ball.position); scene.add(light);
    bursts.push({ mesh: ball, light, life: 0.9, grow: true });
    impact(p, 0xffb36b);
  }
  // True when the segment a->b crosses any live smoke cloud.
  function blockedBySmoke(a, b) {
    for (const s of smokes) {
      const ab = new THREE.Vector3().subVectors(b, a);
      const ap = new THREE.Vector3(s.x - a.x, 0.8 - a.y, s.z - a.z);
      const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(0.001, ab.lengthSq())));
      const closest = a.clone().addScaledVector(ab, t);
      if (Math.hypot(closest.x - s.x, closest.z - s.z) < s.r && closest.y < 3.4) return true;
    }
    return false;
  }
  function update(dt) {
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 500);
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i]; t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.life -= dt;
      f.mesh.material.opacity = Math.max(0, f.life / 0.045);
      if (f.life <= 0) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); flashes.splice(i, 1); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.life -= dt;
      if (b.mesh) {
        const s = 1 + (0.9 - b.life) * 9; b.mesh.scale.setScalar(Math.max(0.1, s));
        b.mesh.material.opacity = Math.max(0, b.life / 0.9);
        if (b.light) b.light.intensity = Math.max(0, b.life / 0.9) * 90;
        if (b.life <= 0) { scene.remove(b.mesh); scene.remove(b.light); b.mesh.geometry.dispose(); b.mesh.material.dispose(); bursts.splice(i, 1); }
        continue;
      }
      const pos = b.pts.geometry.attributes.position;
      for (let j = 0; j < b.vel.length; j++) {
        pos.array[j * 3] += b.vel[j].x * dt; pos.array[j * 3 + 1] += b.vel[j].y * dt; pos.array[j * 3 + 2] += b.vel[j].z * dt;
        b.vel[j].y -= 6 * dt;
      }
      pos.needsUpdate = true; b.pts.material.opacity = Math.max(0, b.life / 0.3);
      if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i]; s.life -= dt;
      s.group.children.forEach((c, j) => { const k = 1 + (15 - s.life) * 0.02; c.scale.setScalar(k); });
      if (s.life <= 0) {
        s.group.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
        scene.remove(s.group); smokes.splice(i, 1);
      }
    }
  }
  return { tracer, muzzle, impact, smoke, explosion, blockedBySmoke, update };
}
