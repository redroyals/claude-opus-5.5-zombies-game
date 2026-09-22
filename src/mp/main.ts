// Dead Signal: Online — lobby, create-a-class, progression, shop, and the in-match client loop.
import './mp.css';
import * as THREE from 'three';
import { api, session, type Profile } from './api';
import { NetClient, Predictor } from './net';
import { View } from './view';
import { MAP_BY_ID } from '../shared/maps';
import { BoxWorld, BTN, MOVE, TICK_DT, height, type MoveInput } from '../shared/movement';
import { MODES, type ModeId } from '../shared/modes';
import { WEAPON_LIST, WEAPONS, attachmentsFor, applyAttachments, fireInterval, MAX_ATTACHMENTS, type WeaponDef } from '../data/weapons';
import { PERKS, perkEffects, flinchDegrees } from '../shared/perks';
import { DEFAULT_LOADOUTS, LETHALS, TACTICALS, KILLSTREAKS, validateLoadout, type Loadout, type Unlocks } from '../shared/loadout';
import { xpForLevel, MAX_LEVEL, canPrestige, weaponLevelForXp } from '../shared/progression';
import { UNLOCK_TABLE, isUnlocked } from '../shared/unlocks';
import { BASE_CAMOS, ALL_CAMOS, ARGENT_REQ, EMPTY_PROGRESS } from '../shared/camos';
import { COSMETICS } from '../data/cosmetics';
import type { EntityState, SelfState, ServerEvent } from '../shared/protocol';

const ui = document.getElementById('ui')!;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ------------------------------------------------------------------------------------------------
// State
let profile: Profile | null = null;
let unlocks: Unlocks = { level: 1, prestige: 0, weaponXp: {} };
let cfg: Awaited<ReturnType<typeof api.config>> | null = null;
let tab = 'play';
let classIndex = Number(localStorage.getItem('ds_class') ?? 0);
let guestName = localStorage.getItem('ds_guest') ?? `Guest${Math.floor(Math.random() * 9000 + 1000)}`;
let message = '';
let privateInfo: { code: string } | null = null;
let editing: Loadout | null = null;

const classes = (): Loadout[] => profile?.classes ?? DEFAULT_LOADOUTS;

async function refresh() {
  if (!session.get()) { profile = null; unlocks = { level: 1, prestige: 0, weaponXp: {} }; return; }
  try { const r = await api.me(); profile = r.profile; unlocks = r.unlocks; } catch (e) { if ((e as { status?: number }).status === 401) session.set(null); profile = null; }
}

// ------------------------------------------------------------------------------------------------
// Lobby
function header(): string {
  if (!profile) {
    return `<div class="row"><span class="brand">DEAD SIGNAL</span><span class="small">ONLINE</span><span style="flex:1"></span>
      <input id="guest" value="${esc(guestName)}" maxlength="20" title="Guest name (local-only progress)">
      <button class="btn primary" id="signin">Sign in with sikhi.io</button>
      ${cfg?.devAuth ? '<button class="btn" id="devsignin">Dev sign-in</button>' : ''}</div>
      <p class="small">Playing as a guest: progress is not saved. Sign in with your sikhi.io account to keep XP, unlocks, camos and dollars.</p>`;
  }
  const lvl = profile.level, cur = xpForLevel(lvl), nxt = xpForLevel(Math.min(MAX_LEVEL, lvl + 1));
  const pct = lvl >= MAX_LEVEL ? 100 : ((profile.xp - cur) / Math.max(1, nxt - cur)) * 100;
  return `<div class="row"><span class="brand">DEAD SIGNAL</span><span class="small">ONLINE</span><span style="flex:1"></span>
    <b>${esc(profile.name)}</b><span>${profile.prestige ? `P${profile.prestige} · ` : ''}Lv ${lvl}</span>
    <div class="xpbar" title="${profile.xp} XP"><div style="width:${pct.toFixed(1)}%"></div></div>
    <span title="In-game dollars (earned by playing; no real money)">$${profile.balance.toLocaleString()}</span>
    <button class="btn" id="signout">Sign out</button></div>`;
}

