import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { createGame, createInput, tickGame, COLORS } from "./src/gameCore.mjs";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const spawns = [
  { x: 1, y: 1 },
  { x: 13, y: 11 },
  { x: 1, y: 11 },
  { x: 13, y: 1 },
];

let game = createGame({ humans: 0, bots: 0, seed: Date.now() % 9999 });
const clients = new Map();
const inputs = {};
let nextClient = 1;
let endedAt = 0;

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const baseDir = requested.startsWith("/src/") ? ROOT : join(ROOT, "public");
  const filePath = normalize(join(baseDir, requested));

  if (!filePath.startsWith(baseDir) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
});

httpServer.on("upgrade", (req, socket) => {
  if (req.headers.upgrade?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));

  addClient(socket);
});

function send(socket, payload) {
  if (socket.destroyed) return;
  const data = Buffer.from(JSON.stringify(payload));
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;

    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }

    if (!masked || cursor + 4 + length > buffer.length) break;
    const mask = buffer.subarray(cursor, cursor + 4);
    cursor += 4;
    const payload = Buffer.alloc(length);
    for (let i = 0; i < length; i += 1) {
      payload[i] = buffer[cursor + i] ^ mask[i % 4];
    }
    cursor += length;
    offset = cursor;

    if (opcode === 0x8) {
      messages.push({ close: true });
    } else if (opcode === 0x1) {
      messages.push({ text: payload.toString("utf8") });
    }
  }
  return { messages, rest: buffer.subarray(offset) };
}

function addClient(socket) {
  if (clients.size >= 4) {
    send(socket, { type: "full" });
    socket.end();
    return;
  }

  const id = `p${nextClient++}`;
  const slot = clients.size;
  const spawn = spawns[slot];
  const player = {
    id,
    name: `Player ${slot + 1}`,
    bot: false,
    color: COLORS[slot],
    x: spawn.x,
    y: spawn.y,
    bombsMax: 1,
    power: 2,
    speed: 1,
    dir: "down",
    moveCooldown: 0,
    dropLatch: false,
    hasNeedle: true,
    needleUsed: false,
    needleGrace: 0,
    trapped: false,
    trapTimer: 0,
    dead: false,
    wins: 0,
  };

  game.players.push(player);
  clients.set(id, { socket, player });
  inputs[id] = createInput();
  send(socket, { type: "hello", playerId: id, color: player.color });
  syncLobbyState();

  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const decoded = decodeFrames(pending);
    pending = decoded.rest;
    for (const message of decoded.messages) {
      if (message.close) {
        socket.end();
        return;
      }
      handleMessage(id, message.text);
    }
  });
  socket.on("close", () => removeClient(id));
  socket.on("error", () => removeClient(id));
}

function handleMessage(id, text) {
  try {
    const message = JSON.parse(text);
    if (message.type === "input") {
      inputs[id] = {
        up: Boolean(message.input?.up),
        down: Boolean(message.input?.down),
        left: Boolean(message.input?.left),
        right: Boolean(message.input?.right),
        drop: Boolean(message.input?.drop),
      };
    }
    if (message.type === "restart") resetMatch();
  } catch {
    // Ignore malformed client messages.
  }
}

function removeClient(id) {
  const client = clients.get(id);
  if (!client) return;
  clients.delete(id);
  delete inputs[id];
  game.players = game.players.filter((player) => player.id !== id);
  if (clients.size === 0) {
    nextClient = 1;
    game = createGame({ humans: 0, bots: 0, seed: Date.now() % 9999 });
  }
  syncLobbyState();
}

function resetMatch() {
  const existing = [...clients.entries()];
  game = createGame({ humans: 0, bots: 0, seed: Date.now() % 9999 });
  for (const [index, [id, client]] of existing.entries()) {
    const spawn = spawns[index];
    client.player = {
      ...client.player,
      name: `Player ${index + 1}`,
      color: COLORS[index],
      x: spawn.x,
      y: spawn.y,
      bombsMax: 1,
      power: 2,
      speed: 1,
      dir: "down",
      moveCooldown: 0,
      dropLatch: false,
      hasNeedle: true,
      needleUsed: false,
      needleGrace: 0,
      trapped: false,
      trapTimer: 0,
      dead: false,
    };
    game.players.push(client.player);
    inputs[id] = createInput();
  }
  endedAt = 0;
  syncLobbyState();
}

function syncLobbyState() {
  if (clients.size < 2) {
    game.status = "waiting";
    game.winner = "Waiting for another player";
  } else if (game.status === "waiting") {
    game.status = "playing";
    game.winner = null;
  }
  broadcast({ type: "snapshot", game, playersOnline: clients.size });
}

function broadcast(payload) {
  for (const { socket } of clients.values()) send(socket, payload);
}

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(160, now - last);
  last = now;

  if (clients.size >= 2) {
    if (game.status === "waiting") {
      game.status = "playing";
      game.winner = null;
    }
    tickGame(game, inputs, dt);
  }

  if (game.status === "ended") {
    if (!endedAt) endedAt = now;
    if (now - endedAt > 6000) resetMatch();
  }

  broadcast({ type: "snapshot", game, playersOnline: clients.size });
}, 80);

httpServer.listen(PORT, () => {
  console.log(`Bubble Grid Arena running at http://localhost:${PORT}`);
});
