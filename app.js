/* ===========================================================
   Les As de Cointe — horloge de tournoi
   Tout tourne en local : aucune connexion n'est nécessaire
   pour que le tournoi se déroule.
   =========================================================== */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const KEY = 'as-de-cointe.v1';

/* ---------- structure de blindes par défaut ---------- */
const DEFAULT_LEVELS = [
  { sb: 25,   bb: 50,    ante: 0,    min: 20 },
  { sb: 50,   bb: 100,   ante: 0,    min: 20 },
  { sb: 75,   bb: 150,   ante: 0,    min: 20 },
  { sb: 100,  bb: 200,   ante: 0,    min: 20 },
  { brk: true, min: 10 },
  { sb: 150,  bb: 300,   ante: 0,    min: 20 },
  { sb: 200,  bb: 400,   ante: 400,  min: 20 },
  { sb: 300,  bb: 600,   ante: 600,  min: 20 },
  { brk: true, min: 10 },
  { sb: 400,  bb: 800,   ante: 800,  min: 20 },
  { sb: 500,  bb: 1000,  ante: 1000, min: 20 },
  { sb: 700,  bb: 1400,  ante: 1400, min: 20 },
  { sb: 1000, bb: 2000,  ante: 2000, min: 20 },
  { sb: 1500, bb: 3000,  ante: 3000, min: 20 },
  { sb: 2000, bb: 4000,  ante: 4000, min: 20 },
  { sb: 3000, bb: 6000,  ante: 6000, min: 20 }
];

const randCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[(Math.random() * A.length) | 0];
  return s;
};

function freshState() {
  return {
    v: 1,
    started: false,
    name: 'Les As de Cointe',
    sub: 'RDC Cointe Liège · entre amis',
    levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
    i: 0,
    left: DEFAULT_LEVELS[0].min * 60,
    running: false,
    endsAt: null,
    playedSec: 0,
    autoNext: true,
    sound: true,
    dealerTracking: false,
    tv: false,
    keepAwake: true,
    breakMin: 10,
    adhocEnds: null,
    resumeAfter: false,
    players: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: 'Joueur ' + (i + 1), out: false, place: null, rebuys: 0 })),
    nextId: 9,
    dealer: 0,
    stack: 10000,
    buyin: 20,
    rebuyAmt: 20,
    rebuyMode: 'level',
    rebuyLevel: 5,
    rebuyTime: '22:30',
    payouts: [50, 30, 20],
    code: randCode()
  };
}

let state = freshState();
let spectate = false;

/* ---------- sauvegarde ---------- */
function save() {
  if (spectate) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* mode privé */ }
  broadcast();
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && s.v === 1) {
      state = Object.assign(freshState(), s);
      /* le chrono ne court pas pendant que l'app est fermée */
      if (state.running && state.endsAt) {
        state.left = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
        state.running = false;
        state.endsAt = null;
      }
      state.adhocEnds = null;
    }
  } catch (e) { /* données illisibles : on repart à neuf */ }
}

/* ---------- utilitaires ---------- */
const pad = (n) => String(n).padStart(2, '0');
function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
}
const euro = (n) => Math.round(n).toLocaleString('fr-BE') + ' €';
/* 1 → 1er, 2 → 2e … */
const ord = (n) => (n === 1 ? '1er' : n + 'e');
const chips = (n) => n.toLocaleString('fr-BE');
function initials(name) {
  const p = (name || '?').trim().split(/\s+/);
  if (p.length > 1) return (p[0][0] + p[1][0]).toUpperCase();
  return (p[0].slice(0, 2) || '?').toUpperCase();
}

const cur      = () => state.levels[state.i] || state.levels[0];
const nextLvl  = () => state.levels[state.i + 1] || null;
const durOf    = (i) => (state.levels[i] ? state.levels[i].min : 20) * 60;
const isBreak  = () => !!cur().brk;
const inAdhoc  = () => !!state.adhocEnds;
const alive    = () => state.players.filter(p => !p.out);
/* numéro de niveau affiché : les pauses ne comptent pas */
function lvlNo(i) {
  let n = 0;
  for (let k = 0; k <= i; k++) if (!state.levels[k].brk) n++;
  return n;
}

/* ---------- son ---------- */
let ac = null;
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, dur, when, vol) {
  const a = audio(); if (!a || !state.sound) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime + when);
  g.gain.exponentialRampToValueAtTime(vol || 0.3, a.currentTime + when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + when + dur);
  o.connect(g); g.connect(a.destination);
  o.start(a.currentTime + when); o.stop(a.currentTime + when + dur + 0.05);
}
const beepShort = () => tone(880, 0.12, 0, 0.25);
function bell() { tone(784, 0.5, 0); tone(1046, 0.6, 0.12); tone(1318, 0.8, 0.24); }

/* ---------- écran allumé ---------- */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && state.keepAwake && 'wakeLock' in navigator) {
      if (!wake) wake = await navigator.wakeLock.request('screen');
    } else if (wake) { await wake.release(); wake = null; }
  } catch (e) { wake = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.running) keepAwake(true);
});

/* ---------- places à table ---------- */
function nextActive(i) {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) { const j = (i + k) % n; if (!state.players[j].out) return j; }
  return i;
}
function positions() {
  const act = alive();
  if (act.length < 2) return { d: null, sb: null, bb: null };
  let d = state.dealer % state.players.length;
  if (state.players[d].out) d = nextActive(d);
  if (act.length === 2) return { d, sb: d, bb: nextActive(d) };
  const sb = nextActive(d);
  return { d, sb, bb: nextActive(sb) };
}

/* ---------- argent (virtuel) ---------- */
const totalRebuys = () => state.players.reduce((a, p) => a + p.rebuys, 0);
const prizePool = () => state.players.length * state.buyin + totalRebuys() * state.rebuyAmt;
function avgStack() {
  const n = alive().length;
  if (!n) return 0;
  return Math.round((state.players.length * state.stack + totalRebuys() * state.stack) / n);
}
function rebuyOpen() {
  if (state.rebuyMode === 'none') return false;
  if (state.rebuyMode === 'level') return lvlNo(state.i) <= state.rebuyLevel;
  const [h, m] = (state.rebuyTime || '22:30').split(':').map(Number);
  const d = new Date(); const end = new Date();
  end.setHours(h, m, 0, 0);
  if (end < d && d.getHours() < 6) end.setDate(end.getDate() - 1);
  return Date.now() < end.getTime();
}
function rebuyText() {
  if (state.rebuyMode === 'none') return { v: 'Pas de recave', cls: 'shut' };
  if (!rebuyOpen()) return { v: 'Fermée', cls: 'shut' };
  if (state.rebuyMode === 'level') {
    const n = state.rebuyLevel - lvlNo(state.i);
    return { v: n === 0 ? 'Dernier niveau' : 'Jusqu’au niv. ' + state.rebuyLevel, cls: n <= 0 ? 'warn' : '' };
  }
  const [h, m] = state.rebuyTime.split(':').map(Number);
  const end = new Date(); end.setHours(h, m, 0, 0);
  const rest = Math.max(0, Math.round((end - Date.now()) / 1000));
  return { v: state.rebuyTime, sub: 'encore ' + mmss(rest), cls: rest < 900 ? 'warn' : '' };
}
function nextBreakIn() {
  for (let k = state.i + 1; k < state.levels.length; k++) {
    if (state.levels[k].brk) {
      let sec = state.left;
      for (let j = state.i + 1; j < k; j++) sec += durOf(j);
      return sec;
    }
  }
  return null;
}

/* ===========================================================
   MOTEUR DU CHRONO
   =========================================================== */
function play(on) {
  state.running = on;
  if (on) {
    audio();
    state.endsAt = Date.now() + state.left * 1000;
    keepAwake(true);
  } else {
    if (state.endsAt) state.left = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
    state.endsAt = null;
    keepAwake(false);
  }
  save(); renderAll();
}
function goLevel(i, keepRunning) {
  i = Math.max(0, Math.min(state.levels.length - 1, i));
  state.i = i;
  state.left = durOf(i);
  state.endsAt = (keepRunning && state.running) ? Date.now() + state.left * 1000 : null;
  if (!keepRunning) state.running = false;
  lastWarn = -1;
  save(); renderAll();
}
function levelEnded() {
  bell();
  if (state.autoNext && state.i < state.levels.length - 1) {
    goLevel(state.i + 1, true);
    const l = cur();
    toast(l.brk ? 'Pause !' : 'Niveau ' + lvlNo(state.i) + ' — blindes ' + l.sb + ' / ' + l.bb);
  } else {
    state.running = false; state.endsAt = null; state.left = 0;
    keepAwake(false); save(); renderAll();
  }
}