function lobby() {
  const tabs = ['play', 'classes', 'progression', 'armory', 'shop'];
  ui.innerHTML = `<div class="lobby">${header()}
    <div class="row tabs" style="margin:14px 0">${tabs.map((t) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t.toUpperCase()}</button>`).join('')}</div>
    ${message ? `<div class="card ${message.startsWith('!') ? 'err' : 'ok'}">${esc(message.replace(/^!/, ''))}</div>` : ''}
    <div id="tab">${tab === 'play' ? playTab() : tab === 'classes' ? classesTab() : tab === 'progression' ? progressionTab() : tab === 'armory' ? armoryTab() : shopTab()}</div></div>`;
  bindLobby();
}

function playTab(): string {
  const modes = Object.values(MODES);
  return `<h3>Quick play</h3><div class="grid">${modes.map((m) => `<div class="card mode" data-quick="${m.id}"><b>${m.name}</b><div class="small">${esc(m.desc)} · up to ${m.maxPlayers}</div></div>`).join('')}</div>
    <div class="row"><span>Class:</span><select id="classSel">${classes().map((c, i) => `<option value="${i}" ${i === classIndex ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <h3>Private match</h3><div class="card row">
      <select id="pmode">${modes.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
      <select id="pmap">${[...(cfg?.maps ?? []), { id: 'range', name: 'Firing Range', city: 'Training' }].map((m) => `<option value="${m.id}">${m.name} — ${m.city}</option>`).join('')}</select>
      <input id="plimit" type="number" min="1" max="500" placeholder="score limit" style="width:110px">
      <button class="btn primary" id="pcreate">Create</button>
      ${privateInfo ? `<span>Code <b>${privateInfo.code}</b></span><input readonly style="width:320px" value="${esc(shareLink(privateInfo.code))}"><button class="btn" id="pjoin2">Join</button>` : ''}
    </div>
    <div class="card row"><input id="code" maxlength="6" placeholder="ROOM CODE" style="text-transform:uppercase;width:120px"><button class="btn" id="pjoin">Join private</button></div>
    <p class="small">Controls: WASD move · Shift sprint (tactical sprint first 3 s) · Ctrl/C crouch (slide while sprinting) · Space jump/mantle · Mouse fire/aim · R reload · Q swap · V melee · G lethal · F tactical · 5/6/7 killstreaks · Tab scoreboard</p>`;
}

const shareLink = (code: string) => `${location.origin}${location.pathname}?room=${code}`;

function weaponOptions(primary: boolean | null, sel: string): string {
  return WEAPON_LIST.filter((w) => primary === null || w.primary === primary || (primary === false && editing && perkEffects(editing.perks).twoPrimaries))
    .map((w) => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''} ${isUnlocked(unlocks, 'weapon', w.id) ? '' : 'disabled'}>${esc(w.name)} (${w.cls}${isUnlocked(unlocks, 'weapon', w.id) ? '' : ` · Lv ${w.unlockLevel}`})</option>`).join('');
}

function attachmentPicker(w: WeaponDef, chosen: string[], key: string): string {
  const wl = weaponLevelForXp(unlocks.weaponXp[w.id] ?? 0);
  const bySlot = new Map<string, ReturnType<typeof attachmentsFor>>();
  for (const a of attachmentsFor(w)) (bySlot.get(a.slot) ?? bySlot.set(a.slot, []).get(a.slot)!).push(a);
  return `<div class="small">Weapon level ${wl} · ${chosen.length}/${MAX_ATTACHMENTS} attachments</div><div class="grid">${[...bySlot].map(([slot, list]) => `<label>${slot}<br><select data-att="${key}" data-slot="${slot}"><option value="">— none —</option>${list.map((a) => `<option value="${a.id}" ${chosen.includes(a.id) ? 'selected' : ''} ${a.weaponLevel > wl ? 'disabled' : ''} title="${esc(Object.entries(a.mod).map(([k, v]) => `${k} ×${v}`).join(', '))}">${esc(a.name)}${a.weaponLevel > wl ? ` (Lv ${a.weaponLevel})` : ''}</option>`).join('')}</select></label>`).join('')}</div>`;
}

function statLine(w: WeaponDef, atts: string[]): string {
  const s = applyAttachments(w, atts);
  return `<div class="small">DMG ${s.damage.toFixed(0)}×${s.pellets} · RPM ${s.rpm.toFixed(0)} · Range ${s.rangeNear.toFixed(0)}–${s.rangeFar.toFixed(0)} m · ADS ${(s.adsTime * 1000).toFixed(0)} ms · Mag ${s.magSize} · Reload ${s.reloadTime.toFixed(2)} s · Mobility ${(s.mobility * 100).toFixed(0)}% · Recoil V ${s.recoil[0].pitch.toFixed(2)} H ${Math.abs(s.recoil[0].yaw).toFixed(2)} · Velocity ${s.bulletVelocity.toFixed(0)} m/s</div>`;
}

function classesTab(): string {
  const l = editing ?? (editing = structuredClone(classes()[classIndex] ?? DEFAULT_LOADOUTS[0]));
  const pri = WEAPONS[l.primary], sec = WEAPONS[l.secondary];
  const errs = validateLoadout(l, unlocks);
  const camoOpts = (w: WeaponDef) => `<select data-camo="${w.id}"><option value="">No camo</option>${(profile?.camos[w.id] ?? []).map((c) => `<option ${l.camos?.[w.id] === c ? 'selected' : ''} value="${c}">${ALL_CAMOS.find((x) => x.id === c)?.name}</option>`).join('')}</select>`;
  return `<div class="row"><select id="editSel">${classes().map((c, i) => `<option value="${i}" ${i === classIndex ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}${classes().length < 10 ? '<option value="new">+ New class</option>' : ''}</select>
      <input id="cname" value="${esc(l.name)}" maxlength="24"></div>
    <div class="card"><b>Primary</b> <select id="pri">${weaponOptions(true, l.primary)}</select> ${pri ? camoOpts(pri) : ''}${pri ? statLine(pri, l.primaryAttachments) + attachmentPicker(pri, l.primaryAttachments, 'p') : ''}</div>
    <div class="card"><b>Secondary</b> <select id="sec">${weaponOptions(false, l.secondary)}</select> ${sec ? camoOpts(sec) : ''}${sec ? statLine(sec, l.secondaryAttachments) + attachmentPicker(sec, l.secondaryAttachments, 's') : ''}</div>
    <div class="card row"><b>Lethal</b><select id="lethal">${LETHALS.map((e) => `<option value="${e.id}" ${e.id === l.lethal ? 'selected' : ''} ${isUnlocked(unlocks, 'lethal', e.id) ? '' : 'disabled'}>${e.name}${isUnlocked(unlocks, 'lethal', e.id) ? '' : ` (Lv ${e.unlockLevel})`}</option>`).join('')}</select>
      <b>Tactical</b><select id="tactical">${TACTICALS.map((e) => `<option value="${e.id}" ${e.id === l.tactical ? 'selected' : ''} ${isUnlocked(unlocks, 'tactical', e.id) ? '' : 'disabled'}>${e.name}${isUnlocked(unlocks, 'tactical', e.id) ? '' : ` (Lv ${e.unlockLevel})`}</option>`).join('')}</select></div>
    <div class="card"><b>Perks</b> <span class="small">(all perks available from level 1)</span><div class="grid">${[1, 2, 3].map((t) => `<label>Tier ${t}<br><select data-perk="${t - 1}">${PERKS.filter((p) => p.tier === t).map((p) => `<option value="${p.id}" ${l.perks[t - 1] === p.id ? 'selected' : ''} title="${esc(p.desc)}">${p.name}</option>`).join('')}</select><div class="small">${esc(PERKS.find((p) => p.id === l.perks[t - 1])?.desc ?? '')}</div></label>`).join('')}</div></div>
    <div class="card"><b>Killstreaks</b><div class="row">${[0, 1, 2].map((i) => `<select data-streak="${i}">${KILLSTREAKS.map((s) => `<option value="${s.id}" ${l.streaks[i] === s.id ? 'selected' : ''} ${isUnlocked(unlocks, 'streak', s.id) ? '' : 'disabled'}>${s.name} (${s.kills})${isUnlocked(unlocks, 'streak', s.id) ? '' : ` Lv ${s.unlockLevel}`}</option>`).join('')}</select>`).join('')}</div></div>
    ${errs.length ? `<div class="card err">${errs.map(esc).join('<br>')}</div>` : ''}
    <button class="btn primary" id="saveClass" ${errs.length || !profile ? 'disabled' : ''}>${profile ? 'Save class' : 'Sign in to save classes'}</button>`;
}

function progressionTab(): string {
  if (!profile) return '<p>Sign in to track progression.</p>';
  const next = UNLOCK_TABLE.filter((e) => e.level > profile!.level).slice(0, 12);
  const nameOf = (e: { kind: string; id: string }) => e.kind === 'weapon' ? WEAPONS[e.id]?.name : e.kind === 'cosmetic' ? COSMETICS.find((c) => c.id === e.id)?.name : [...LETHALS, ...TACTICALS, ...KILLSTREAKS].find((x) => x.id === e.id)?.name ?? e.id;
  return `<div class="card">Level <b>${profile.level}</b> / ${MAX_LEVEL} · Prestige <b>${profile.prestige}</b> · ${profile.xp.toLocaleString()} XP · K/D ${profile.kills}/${profile.deaths} · Wins ${profile.wins}/${profile.matches}
    ${canPrestige(profile) ? '<button class="btn primary" id="prestige">Enter Prestige</button>' : ''}
    <div class="small">Unlock tokens: ${profile.inventory.unlock_token ?? 0}</div></div>
    <h3>Coming up</h3><div class="grid">${next.map((e) => `<div class="card">Lv ${e.level} · ${e.kind}<br><b>${esc(nameOf(e))}</b>${(profile!.inventory.unlock_token ?? 0) > 0 && e.kind !== 'feature' ? ` <button class="btn" data-token="${e.kind}:${e.id}">Use token</button>` : ''}</div>`).join('')}</div>`;
}

function armoryTab(): string {
  const wp = profile?.weaponProgress ?? {};
  return `<p class="small">Camo ladders: ${BASE_CAMOS.map((c) => `${c.name} (${c.count} ${c.stat})`).join(' → ')} → <b>Gilded</b> → <b>Argent</b> (${Object.entries(ARGENT_REQ).map(([k, v]) => `${v} ${k}`).join(', ')}) → <b>Prism</b> (all class weapons Argent) → <b>Void Matter</b> (every class Prism).</p>
    <div class="grid">${WEAPON_LIST.map((w) => { const p = wp[w.id] ?? { ...EMPTY_PROGRESS, xp: 0 }; const got = profile?.camos[w.id] ?? []; return `<div class="card ${isUnlocked(unlocks, 'weapon', w.id) ? '' : 'locked'}"><b>${esc(w.name)}</b> <span class="small">${w.cls} · Lv ${weaponLevelForXp(p.xp)}</span><div class="small">${p.kills} kills · ${p.headshots} HS · ${p.longshots} long</div><div class="small">${got.length}/${ALL_CAMOS.length} camos: ${got.map((c) => ALL_CAMOS.find((x) => x.id === c)?.name).join(', ') || '—'}</div></div>`; }).join('')}</div>`;
}

function shopTab(): string {
  const shop = COSMETICS.filter((c) => c.price !== undefined);
  return `<p class="small">Dollars are earned in matches, from levelling and camo challenges. There is no real-money purchasing.</p>
    <div class="grid">${shop.map((c) => `<div class="card"><b>${esc(c.name)}</b><div class="small">${c.kind}</div>$${c.price!.toLocaleString()} ${profile?.inventory[c.id] && c.kind !== 'token' ? '<span class="ok">Owned</span>' : `<button class="btn" data-buy="${c.id}" ${!profile || profile.balance < c.price! ? 'disabled' : ''}>Buy</button>`}</div>`).join('')}</div>`;
}

function bindLobby() {
  const $ = <T extends HTMLElement>(s: string) => ui.querySelector(s) as T | null;
  ui.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab!; message = ''; lobby(); }));
  $('#signin') && ($('#signin')!.onclick = () => { location.href = `${cfg!.ssoIssuer}?return=${encodeURIComponent(location.origin + location.pathname)}`; });
  $('#devsignin') && ($('#devsignin')!.onclick = async () => { const r = await api.dev(guestName); session.set(r.session); await refresh(); lobby(); });
  $('#signout') && ($('#signout')!.onclick = () => { session.set(null); profile = null; lobby(); });
  $<HTMLInputElement>('#guest') && ($<HTMLInputElement>('#guest')!.onchange = (e) => { guestName = (e.target as HTMLInputElement).value; localStorage.setItem('ds_guest', guestName); });
  $<HTMLSelectElement>('#classSel') && ($<HTMLSelectElement>('#classSel')!.onchange = (e) => { classIndex = Number((e.target as HTMLSelectElement).value); localStorage.setItem('ds_class', String(classIndex)); });
  ui.querySelectorAll<HTMLElement>('[data-quick]').forEach((el) => (el.onclick = async () => { try { const r = await api.quick(el.dataset.quick!); startMatch(r.room); } catch (e) { message = `!${(e as Error).message}`; lobby(); } }));
  $('#pcreate') && ($('#pcreate')!.onclick = async () => {
    const lim = Number($<HTMLInputElement>('#plimit')!.value);
    privateInfo = await api.createPrivate({ mode: $<HTMLSelectElement>('#pmode')!.value, map: $<HTMLSelectElement>('#pmap')!.value, scoreLimit: lim > 0 ? lim : undefined });
    history.replaceState(null, '', `?room=${privateInfo.code}`);
    lobby();
  });
  $('#pjoin2') && ($('#pjoin2')!.onclick = () => startMatch(`p-${privateInfo!.code}`));
  $('#pjoin') && ($('#pjoin')!.onclick = () => { const c = $<HTMLInputElement>('#code')!.value.trim().toUpperCase(); if (/^[A-Z0-9]{6}$/.test(c)) startMatch(`p-${c}`); });
  // class editor
  const l = editing;
  if (tab === 'classes' && l) {
    const rerender = () => lobby();
    $<HTMLSelectElement>('#editSel')!.onchange = (e) => { const v = (e.target as HTMLSelectElement).value; if (v === 'new') { classes().push({ ...structuredClone(DEFAULT_LOADOUTS[0]), name: `Class ${classes().length + 1}` }); classIndex = classes().length - 1; } else classIndex = Number(v); editing = null; rerender(); };
    $<HTMLInputElement>('#cname')!.onchange = (e) => { l.name = (e.target as HTMLInputElement).value; };
    $<HTMLSelectElement>('#pri')!.onchange = (e) => { l.primary = (e.target as HTMLSelectElement).value; l.primaryAttachments = []; rerender(); };
    $<HTMLSelectElement>('#sec')!.onchange = (e) => { l.secondary = (e.target as HTMLSelectElement).value; l.secondaryAttachments = []; rerender(); };
    $<HTMLSelectElement>('#lethal')!.onchange = (e) => { l.lethal = (e.target as HTMLSelectElement).value; };
    $<HTMLSelectElement>('#tactical')!.onchange = (e) => { l.tactical = (e.target as HTMLSelectElement).value; };
    ui.querySelectorAll<HTMLSelectElement>('[data-perk]').forEach((s) => (s.onchange = () => { l.perks[Number(s.dataset.perk)] = s.value; rerender(); }));
    ui.querySelectorAll<HTMLSelectElement>('[data-streak]').forEach((s) => (s.onchange = () => { l.streaks[Number(s.dataset.streak)] = s.value; rerender(); }));
    ui.querySelectorAll<HTMLSelectElement>('[data-camo]').forEach((s) => (s.onchange = () => { l.camos = { ...(l.camos ?? {}), [s.dataset.camo!]: s.value }; }));
    ui.querySelectorAll<HTMLSelectElement>('[data-att]').forEach((s) => (s.onchange = () => {
      const list = s.dataset.att === 'p' ? l.primaryAttachments : l.secondaryAttachments;
      const w = WEAPONS[s.dataset.att === 'p' ? l.primary : l.secondary];
      const keep = list.filter((id) => attachmentsFor(w).find((a) => a.id === id)?.slot !== s.dataset.slot);
      if (s.value) keep.push(s.value);
      if (s.dataset.att === 'p') l.primaryAttachments = keep; else l.secondaryAttachments = keep;
      rerender();
    }));
    $('#saveClass') && ($('#saveClass')!.onclick = async () => {
      try { await api.saveClass(classIndex, l); message = 'Class saved'; await refresh(); editing = null; } catch (e) { message = `!${((e as { body?: { errors?: string[] } }).body?.errors ?? [(e as Error).message]).join('; ')}`; }
      rerender();
    });
  }
  $('#prestige') && ($('#prestige')!.onclick = async () => { if (confirm('Prestige: reset to level 1, keep all unlocks, earn $5000 and an unlock token?')) { await api.prestige(); await refresh(); lobby(); } });
  ui.querySelectorAll<HTMLButtonElement>('[data-token]').forEach((b) => (b.onclick = async () => { const [k, id] = b.dataset.token!.split(':'); try { await api.unlock(k, id); message = 'Unlocked'; } catch (e) { message = `!${(e as Error).message}`; } await refresh(); lobby(); }));
  ui.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => (b.onclick = async () => { try { await api.buy(b.dataset.buy!); message = 'Purchased'; } catch (e) { message = `!${(e as Error).message}`; } await refresh(); lobby(); }));
}

