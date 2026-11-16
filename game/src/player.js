// Duskfall Bazaar — first-person movement, collision, ground height.
import * as THREE from 'three';

const RADIUS = 0.45;
const EYE_STAND = 1.62, EYE_CROUCH = 1.08;

export function createPlayer(world) {
  const state = {
    pos: new THREE.Vector3(-25, 0, 0), yaw: -Math.PI / 2, pitch: 0,
    eye: EYE_STAND, vy: 0, grounded: true, crouched: false,
    hp: 100, armour: 0, helmet: false, alive: true, speed: 0,
  };
  let bobPhase = 0;

  function collide(p) {
    const y = p.y;
    for (const c of world.colliders) {
      if (c.platform !== undefined) continue; // walkable top, handled by groundHeight
      if (y >= c.h) continue;
      const nx = Math.max(c.x0, Math.min(p.x, c.x1));
      const nz = Math.max(c.z0, Math.min(p.z, c.z1));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          p.x = nx + (dx / d) * RADIUS; p.z = nz + (dz / d) * RADIUS;
        } else {
          // Inside the box: push out along the smallest penetration axis.
          const pl = p.x - c.x0, pr = c.x1 - p.x, pt = p.z - c.z0, pb = c.z1 - p.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) p.x = c.x0 - RADIUS; else if (m === pr) p.x = c.x1 + RADIUS;
          else if (m === pt) p.z = c.z0 - RADIUS; else p.z = c.z1 + RADIUS;
        }
      }
    }
    p.x = Math.max(-27.2, Math.min(27.2, p.x));
    p.z = Math.max(-19.7, Math.min(19.7, p.z));
  }

  function step(dt, keys, wantJump) {
    const p = state.pos;
    const crouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouched = crouch;
    const targetEye = crouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 10);
    const speed = crouch ? 2.6 : 4.6;
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    let fx = 0, fz = 0;
    if (keys.has('KeyW')) { fx -= sin; fz -= cos; }
    if (keys.has('KeyS')) { fx += sin; fz += cos; }
    if (keys.has('KeyA')) { fx -= cos; fz += sin; }
    if (keys.has('KeyD')) { fx += cos; fz -= sin; }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len; fz /= len;
      p.x += fx * speed * dt; p.z += fz * speed * dt;
      bobPhase += dt * speed * 1.6;
      state.speed = speed;
    } else state.speed = 0;
    collide(p);
    const ground = world.groundHeight(p.x, p.z, p.y);
    if (wantJump && state.grounded) { state.vy = 4.4; state.grounded = false; }
    if (!state.grounded) {
      state.vy -= 12 * dt; p.y += state.vy * dt;
      if (p.y <= ground) { p.y = ground; state.vy = 0; state.grounded = true; }
    } else {
      // Walk up ramps / step down smoothly.
      p.y += (ground - p.y) * Math.min(1, dt * 12);
      if (Math.abs(ground - p.y) < 0.02) p.y = ground;
    }
    return bobPhase;
  }
  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch - dy * 0.0021));
  }
  function respawn(x, z, yaw) {
    state.pos.set(x, world.groundHeight(x, z, 0), z);
    state.yaw = yaw; state.pitch = 0; state.hp = 100; state.alive = true; state.vy = 0; state.grounded = true;
  }
  return { state, step, look, respawn };
}
