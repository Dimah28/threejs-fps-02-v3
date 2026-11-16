// Duskfall Bazaar — DOM HUD: minimap, killfeed, radio, banners, buy menu, damage numbers.
import { WEAPONS, UTILITY } from './weapons.js';

export function createHud(view) {
  const $ = (id) => document.getElementById(id);
  const mm = $('minimap').getContext('2d');
  const dmgLayer = $('dmg-layer'), tagLayer = $('nametags');
  const tagPool = [];
  let radioTimer = 0;

  function el(tag, cls, parent) {
    const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e;
  }
  function setText(id, t) { const e = $(id); if (e) e.textContent = t; }

  function drawMinimap(bots, player, seenIds) {
    const W = 180, H = 150, sx = W / 56, sz = H / 41;
    const X = (x) => (x + 28) * sx, Z = (z) => (z + 20.5) * sz;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(12,10,18,0.82)'; mm.fillRect(0, 0, W, H);
    mm.fillStyle = '#3a2f28';
    for (const c of view.world.colliders) {
      if (c.platform !== undefined) continue;
      mm.fillRect(X(c.x0), Z(c.z0), (c.x1 - c.x0) * sx, (c.z1 - c.z0) * sz);
    }
    for (const [key, s] of Object.entries(view.world.sites || {})) {
      mm.beginPath(); mm.arc(X(s.x), Z(s.z), 7, 0, Math.PI * 2);
      mm.fillStyle = 'rgba(255,210,122,0.25)'; mm.fill();
      mm.fillStyle = '#ffd27a'; mm.font = 'bold 10px system-ui'; mm.textAlign = 'center'; mm.fillText(key, X(s.x), Z(s.z) + 3.5);
    }
    const dot = (x, z, color, r = 3) => { mm.beginPath(); mm.arc(X(x), Z(z), r, 0, Math.PI * 2); mm.fillStyle = color; mm.fill(); };
    for (const b of bots) {
      if (!b.alive) continue;
      const isAlly = b.team === view.playerTeam();
      if (isAlly) dot(b.pos.x, b.pos.z, '#7ad7d7');
      else if (seenIds && seenIds.has(b.id)) dot(b.pos.x, b.pos.z, '#ff5a3c');
    }
    // Player arrow.
    const px = X(player.pos.x), pz = Z(player.pos.z);
    mm.save(); mm.translate(px, pz); mm.rotate(-player.yaw + Math.PI);
    mm.fillStyle = '#fff'; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath(); mm.fill(); mm.restore();
  }

  function setScore(a, b, aliveA, aliveB, nameA, nameB) {
    setText('score-a', String(a)); setText('score-b', String(b));
    setText('team-a-name', nameA); setText('team-b-name', nameB);
    const pips = (n, total, id) => { const e = $(id); if (!e) return; e.innerHTML = ''; for (let i = 0; i < total; i++) { const s = el('i', i < n ? 'on' : '', e); } };
    pips(aliveA, 5, 'pips-a'); pips(aliveB, 5, 'pips-b');
  }
  function setTimer(text, urgent) { const e = $('timer'); e.textContent = text; e.classList.toggle('urgent', !!urgent); }
  function setRound(n, total) { setText('round-label', `ROUND ${n} OF ${total}`); }
  function setPhase(label) { setText('phase-label', label); }
  function setLocation(t) { setText('loc-label', t); }
  function setObjective(t) { setText('objective', t); }
  function setHealth(hp) { setText('health', String(Math.max(0, Math.round(hp)))); $('health-bar').style.width = `${Math.max(0, hp)}%`; }
  function setArmour(a, helmet) { setText('armour', `${Math.round(a)}${helmet ? '+H' : ''}`); $('armour-bar').style.width = `${Math.max(0, a)}%`; }
  function setCash(c) { setText('cash', `$${c.toLocaleString('en-US')}`); }
  function setAmmo(mag, reserve, isMelee) {
    setText('ammo-mag', isMelee ? '—' : String(mag));
    setText('ammo-reserve', isMelee ? '' : `/ ${reserve}`);
    $('ammo').classList.toggle('empty', !isMelee && mag === 0);
  }
  function setWeapon(name, sub) { setText('weapon-name', name); setText('weapon-sub', sub || ''); }
  function setSlots(html) { $('slots').innerHTML = html; }
  function setUtil(html) { $('util-line').innerHTML = html; }

  function killfeedAdd(killer, weapon, victim, tags = []) {
    const feed = $('killfeed');
    const row = el('div', 'kf-row', feed);
    const k = el('span', killer === 'You' ? 'kf-you' : 'kf-name', row); k.textContent = killer;
    const w = el('span', 'kf-wep', row); w.textContent = weapon;
    for (const t of tags) { const tg = el('span', 'kf-tag', row); tg.textContent = t; }
    const v = el('span', victim === 'You' ? 'kf-you' : 'kf-name', row); v.textContent = victim;
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
    setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 7000);
  }
  function radioAdd(name, role, line) {
    const feed = $('radio');
    const row = el('div', 'radio-row', feed);
    const who = el('span', 'radio-who', row); who.textContent = `[RADIO] ${name} (${role}): `;
    const txt = el('span', '', row); txt.textContent = line;
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 9000);
  }
  let bannerTimer = 0;
  function banner(title, sub, ms = 2600, cls = '') {
    const b = $('banner');
    $('banner-title').textContent = title; $('banner-sub').textContent = sub || '';
    b.className = `show ${cls}`; clearTimeout(bannerTimer);
    if (ms > 0) bannerTimer = setTimeout(() => { b.className = ''; }, ms);
  }
  function bannerHide() { $('banner').className = ''; }
  function plantBar(show, frac, label) {
    const p = $('plantbar');
    if (!show) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    $('plantlabel').textContent = label;
    $('plantfill').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }
  function damageNumber(worldPos, text, cls, keep) {
    const p = view.project(worldPos);
    if (!p.visible) return;
    const s = el('span', `dmg ${cls || ''}`, dmgLayer);
    s.textContent = text;
    s.style.left = `${p.x}px`; s.style.top = `${p.y}px`;
    if (keep) return; // static: no fade (deterministic capture)
    requestAnimationFrame(() => { s.style.transform = 'translate(-50%,-70px)'; s.style.opacity = '0'; });
    setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 950);
  }
  function updateNametags(bots) {
    let i = 0;
    for (const b of bots) {
      if (!b.alive) continue;
      const p = view.project(b.pos.clone().setY(b.pos.y + 2.15));
      if (!p.visible || p.dist > 42) continue;
      let tag = tagPool[i];
      if (!tag) { tag = el('div', 'nametag', tagLayer); tagPool.push(tag); }
      tag.style.display = 'block';
      tag.style.left = `${p.x}px`; tag.style.top = `${p.y}px`;
      tag.textContent = b.name;
      tag.classList.toggle('enemy', b.team !== view.playerTeam());
      i++;
    }
    for (; i < tagPool.length; i++) tagPool[i].style.display = 'none';
  }
  function crosshairSpread(px) {
    $('crosshair').style.setProperty('--sp', `${px}px`);
  }
  function hitmarker(kill) {
    const h = $('hitmarker');
    h.classList.add('on'); if (kill) h.classList.add('kill');
    setTimeout(() => h.classList.remove('on', 'kill'), 110);
  }
  function hurtFlash() {
    const h = $('hurt'); h.classList.add('on');
    setTimeout(() => h.classList.remove('on'), 260);
  }
  function flashWhite() {
    const f = $('flash-white'); f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 500);
  }
  // ---- buy menu ----
  let buyOpen = false, buyHandler = null;
  function buildBuyMenu() {
    const grid = $('buy-grid'); grid.innerHTML = '';
    const cats = [
      ['1 · SIDEARMS', ['wasp']],
      ['2 · CLOSE RANGE', ['moth', 'cinder']],
      ['3 · RIFLES', ['vesper', 'heron']],
      ['4 · GEAR', ['kevlar', 'helmet', 'kit']],
      ['5 · GRENADES', ['frag', 'flash', 'smoke']],
    ];
    for (const [title, ids] of cats) {
      const col = el('div', 'buy-col', grid);
      const h = el('div', 'buy-col-title', col); h.textContent = title;
      for (const id of ids) {
        const w = WEAPONS[id] || UTILITY[id];
        const item = el('button', 'buy-item', col);
        item.dataset.item = id;
        const nm = el('div', 'buy-item-name', item); nm.textContent = w.name;
        const pr = el('div', 'buy-item-price', item); pr.textContent = `$${w.price}`;
        const ds = el('div', 'buy-item-desc', item);
        ds.textContent = w.kind ? `${w.dmg} dmg · ${w.rpm} rpm · ${w.mag}/${w.reserve}` : w.desc;
        item.addEventListener('click', () => { if (buyHandler) buyHandler(id, item); });
      }
    }
  }
  function showBuy(cash, timeLeft, loadout) {
    buildBuyMenu(); refreshBuy(loadout, cash);
    $('buy-cash').textContent = `$${cash.toLocaleString('en-US')}`;
    setText('buy-timer', `${timeLeft} S LEFT`);
    $('buymenu').classList.remove('hidden'); buyOpen = true;
  }
  function refreshBuy(loadout, cash) {
    document.querySelectorAll('.buy-item').forEach((item) => {
      const id = item.dataset.item;
      const owned = (WEAPONS[id] && ((loadout.primary === id) || (loadout.sidearm === id)))
        || (id === 'kevlar' && loadout.armour >= 100 && !loadout.helmet)
        || (id === 'helmet' && loadout.helmet) || (id === 'kit' && loadout.kit)
        || (loadout.util[id] >= 2);
      const price = (WEAPONS[id] || UTILITY[id]).price;
      item.classList.toggle('owned', !!owned);
      item.classList.toggle('poor', !owned && cash < price);
      const pr = item.querySelector('.buy-item-price');
      if (pr) pr.textContent = owned ? 'Owned' : (cash < price ? `$${price} · Too expensive` : `$${price}`);
    });
    $('buy-cash').textContent = `$${cash.toLocaleString('en-US')}`;
  }
  function hideBuy() { $('buymenu').classList.add('hidden'); buyOpen = false; }
  function onBuy(fn) { buyHandler = fn; }
  // ---- overlays ----
  function showMenu(kind, data = {}) {
    const m = $('menu');
    $('menu-title').textContent = data.title || 'DUSKFALL BAZAAR';
    $('menu-copy').textContent = data.copy || '';
    $('play-btn').textContent = data.button || 'Click to play';
    $('menu-keys').style.display = data.hideKeys ? 'none' : 'grid';
    m.classList.remove('hidden');
  }
  function hideMenu() { $('menu').classList.add('hidden'); }
  function onPlay(fn) { $('play-btn').addEventListener('click', fn); }
  function toast(text) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(radioTimer); radioTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  return {
    drawMinimap, setScore, setTimer, setRound, setPhase, setLocation, setObjective,
    setHealth, setArmour, setCash, setAmmo, setWeapon, setSlots, setUtil,
    killfeedAdd, radioAdd, banner, bannerHide, plantBar, damageNumber, updateNametags,
    crosshairSpread, hitmarker, hurtFlash, flashWhite,
    showBuy, refreshBuy, hideBuy, onBuy, isBuyOpen: () => buyOpen,
    showMenu, hideMenu, onPlay, toast,
  };
}