// ------------------------------------------------------------------------------------------------
// Match
interface Match {
  net: NetClient; view: View; pred: Predictor | null; you: number; mode: ModeId; mapId: string; team: number;
  yaw: number; pitch: number; self: SelfState | null; roster: Map<number, { name: string; team: number; kills: number; deaths: number; score: number; noPlate: boolean; level: number; prestige: number }>;
  keys: Set<string>; mouse: { l: boolean; r: boolean }; edges: number; seq: number; acc: number; last: number; running: boolean;
  prev: { x: number; y: number; z: number }; feed: { html: string; t: number }[]; center: string; radar: { x: number; z: number }[];
  score: Extract<ServerEvent, { t: 'score' }> | null; localAmmo: number; nextShot: number; shot: number; weaponIdx: number; edgesFire: boolean;
}
let match: Match | null = null;
let view: View | null = null;

function startMatch(room: string) {
  view ??= new View(document.getElementById('game')!);
  const net = new NetClient({ onEvent: (e) => onEvent(e), onSnapshot: (t, ack, s) => onSnapshot(t, ack, s), onClose: (r) => endMatch(r) });
  match = { net, view, pred: null, you: -1, mode: 'tdm', mapId: '', team: 0, yaw: 0, pitch: 0, self: null, roster: new Map(), keys: new Set(), mouse: { l: false, r: false }, edges: 0, seq: 1, acc: 0, last: performance.now(), running: true, prev: { x: 0, y: 0, z: 0 }, feed: [], center: 'Connecting…', radar: [], score: null, localAmmo: 0, nextShot: 0, shot: 0, weaponIdx: 0, edgesFire: false };
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const q = new URLSearchParams({ class: String(classIndex) });
  const tok = session.get();
  if (tok) q.set('token', tok); else q.set('name', guestName);
  net.connect(`${proto}://${location.host}/ws/${room}?${q}`);
  hud();
  document.getElementById('game')!.onclick = () => document.getElementById('game')!.requestPointerLock();
  requestAnimationFrame(frame);
}