let lastWarn = -1;
let lastSave = 0;
function tick() {
  /* pause improvisée */
  if (state.adhocEnds) {
    const l = Math.max(0, Math.round((state.adhocEnds - Date.now()) / 1000));
    $('#breakClock').textContent = mmss(l);
    if (l === 0) { endAdhoc(); return; }
    return;
  }
  if (!state.running || !state.endsAt) return;

  const left = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
  if (left === state.left) return;

  state.playedSec += Math.max(0, state.left - left);
  state.left = left;

  if (!isBreak()) {
    if (left === 60 && lastWarn !== 60) { lastWarn = 60; beepShort(); toast('Encore 1 minute'); }
    if (left <= 5 && left > 0 && lastWarn !== left) { lastWarn = left; beepShort(); }
  }
  if (left === 0) { levelEnded(); return; }

  renderClock();
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); save(); }
}

function startAdhoc() {
  state.resumeAfter = state.running;
  if (state.running) {
    state.left = Math.max(0, Math.round((state.endsAt - Date.now()) / 1000));
    state.running = false; state.endsAt = null;
  }
  state.adhocEnds = Date.now() + state.breakMin * 60 * 1000;
  keepAwake(true);
  save(); renderAll();
}
function endAdhoc() {
  state.adhocEnds = null;
  if (state.resumeAfter) { state.running = true; state.endsAt = Date.now() + state.left * 1000; }
  state.resumeAfter = false;
  bell();
  save(); renderAll();
}

/* ===========================================================
   AFFICHAGE
   =========================================================== */
function renderClock() {
  const c = $('#clock'), bar = $('#bar');
  const left = state.left;
  c.textContent = mmss(left);
  c.classList.toggle('warn', !isBreak() && left <= 60 && left > 10);
  c.classList.toggle('urgent', !isBreak() && left <= 10);
  bar.classList.toggle('warn', !isBreak() && left <= 60 && left > 10);
  bar.classList.toggle('urgent', !isBreak() && left <= 10);
  const d = durOf(state.i) || 1;
  bar.firstElementChild.style.width = (100 - (left / d) * 100).toFixed(2) + '%';
  /* pendant une pause prévue par la structure, c'est le chrono du niveau
     qui tourne : il faut aussi le reporter sur le grand écran de pause */
  if (!inAdhoc() && isBreak()) {
    const bc = $('#breakClock');
    if (bc) bc.textContent = mmss(left);
  }
  if (spectate) return;
  renderStats();
}

function renderCenter() {
  const l = cur(), nx = nextLvl();
  const chip = $('#levelChip');
  chip.classList.toggle('break', !!l.brk);
  chip.classList.toggle('paused', !state.running && !l.brk);

  if (l.brk) {
    chip.textContent = 'Pause';
    $('#blindsNow').innerHTML = '<small>Reprise ensuite</small>';
  } else {
    chip.textContent = 'Niveau ' + lvlNo(state.i) + (state.running ? '' : ' · arrêté');
    $('#blindsNow').innerHTML = chips(l.sb) + ' / ' + chips(l.bb) +
      (l.ante ? ' <small>ante ' + chips(l.ante) + '</small>' : '');
  }
  $('#blindsNext').textContent = nx
    ? (nx.brk ? 'Ensuite : pause de ' + nx.min + ' min'
              : 'Ensuite : ' + chips(nx.sb) + ' / ' + chips(nx.bb))
    : 'Dernier niveau';

  const play = $('#btnPlay');
  play.classList.toggle('running', state.running);
  play.querySelector('use').setAttribute('href', state.running ? '#i-pause' : '#i-play');
  play.querySelector('span').textContent = state.running ? 'Pause' : (state.left === durOf(state.i) ? 'Démarrer' : 'Reprendre');

  /* écran de pause */
  const br = $('#breaker');
  const showBreak = inAdhoc() || (isBreak() && state.running);
  br.classList.toggle('on', showBreak);
  if (showBreak) {
    $('#breakClock').textContent = inAdhoc()
      ? mmss(Math.max(0, Math.round((state.adhocEnds - Date.now()) / 1000)))
      : mmss(state.left);
    const after = inAdhoc() ? cur() : nextLvl();
    $('#breakNext').textContent = after && !after.brk
      ? 'Reprise à ' + chips(after.sb) + ' / ' + chips(after.bb)
      : 'Reprise ensuite';
  }
}

/* rayon de placement des sièges : resserré quand l'écran est étroit,
   sinon les noms des places latérales débordent */
function seatRadii() {
  const w = ($('#tableWrap') || {}).clientWidth || 800;
  return w < 560 ? { rx: 35, ry: 43 } : { rx: 43, ry: 42.5 };
}

function renderSeats() {
  const box = $('#seats');
  const n = state.players.length;
  const pos = state.dealerTracking ? positions() : { d: null, sb: null, bb: null };
  const { rx, ry } = seatRadii();
  box.innerHTML = state.players.map((p, k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI / n);
    const x = 50 + Math.cos(a) * rx;
    const y = 50 + Math.sin(a) * ry;
    let badge = '';
    if (k === pos.d)       badge = '<span class="badge d">D</span>';
    else if (k === pos.sb) badge = '<span class="badge sb">SB</span>';
    else if (k === pos.bb) badge = '<span class="badge bb">BB</span>';
    if (k === pos.d && pos.d === pos.sb) badge = '<span class="badge d">D/SB</span>';
    const cls = ['seat'];
    if (p.out) cls.push('out');
    if (k === pos.d) cls.push('dealer');
    if (k === pos.sb && k !== pos.d) cls.push('sb');
    if (k === pos.bb) cls.push('bb');
    const sub = p.out ? (p.place ? ord(p.place) : 'sorti') : '';
    return `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%" data-seat="${k}">
      <div class="av">${initials(p.name)}${badge}${p.rebuys ? '<span class="rebuy-dot">+' + p.rebuys + '</span>' : ''}</div>
      <div class="nm">${esc(p.name)}</div>
      ${sub ? '<div class="sub">' + sub + '</div>' : ''}
    </div>`;
  }).join('');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function statCard(k, v, sub, cls) {
  return `<div class="stat ${cls || ''}"><div class="k">${k}</div><div class="v num">${v}${sub ? ' <small>' + sub + '</small>' : ''}</div></div>`;
}

function renderStats() {
  const box = spectate ? $('#controls') : $('#stats');
  const rb = rebuyText();
  const nb = nextBreakIn();
  const a = alive().length;
  let html = '';
  html += statCard('Joueurs restants', a + ' <small>/ ' + state.players.length + '</small>', '', 'hero');
  html += statCard('Recave', rb.v, rb.sub, rb.cls);
  html += statCard('Cagnotte', euro(prizePool()), totalRebuys() ? totalRebuys() + ' recave' + (totalRebuys() > 1 ? 's' : '') : '');
  html += statCard('Jetons par joueur', chips(avgStack()), 'en moyenne');
  html += statCard('Temps de jeu', mmss(state.playedSec));
  if (nb !== null) html += statCard('Prochaine pause', 'dans ' + mmss(nb));
  box.innerHTML = html;
}

function renderBrand() {
  $('#brandName').textContent = state.name;
  $('#brandSub').textContent = state.sub;
  document.title = state.name;
  const m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (m) m.setAttribute('content', state.name);
}

function renderAll() {
  renderBrand();
  renderSeats();
  renderCenter();
  renderClock();
  if (!spectate) renderStats();
  $('#btnPrev').disabled = state.i === 0;
  $('#btnNext').disabled = state.i >= state.levels.length - 1;
  $('#btnDeal').style.display = state.dealerTracking ? '' : 'none';
}

/* ===========================================================
   MODE TÉLÉ
   Les commandes s'effacent au bout de quelques secondes ;
   un appui n'importe où les fait revenir. Ça permet d'afficher
   l'écran sur une télé tout en gardant la tablette utilisable.
   =========================================================== */
let chromeT = null;

function showChrome() {
  document.body.classList.add('chrome-on');
  clearTimeout(chromeT);
  if (state.tv) chromeT = setTimeout(() => document.body.classList.remove('chrome-on'), 6000);
}

