// Poker table server — no dependencies. Run: node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, "index.html"));

// ---------- Cards ----------
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RV = {};
RANKS.forEach((r, i) => (RV[r] = i + 2));

function newDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s }); // 52 cards, no jokers
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

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
      const a = auth(room, url.searchParams.get("token"));
      if (!a) return send(res, 403, { error: "Not in this room" });
      room.updated = Date.now();
      return send(res, 200, stateFor(room, a));
    }

    if (req.method === "POST") {
      const body = await readBody(req);

      if (url.pathname === "/api/create") {
        const max = parseInt(body.max, 10);
        if (!(max >= 2 && max <= 8)) return send(res, 400, { error: "Max players must be 2-8" });
        const room = {
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