function endMatch(reason: string) {
  if (!match) return;
  match.running = false;
  match.net.close();
  match = null;
  document.exitPointerLock?.();
  message = reason === 'leave' ? '' : `!Disconnected: ${reason}`;
  void refresh().then(lobby);
}

function onEvent(e: ServerEvent) {
  const m = match!;
  switch (e.t) {
    case 'welcome': {
      m.you = e.you; m.mode = e.mode as ModeId;
      if (e.map !== m.mapId) {
        m.mapId = e.map;
        const map = MAP_BY_ID[e.map];
        m.view.loadMap(map);
        const effects = perkEffects(classes()[classIndex]?.perks ?? []);
        m.pred = new Predictor(new BoxWorld(map.boxes), () => ({ speedMult: m.self ? WEAPON_LIST[m.self.weapon]?.stats.mobility ?? 1 : 1, tacSprintMult: effects.tacSprintMult, tacRechargeMult: effects.tacRechargeMult, mantleTimeMult: effects.mantleTimeMult, slideCooldownMult: effects.slideCooldownMult, slideSpeedMult: effects.slideSpeedMult }));
      }
      m.center = `${MODES[m.mode].name} · ${MAP_BY_ID[e.map]?.name}${e.private ? ` · code ${e.room.slice(2)}` : ''}`;
      setTimeout(() => { if (match) match.center = ''; }, 3000);
      break;
    }
    case 'roster': m.roster = new Map(e.players.map((p) => [p.id, p])); m.team = m.roster.get(m.you)?.team ?? 0; break;
    case 'kill': {
      const k = m.roster.get(e.killer), v = m.roster.get(e.victim);
      const nm = (p: typeof k, id: number) => `<span class="t${p?.team ?? 0}">${esc(p?.name ?? (id < 0 ? 'World' : `#${id}`))}</span>`;
      m.feed.push({ html: `${nm(k, e.killer)} [${esc(WEAPONS[e.weapon]?.name ?? e.weapon)}${e.head ? ' ⌖' : ''}] ${nm(v, e.victim)}`, t: performance.now() });
      if (e.killer === m.you && e.victim !== m.you) flashHit(e.head);
      if (e.victim === m.you) m.center = `Killed by ${esc(k?.name ?? 'the world')}`, setTimeout(() => { if (match) match.center = ''; }, 2500);
      break;
    }
    case 'hit': if (e.victim === m.you) m.pitch += (flinchDegrees(e.dmg, perkEffects(classes()[classIndex]?.perks ?? [])) * Math.PI) / 180; else flashHit(e.head); break;
    case 'score': m.score = e; if (e.flags) m.view.setFlagColors(e.flags); break;
    case 'streak': if (e.id === m.you) m.center = e.streak.replace('earned:', 'Killstreak ready: ').replace('used:', 'Inbound: '), setTimeout(() => { if (match) match.center = ''; }, 2000); break;
    case 'tag': m.view.addTag(e.id, e.x, e.y, e.z, e.team !== m.team); break;
    case 'tagGone': m.view.removeTag(e.id); break;
    case 'equip': m.view.addEquip(e.id, e.x, e.y, e.z, e.yaw, MODES[m.mode].teams ? e.team !== m.team : e.owner !== m.you); break;
    case 'equipGone': m.view.removeEquip(e.id); break;
    case 'proj': m.view.addProjectile(e.id, e.x, e.y, e.z, e.vx, e.vy, e.vz); break;
    case 'boom': m.view.removeProjectile(e.id); if (e.r > 0 || e.kind.startsWith('streak')) m.view.explosion(e.x, e.y, e.z, e.r, e.kind); break;
    case 'smoke': m.view.smoke(e.x, e.y, e.z, e.dur); break;
    case 'flash': { const f = document.getElementById('flash'); if (f) { f.style.transition = 'none'; f.style.opacity = String(e.strength); requestAnimationFrame(() => { f.style.transition = `opacity ${e.dur}s ease-in`; f.style.opacity = '0'; }); } break; }
    case 'radar': m.radar = e.pts; break;
    case 'camo': m.feed.push({ html: `<span style="color:var(--acc)">Camo unlocked: ${esc(ALL_CAMOS.find((c) => c.id === e.camo)?.name)} — ${esc(WEAPONS[e.weapon]?.name)}</span>`, t: performance.now() }); break;
    case 'end': {
      const mine = e.xp[m.you] ?? 0, d = e.dollars[m.you] ?? 0;
      const won = MODES[m.mode].teams ? e.winner === m.team : e.winner === m.you;
      m.center = `${e.winner === -1 ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}<br><span style="font-size:18px">+${mine} XP · +$${d}${session.get() ? '' : ' (guest: not saved)'}<br>Next match in 15 s</span>`;
      break;
    }
    case 'error': m.feed.push({ html: `<span class="err">${esc(e.msg)}</span>`, t: performance.now() }); break;
  }
}