function setTv(on) {
  state.tv = on;
  document.body.classList.toggle('tv', on);
  if (on) {
    document.documentElement.requestFullscreen?.().catch(() => { /* refusé : tant pis */ });
    showChrome();
    toast('Mode télé — appuie sur l’écran pour revoir les commandes');
  } else {
    clearTimeout(chromeT);
    document.body.classList.add('chrome-on');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  save();
  renderAll();
}

/* ---------- petit message ---------- */
let toastT = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ===========================================================
   PANNEAUX
   =========================================================== */
function openSheet(id) {
  $$('.sheet').forEach(s => s.classList.remove('on'));
  $(id).classList.add('on');
  $('#scrim').classList.add('on');
}
function closeSheets() {
  $$('.sheet').forEach(s => s.classList.remove('on'));
  $('#scrim').classList.remove('on');
  closePop();
}

/* ---------- fiche joueur ---------- */
let popFor = null;
function openPop(k, anchor) {
  const p = state.players[k];
  popFor = k;
  const pos = positions();
  const pop = $('#pop');
  const canDeal = state.dealerTracking && !p.out && alive().length > 1;
  pop.innerHTML = `
    <h3>${esc(p.name)}</h3>
    <div class="meta">${p.out ? 'Éliminé — ' + (p.place ? ord(p.place) + ' place' : 'place inconnue') : 'En jeu'}${p.rebuys ? ' · ' + p.rebuys + ' recave' + (p.rebuys > 1 ? 's' : '') : ''}${state.dealerTracking && k === pos.d ? ' · bouton' : ''}</div>
    <div class="acts">
      ${p.out
        ? '<button data-act="back" class="good">↺ Le remettre en jeu</button>'
        : '<button data-act="out" class="danger">✖ Éliminer</button>'}
      ${!p.out && rebuyOpen() ? '<button data-act="rebuy">➕ Recave (' + euro(state.rebuyAmt) + ')</button>' : ''}
      ${canDeal && k !== pos.d ? '<button data-act="deal">◉ Lui donner le bouton</button>' : ''}
      <button data-act="rename">✎ Renommer</button>
      ${state.players.length > 2 ? '<div class="row tight" style="margin-top:2px"><button data-act="moveL">◀ Reculer</button><button data-act="moveR">Avancer ▶</button></div>' : ''}
    </div>`;
  pop.classList.add('on');
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  let y = r.bottom + 8;
  if (y + h > innerHeight - 10) y = Math.max(10, r.top - h - 8);
  pop.style.left = Math.max(10, Math.min(innerWidth - w - 10, x)) + 'px';
  pop.style.top = y + 'px';
}
function closePop() { $('#pop').classList.remove('on'); popFor = null; }

/* échange deux places : l'ordre autour de la table est l'ordre du jeu */
function swapSeats(a, b) {
  const t = state.players[a];
  state.players[a] = state.players[b];
  state.players[b] = t;
  if (state.dealer === a) state.dealer = b;
  else if (state.dealer === b) state.dealer = a;
  save(); renderAll();
  toast(state.players[b].name + ' change de place avec ' + state.players[a].name);
}

function eliminate(k) {
  const p = state.players[k];
  const n = alive().length;
  p.out = true;
  p.place = n;
  if (state.dealer === k) state.dealer = nextActive(k);
  const rest = alive();
  if (rest.length === 1) {
    rest[0].place = 1;
    bell();
    setTimeout(() => { renderPodium(); openSheet('#podSheet'); }, 450);
    toast('\u{1F3C6} ' + rest[0].name + ' remporte le tournoi !');
  } else {
    toast(p.name + ' éliminé — ' + ord(p.place) + ' place');
  }
  save(); renderAll();
}

/* ===========================================================
   ÉCRAN DE DÉPART
   =========================================================== */
let introCount = 8, introPace = 20, introNames = [], introBuyin = 20, introRebuy = 20;
const EST_GENERIQUE = (n) => /^Joueur \d+$/.test(n || '');

function introOpen() {
  introCount = state.players.length;
  introNames = state.players.map(p => p.name);
  const prem = state.levels.find(l => !l.brk);
  introPace = prem ? prem.min : 20;
  introBuyin = state.buyin;
  introRebuy = state.rebuyAmt;
  $('#fIntroBuyin').value = introBuyin;
  $('#fIntroRebuy').value = introRebuy;
  $('#introSub').textContent = state.sub;
  $('#introResume').classList.toggle('off', !state.started);
  renderIntroNames();
  syncPool();
  syncPace();
  $('#intro').classList.remove('off');
}
function introClose() { $('#intro').classList.add('off'); }

function renderIntroNames() {
  $('#pCount').textContent = introCount;
  $('#pMinus').disabled = introCount <= 2;
  $('#pPlus').disabled = introCount >= 12;
  const g = $('#nameGrid');
  g.innerHTML = Array.from({ length: introCount }, (_, i) => {
    const v = EST_GENERIQUE(introNames[i]) ? '' : (introNames[i] || '');
    return `<input type="text" maxlength="18" placeholder="Joueur ${i + 1}" value="${esc(v)}" data-n="${i}"
      autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false">`;
  }).join('');
  $$('[data-n]', g).forEach(inp => inp.addEventListener('input', e => {
    introNames[+e.target.dataset.n] = e.target.value;
  }));
}

/* la cagnotte se calcule sous les yeux, au fur et à mesure des réglages */
function syncPool() {
  const h = $('#poolHint');
  if (!introBuyin) {
    h.textContent = 'Partie sans mise : on joue pour l’honneur.';
    return;
  }
  const pool = introCount * introBuyin;
  h.innerHTML = introCount + ' joueurs × ' + euro(introBuyin) +
    ' = <b style="color:var(--gold)">' + euro(pool) + '</b> dans la cagnotte' +
    (introRebuy ? ', et chaque recave ajoute ' + euro(introRebuy) + '.' : '. Pas de recave payante.');
}

function syncPace() {
  $$('#paceIntro button').forEach(b => b.classList.toggle('on', +b.dataset.pace === introPace));
  const niveaux = state.levels.filter(l => !l.brk).length;
  const pauses = state.levels.filter(l => l.brk).reduce((a, l) => a + l.min, 0);
  const tot = niveaux * introPace + pauses;
  $('#paceHint').textContent = 'La structure couvre ' + Math.floor(tot / 60) + ' h ' + pad(tot % 60) +
    ' au maximum. En pratique ça se termine bien avant, dès qu\'il ne reste qu\'un joueur.';
}

function introStart() {
  const noms = [];
  for (let i = 0; i < introCount; i++) {
    const v = (introNames[i] || '').trim();
    noms.push(v || 'Joueur ' + (i + 1));
  }
  state.players = noms.map((n, i) => ({ id: i + 1, name: n, out: false, place: null, rebuys: 0 }));
  state.nextId = noms.length + 1;
  state.levels.forEach(l => { if (!l.brk) l.min = introPace; });
  state.buyin = introBuyin;
  state.rebuyAmt = introRebuy;
  state.i = 0;
  state.left = durOf(0);
  state.running = false;
  state.endsAt = null;
  state.playedSec = 0;
  state.dealer = 0;
  state.adhocEnds = null;
  state.started = true;
  lastWarn = -1;
  save();
  introClose();
  renderAll();
  const b = $('#btnPlay');
  b.classList.remove('nudge');
  void b.offsetWidth;
  b.classList.add('nudge');
  toast('Table prête — appuie sur Démarrer quand vous êtes installés');
}

/* ===========================================================
   MÉMO
   =========================================================== */
function renderMemo() {
  $('#memoBody').innerHTML = `
    <div class="memo-item">
      <div class="memo-badges"><i class="d">D</i><i class="sb">SB</i><i class="bb">BB</i></div>
      <b>Les trois pastilles</b>
      <span><b style="display:inline;color:var(--gold)">D</b> le donneur (le « bouton »).
      <b style="display:inline;color:var(--blue)">SB</b> la petite blind et
      <b style="display:inline;color:var(--red)">BB</b> la grosse blind : les deux joueurs
      obligés de miser avant de voir leurs cartes.
      <em>C'est désactivé par défaut, parce que le jeton qui tourne sur la vraie table le dit déjà
      et qu'il faudrait appuyer à chaque main. Si tu y tiens : Réglages → Suivre le donneur.</em></span>
    </div>
    <div class="memo-item">
      <b>Cagnotte</b>
      <span>Toutes les caves additionnées, recaves comprises. ${state.players.length} joueurs
      à ${euro(state.buyin)} font ${euro(state.players.length * state.buyin)}, et chaque recave
      l'augmente de ${euro(state.rebuyAmt)}. C'est ce montant qui se partage à la fin.
      <em>Rien n'est encaissé par l'application : c'est juste le tableau des comptes.</em></span>
    </div>
    <div class="memo-item">
      <b>Jetons par joueur</b>
      <span>Le nombre moyen de jetons qu'il reste à chaque joueur encore en jeu. C'est le vrai
      thermomètre de la partie : comparé aux blindes du moment, il dit s'il reste de la marge
      ou s'il faut commencer à jouer. Il monte mécaniquement à chaque élimination.</span>
    </div>
    <div class="memo-item">
      <b>Blindes et niveaux</b>
      <span>Les mises obligatoires, affichées <b style="display:inline">petite / grosse</b>.
      Elles montent à chaque niveau pour que la partie ne s'éternise pas. L'<em>ante</em>,
      quand il y en a une, est une petite mise payée par tout le monde en plus.</span>
    </div>
    <div class="memo-item">
      <b>Recave</b>
      <span>Racheter des jetons après avoir tout perdu. Ici elle est autorisée jusqu'à un niveau
      ou une heure que tu choisis dans les réglages ; passé ce point, celui qui tombe est éliminé
      pour de bon.</span>
    </div>
    <div class="memo-item">
      <b>Changer de place</b>
      <span>Appuie sur un joueur puis sur <em>Reculer</em> ou <em>Avancer</em> : il échange sa
      place avec son voisin. L'ordre autour de la table est l'ordre du jeu, c'est lui qui décide
      qui paiera les blindes ensuite.</span>
    </div>
    <div class="memo-item">
      <b>Changer le nombre de joueurs</b>
      <span>Réglages (⚙) puis l'onglet <em>Joueurs</em> : tu ajoutes, tu retires et tu renommes.
      Pour repartir de zéro avec une autre table, <em>Nouveau tournoi</em> en bas de l'onglet
      Tournoi ramène l'écran de départ.</span>
    </div>`;
}

/* ===========================================================
   RÉGLAGES
   =========================================================== */
let setTab = 'tour';

function renderSettings() {
  const b = $('#setBody');
  if (setTab === 'tour')    b.innerHTML = tabTournoi();
  if (setTab === 'blinds')  b.innerHTML = tabBlinds();
  if (setTab === 'players') b.innerHTML = tabPlayers();
  if (setTab === 'money')   b.innerHTML = tabMoney();
  wireSettings();
}

function tabTournoi() {
  return `
    <div class="field">
      <label>Nom du tournoi</label>
      <input type="text" id="fName" value="${esc(state.name)}" maxlength="34">
      <div class="hint">Ce nom s’affiche en haut, sur l’écran spectateur et sur l’image du classement.</div>
    </div>
    <div class="field">
      <label>Sous-titre</label>
      <input type="text" id="fSub" value="${esc(state.sub)}" maxlength="40">
    </div>
    <div class="field">
      <label>Durée d’une pause improvisée</label>
      <div class="row">
        <input type="number" id="fBreakMin" value="${state.breakMin}" min="1" max="60">
        <span style="flex:2;color:var(--faint);font-size:.8rem">minutes, quand tu appuies sur Pause</span>
      </div>
    </div>
    <div class="field">
      <label>Options</label>
      <div class="switch">
        <div class="lbl">Montée automatique<span>Passer au niveau suivant tout seul</span></div>
        <button class="toggle ${state.autoNext ? 'on' : ''}" data-tog="autoNext"></button>
      </div>
      <div class="switch">
        <div class="lbl">Suivre le donneur<span>Affiche D / petite / grosse blind. À faire tourner à la main à chaque donne : la plupart du temps, le jeton sur la table suffit.</span></div>
        <button class="toggle ${state.dealerTracking ? 'on' : ''}" data-tog="dealerTracking"></button>
      </div>
      <div class="switch">
        <div class="lbl">Son<span>Cloche au changement de niveau</span></div>
        <button class="toggle ${state.sound ? 'on' : ''}" data-tog="sound"></button>
      </div>
      <div class="switch">
        <div class="lbl">Garder l’écran allumé<span>Pendant que le chrono tourne</span></div>
        <button class="toggle ${state.keepAwake ? 'on' : ''}" data-tog="keepAwake"></button>
      </div>
    </div>
    <div class="field">
      <label>Affichage</label>
      <button class="btn full" id="fTv">📺 ${state.tv ? 'Quitter le mode télé' : 'Passer en mode télé'}</button>
      <div class="hint">Chrono géant, commandes escamotées, chiffres lisibles de loin. Idéal si tu renvoies l’écran de la tablette sur une télé. Un appui sur l’écran ramène les commandes quelques secondes.</div>
    </div>
    <div class="field" style="margin-top:26px">
      <button class="btn danger full" id="fReset">Nouveau tournoi (tout remettre à zéro)</button>
      <div class="hint">Les joueurs, la structure et les réglages sont conservés. Seuls le chrono, les éliminations et les recaves repartent à zéro.</div>
    </div>`;
}

function tabBlinds() {
  const rows = state.levels.map((l, i) => {
    const now = i === state.i ? ' now' : '';
    if (l.brk) {
      return `<div class="lvl-row is-break${now}" data-i="${i}">
        <div class="ix">—</div>
        <div class="pause-lbl">☕ Pause</div>
        <input type="number" data-f="min" value="${l.min}" min="1" max="120">
        <button class="del" data-del="${i}">✕</button>
      </div>`;
    }
    return `<div class="lvl-row${now}" data-i="${i}">
      <div class="ix">${lvlNo(i)}</div>
      <input type="number" data-f="sb" value="${l.sb}" min="1">
      <input type="number" data-f="bb" value="${l.bb}" min="1">
      <input type="number" data-f="ante" value="${l.ante || 0}" min="0">
      <input type="number" data-f="min" value="${l.min}" min="1" max="120">
      <button class="del" data-del="${i}">✕</button>
    </div>`;
  }).join('');

  return `
    <div class="field">
      <label>Rythme</label>
      <div class="seg" id="paceSeg">
        <button data-pace="10">Turbo · 10 min</button>
        <button data-pace="15">Rapide · 15 min</button>
        <button data-pace="20">Classique · 20 min</button>
        <button data-pace="30">Longue · 30 min</button>
      </div>
      <div class="hint">Applique la même durée à tous les niveaux (les pauses ne changent pas).</div>
    </div>
    <div class="lvl-row head">
      <div>#</div><div>Petite</div><div>Grosse</div><div>Ante</div><div>Min</div><div></div>
    </div>
    ${rows}
    <div class="row" style="margin-top:14px">
      <button class="btn" id="addLvl">+ Niveau</button>
      <button class="btn" id="addBrk">+ Pause</button>
    </div>
    <div class="hint" style="margin-top:12px">Durée totale prévue : <b>${mmss(state.levels.reduce((a, l) => a + l.min * 60, 0))}</b></div>`;
}

function tabPlayers() {
  const list = state.players.map((p, i) => `
    <div class="pitem ${p.out ? 'out' : ''}">
      <div class="av-sm">${initials(p.name)}</div>
      <input type="text" data-pname="${i}" value="${esc(p.name)}" maxlength="18"
        autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false">
      ${p.rebuys ? '<span class="tag">+' + p.rebuys + '</span>' : ''}
      ${p.out ? '<span class="tag">' + (p.place ? ord(p.place) : '?') + '</span>' : ''}
      <button class="del" data-pdel="${i}" style="width:34px">✕</button>
    </div>`).join('');
  return `
    <div class="field">
      <label>${state.players.length} joueurs</label>
      <div class="plist">${list}</div>
      <div class="row" style="margin-top:11px">
        <button class="btn" id="addPlayer">+ Ajouter un joueur</button>
        <button class="btn" id="shuffle">\u{1F500} Mélanger les places</button>
      </div>
      <div class="hint">Sur la table, appuie sur un joueur pour l’éliminer, lui donner le bouton ou noter une recave.</div>
    </div>`;
}

function tabMoney() {
  const sum = state.payouts.reduce((a, b) => a + b, 0);
  const pool = prizePool();
  const pay = state.payouts.map((p, i) => `
    <div class="row tight" style="margin-bottom:6px">
      <div style="flex:0 0 42px;color:var(--faint);font-size:.85rem">${i + 1}ᵉ</div>
      <input type="number" data-pay="${i}" value="${p}" min="0" max="100">
      <div style="flex:0 0 78px;text-align:right;color:var(--gold);font-weight:600">${euro(pool * p / 100)}</div>
      <button class="del" data-paydel="${i}" style="flex:0 0 34px">✕</button>
    </div>`).join('');

  return `
    <div class="hint" style="margin-bottom:16px;padding:10px 12px;background:rgba(245,180,69,.08);border:1px solid rgba(245,180,69,.25);border-radius:12px">
      Tout ceci est <b>pour le fun</b> : l’application ne gère aucun paiement, elle fait juste les comptes de la soirée.
    </div>
    <div class="field">
      <label>Cave et tapis</label>
      <div class="row">
        <div><input type="number" id="fBuyin" value="${state.buyin}" min="0"><div class="hint">Cave (€)</div></div>
        <div><input type="number" id="fRebuy" value="${state.rebuyAmt}" min="0"><div class="hint">Recave (€)</div></div>
        <div><input type="number" id="fStack" value="${state.stack}" min="1" step="500"><div class="hint">Tapis de départ</div></div>
      </div>
    </div>
    <div class="field">
      <label>Recave possible jusqu’à</label>
      <div class="seg" id="rbSeg">
        <button data-rb="level" class="${state.rebuyMode === 'level' ? 'on' : ''}">Un niveau</button>
        <button data-rb="time" class="${state.rebuyMode === 'time' ? 'on' : ''}">Une heure</button>
        <button data-rb="none" class="${state.rebuyMode === 'none' ? 'on' : ''}">Aucune</button>
      </div>
      <div style="margin-top:9px">
        ${state.rebuyMode === 'level'
          ? '<div class="row"><span style="flex:2;color:var(--faint);font-size:.85rem">Fin du niveau</span><input type="number" id="fRbLevel" value="' + state.rebuyLevel + '" min="1" max="30"></div>'
          : state.rebuyMode === 'time'
            ? '<div class="row"><span style="flex:2;color:var(--faint);font-size:.85rem">Jusqu’à</span><input type="time" id="fRbTime" value="' + state.rebuyTime + '"></div>'
            : '<div class="hint">Une seule cave par joueur.</div>'}
      </div>
    </div>
    <div class="field">
      <label>Partage de la cagnotte — ${euro(pool)}</label>
      ${pay}
      <div class="row" style="margin-top:8px">
        <button class="btn" id="addPay">+ Une place payée</button>
        <div style="flex:0 0 auto;color:${sum === 100 ? 'var(--green)' : 'var(--red)'};font-size:.85rem;font-weight:600">Total ${sum} %</div>
      </div>
    </div>`;
}

function wireSettings() {
  const b = $('#setBody');

  const bind = (sel, ev, fn) => { const e = $(sel, b); if (e) e.addEventListener(ev, fn); };

  bind('#fName', 'input', e => { state.name = e.target.value || 'Tournoi'; renderBrand(); save(); });
  bind('#fSub', 'input', e => { state.sub = e.target.value; renderBrand(); save(); });
  bind('#fBreakMin', 'input', e => { state.breakMin = Math.max(1, +e.target.value || 10); save(); });
  bind('#fTv', 'click', () => { const on = !state.tv; closeSheets(); setTv(on); });
  bind('#fReset', 'click', () => {
    if (!confirm('Nouveau tournoi ? Le chrono, les éliminations et les recaves repartent à zéro.')) return;
    state.players.forEach(p => { p.out = false; p.place = null; p.rebuys = 0; });
    state.i = 0; state.left = durOf(0); state.running = false; state.endsAt = null;
    state.playedSec = 0; state.adhocEnds = null; state.dealer = 0;
    state.started = false;
    save(); renderAll(); closeSheets(); introOpen();
  });

  $$('[data-tog]', b).forEach(t => t.addEventListener('click', () => {
    const k = t.dataset.tog;
    state[k] = !state[k];
    t.classList.toggle('on', state[k]);
    if (k === 'keepAwake') keepAwake(state.running);
    if (k === 'dealerTracking') renderAll();
    if (k === 'sound' && state[k]) beepShort();
    save();
  }));

  /* blindes */
  $$('[data-pace]', b).forEach(x => x.addEventListener('click', () => {
    const m = +x.dataset.pace;
    state.levels.forEach(l => { if (!l.brk) l.min = m; });
    state.left = durOf(state.i);
    if (state.running) state.endsAt = Date.now() + state.left * 1000;
    save(); renderAll(); renderSettings(); toast('Niveaux de ' + m + ' minutes');
  }));
  $$('.lvl-row[data-i] input', b).forEach(inp => inp.addEventListener('input', e => {
    const row = e.target.closest('.lvl-row');
    const i = +row.dataset.i, f = e.target.dataset.f;
    const v = Math.max(f === 'ante' ? 0 : 1, +e.target.value || 0);
    state.levels[i][f] = v;
    if (i === state.i && f === 'min') {
      state.left = Math.min(state.left, v * 60);
      if (state.running) state.endsAt = Date.now() + state.left * 1000;
    }
    save(); renderCenter(); renderClock();
  }));
  $$('[data-del]', b).forEach(x => x.addEventListener('click', () => {
    const i = +x.dataset.del;
    if (state.levels.length <= 1) return;
    state.levels.splice(i, 1);
    if (state.i >= state.levels.length) state.i = state.levels.length - 1;
    save(); renderAll(); renderSettings();
  }));
  bind('#addLvl', 'click', () => {
    const last = [...state.levels].reverse().find(l => !l.brk) || { sb: 25, bb: 50, ante: 0, min: 20 };
    state.levels.push({ sb: last.sb * 2, bb: last.bb * 2, ante: last.ante ? last.ante * 2 : 0, min: last.min });
    save(); renderSettings();
    b.scrollTop = b.scrollHeight;
  });
  bind('#addBrk', 'click', () => {
    state.levels.push({ brk: true, min: state.breakMin });
    save(); renderSettings();
    b.scrollTop = b.scrollHeight;
  });

  /* joueurs */
  $$('[data-pname]', b).forEach(inp => inp.addEventListener('input', e => {
    state.players[+e.target.dataset.pname].name = e.target.value;
    save(); renderSeats();
  }));
  $$('[data-pdel]', b).forEach(x => x.addEventListener('click', () => {
    if (state.players.length <= 2) { toast('Il faut au moins 2 joueurs'); return; }
    state.players.splice(+x.dataset.pdel, 1);
    state.dealer = state.dealer % state.players.length;
    save(); renderAll(); renderSettings();
  }));
  bind('#addPlayer', 'click', () => {
    if (state.players.length >= 12) { toast('12 joueurs maximum à table'); return; }
    state.players.push({ id: state.nextId++, name: 'Joueur ' + (state.players.length + 1), out: false, place: null, rebuys: 0 });
    save(); renderAll(); renderSettings();
  });
  bind('#shuffle', 'click', () => {
    for (let i = state.players.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
    }
    save(); renderAll(); renderSettings(); toast('Places tirées au sort');
  });

  /* argent */
  bind('#fBuyin', 'input', e => { state.buyin = Math.max(0, +e.target.value || 0); save(); renderStats(); refreshMoney(); });
  bind('#fRebuy', 'input', e => { state.rebuyAmt = Math.max(0, +e.target.value || 0); save(); renderStats(); refreshMoney(); });
  bind('#fStack', 'input', e => { state.stack = Math.max(1, +e.target.value || 1); save(); renderStats(); });
  $$('[data-rb]', b).forEach(x => x.addEventListener('click', () => {
    state.rebuyMode = x.dataset.rb; save(); renderAll(); renderSettings();
  }));
  bind('#fRbLevel', 'input', e => { state.rebuyLevel = Math.max(1, +e.target.value || 1); save(); renderStats(); });
  bind('#fRbTime', 'input', e => { state.rebuyTime = e.target.value || '22:30'; save(); renderStats(); });
  $$('[data-pay]', b).forEach(inp => inp.addEventListener('input', e => {
    state.payouts[+e.target.dataset.pay] = Math.max(0, +e.target.value || 0);
    save(); refreshMoney();
  }));
  $$('[data-paydel]', b).forEach(x => x.addEventListener('click', () => {
    if (state.payouts.length <= 1) return;
    state.payouts.splice(+x.dataset.paydel, 1); save(); renderSettings();
  }));
  bind('#addPay', 'click', () => {
    if (state.payouts.length >= 9) return;
    state.payouts.push(0); save(); renderSettings();
  });

  let moneyT = null;
  function refreshMoney() { clearTimeout(moneyT); moneyT = setTimeout(() => { if (setTab === 'money') renderSettings(); }, 700); }
}

/* ===========================================================
   QUI GAGNE ?
   =========================================================== */
const calc = { board: [], hands: [[], []], sel: null };

function calcNames() {
  const act = alive();
  return calc.hands.map((_, i) => (act[i] ? act[i].name : 'Joueur ' + (i + 1)));
}
function usedCards() {
  const u = new Set(calc.board);
  calc.hands.forEach(h => h.forEach(c => u.add(c)));
  return u;
}
function slotHTML(cardVal, sel, data) {
  if (cardVal == null) {
    return `<button class="slot ${sel ? 'sel' : ''}" ${data}>+</button>`;
  }
  const r = cardRank(cardVal), s = cardSuit(cardVal);
  return `<button class="slot filled ${SUIT_RED[s] ? 'red' : ''} ${sel ? 'sel' : ''}" ${data}>
    <span>${RANK_CH[r]}</span><span class="s">${SUIT_CH[s]}</span></button>`;
}

function renderCalc() {
  const names = calcNames();
  const selIs = (t, p, k) => calc.sel && calc.sel.t === t && calc.sel.p === p && calc.sel.k === k;

  let board = '';
  for (let k = 0; k < 5; k++) {
    board += slotHTML(calc.board[k] ?? null, selIs('b', 0, k), `data-slot="b" data-p="0" data-k="${k}"`);
  }

  let players = '';
  calc.hands.forEach((h, p) => {
    players += `<div class="calc-player" data-pl="${p}">
      <div class="slots">
        ${slotHTML(h[0] ?? null, selIs('h', p, 0), `data-slot="h" data-p="${p}" data-k="0"`)}
        ${slotHTML(h[1] ?? null, selIs('h', p, 1), `data-slot="h" data-p="${p}" data-k="1"`)}
      </div>
      <div class="who"><b>${esc(names[p])}</b><i data-res="${p}">—</i></div>
      <div class="pct num" data-pct="${p}"></div>
      ${calc.hands.length > 2 ? `<button class="rm" data-rm="${p}">✕</button>` : ''}
    </div>`;
  });

  const used = usedCards();
  let deck = '';
  for (let r = 14; r >= 2; r--) {
    for (let s = 0; s < 4; s++) {
      const c = card(r, s);
      deck += `<button class="${SUIT_RED[s] ? 'red' : ''}" data-card="${c}" ${used.has(c) ? 'disabled' : ''}>
        <span>${RANK_CH[r]}</span><span class="s">${SUIT_CH[s]}</span></button>`;
    }
  }
  /* rangé par couleur : 4 lignes de 13 */
  deck = '';
  for (let s = 0; s < 4; s++) {
    for (let r = 14; r >= 2; r--) {
      const c = card(r, s);
      deck += `<button class="${SUIT_RED[s] ? 'red' : ''}" data-card="${c}" ${used.has(c) ? 'disabled' : ''}>
        <span>${RANK_CH[r]}</span><span class="s">${SUIT_CH[s]}</span></button>`;
    }
  }

  $('#calcBody').innerHTML = `
    <div id="verdict" class="verdict neutral"><div class="big">Choisis les cartes</div>
      <div class="small">Appuie sur une case, puis sur une carte en bas.</div></div>
    <div class="calc-board">
      <div class="k">Le tapis (board)</div>
      <div class="slots">${board}</div>
    </div>
    <div style="margin-bottom:12px">${players}</div>
    ${calc.hands.length < 6 ? '<button class="btn full" id="addHand" style="margin-bottom:16px">+ Ajouter un joueur</button>' : ''}
    <div class="k" style="font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);font-weight:600;margin-bottom:8px">Le paquet</div>
    <div class="deck">${deck}</div>`;

  wireCalc();
  computeCalc();
}

function wireCalc() {
  const b = $('#calcBody');
  $$('[data-slot]', b).forEach(s => s.addEventListener('click', () => {
    const t = s.dataset.slot, p = +s.dataset.p, k = +s.dataset.k;
    if (t === 'b' && calc.board[k] != null) { calc.board.splice(k, 1); renderCalc(); return; }
    if (t === 'h' && calc.hands[p][k] != null) { calc.hands[p][k] = null; renderCalc(); return; }
    calc.sel = { t, p, k };
    renderCalc();
  }));
  $$('[data-card]', b).forEach(c => c.addEventListener('click', () => {
    const v = +c.dataset.card;
    if (!calc.sel) calc.sel = firstEmpty();
    if (!calc.sel) return;
    const { t, p, k } = calc.sel;
    if (t === 'b') calc.board[k] = v; else calc.hands[p][k] = v;
    calc.sel = firstEmpty();
    renderCalc();
  }));
  $$('[data-rm]', b).forEach(x => x.addEventListener('click', () => {
    calc.hands.splice(+x.dataset.rm, 1); renderCalc();
  }));
  const add = $('#addHand', b);
  if (add) add.addEventListener('click', () => { calc.hands.push([]); renderCalc(); });
}

function firstEmpty() {
  for (let p = 0; p < calc.hands.length; p++)
    for (let k = 0; k < 2; k++)
      if (calc.hands[p][k] == null) return { t: 'h', p, k };
  for (let k = 0; k < 5; k++) if (calc.board[k] == null) return { t: 'b', p: 0, k };
  return null;
}

function computeCalc() {
  const v = $('#verdict');
  const names = calcNames();
  const board = calc.board.filter(c => c != null);
  const hands = calc.hands.map(h => (h[0] != null && h[1] != null) ? [h[0], h[1]] : null);
  const ready = hands.filter(Boolean).length;

  $$('[data-pct]').forEach(e => e.textContent = '');
  $$('[data-res]').forEach(e => { e.textContent = '—'; });
  $$('.calc-player').forEach(e => e.classList.remove('win'));

  if (ready < 2) {
    v.className = 'verdict neutral';
    v.innerHTML = '<div class="big">Il faut au moins deux mains complètes</div><div class="small">Deux cartes par joueur.</div>';
    return;
  }

  if (board.length === 5) {
    const { res, winners } = showdown(hands, board);
    res.forEach(r => {
      if (!r.valid) return;
      const el = $(`[data-res="${r.i}"]`);
      if (el) el.textContent = r.name;
      if (r.win) $(`.calc-player[data-pl="${r.i}"]`)?.classList.add('win');
    });
    v.className = 'verdict';
    if (winners.length === 1) {
      const w = res.find(r => r.i === winners[0]);
      v.innerHTML = `<div class="big">\u{1F3C6} ${esc(names[winners[0]])} gagne</div><div class="small">${w.name}</div>`;
    } else {
      v.innerHTML = `<div class="big">Pot partagé</div><div class="small">${winners.map(i => esc(names[i])).join(' et ')} — ${res.find(r => r.i === winners[0]).name}</div>`;
    }
    return;
  }

  /* board incomplet : chances de gagner */
  v.className = 'verdict neutral';
  v.innerHTML = '<div class="big">Calcul des chances…</div>';
  const iters = Math.max(8000, Math.round(50000 / ready));
  setTimeout(() => {
    const eq = equity(hands, board, iters);
    if (!eq) return;
    let bestPct = -1, bestI = -1;
    eq.forEach(e => {
      const el = $(`[data-pct="${e.i}"]`);
      if (el) el.textContent = e.pct.toFixed(1) + ' %';
      const r = $(`[data-res="${e.i}"]`);
      if (r && board.length >= 3) {
        const bb = best(hands[e.i].concat(board));
        r.textContent = handName(bb.cards);
      } else if (r) {
        r.textContent = cardText(hands[e.i][0]) + ' ' + cardText(hands[e.i][1]);
      }
      if (e.pct > bestPct) { bestPct = e.pct; bestI = e.i; }
    });
    $(`.calc-player[data-pl="${bestI}"]`)?.classList.add('win');
    const label = board.length === 0 ? 'avant le flop' : board.length === 3 ? 'au flop' : 'au turn';
    v.className = 'verdict';
    v.innerHTML = `<div class="big">${esc(names[bestI])} est favori · ${bestPct.toFixed(0)} %</div>
      <div class="small">Chances de gagner ${label}${eq[0].exact ? ' (calcul exact)' : ' (sur ' + iters.toLocaleString('fr-BE') + ' tirages)'}</div>`;
  }, 30);
}

/* ===========================================================
   ÉCRAN SPECTATEUR
   =========================================================== */
let chan = null;
function channel() {
  if (chan || !('BroadcastChannel' in window)) return chan;
  try { chan = new BroadcastChannel('as-de-cointe-' + state.code); } catch (e) { chan = null; }
  return chan;
}
function snapshot() {
  const l = cur(), nx = nextLvl();
  return {
    t: 'snap',
    name: state.name, sub: state.sub,
    lvl: l.brk ? null : lvlNo(state.i),
    brk: !!l.brk || inAdhoc(),
    left: inAdhoc() ? Math.max(0, Math.round((state.adhocEnds - Date.now()) / 1000)) : state.left,
    dur: durOf(state.i),
    running: state.running || inAdhoc(),
    sb: l.sb, bb: l.bb, ante: l.ante,
    nextTxt: nx ? (nx.brk ? 'pause de ' + nx.min + ' min' : chips(nx.sb) + ' / ' + chips(nx.bb)) : null,
    alive: alive().length, total: state.players.length,
    pool: prizePool(), avg: avgStack(),
    rebuy: rebuyText(), played: state.playedSec,
    names: alive().map(p => p.name)
  };
}
let lastBc = 0;
function broadcast() {
  const c = channel(); if (!c || spectate) return;
  const now = Date.now();
  if (now - lastBc < 400) return;
  lastBc = now;
  try { c.postMessage(snapshot()); } catch (e) { /* ignore */ }
}

function renderShare() {
  const url = location.origin + location.pathname + '?v=' + state.code;
  $('#shareBody').innerHTML = `
    <div class="field">
      <label>Code de la table</label>
      <div style="font-size:2.6rem;font-weight:650;letter-spacing:.22em;color:var(--gold);text-align:center;padding:14px 0">${state.code}</div>
    </div>
    <div class="field">
      <label>Lien à partager</label>
      <input type="text" id="shareUrl" value="${url}" readonly>
      <div class="row" style="margin-top:9px">
        <button class="btn primary" id="copyUrl">Copier le lien</button>
        <button class="btn" id="newCode">Nouveau code</button>
      </div>
    </div>
    <div class="hint" style="margin-top:18px;padding:12px;background:rgba(90,169,230,.08);border:1px solid rgba(90,169,230,.25);border-radius:12px;line-height:1.5">
      <b>À savoir :</b> pour l’instant l’écran spectateur fonctionne entre plusieurs onglets ou fenêtres du même appareil.
      Pour que les téléphones de tout le monde suivent en direct, il reste la couche de synchronisation à brancher.
      Le tournoi, lui, n’en dépend jamais : la tablette fonctionne seule.
    </div>
    <div class="field" style="margin-top:16px">
      <button class="btn full" id="openSpec">Ouvrir l’écran spectateur dans un onglet</button>
    </div>`;

  $('#copyUrl').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); toast('Lien copié'); }
    catch (e) { $('#shareUrl').select(); toast('Sélectionne et copie'); }
  });
  $('#newCode').addEventListener('click', () => {
    state.code = randCode(); chan = null; save(); renderShare(); toast('Nouveau code : ' + state.code);
  });
  $('#openSpec').addEventListener('click', () => window.open(url, '_blank'));
}

