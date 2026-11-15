/* ============================================================
   poker.js — moteur de cartes : évaluation de mains et équités
   Aucune dépendance. Une carte = un entier 0..51.
   ============================================================ */
'use strict';

const RANK_CH   = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'V',12:'D',13:'R',14:'A'};
const RANK_ONE  = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'Valet',12:'Dame',13:'Roi',14:'As'};
const RANK_MANY = {2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'Valets',12:'Dames',13:'Rois',14:'As'};
const SUIT_CH   = ['♠','♥','♦','♣'];      // pique coeur carreau trefle
const SUIT_NAME = ['pique','cœur','carreau','trèfle'];
const SUIT_RED  = [false, true, true, false];

const card      = (r, s) => (r - 2) * 4 + s;
const cardRank  = (c) => (c >> 2) + 2;
const cardSuit  = (c) => c & 3;
const cardText  = (c) => RANK_CH[cardRank(c)] + SUIT_CH[cardSuit(c)];

/* « au Roi », « à l'As », « à la Dame », « au 10 » */
function auRang(r) {
  if (r === 14) return "à l'As";
  if (r === 12) return 'à la Dame';
  return 'au ' + RANK_ONE[r];
}

/* ------------------------------------------------------------
   Évaluation d'une main de 5 cartes.
   Renvoie un entier : plus il est grand, plus la main est forte.
   Catégories : 9 quinte flush … 1 hauteur
   ------------------------------------------------------------ */
function eval5(c0, c1, c2, c3, c4) {
  const r = [cardRank(c0), cardRank(c1), cardRank(c2), cardRank(c3), cardRank(c4)];
  const s0 = cardSuit(c0);
  const flush = (cardSuit(c1) === s0 && cardSuit(c2) === s0 && cardSuit(c3) === s0 && cardSuit(c4) === s0);
  r.sort((a, b) => b - a);

  /* groupes { rang, nombre } triés par nombre puis par rang */
  const g = [];
  for (let i = 0; i < 5; i++) {
    let found = false;
    for (const x of g) if (x.r === r[i]) { x.n++; found = true; break; }
    if (!found) g.push({ r: r[i], n: 1 });
  }
  g.sort((a, b) => (b.n - a.n) || (b.r - a.r));

  /* suite (la roue A-2-3-4-5 compte comme hauteur 5) */
  let hi = 0;
  if (g.length === 5) {
    if (r[0] - r[4] === 4) hi = r[0];
    else if (r[0] === 14 && r[1] === 5) hi = 5;
  }

  let cat, tb;
  if (flush && hi)                      { cat = 9; tb = [hi]; }
  else if (g[0].n === 4)                { cat = 8; tb = [g[0].r, g[1].r]; }
  else if (g[0].n === 3 && g[1].n === 2){ cat = 7; tb = [g[0].r, g[1].r]; }
  else if (flush)                       { cat = 6; tb = r; }
  else if (hi)                          { cat = 5; tb = [hi]; }
  else if (g[0].n === 3)                { cat = 4; tb = [g[0].r, g[1].r, g[2].r]; }
  else if (g[0].n === 2 && g[1].n === 2){ cat = 3; tb = [g[0].r, g[1].r, g[2].r]; }
  else if (g[0].n === 2)                { cat = 2; tb = [g[0].r, g[1].r, g[2].r, g[3].r]; }
  else                                  { cat = 1; tb = r; }

  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 16 + (tb[i] || 0);
  return score;
}

/* les 21 combinaisons de 5 cartes parmi 7 */
const COMBOS_7_5 = (() => {
  const out = [];
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 4; b++)
      for (let c = b + 1; c < 5; c++)
        for (let d = c + 1; d < 6; d++)
          for (let e = d + 1; e < 7; e++) out.push([a, b, c, d, e]);
  return out;
})();

/* meilleure main de 5 parmi 7 (ou moins) */
function best(cards) {
  if (cards.length < 5) return { score: 0, cards: cards.slice() };
  if (cards.length === 5) return { score: eval5(...cards), cards: cards.slice() };
  let bestScore = -1, bestIdx = null;
  if (cards.length === 7) {
    for (let k = 0; k < 21; k++) {
      const i = COMBOS_7_5[k];
      const sc = eval5(cards[i[0]], cards[i[1]], cards[i[2]], cards[i[3]], cards[i[4]]);
      if (sc > bestScore) { bestScore = sc; bestIdx = i; }
    }
  } else { /* 6 cartes */
    const n = cards.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
      for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
        const sc = eval5(cards[a], cards[b], cards[c], cards[d], cards[e]);
        if (sc > bestScore) { bestScore = sc; bestIdx = [a, b, c, d, e]; }
      }
  }
  return { score: bestScore, cards: bestIdx.map(i => cards[i]) };
}

/* version rapide, sans retenir les cartes (pour les simulations) */
function bestScore7(c) {
  let m = -1;
  for (let k = 0; k < 21; k++) {
    const i = COMBOS_7_5[k];
    const sc = eval5(c[i[0]], c[i[1]], c[i[2]], c[i[3]], c[i[4]]);
    if (sc > m) m = sc;
  }
  return m;
}