function onSnapshot(_tick: number, ackSeq: number, s: SelfState | null) {
  const m = match!;
  if (!s || !m.pred) return;
  const wasAlive = (m.self?.health ?? 0) > 0;
  if (m.self && s.weapon !== m.self.weapon) m.localAmmo = s.ammo;
  m.self = s;
  if (s.health <= 0 || !wasAlive) { m.pred.pending = []; }
  m.pred.reconcile(ackSeq, s);
  if (Math.abs(m.localAmmo - s.ammo) > 2 || s.ammo > m.localAmmo) m.localAmmo = s.ammo;
}

function hud() {
  ui.innerHTML = `<div class="hud"><div id="flash" class="flash"></div><div class="cross"></div><div id="hit" class="hit"></div><canvas id="radar" class="radar" width="180" height="180"></canvas>
    <div id="score" class="score"></div><div id="feed" class="feed"></div><div id="center" class="center-msg"></div>
    <div class="health"><div id="hp"></div></div><div id="ammo" class="ammo"></div><div id="streaks" class="streaks"></div><div id="board" class="board"></div>
    <div id="net" class="small" style="position:absolute;left:210px;top:24px"></div></div>`;
}

function flashHit(head: boolean) {
  const h = document.getElementById('hit');
  if (!h) return;
  h.className = head ? 'hit head' : 'hit';
  h.style.opacity = '1';
  setTimeout(() => (h.style.opacity = '0'), 120);
}

