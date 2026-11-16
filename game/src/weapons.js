// Duskfall Bazaar — weapons, utility and economy.
// All names, prices and numbers are original to this entry.
export const WEAPONS = {
  wasp:   { id: 'wasp',   slot: 2, name: 'Wasp P9',     kind: 'pistol',  price: 300,  dmg: 30, hs: 2.0, rpm: 380, mag: 13, reserve: 52,  spread: 0.011, range: 42, auto: false, reload: 1.5, zoom: 0,    kick: 0.006 },
  moth:    { id: 'moth',   slot: 1, name: 'Moth SMG',    kind: 'smg',     price: 1200, dmg: 26, hs: 2.0, rpm: 800, mag: 30, reserve: 120, spread: 0.016, range: 34, auto: true,  reload: 1.9, zoom: 0,    kick: 0.005 },
  vesper:  { id: 'vesper', slot: 1, name: 'Vesper AR',   kind: 'rifle',   price: 2700, dmg: 36, hs: 2.0, rpm: 600, mag: 30, reserve: 90,  spread: 0.008, range: 60, auto: true,  reload: 2.2, zoom: 0,    kick: 0.009 },
  heron:   { id: 'heron',  slot: 1, name: 'Heron DMR',   kind: 'dmr',     price: 4750, dmg: 115, hs: 2.0, rpm: 41,  mag: 5,  reserve: 30,  spread: 0.002, range: 90, auto: false, reload: 2.8, zoom: 2.2,  kick: 0.02 },
  cinder:  { id: 'cinder', slot: 1, name: 'Cinder-12',   kind: 'shotgun', price: 1700, dmg: 19, hs: 1.5, rpm: 70,  mag: 6,  reserve: 32,  spread: 0.045, range: 18, auto: false, reload: 2.6, zoom: 0,    kick: 0.016, pellets: 8 },
  knife:   { id: 'knife',  slot: 3, name: 'Hook Knife',   kind: 'melee',   price: 0,    dmg: 40, hs: 1.0, rpm: 110, mag: 0,  reserve: 0,   spread: 0,     range: 2.2, auto: false, reload: 0,   zoom: 0,    kick: 0 },
};

export const UTILITY = {
  frag:   { id: 'frag',   name: 'Frag',       price: 300, key: '5', desc: 'Blast up to 9 m' },
  flash:  { id: 'flash',  name: 'Flash',      price: 200, key: 'Q', desc: 'Blinds whoever faces it' },
  smoke:  { id: 'smoke',  name: 'Smoke',      price: 300, key: 'G', desc: '15 s cloud that blocks sight' },
  kevlar: { id: 'kevlar', name: 'Kevlar vest', price: 650, key: '', desc: 'Body armour 100' },
  helmet: { id: 'helmet', name: 'Vest + helmet', price: 1000, key: '', desc: 'Armour 100 and a helmet' },
  kit:    { id: 'kit',    name: 'Defuse kit', price: 400, key: '', desc: 'Defuse in 2.5 s instead of 5' },
};

export const ECONOMY = {
  startMoney: 800, killReward: 300, plantReward: 300, winReward: 3250,
  lossReward: 1900, lossStreakBonus: 500, lossStreakMax: 3400,
};

// A loadout: primary id, sidearm id, utility counts, armour, hasKit, knife always owned.
export function createLoadout() {
  return { primary: null, sidearm: 'wasp', mags: {}, util: { frag: 0, flash: 0, smoke: 0 }, armour: 0, helmet: false, kit: false };
}

export function weaponOf(loadout, slot) {
  if (slot === 1) return loadout.primary ? WEAPONS[loadout.primary] : null;
  if (slot === 2) return WEAPONS[loadout.sidearm];
  if (slot === 3) return WEAPONS.knife;
  return null;
}

// Buy one item. Returns { ok, cost, msg }. Money is the caller's to change.
export function buyItem(loadout, money, itemId) {
  const w = WEAPONS[itemId];
  if (w) {
    if (itemId === 'knife' || itemId === 'wasp') return { ok: false, cost: 0, msg: 'Already owned' };
    if (w.slot === 1 && loadout.primary === itemId) return { ok: false, cost: 0, msg: 'Owned' };
    if (w.slot === 2 && loadout.sidearm === itemId) return { ok: false, cost: 0, msg: 'Owned' };
    if (money < w.price) return { ok: false, cost: 0, msg: 'Too expensive' };
    if (w.slot === 1) loadout.primary = itemId; else loadout.sidearm = itemId;
    loadout.mags[itemId] = { mag: w.mag, reserve: w.reserve };
    return { ok: true, cost: w.price, msg: w.name };
  }
  const u = UTILITY[itemId];
  if (!u) return { ok: false, cost: 0, msg: 'Unknown item' };
  if (itemId === 'kevlar') {
    if (loadout.armour >= 100 && !loadout.helmet) return { ok: false, cost: 0, msg: 'Owned' };
    if (money < u.price) return { ok: false, cost: 0, msg: 'Too expensive' };
    loadout.armour = 100; return { ok: true, cost: u.price, msg: 'Kevlar vest' };
  }
  if (itemId === 'helmet') {
    if (loadout.helmet) return { ok: false, cost: 0, msg: 'Owned' };
    if (money < u.price) return { ok: false, cost: 0, msg: 'Too expensive' };
    loadout.armour = 100; loadout.helmet = true; return { ok: true, cost: u.price, msg: 'Vest + helmet' };
  }
  if (itemId === 'kit') {
    if (loadout.kit) return { ok: false, cost: 0, msg: 'Owned' };
    if (money < u.price) return { ok: false, cost: 0, msg: 'Too expensive' };
    loadout.kit = true; return { ok: true, cost: u.price, msg: 'Defuse kit' };
  }
  if (loadout.util[itemId] >= 2) return { ok: false, cost: 0, msg: 'Max 2 carried' };
  if (money < u.price) return { ok: false, cost: 0, msg: 'Too expensive' };
  loadout.util[itemId] += 1;
  return { ok: true, cost: u.price, msg: u.name };
}

// Damage after distance falloff and armour. Returns { hp, armour } dealt to a target.
export function applyDamage(target, raw, isHead) {
  let dmg = raw * (isHead ? 2 : 1);
  if (target.helmet && isHead) dmg *= 0.5;
  let absorbed = 0;
  if (target.armour > 0) { absorbed = Math.min(target.armour, dmg * 0.5); target.armour -= absorbed; }
  const hpDmg = dmg - absorbed;
  target.hp = Math.max(0, target.hp - hpDmg);
  return { dealt: Math.round(dmg), hpDmg: Math.round(hpDmg) };
}