/* vue lecture seule */
function applySpectator(snap) {
  if (!snap) return;
  $('#brandName').textContent = snap.name;
  $('#brandSub').textContent = snap.sub || 'En direct';
  document.title = snap.name;
  const chip = $('#levelChip');
  chip.classList.toggle('break', snap.brk);
  chip.textContent = snap.brk ? 'Pause' : 'Niveau ' + snap.lvl + (snap.running ? '' : ' · arrêté');
  $('#clock').textContent = mmss(snap.left);
  $('#clock').classList.toggle('warn', !snap.brk && snap.left <= 60 && snap.left > 10);
  $('#clock').classList.toggle('urgent', !snap.brk && snap.left <= 10);
  $('#blindsNow').innerHTML = snap.brk ? '<small>Reprise ensuite</small>'
    : chips(snap.sb) + ' / ' + chips(snap.bb) + (snap.ante ? ' <small>ante ' + chips(snap.ante) + '</small>' : '');
  $('#blindsNext').textContent = snap.nextTxt ? 'Ensuite : ' + snap.nextTxt : 'Dernier niveau';
  const bar = $('#bar');
  bar.firstElementChild.style.width = (100 - (snap.left / (snap.dur || 1)) * 100).toFixed(2) + '%';

  $('#controls').className = 'spec-grid';
  $('#controls').innerHTML =
    statCard('Joueurs restants', snap.alive + ' <small>/ ' + snap.total + '</small>', '', 'hero') +
    statCard('Recave', snap.rebuy.v, snap.rebuy.sub, snap.rebuy.cls) +
    statCard('Cagnotte', euro(snap.pool)) +
    statCard('Jetons par joueur', chips(snap.avg), 'en moyenne') +
    statCard('Temps de jeu', mmss(snap.played));

  const n = snap.names.length;
  const { rx, ry } = seatRadii();
  $('#seats').innerHTML = snap.names.map((nm, k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI / Math.max(n, 2));
    return `<div class="seat" style="left:${50 + Math.cos(a) * rx}%;top:${50 + Math.sin(a) * ry}%">
      <div class="av">${initials(nm)}</div><div class="nm">${esc(nm)}</div></div>`;
  }).join('');
}