// Input
const KEYBTN: Record<string, number> = { Space: BTN.jump, ControlLeft: BTN.crouch, KeyC: BTN.crouch, ShiftLeft: BTN.sprint, KeyR: BTN.reload, KeyQ: BTN.swap, KeyV: BTN.melee, KeyG: BTN.lethal, KeyF: BTN.tactical, KeyE: BTN.use };
document.addEventListener('keydown', (e) => {
  if (!match) return;
  if (e.code === 'Tab') { e.preventDefault(); document.getElementById('board')!.style.display = 'block'; }
  if (e.code === 'Escape') { if (!document.pointerLockElement) endMatch('leave'); }
  if (['Digit5', 'Digit6', 'Digit7'].includes(e.code)) match.net.sendEvent({ t: 'streak', slot: Number(e.code.slice(5)) - 5 });
  match.keys.add(e.code);
  if (KEYBTN[e.code]) match.edges |= KEYBTN[e.code];
});
document.addEventListener('keyup', (e) => { if (!match) return; match.keys.delete(e.code); if (e.code === 'Tab') document.getElementById('board')!.style.display = 'none'; });
document.addEventListener('mousemove', (e) => {
  if (!match || !document.pointerLockElement) return;
  const sens = 0.0022 * (match.view.adsT > 0.5 ? 0.7 : 1);
  match.yaw -= e.movementX * sens;
  match.pitch = Math.max(-1.5, Math.min(1.5, match.pitch - e.movementY * sens));
});
document.addEventListener('mousedown', (e) => { if (!match || !document.pointerLockElement) return; if (e.button === 0) { match.mouse.l = true; match.edges |= BTN.fire; } if (e.button === 2) match.mouse.r = true; });
document.addEventListener('mouseup', (e) => { if (!match) return; if (e.button === 0) match.mouse.l = false; if (e.button === 2) match.mouse.r = false; });
document.addEventListener('contextmenu', (e) => { if (match) e.preventDefault(); });

