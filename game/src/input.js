// Duskfall Bazaar — keyboard + mouse input with pointer lock.
export function createInput(canvas, onLockChange) {
  const state = { keys: new Set(), firing: false, lookX: 0, lookY: 0, jumpQueued: false };
  let locked = false;
  function onKey(e, down) {
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (down) {
      state.keys.add(e.code);
      if (e.code === 'Space') state.jumpQueued = true;
    } else state.keys.delete(e.code);
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { state.keys.clear(); state.firing = false; });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    state.lookX += e.movementX; state.lookY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => { if (locked && e.button === 0) state.firing = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) state.firing = false; });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
  });
  function requestLock() {
    try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable (headless) */ }
  }
  function takeLook() {
    const r = { x: state.lookX, y: state.lookY };
    state.lookX = 0; state.lookY = 0;
    return r;
  }
  function takeJump() { const j = state.jumpQueued; state.jumpQueued = false; return j; }
  return { state, requestLock, takeLook, takeJump, isLocked: () => locked };
}