function bootSpectator(code) {
  spectate = true;
  $('#intro').classList.add('off');
  document.body.classList.add('spectate');
  $('#btnCalc').style.display = '';
  $('#btnShare').style.display = 'none';
  $('#btnSet').style.display = 'none';
  $('#brandSub').textContent = 'Connexion…';
  $('#clock').textContent = '--:--';
  $('#blindsNow').textContent = '';
  $('#blindsNext').textContent = '';
  $('#controls').className = 'spec-grid';
  $('#controls').innerHTML = statCard('En attente', 'de la table', '', '');

  let c = null;
  try { c = new BroadcastChannel('as-de-cointe-' + code); } catch (e) { c = null; }
  if (!c) { $('#brandSub').textContent = 'Navigateur non compatible'; return; }
  c.onmessage = (e) => { if (e.data && e.data.t === 'snap') applySpectator(e.data); };
  c.postMessage({ t: 'hello' });
  setInterval(() => c.postMessage({ t: 'hello' }), 4000);
}

/* ===========================================================
   CLASSEMENT
   =========================================================== */
function ranking() {
  const out = state.players.filter(p => p.out && p.place).sort((a, b) => a.place - b.place);
  const inPlay = state.players.filter(p => !p.out);
  const win = inPlay.length === 1 ? inPlay : [];
  const still = inPlay.length > 1 ? inPlay : [];
  const list = [];
  win.forEach(p => list.push({ p, pos: 1 }));
  still.forEach(p => list.push({ p, pos: null }));
  out.forEach(p => list.push({ p, pos: p.place }));
  return list;
}
function gainFor(pos) {
  if (!pos || pos > state.payouts.length) return 0;
  return prizePool() * state.payouts[pos - 1] / 100;
}
function renderPodium() {
  const list = ranking();
  const rows = list.map(({ p, pos }) => {
    const g = gainFor(pos);
    return `<div class="prow ${pos === 1 ? 'p1' : pos === 2 ? 'p2' : pos === 3 ? 'p3' : ''}">
      <div class="pos">${pos ? ord(pos) : '·'}</div>
      <div class="nm">${esc(p.name)}${p.rebuys ? ' <span style="color:var(--faint);font-size:.8rem">+' + p.rebuys + '</span>' : ''}</div>
      ${pos ? '' : '<div style="color:var(--green);font-size:.82rem;font-weight:600">en jeu</div>'}
      ${g ? '<div class="gain">' + euro(g) + '</div>' : ''}
    </div>`;
  }).join('');
  $('#podBody').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.14em;color:var(--faint)">${esc(state.name)}</div>
      <div style="font-size:.85rem;color:var(--muted);margin-top:3px">Cagnotte ${euro(prizePool())} · ${state.players.length} joueurs</div>
    </div>
    <div class="podium">${rows}</div>`;
}

/* ---------- image à partager ---------- */
function exportImage() {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');

  const g = x.createRadialGradient(W * 0.4, H * 0.22, 60, W * 0.5, H * 0.5, H * 0.85);
  g.addColorStop(0, '#17553f'); g.addColorStop(1, '#060f0d');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  x.strokeStyle = 'rgba(232,197,122,.35)'; x.lineWidth = 3;
  x.strokeRect(38, 38, W - 76, H - 76);

  x.textAlign = 'center';
  x.fillStyle = '#e8c57a';
  x.font = '600 30px -apple-system, Helvetica, sans-serif';
  x.fillText(state.name.toUpperCase(), W / 2, 136);
  x.fillStyle = '#8ba69c';
  x.font = '400 23px -apple-system, Helvetica, sans-serif';
  const d = new Date();
  x.fillText(d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 176);

  x.fillStyle = '#f2f7f4';
  x.font = '200 76px -apple-system, Helvetica, sans-serif';
  x.fillText('Classement', W / 2, 272);

  const list = ranking().slice(0, 10);
  let y = 352;
  list.forEach(({ p, pos }) => {
    const g2 = gainFor(pos);
    const top = pos === 1;
    x.fillStyle = top ? 'rgba(232,197,122,.16)' : 'rgba(255,255,255,.05)';
    roundRect(x, 90, y, W - 180, 86, 18); x.fill();
    if (top) { x.strokeStyle = 'rgba(232,197,122,.5)'; x.lineWidth = 2; roundRect(x, 90, y, W - 180, 86, 18); x.stroke(); }

    x.textAlign = 'center';
    x.fillStyle = top ? '#e8c57a' : '#5b7a70';
    x.font = '700 34px -apple-system, Helvetica, sans-serif';
    x.fillText(pos ? ord(pos) : '-', 152, y + 56);

    x.textAlign = 'left';
    x.fillStyle = top ? '#e8c57a' : '#f2f7f4';
    x.font = (top ? '650 ' : '500 ') + '36px -apple-system, Helvetica, sans-serif';
    x.fillText(p.name.slice(0, 20), 210, y + 56);

    if (g2) {
      x.textAlign = 'right';
      x.fillStyle = '#e8c57a';
      x.font = '600 32px -apple-system, Helvetica, sans-serif';
      x.fillText(Math.round(g2).toLocaleString('fr-BE') + ' €', W - 120, y + 56);
    }
    y += 98;
  });

  x.textAlign = 'center';
  x.fillStyle = '#5b7a70';
  x.font = '400 24px -apple-system, Helvetica, sans-serif';
  x.fillText('Cagnotte ' + euro(prizePool()) + '  ·  ' + state.players.length + ' joueurs  ·  ' + mmss(state.playedSec) + ' de jeu', W / 2, H - 92);
  x.fillStyle = '#e8c57a';
  x.font = '600 22px -apple-system, Helvetica, sans-serif';
  x.fillText(state.sub || '', W / 2, H - 56);

  cv.toBlob(async (blob) => {
    const file = new File([blob], 'classement.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: state.name }); return; } catch (e) { /* annulé */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'classement.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Image enregistrée');
  }, 'image/png');
}
function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.moveTo(l + r, t);
  x.arcTo(l + w, t, l + w, t + h, r);
  x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r);
  x.arcTo(l, t, l + w, t, r);
  x.closePath();
}

/* ===========================================================
   BRANCHEMENTS
   =========================================================== */
function wire() {
  $('#btnPlay').addEventListener('click', () => play(!state.running));
  $('#btnNext').addEventListener('click', () => goLevel(state.i + 1, true));
  $('#btnPrev').addEventListener('click', () => goLevel(state.i - 1, true));
  $('#btnReset').addEventListener('click', () => {
    state.left = durOf(state.i); lastWarn = -1;
    if (state.running) state.endsAt = Date.now() + state.left * 1000;
    save(); renderAll(); toast('Niveau relancé');
  });
  $('#btnAdd').addEventListener('click', () => {
    state.left += 60;
    if (state.running) state.endsAt = Date.now() + state.left * 1000;
    save(); renderAll(); toast('+1 minute');
  });
  $('#btnDeal').addEventListener('click', () => {
    if (alive().length < 2) return;
    state.dealer = nextActive(state.dealer);
    save(); renderSeats();
    const p = positions();
    toast('Bouton : ' + state.players[p.d].name + ' · GB : ' + state.players[p.bb].name);
  });
  $('#btnBreak').addEventListener('click', () => { if (inAdhoc()) endAdhoc(); else startAdhoc(); });
  $('#breakSkip').addEventListener('click', () => {
    if (inAdhoc()) endAdhoc();
    else goLevel(state.i + 1, true);
  });

  $('#btnSet').addEventListener('click', () => { renderSettings(); openSheet('#setSheet'); });
  $('#btnMemo').addEventListener('click', () => { renderMemo(); openSheet('#memoSheet'); });
  $('#stats').addEventListener('click', () => { renderMemo(); openSheet('#memoSheet'); });

  /* écran de départ */
  $('#pMinus').addEventListener('click', () => { if (introCount > 2) { introCount--; renderIntroNames(); syncPool(); syncPace(); } });
  $('#pPlus').addEventListener('click', () => { if (introCount < 12) { introCount++; renderIntroNames(); syncPool(); syncPace(); } });
  $('#fIntroBuyin').addEventListener('input', e => { introBuyin = Math.max(0, +e.target.value || 0); syncPool(); });
  $('#fIntroRebuy').addEventListener('input', e => { introRebuy = Math.max(0, +e.target.value || 0); syncPool(); });
  $$('#paceIntro button').forEach(b => b.addEventListener('click', () => { introPace = +b.dataset.pace; syncPace(); }));
  $('#introGo').addEventListener('click', introStart);
  $('#introResume').addEventListener('click', introClose);
  $('#brandBtn').addEventListener('click', () => { setTab = 'tour'; syncTabs(); renderSettings(); openSheet('#setSheet'); });
  $('#btnCalc').addEventListener('click', () => { renderCalc(); openSheet('#calcSheet'); });
  $('#btnShare').addEventListener('click', () => { renderShare(); openSheet('#shareSheet'); });
  $('#btnPodium').addEventListener('click', () => { renderPodium(); openSheet('#podSheet'); });
  $('#btnExport').addEventListener('click', exportImage);
  $('#calcClear').addEventListener('click', () => { calc.board = []; calc.hands = [[], []]; calc.sel = null; renderCalc(); });

  $('#btnFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast('Plein écran indisponible'));
  });

  $('#btnTvExit').addEventListener('click', () => setTv(false));

  /* en mode télé, un appui n'importe où ramène les commandes */
  $('#app').addEventListener('pointerdown', () => { if (state.tv) showChrome(); }, true);

  $$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
  $('#scrim').addEventListener('click', closeSheets);

  $$('#setTabs .tab').forEach(t => t.addEventListener('click', () => {
    setTab = t.dataset.tab; syncTabs(); renderSettings();
  }));

  /* sièges */
  $('#seats').addEventListener('click', (e) => {
    const s = e.target.closest('[data-seat]');
    if (!s || spectate) return;
    openPop(+s.dataset.seat, s);
  });
  $('#pop').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || popFor === null) return;
    const k = popFor, p = state.players[k];
    const act = b.dataset.act;
    if (act === 'out')    eliminate(k);
    if (act === 'back')   { p.out = false; p.place = null; save(); renderAll(); toast(p.name + ' revient en jeu'); }
    if (act === 'rebuy')  { p.rebuys++; save(); renderAll(); toast('Recave de ' + p.name + ' · pool ' + euro(prizePool())); }
    if (act === 'deal')   { state.dealer = k; save(); renderSeats(); toast('Bouton sur ' + p.name); }
    if (act === 'moveL')  swapSeats(k, (k - 1 + state.players.length) % state.players.length);
    if (act === 'moveR')  swapSeats(k, (k + 1) % state.players.length);
    if (act === 'rename') {
      const v = prompt('Nom du joueur', p.name);
      if (v) { p.name = v.slice(0, 18); save(); renderAll(); }
    }
    closePop();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#pop') && !e.target.closest('[data-seat]')) closePop();
  }, true);

  /* clavier */
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space')      { e.preventDefault(); play(!state.running); }
    if (e.code === 'ArrowRight') goLevel(state.i + 1, true);
    if (e.code === 'ArrowLeft')  goLevel(state.i - 1, true);
    if (e.code === 'Escape')     closeSheets();
  });

  /* déverrouillage du son au premier contact */
  const unlock = () => { audio(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);

  /* le spectateur demande une photo de l'état */
  const c = channel();
  if (c) c.onmessage = (e) => { if (e.data && e.data.t === 'hello') { lastBc = 0; broadcast(); } };
}

function syncTabs() {
  $$('#setTabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === setTab));
}

/* ===========================================================
   DÉMARRAGE
   =========================================================== */
(function boot() {
  const code = new URLSearchParams(location.search).get('v');
  if (code) {
    bootSpectator(code.toUpperCase());
    $('#btnCalc').addEventListener('click', () => { renderCalc(); openSheet('#calcSheet'); });
    $$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
    $('#scrim').addEventListener('click', closeSheets);
    $('#calcClear').addEventListener('click', () => { calc.board = []; calc.hands = [[], []]; calc.sel = null; renderCalc(); });
    $('#btnFull').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    setInterval(() => {}, 1000);
    return;
  }
  load();
  wire();
  syncTabs();
  renderAll();
  if (state.started) introClose(); else introOpen();
  document.body.classList.toggle('tv', !!state.tv);
  showChrome();
  setInterval(tick, 200);
  setInterval(broadcast, 1000);
  let rsT = null;
  addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(renderSeats, 150); });
  /* mode hors-ligne une fois l'app ouverte une première fois */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sans importance */ });
  }
})();