function sampleInput(m: Match): MoveInput {
  const k = m.keys;
  let b = m.edges;
  m.edges = 0;
  for (const [code, bit] of Object.entries(KEYBTN)) if (k.has(code)) b |= bit;
  if (m.mouse.l) b |= BTN.fire;
  if (m.mouse.r) b |= BTN.ads;
  return { seq: m.seq++, fwd: (k.has('KeyW') ? 127 : 0) - (k.has('KeyS') ? 127 : 0), strafe: (k.has('KeyD') ? 127 : 0) - (k.has('KeyA') ? 127 : 0), yaw: m.yaw, pitch: m.pitch, buttons: b };
}

/** Local fire prediction for feel: recoil (which really moves the aim sent to the server) + tracer. */
function predictFire(m: Match, inp: MoveInput) {
  const s = m.self;
  if (!s || s.health <= 0 || !m.pred) return;
  const w = WEAPON_LIST[s.weapon];
  const l = classes()[classIndex];
  const atts = w?.id === l?.primary ? l.primaryAttachments : w?.id === l?.secondary ? l.secondaryAttachments : [];
  const st = applyAttachments(w, atts);
  m.shot += TICK_DT;
  const want = st.auto ? inp.buttons & BTN.fire : (inp.buttons & BTN.fire) && m.edgesFire;
  if (!want || m.localAmmo <= 0 || m.shot < m.nextShot || m.pred.state.sprinting) return;
  m.nextShot = m.shot + fireInterval(st);
  m.localAmmo--;
  const rec = st.recoil[(m.localAmmo >>> 0) % st.recoil.length];
  const adsK = m.view.adsT > 0.5 ? 0.75 : 1;
  m.pitch = Math.min(1.5, m.pitch + (rec.pitch * adsK * Math.PI) / 180);
  m.yaw -= (rec.yaw * adsK * Math.PI) / 180;
  m.view.recoilKick += 0.02;
  const cam = m.view.camera;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  m.view.tracer(cam.position.clone().add(dir.clone().multiplyScalar(0.6)).add(new THREE.Vector3(0, -0.1, 0)), cam.position.clone().add(dir.multiplyScalar(80)));
}

function frame(now: number) {
  const m = match;
  if (!m || !m.running) return;
  const dt = Math.min(0.1, (now - m.last) / 1000);
  m.last = now;
  m.acc += dt;
  while (m.acc >= TICK_DT) {
    m.acc -= TICK_DT;
    if (!m.pred || !m.self) continue;
    const fireEdge = (m.edges & BTN.fire) !== 0;
    const inp = sampleInput(m);
    m.edgesFire = fireEdge;
    m.prev = { x: m.pred.state.x, y: m.pred.state.y, z: m.pred.state.z };
    if (m.self.health > 0) { m.pred.apply(inp); predictFire(m, inp); }
    m.net.sendInputs([inp]);
  }
  const renderTick = m.net.renderTick(now);
  const remotes: EntityState[] = [];
  for (const id of m.net.interp.ids()) { if (id === m.you) continue; const e = m.net.interp.at(id, renderTick); if (e) remotes.push(e); }
  m.view.updateRemotes(remotes, new Map([...m.roster].map(([id, r]) => [id, r])), m.team, MODES[m.mode].teams);
  if (m.pred) {
    const a = m.acc / TICK_DT, s = m.pred.state;
    const x = m.prev.x + (s.x - m.prev.x) * a, y = m.prev.y + (s.y - m.prev.y) * a, z = m.prev.z + (s.z - m.prev.z) * a;
    m.view.setCamera(x, y, z, m.yaw, m.pitch, height(s) - MOVE.eye);
  }
  const w = m.self ? WEAPON_LIST[m.self.weapon] : undefined;
  if (w) m.view.setViewWeapon(m.self!.weapon, classes()[classIndex]?.camos?.[w.id]);
  const st = w ? w.stats : null;
  m.view.adsT = Math.max(0, Math.min(1, m.view.adsT + (m.mouse.r && !m.pred?.state.sprinting ? 1 : -1) * dt / Math.max(0.05, (st?.adsTime ?? 0.2) * perkEffects(classes()[classIndex]?.perks ?? []).adsTimeMult)));
  m.view.render(dt, m.view.adsT, st?.adsZoom ?? 0.8);
  drawHud(m, remotes);
  requestAnimationFrame(frame);
}