/* ------------------------------------------------------------
   Nom de la main, en français
   ------------------------------------------------------------ */
function handName(cards5) {
  const score = eval5(...cards5);
  const cat = Math.floor(score / 16 ** 5);
  const r = cards5.map(cardRank).sort((a, b) => b - a);
  const g = [];
  for (const x of r) {
    const f = g.find(y => y.r === x);
    if (f) f.n++; else g.push({ r: x, n: 1 });
  }
  g.sort((a, b) => (b.n - a.n) || (b.r - a.r));

  let hi = r[0];
  if (cat === 5 || cat === 9) hi = (r[0] === 14 && r[1] === 5) ? 5 : r[0];

  switch (cat) {
    case 9: return hi === 14 ? 'Quinte flush royale' : 'Quinte flush ' + auRang(hi);
    case 8: return 'Carré de ' + RANK_MANY[g[0].r];
    case 7: return 'Full aux ' + RANK_MANY[g[0].r] + ' par les ' + RANK_MANY[g[1].r];
    case 6: return 'Couleur ' + auRang(r[0]);
    case 5: return 'Quinte ' + auRang(hi);
    case 4: return 'Brelan de ' + RANK_MANY[g[0].r];
    case 3: return 'Double paire, ' + RANK_MANY[g[0].r] + ' et ' + RANK_MANY[g[1].r];
    case 2: return 'Paire de ' + RANK_MANY[g[0].r];
    default: return 'Hauteur ' + RANK_ONE[r[0]];
  }
}

const CAT_SHORT = { 9: 'Quinte flush', 8: 'Carré', 7: 'Full', 6: 'Couleur', 5: 'Quinte', 4: 'Brelan', 3: 'Double paire', 2: 'Paire', 1: 'Hauteur' };

/* ------------------------------------------------------------
   Qui gagne ? board complet (5 cartes) → verdict exact
   ------------------------------------------------------------ */
function showdown(hands, board) {
  const res = hands.map((h, i) => {
    if (!h || h.length !== 2) return { i, valid: false };
    const b = best(h.concat(board));
    return { i, valid: true, score: b.score, cards: b.cards, name: handName(b.cards) };
  });
  const valid = res.filter(x => x.valid);
  if (!valid.length) return { res, winners: [] };
  const top = Math.max(...valid.map(x => x.score));
  const winners = valid.filter(x => x.score === top).map(x => x.i);
  for (const x of res) x.win = winners.includes(x.i);
  return { res, winners };
}

/* ------------------------------------------------------------
   Équités : board incomplet → chances de gagner de chacun
   Énumération exacte s'il manque 1 ou 2 cartes, sinon simulation.
   ------------------------------------------------------------ */
function equity(hands, board, iters) {
  iters = iters || 10000;
  const live = [];
  hands.forEach((h, i) => { if (h && h.length === 2) live.push({ i, h }); });
  if (live.length < 2) return null;

  const used = new Set(board);
  for (const p of live) { used.add(p.h[0]); used.add(p.h[1]); }
  const deck = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);

  const need = 5 - board.length;
  const eq = live.map(() => 0);
  const wins = live.map(() => 0);
  const ties = live.map(() => 0);
  let total = 0;

  const seven = new Array(7);
  const scores = new Array(live.length);

  const run = (add) => {
    for (let p = 0; p < live.length; p++) {
      seven[0] = live[p].h[0]; seven[1] = live[p].h[1];
      for (let k = 0; k < board.length; k++) seven[2 + k] = board[k];
      for (let k = 0; k < add.length; k++) seven[2 + board.length + k] = add[k];
      scores[p] = bestScore7(seven);
    }
    let top = -1;
    for (const s of scores) if (s > top) top = s;
    let n = 0;
    for (const s of scores) if (s === top) n++;
    for (let p = 0; p < live.length; p++) {
      if (scores[p] === top) {
        eq[p] += 1 / n;
        if (n === 1) wins[p]++; else ties[p]++;
      }
    }
    total++;
  };

  let exact = true;
  if (need === 0) run([]);
  else if (need === 1) { for (const c of deck) run([c]); }
  else if (need === 2) {
    for (let a = 0; a < deck.length; a++)
      for (let b = a + 1; b < deck.length; b++) run([deck[a], deck[b]]);
  } else {
    exact = false;
    const d = deck.slice();
    const add = new Array(need);
    for (let k = 0; k < iters; k++) {
      for (let i = 0; i < need; i++) {
        const j = i + ((Math.random() * (d.length - i)) | 0);
        const t = d[i]; d[i] = d[j]; d[j] = t;
        add[i] = d[i];
      }
      run(add);
    }
  }

  return live.map((p, k) => ({
    i: p.i,
    pct: (eq[k] / total) * 100,
    winPct: (wins[k] / total) * 100,
    tiePct: (ties[k] / total) * 100,
    exact
  }));
}
