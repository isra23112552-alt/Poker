// Card table (Poker + Blackjack vs bot) — single file, no dependencies. Run: node server.js
const http = require("http");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
// ---------- Front-end (single page, embedded) ----------
const INDEX = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Poker Table</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,sans-serif;background:#0b5d34;color:#fff;padding:16px;min-height:100vh}
h1{text-align:center;margin:8px 0 16px}
.panel{max-width:420px;margin:0 auto;background:#0a4a2a;padding:16px;border-radius:12px}
label{display:block;margin:12px 0 4px;font-size:14px;opacity:.85}
input,select{width:100%;padding:10px;font-size:16px;border-radius:8px;border:0}
button{padding:10px 14px;font-size:15px;border:0;border-radius:8px;cursor:pointer;background:#e8e8e8;margin:4px 4px 0 0}
.tabs{display:flex;gap:8px;margin-top:14px}
.tabs button{flex:1;margin:0}
.tabs .on{background:#f2c94c;font-weight:700}
.go{background:#f2c94c;font-weight:700}
.panel .go{width:100%;margin-top:16px}
.err{color:#ffb4b4;min-height:1em}
.wrap{max-width:900px;margin:0 auto}
.bar{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center}
.board{display:flex;gap:8px;justify-content:center;margin:16px 0;flex-wrap:wrap}
.card{width:56px;height:80px;background:#fff;color:#111;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:18px;font-weight:700;box-shadow:0 2px 6px #0007}
.card b{font-size:26px}
.card.red{color:#d00}
.card.back{background:repeating-linear-gradient(45deg,#2b4a9e,#2b4a9e 6px,#1d3577 6px,#1d3577 12px);border:2px solid #fff}
.card.empty{background:#ffffff18;box-shadow:none;border:2px dashed #ffffff55}
.seats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.seat{background:#0a4a2a;border-radius:12px;padding:10px;text-align:center;border:2px solid transparent}
.seat.me{border-color:#f2c94c}
.seat.win{border-color:#4cf28a;background:#0f6b3a}
.seat.folded{opacity:.5}
.seat.empty{opacity:.4}
.seat .cards{display:flex;gap:6px;justify-content:center;margin:8px 0;min-height:80px}
.nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sub{font-size:13px;min-height:1.2em}
.ctl{margin-top:16px;text-align:center}
.kick{font-size:12px;padding:4px 8px;background:#a33;color:#fff}
.link{font-size:13px;word-break:break-all;opacity:.9;margin-top:6px}
.dealer{background:#0a4a2a;border-radius:12px;padding:10px;text-align:center;margin:12px 0}
.dealer .cards{display:flex;gap:6px;justify-content:center;margin:8px 0;min-height:80px}
.seat.turn{border-color:#fff}
button:disabled{opacity:.4;cursor:default}
.chips{font-size:13px;opacity:.9}
</style>
</head>
<body>
<div id="app"></div>
<script>
const app = document.getElementById("app");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const val = (id) => document.getElementById(id).value.trim();
let session = null, last = "", timer = null, role = "dealer", game = "poker";
try { session = JSON.parse(localStorage.getItem("poker_session") || "null"); } catch (e) {}
function save() {
  try { session ? localStorage.setItem("poker_session", JSON.stringify(session)) : localStorage.removeItem("poker_session"); } catch (e) {}
}
async function api(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch (e) { return { error: "Network error" }; }
}

// ---------- Home ----------
function renderHome(msg) {
  clearTimeout(timer);
  last = "";
  const pre = new URLSearchParams(location.search).get("room") || "";
  const joinOnly = !!pre;
  if (joinOnly) role = "player";
  const bj = game === "blackjack";
  let opts = "";
  for (let n = 2; n <= 8; n++) opts += \`<option value="\${n}" \${n === 8 ? "selected" : ""}>\${n} players</option>\`;
  let form;
  if (role === "dealer") {
    form = bj
      ? \`<p style="font-size:14px;opacity:.85">Play against the bot dealer. Max 2 players per table. Everyone starts with 1000 chips.</p>
         <button class="go" onclick="createRoom()">Create table</button>\`
      : \`<label>Seats at the table (2–8)</label><select id="max">\${opts}</select>
         <button class="go" onclick="createRoom()">Create room</button>\`;
  } else {
    form = \`<label>Room code</label>
         <input id="code" maxlength="4" value="\${esc(pre)}" placeholder="ABCD" style="text-transform:uppercase">
         <button class="go" onclick="joinRoom()">Join</button>\`;
  }
  const tabs = joinOnly ? "" : \`
    <div class="tabs">
      <button class="\${!bj ? "on" : ""}" onclick="setGame('poker')">♠ Poker</button>
      <button class="\${bj ? "on" : ""}" onclick="setGame('blackjack')">🃏 Blackjack</button>
    </div>
    <div class="tabs">
      <button class="\${role === "dealer" ? "on" : ""}" onclick="setRole('dealer')">\${bj ? "Create table" : "I'm the Dealer"}</button>
      <button class="\${role === "player" ? "on" : ""}" onclick="setRole('player')">\${bj ? "Join table" : "I'm a Player"}</button>
    </div>\`;
  app.innerHTML = \`
  <h1>♠ Card Table ♥</h1>
  <div class="panel">
    <label>Your name</label>
    <input id="name" maxlength="16" placeholder="e.g. Alex">
    \${tabs}
    \${form}
    <p class="err" id="err">\${esc(msg || "")}</p>
  </div>\`;
}
function keepName(fn) {
  const n = document.getElementById("name").value;
  fn();
  renderHome();
  document.getElementById("name").value = n;
}
function setRole(r) { keepName(() => { role = r; }); }
function setGame(g) { keepName(() => { game = g; role = "dealer"; }); }
function showErr(m) { document.getElementById("err").textContent = m; }
async function createRoom() {
  const r = await api("/api/create", { name: val("name"), mode: game, max: game === "poker" ? val("max") : 2 });
  if (r.error) return showErr(r.error);
  startSession(r.code, r.token);
}
async function joinRoom() {
  const r = await api("/api/join", { name: val("name"), code: val("code").toUpperCase() });
  if (r.error) return showErr(r.error);
  startSession(r.code, r.token);
}
function startSession(code, token) {
  session = { code, token };
  save();
  history.replaceState(null, "", "/");
  poll();
}

// ---------- Room ----------
async function poll() {
  clearTimeout(timer);
  if (!session) return renderHome();
  try {
    const r = await fetch("/api/state?code=" + encodeURIComponent(session.code) + "&token=" + encodeURIComponent(session.token));
    if (r.status === 404 || r.status === 403) {
      session = null; save();
      return renderHome("Room closed, or you were removed from it.");
    }
    const txt = await r.text();
    if (txt !== last) { last = txt; renderRoom(JSON.parse(txt)); }
  } catch (e) {}
  timer = setTimeout(poll, 1500);
}
async function act(action, extra) {
  const r = await api("/api/action", Object.assign({ code: session.code, token: session.token, action }, extra || {}));
  if (r.error) alert(r.error);
  poll();
}
function kick(seat) { if (confirm("Remove this player?")) act("kick", { seat }); }
function closeRoom() { if (confirm("Close the room for everyone?")) act("close"); }
async function leaveRoom() {
  if (!confirm("Leave the table?")) return;
  await api("/api/action", { code: session.code, token: session.token, action: "leave" });
  session = null; save(); renderHome();
}
function copyLink(code) {
  const link = location.origin + "/?room=" + code;
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => alert("Link copied!"), () => prompt("Copy this link:", link));
  else prompt("Copy this link:", link);
}
function cardHtml(c) {
  if (!c) return '<div class="card back"></div>';
  const red = c.s === "♥" || c.s === "♦";
  return \`<div class="card \${red ? "red" : ""}"><span>\${esc(c.r)}</span><b>\${esc(c.s)}</b></div>\`;
}

function renderRoom(s) {
  if (s.mode === "blackjack") return renderBJ(s);
  const PH = { waiting: "Waiting for the dealer", preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };
  const inHand = ["preflop", "flop", "turn", "river"].includes(s.phase);
  const me = s.players.find((p) => p.you);

  let board = "";
  for (let i = 0; i < 5; i++) board += s.community[i] ? cardHtml(s.community[i]) : '<div class="card empty"></div>';

  const bySeat = {};
  s.players.forEach((p) => (bySeat[p.seat] = p));
  let seats = "";
  for (let i = 0; i < s.max; i++) {
    const p = bySeat[i];
    if (!p) {
      seats += \`<div class="seat empty"><div class="nm">Seat \${i + 1}</div><div class="sub">Empty</div></div>\`;
      continue;
    }
    const cls = ["seat"];
    if (p.you) cls.push("me");
    if (p.folded) cls.push("folded");
    if (p.winner) cls.push("win");
    const sub = p.handName || (p.folded ? "Folded" : (!p.inHand && inHand ? "Waiting for next hand" : ""));
    seats += \`<div class="\${cls.join(" ")}">
      <div class="nm">\${esc(p.name)}\${p.you ? " (you)" : ""}</div>
      <div class="cards">\${p.cards.map(cardHtml).join("")}</div>
      <div class="sub">\${p.winner ? "🏆 " : ""}\${esc(sub)}</div>
      \${s.role === "dealer" ? \`<button class="kick" onclick="kick(\${p.seat})">Kick</button>\` : ""}
    </div>\`;
  }

  let ctl = "";
  if (s.role === "dealer") {
    let label, action;
    if (!inHand) { label = s.phase === "waiting" ? "Deal hand" : "New hand"; action = "deal"; }
    else if (s.contenders <= 1 || s.phase === "river") { label = "Showdown"; action = "showdown"; }
    else { label = "Deal " + { preflop: "flop", flop: "turn", turn: "river" }[s.phase]; action = "next"; }
    ctl = \`<button class="go" onclick="act('\${action}')">\${label}</button>\`;
    if (inHand) ctl += \`<button onclick="act('deal')">Reshuffle and redeal</button>\`;
    ctl += \`<button onclick="closeRoom()">Close room</button>\`;
  } else {
    if (me && inHand && me.inHand && !me.folded) ctl += \`<button class="go" onclick="act('fold')">Fold</button>\`;
    ctl += \`<button onclick="leaveRoom()">Leave table</button>\`;
  }

  app.innerHTML = \`<div class="wrap">
    <div class="bar">
      <div><b>Room \${esc(s.code)}</b> · \${s.players.length}/\${s.max} seated · Dealer: \${esc(s.dealerName)}</div>
      <div><button onclick="copyLink('\${esc(s.code)}')">Copy invite link</button></div>
    </div>
    <h2 style="text-align:center;margin:12px 0 0">\${PH[s.phase]}</h2>
    <div class="board">\${board}</div>
    <div class="seats">\${seats}</div>
    <div class="ctl">\${ctl}</div>
  </div>\`;
}

function renderBJ(s) {
  const me = s.players.find((p) => p.you);
  const PH = { betting: "Place your bets", playing: "Players' turns", settle: "Round over" };
  const dc = s.dealer.cards.length ? s.dealer.cards.map(cardHtml).join("") : '<div class="card empty"></div><div class="card empty"></div>';
  const bySeat = {};
  s.players.forEach((p) => (bySeat[p.seat] = p));
  let seats = "";
  for (let i = 0; i < 2; i++) {
    const p = bySeat[i];
    if (!p) {
      seats += \`<div class="seat empty"><div class="nm">Seat \${i + 1}</div><div class="sub">Waiting for a player…</div></div>\`;
      continue;
    }
    const cls = ["seat"];
    if (p.you) cls.push("me");
    if (p.turn) cls.push("turn");
    if (s.phase === "settle" && p.delta > 0) cls.push("win");
    if (p.status === "bust") cls.push("folded");
    let sub = "";
    if (s.phase === "settle" && p.status !== "idle") sub = p.result + (p.delta > 0 ? " +" + p.delta : p.delta < 0 ? " " + p.delta : "");
    else if (p.status === "stand") sub = "Stands";
    else if (p.status === "bust") sub = "Bust";
    else if (p.status === "blackjack") sub = "Blackjack!";
    else if (p.turn) sub = p.you ? "Your turn" : "Thinking…";
    else if (s.phase === "betting") sub = p.bet > 0 ? "Bet placed" : "Choosing a bet…";
    else sub = "Joins next round";
    seats += \`<div class="\${cls.join(" ")}">
      <div class="nm">\${esc(p.name)}\${p.you ? " (you)" : ""}</div>
      <div class="chips">💰 \${p.chips}\${p.bet ? " · Bet " + p.bet : ""}</div>
      <div class="cards">\${p.cards.map(cardHtml).join("")}</div>
      <div class="sub">\${p.value !== null ? "Total " + p.value + " · " : ""}\${esc(sub)}</div>
      \${p.rebuy && s.phase === "betting" ? '<div class="sub">Out of chips — reset to 1000</div>' : ""}
    </div>\`;
  }

  let ctl = "";
  if (me) {
    if (s.phase === "betting") {
      if (me.bet === 0) {
        ctl += "<div>Choose your bet</div>";
        [10, 50, 100, 250].forEach((a) => {
          ctl += \`<button class="go" \${me.chips < a ? "disabled" : ""} onclick="act('bet',{amount:\${a}})">\${a}</button>\`;
        });
      } else ctl += "<div>Waiting for the other player to bet…</div>";
    } else if (s.phase === "playing") {
      if (me.turn) {
        ctl += \`<button class="go" onclick="act('hit')">Hit</button><button class="go" onclick="act('stand')">Stand</button>\`;
        if (me.canDouble) ctl += \`<button onclick="act('double')">Double down</button>\`;
      } else ctl += "<div>Waiting for the other player…</div>";
    } else if (s.phase === "settle") {
      ctl += \`<button class="go" onclick="act('next')">Next round</button>\`;
    }
  }
  ctl += \`<div><button onclick="leaveRoom()">Leave table</button></div>\`;

  app.innerHTML = \`<div class="wrap">
    <div class="bar">
      <div><b>Blackjack \${esc(s.code)}</b> · \${s.players.length}/2 players</div>
      <div><button onclick="copyLink('\${esc(s.code)}')">Copy invite link</button></div>
    </div>
    <h2 style="text-align:center;margin:12px 0 0">\${PH[s.phase]}</h2>
    <div class="dealer">
      <div class="nm">🤖 Dealer Bot</div>
      <div class="cards">\${dc}</div>
      <div class="sub">\${s.dealer.value !== null ? "Total " + s.dealer.value + (s.dealer.value > 21 ? " · Bust" : "") : s.dealer.cards.length ? "One card hidden" : ""}</div>
    </div>
    <div class="seats">\${seats}</div>
    <div class="ctl">\${ctl}</div>
  </div>\`;
}

if (session) poll(); else renderHome();
</script>
</body>
</html>
`;

// ---------- Cards ----------
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RV = {};
RANKS.forEach((r, i) => (RV[r] = i + 2));

function freshCards() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s }); // 52 cards, no jokers
  return deck;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const newDeck = () => shuffle(freshCards());
const newShoe = () => shuffle([...freshCards(), ...freshCards(), ...freshCards(), ...freshCards()]); // 4 decks

// ---------- Hand evaluation ----------
const HAND_NAMES = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];

function eval5(cs) {
  const vals = cs.map((c) => RV[c.r]).sort((a, b) => b - a);
  const flush = cs.every((c) => c.s === cs[0].s);
  let straightHigh = 0;
  if (new Set(vals).size === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const cnt = {};
  vals.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
  const groups = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a);
  const shape = groups.map((v) => cnt[v]).join("");
  if (straightHigh && flush) return [8, straightHigh];
  if (shape === "41") return [7, ...groups];
  if (shape === "32") return [6, ...groups];
  if (flush) return [5, ...vals];
  if (straightHigh) return [4, straightHigh];
  if (shape === "311") return [3, ...groups];
  if (shape === "221") return [2, ...groups];
  if (shape === "2111") return [1, ...groups];
  return [0, ...vals];
}

function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

function combos(arr, k, start = 0, cur = [], out = []) {
  if (cur.length === k) {
    out.push(cur.slice());
    return out;
  }
  for (let i = start; i < arr.length; i++) {
    cur.push(arr[i]);
    combos(arr, k, i + 1, cur, out);
    cur.pop();
  }
  return out;
}

function bestHand(cards) {
  let best = null;
  for (const c of combos(cards, 5)) {
    const s = eval5(c);
    if (!best || cmp(s, best) > 0) best = s;
  }
  return best;
}

function handName(score) {
  return score[0] === 8 && score[1] === 14 ? "Royal flush" : HAND_NAMES[score[0]];
}

// ---------- Rooms ----------
const rooms = new Map();
const IN_HAND = ["preflop", "flop", "turn", "river"];

function makeCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += letters[crypto.randomInt(letters.length)];
    if (!rooms.has(code)) return code;
  }
}

const clean = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 16);
const getRoom = (code) => rooms.get(String(code || "").toUpperCase());
const contenders = (room) => room.players.filter((p) => p.inHand && !p.folded);

function auth(room, token) {
  if (!room || !token) return null;
  if (room.dealer.token === token) return { role: "dealer" };
  const p = room.players.find((x) => x.token === token);
  return p ? { role: "player", p } : null;
}

function stateFor(room, a) {
  const show = room.phase === "showdown" && room.results && !room.results.byFold;
  const players = room.players
    .slice()
    .sort((x, y) => x.seat - y.seat)
    .map((p) => {
      const mine = a.role === "player" && a.p === p;
      const revealed = show && p.inHand && !p.folded;
      let cards = [];
      if (p.inHand) cards = mine || revealed ? p.cards : [null, null];
      const winner = room.phase === "showdown" && room.results && room.results.winners.includes(p.seat);
      let name = null;
      if (room.phase === "showdown" && room.results && winner) {
        name = room.results.byFold ? "Last player standing" : room.results.names[p.seat];
      } else if (revealed) name = room.results.names[p.seat];
      return { seat: p.seat, name: p.name, you: mine, inHand: p.inHand, folded: p.folded, cards, winner: !!winner, handName: name };
    });
  return {
    mode: "poker",
    code: room.code,
    role: a.role,
    max: room.max,
    dealerName: room.dealer.name,
    phase: room.phase,
    community: room.community,
    contenders: contenders(room).length,
    players,
  };
}

function showdown(room) {
  const cont = contenders(room);
  const results = { winners: [], names: {}, byFold: false };
  if (cont.length === 1) {
    results.winners = [cont[0].seat];
    results.byFold = true;
  } else {
    let best = null;
    for (const p of cont) {
      const sc = bestHand([...p.cards, ...room.community]);
      results.names[p.seat] = handName(sc);
      if (!best || cmp(sc, best) > 0) {
        best = sc;
        results.winners = [p.seat];
      } else if (cmp(sc, best) === 0) results.winners.push(p.seat);
    }
  }
  room.results = results;
  room.phase = "showdown";
}

function handleAction(room, a, body) {
  const act = body.action;
  if (a.role === "player") {
    const p = a.p;
    if (act === "fold") {
      if (!IN_HAND.includes(room.phase) || !p.inHand || p.folded) return "You can't fold now";
      p.folded = true;
      return null;
    }
    if (act === "leave") {
      room.players = room.players.filter((x) => x !== p);
      return null;
    }
    return "Not allowed";
  }
  // dealer actions
  if (act === "deal") {
    if (room.players.length < 2) return "Need at least 2 players seated";
    room.deck = newDeck();
    room.community = [];
    room.results = null;
    for (const p of room.players) {
      p.cards = [room.deck.pop(), room.deck.pop()];
      p.inHand = true;
      p.folded = false;
    }
    room.phase = "preflop";
    return null;
  }
  if (act === "next") {
    const n = { preflop: 3, flop: 1, turn: 1 }[room.phase];
    if (!n) return "Nothing to deal now";
    room.deck.pop(); // burn card
    for (let i = 0; i < n; i++) room.community.push(room.deck.pop());
    room.phase = { preflop: "flop", flop: "turn", turn: "river" }[room.phase];
    return null;
  }
  if (act === "showdown") {
    if (!IN_HAND.includes(room.phase)) return "No hand in progress";
    const c = contenders(room).length;
    if (c === 0) return "No players left in the hand";
    if (c > 1 && room.community.length < 5) return "Deal the river first";
    showdown(room);
    return null;
  }
  if (act === "kick") {
    room.players = room.players.filter((x) => x.seat !== body.seat);
    return null;
  }
  if (act === "close") {
    rooms.delete(room.code);
    return null;
  }
  return "Unknown action";
}

// ---------- Blackjack (bot dealer, max 2 players) ----------
const BJ_BETS = [10, 50, 100, 250];

function bjValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === "A") { aces++; total += 11; }
    else if (["10", "J", "Q", "K"].includes(c.r)) total += 10;
    else total += parseInt(c.r, 10);
  }
  while (total > 21 && aces) { total -= 10; aces--; }
  return total;
}
const bjNatural = (cards) => cards.length === 2 && bjValue(cards) === 21;
const bjSorted = (room) => room.players.slice().sort((a, b) => a.seat - b.seat);
function bjDraw(room) {
  if (!room.shoe.length) room.shoe = newShoe();
  return room.shoe.pop();
}

function newBjRoom() {
  return { mode: "blackjack", code: makeCode(), max: 2, players: [], phase: "betting", shoe: newShoe(), dealerCards: [], turn: -1, updated: Date.now() };
}

function bjAddPlayer(room, name) {
  let seat = 0;
  while (room.players.some((p) => p.seat === seat)) seat++;
  const p = { token: crypto.randomUUID(), name: name || "Player " + (seat + 1), seat, chips: 1000, bet: 0, cards: [], status: "idle", result: "", delta: 0, rebuy: false };
  room.players.push(p);
  return p;
}

function bjTryStart(room) {
  if (room.phase !== "betting" || !room.players.length) return;
  if (!room.players.every((p) => p.bet > 0)) return;
  if (room.shoe.length < 40) room.shoe = newShoe();
  room.dealerCards = [];
  const ps = bjSorted(room);
  for (const p of ps) { p.cards = []; p.status = "playing"; p.result = ""; p.delta = 0; }
  for (let i = 0; i < 2; i++) {
    for (const p of ps) p.cards.push(bjDraw(room));
    room.dealerCards.push(bjDraw(room));
  }
  room.phase = "playing";
  for (const p of ps) if (bjNatural(p.cards)) p.status = "blackjack";
  if (bjNatural(room.dealerCards)) bjSettle(room);
  else bjAdvance(room);
}

function bjAdvance(room) {
  const ps = bjSorted(room);
  const next = ps.find((p) => p.status === "playing");
  if (next) { room.turn = next.seat; return; }
  // dealer bot plays only if someone is still standing (not bust / not blackjack)
  if (ps.some((p) => p.status === "stand")) {
    while (bjValue(room.dealerCards) < 17) room.dealerCards.push(bjDraw(room)); // stands on all 17s
  }
  bjSettle(room);
}

function bjSettle(room) {
  const dv = bjValue(room.dealerCards);
  const dealerNat = bjNatural(room.dealerCards);
  const dealerBust = dv > 21;
  for (const p of room.players) {
    if (p.status === "idle") continue;
    const pv = bjValue(p.cards);
    let back = 0; // chips returned to the player (bet was already taken)
    if (p.status === "bust") { p.result = "Bust"; p.delta = -p.bet; }
    else if (p.status === "blackjack") {
      if (dealerNat) { back = p.bet; p.result = "Push"; p.delta = 0; }
      else { const win = Math.floor(p.bet * 1.5); back = p.bet + win; p.result = "Blackjack!"; p.delta = win; }
    }
    else if (dealerNat) { p.result = "Dealer blackjack"; p.delta = -p.bet; }
    else if (dealerBust || pv > dv) { back = p.bet * 2; p.result = "Win"; p.delta = p.bet; }
    else if (pv === dv) { back = p.bet; p.result = "Push"; p.delta = 0; }
    else { p.result = "Lose"; p.delta = -p.bet; }
    p.chips += back;
  }
  room.phase = "settle";
  room.turn = -1;
}

function bjAction(room, p, body) {
  const act = body.action;
  if (act === "leave") {
    room.players = room.players.filter((x) => x !== p);
    if (!room.players.length) { rooms.delete(room.code); return null; }
    if (room.phase === "betting") bjTryStart(room);
    else if (room.phase === "playing") bjAdvance(room);
    return null;
  }
  if (act === "bet") {
    const amt = parseInt(body.amount, 10);
    if (room.phase !== "betting") return "Betting is closed";
    if (p.bet > 0) return "You already placed a bet";
    if (!BJ_BETS.includes(amt) || p.chips < amt) return "Invalid bet";
    p.chips -= amt;
    p.bet = amt;
    bjTryStart(room);
    return null;
  }
  if (act === "next") {
    if (room.phase !== "settle") return "The round isn't over yet";
    for (const q of room.players) {
      q.bet = 0; q.cards = []; q.status = "idle"; q.result = ""; q.delta = 0;
      q.rebuy = q.chips < BJ_BETS[0];
      if (q.rebuy) q.chips = 1000;
    }
    room.dealerCards = [];
    room.phase = "betting";
    return null;
  }
  if (room.phase !== "playing" || room.turn !== p.seat || p.status !== "playing") return "It's not your turn";
  if (act === "hit") {
    p.cards.push(bjDraw(room));
    const v = bjValue(p.cards);
    if (v > 21) p.status = "bust";
    else if (v === 21) p.status = "stand";
  } else if (act === "stand") {
    p.status = "stand";
  } else if (act === "double") {
    if (p.cards.length !== 2 || p.chips < p.bet) return "You can't double down now";
    p.chips -= p.bet;
    p.bet *= 2;
    p.cards.push(bjDraw(room));
    p.status = bjValue(p.cards) > 21 ? "bust" : "stand";
  } else return "Unknown action";
  if (p.status !== "playing") bjAdvance(room);
  return null;
}

function bjState(room, me) {
  const revealed = room.phase === "settle";
  return {
    mode: "blackjack",
    code: room.code,
    max: 2,
    phase: room.phase,
    dealer: { cards: room.dealerCards.map((c, i) => (i === 1 && !revealed ? null : c)), value: revealed ? bjValue(room.dealerCards) : null },
    players: bjSorted(room).map((p) => {
      const turn = room.phase === "playing" && room.turn === p.seat && p.status === "playing";
      return {
        seat: p.seat, name: p.name, you: p === me, chips: p.chips, bet: p.bet, cards: p.cards,
        value: p.cards.length ? bjValue(p.cards) : null,
        status: p.status, result: p.result, delta: p.delta, rebuy: p.rebuy, turn,
        canDouble: p === me && turn && p.cards.length === 2 && p.chips >= p.bet,
      };
    }),
  };
}

// ---------- HTTP ----------
function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > 10000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(d || "{}"));
      } catch (e) {
        resolve({});
      }
    });
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(INDEX);
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const room = getRoom(url.searchParams.get("code"));
      if (!room) return send(res, 404, { error: "Room not found" });
      if (room.mode === "blackjack") {
        const bp = room.players.find((x) => x.token === url.searchParams.get("token"));
        if (!bp) return send(res, 403, { error: "Not in this room" });
        room.updated = Date.now();
        return send(res, 200, bjState(room, bp));
      }
      const a = auth(room, url.searchParams.get("token"));
      if (!a) return send(res, 403, { error: "Not in this room" });
      room.updated = Date.now();
      return send(res, 200, stateFor(room, a));
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      if (url.pathname === "/api/create") {
        if (body.mode === "blackjack") {
          const room = newBjRoom();
          const p = bjAddPlayer(room, clean(body.name));
          rooms.set(room.code, room);
          return send(res, 200, { code: room.code, token: p.token });
        }
        const max = parseInt(body.max, 10);
        if (!(max >= 2 && max <= 8)) return send(res, 400, { error: "Max players must be 2-8" });
        const room = {
          mode: "poker",
          code: makeCode(),
          max,
          dealer: { token: crypto.randomUUID(), name: clean(body.name) || "Dealer" },
          players: [],
          phase: "waiting",
          deck: [],
          community: [],
          results: null,
          updated: Date.now(),
        };
        rooms.set(room.code, room);
        return send(res, 200, { code: room.code, token: room.dealer.token });
      }

      if (url.pathname === "/api/join") {
        const room = getRoom(body.code);
        if (!room) return send(res, 404, { error: "Room not found" });
        if (room.players.length >= room.max) return send(res, 400, { error: "Room is full" });
        if (room.mode === "blackjack") {
          const bp = bjAddPlayer(room, clean(body.name));
          room.updated = Date.now();
          return send(res, 200, { code: room.code, token: bp.token });
        }
        let seat = 0;
        while (room.players.some((p) => p.seat === seat)) seat++;
        const token = crypto.randomUUID();
        room.players.push({ token, name: clean(body.name) || "Player " + (seat + 1), seat, cards: [], inHand: false, folded: false });
        room.updated = Date.now();
        return send(res, 200, { code: room.code, token });
      }

      if (url.pathname === "/api/action") {
        const room = getRoom(body.code);
        if (!room) return send(res, 404, { error: "Room not found" });
        if (room.mode === "blackjack") {
          const bp = room.players.find((x) => x.token === body.token);
          if (!bp) return send(res, 403, { error: "Not in this room" });
          room.updated = Date.now();
          const berr = bjAction(room, bp, body);
          return berr ? send(res, 400, { error: berr }) : send(res, 200, { ok: true });
        }
        const a = auth(room, body.token);
        if (!a) return send(res, 403, { error: "Not in this room" });
        room.updated = Date.now();
        const err = handleAction(room, a, body);
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
    }

    send(res, 404, { error: "Not found" });
  })
  .listen(PORT, "0.0.0.0", () => console.log("Poker table running on port " + PORT));

// Delete rooms idle for 6 hours
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600 * 1000;
  for (const [code, r] of rooms) if (r.updated < cutoff) rooms.delete(code);
}, 10 * 60 * 1000);