function drawHud(m: Match, remotes: EntityState[]) {
  const s = m.self;
  const g = (id: string) => document.getElementById(id);
  if (s) {
    g('hp')!.style.width = `${s.health}%`;
    g('ammo')!.innerHTML = `${m.localAmmo}<span style="font-size:18px;color:#aaa"> / ${s.reserve}</span><div style="font-size:13px">${esc(WEAPON_LIST[s.weapon]?.name)} · L${s.lethals} T${s.tacticals}</div>`;
    const l = classes()[classIndex];
    g('streaks')!.innerHTML = `Streak ${s.streak}<br>${(l?.streaks ?? []).map((id, i) => `<div class="${s.streakMask & (1 << i) ? 'ready' : ''}">[${i + 5}] ${esc(KILLSTREAKS.find((k) => k.id === id)?.name)}</div>`).join('')}`;
  }
  const sc = m.score;
  const teams = MODES[m.mode].teams;
  if (sc) {
    const mm = Math.floor(sc.timeLeft / 60), ss = String(sc.timeLeft % 60).padStart(2, '0');
    g('score')!.innerHTML = teams ? `<span class="t${m.team}">${sc.teams[m.team]}</span> — <span class="t${1 - m.team}">${sc.teams[1 - m.team]}</span> · ${mm}:${ss}${sc.flags ? ` · ${sc.flags.map((f, i) => `<span class="${f >= 1 ? 't0' : f <= -1 ? 't1' : ''}">${'ABC'[i]}</span>`).join(' ')}` : ''}` : `${m.roster.get(m.you)?.kills ?? 0} / ${MODES[m.mode].scoreLimit} · ${mm}:${ss}`;
  }
  const now = performance.now();
  m.feed = m.feed.filter((f) => now - f.t < 6000).slice(-6);
  g('feed')!.innerHTML = m.feed.map((f) => `<div>${f.html}</div>`).join('');
  g('center')!.innerHTML = m.center;
  g('net')!.textContent = `${Math.round(m.net.rtt)} ms · err ${m.pred?.lastError.toFixed(2) ?? 0} m`;
  const rows = [...m.roster.values()].sort((a, b) => b.score - a.score);
  g('board')!.innerHTML = `<table><tr><th>Player</th><th>Lv</th><th>K</th><th>D</th><th>Score</th></tr>${rows.map((r) => `<tr class="t${teams ? r.team : 0}"><td>${esc(r.name)}</td><td>${r.prestige ? `P${r.prestige}·` : ''}${r.level}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.score}</td></tr>`).join('')}</table>`;
  // radar
  const c = g('radar') as HTMLCanvasElement, x = c.getContext('2d')!;
  x.clearRect(0, 0, 180, 180);
  if (!m.pred) return;
  const me = m.pred.state, scale = 1.6, cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
  const plot = (px: number, pz: number, color: string, r = 3) => {
    const dx = px - me.x, dz = pz - me.z;
    const rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;
    const X = 90 + rx * scale, Y = 90 + rz * scale;
    if (Math.hypot(X - 90, Y - 90) > 88) return;
    x.fillStyle = color; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill();
  };
  for (const e of remotes) if (teams && ((e.flags & 32) ? 1 : 0) === m.team) plot(e.x, e.z, '#7fc4ff');
  for (const p of m.radar) plot(p.x, p.z, '#ff5a3a', 4);
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(90, 84); x.lineTo(85, 96); x.lineTo(95, 96); x.fill();
}

// Automation hook (headless tests): /mp.html?room=CODE&autotest=1
if (new URLSearchParams(location.search).has('autotest')) {
  (window as unknown as { __mp: object }).__mp = {
    state: () => match && { you: match.you, team: match.team, self: match.self, pos: match.pred && { x: match.pred.state.x, y: match.pred.state.y, z: match.pred.state.z }, remotes: [...match.net.known.values()], feed: match.feed.map((f) => f.html), roster: [...match.roster.values()], rtt: match.net.rtt, err: match.pred?.lastError },
    aim: (yaw: number, pitch: number) => { if (match) { match.yaw = yaw; match.pitch = pitch; } },
    fire: (on: boolean) => { if (match) { match.mouse.l = on; match.mouse.r = on; } },
    key: (code: string, down: boolean) => { if (match) { if (down) { match.keys.add(code); if (KEYBTN[code]) match.edges |= KEYBTN[code]; } else match.keys.delete(code); } },
  };
}

// ------------------------------------------------------------------------------------------------
// Boot
(async () => {
  try { cfg = await api.config(); } catch { ui.innerHTML = '<div class="lobby"><h2>Server unreachable</h2><p>Start the Worker: <code>cd server && pnpm dev</code></p></div>'; return; }
  const params = new URLSearchParams(location.search);
  const sso = params.get('sso_token');
  if (sso) {
    try { const r = await api.sso(sso); session.set(r.session); } catch { message = '!Sign-in failed or expired — try again'; }
    params.delete('sso_token');
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
  }
  await refresh();
  const room = params.get('room');
  if (room && /^[A-Z0-9]{6}$/i.test(room)) { startMatch(`p-${room.toUpperCase()}`); return; }
  lobby();
})();

