import {
  TILE,
  createGame,
  createInput,
  decideBotInput,
  tickGame,
} from "/src/gameCore.mjs";

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const singleBtn = document.querySelector("#singleBtn");
const multiBtn = document.querySelector("#multiBtn");
const restartBtn = document.querySelector("#restartBtn");
const connectBtn = document.querySelector("#connectBtn");
const modeLabel = document.querySelector("#modeLabel");
const statusLabel = document.querySelector("#statusLabel");
const timeLabel = document.querySelector("#timeLabel");
const onlineLabel = document.querySelector("#onlineLabel");
const needleStatus = document.querySelector("#needleStatus");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");

const tileSize = 48;
const keys = new Set();
let mode = "single";
let game = createGame({ humans: 1, bots: 3, seed: 24 });
let socket = null;
let playerId = "p1";
let playersOnline = 0;
let frame = 0;
let last = performance.now();
let lastSent = 0;
let audioUnlocked = false;
const visualPositions = new Map();
let previousCounts = {
  bombs: game.bombs.length,
  blasts: game.blasts.length,
  items: game.items.length,
};

const K = {
  single: "\uac1c\uc778\ud50c\ub808\uc774",
  multi: "\uba40\ud2f0\ud50c\ub808\uc774",
  connecting: "\uc5f0\uacb0 \uc911",
  connected: "\uc811\uc18d \uc644\ub8cc",
  connectedHelp: "\ub450 \uba85 \uc774\uc0c1 \uc811\uc18d\ud558\uba74 \uacbd\uae30\uac00 \uc2dc\uc791\ub429\ub2c8\ub2e4.",
  full: "\ubc29\uc774 \uac00\ub4dd \ucc3c\uc2b5\ub2c8\ub2e4",
  fullHelp: "\ucd5c\ub300 4\uba85\uae4c\uc9c0 \uc811\uc18d\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  closed: "\uc5f0\uacb0 \ub04a\uae40",
  closedHelp: "\uc11c\ubc84 \uc5f0\uacb0\uc744 \ub20c\ub7ec \ub2e4\uc2dc \uc811\uc18d\ud558\uc138\uc694.",
  failed: "\uc5f0\uacb0 \uc2e4\ud328",
  failedHelp: "\uc11c\ubc84\uac00 \uc2e4\ud589 \uc911\uc778\uc9c0 \ud655\uc778\ud558\uc138\uc694.",
  multiHelp: "\uc11c\ubc84 \uc5f0\uacb0\uc744 \ub204\ub974\uac70\ub098 \ub2e4\ub978 \ud0ed\uc5d0\uc11c \uac19\uc740 \uc8fc\uc18c\ub97c \uc5ec\uc138\uc694.",
  playing: "\uc9c4\ud589 \uc911",
  waiting: "\ub300\uae30 \uc911",
  ended: "\uc885\ub8cc",
  endedTitle: "\uacbd\uae30 \uc885\ub8cc",
  winner: "\uc2b9\uc790",
  waitingTitle: "\uc0c1\ub300 \ub300\uae30 \uc911",
  waitingHelp: "\ub2e4\ub978 \ube0c\ub77c\uc6b0\uc800\ub098 \ud0ed\uc5d0\uc11c \uac19\uc740 \uc8fc\uc18c\ub97c \uc5f4\uba74 \uc2dc\uc791\ub429\ub2c8\ub2e4.",
};

const itemColors = {
  bomb: "#27c5ff",
  power: "#ffd338",
  speed: "#45df78",
};

const playerSkins = [
  { body: "#2787ff", trim: "#ffe66c", hair: "#173b78", cheek: "#ff8fa3", hat: "cap" },
  { body: "#ff5d6c", trim: "#fff1b5", hair: "#66321e", cheek: "#ffb0c0", hat: "ribbon" },
  { body: "#2fd477", trim: "#d7ffe5", hair: "#145c39", cheek: "#ffc0a4", hat: "sprout" },
  { body: "#ffc839", trim: "#fff6cb", hair: "#8a541c", cheek: "#ff9fa7", hat: "goggles" },
];

const playerCharacterSheet = new Image();
playerCharacterSheet.src = "/assets/generated-characters/sailor-direction-sheet-transparent.png";
const rivalCharacterSheet = new Image();
rivalCharacterSheet.src = "/assets/generated-characters/rival-direction-sheet-transparent.png";
const characterFrames = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

const sounds = {
  drop: new Audio("/assets/sounds/water-bubble.ogg"),
  splash: new Audio("/assets/sounds/water-splash.ogg"),
  pop: new Audio("/assets/sounds/bubble-pop.ogg"),
  click: new Audio("/assets/sounds/ui-click.ogg"),
  item: new Audio("/assets/sounds/item-confirm.ogg"),
};

for (const sound of Object.values(sounds)) {
  sound.preload = "auto";
  sound.volume = 0.42;
}
sounds.splash.volume = 0.34;

function unlockAudio() {
  audioUnlocked = true;
}

function playSfx(name) {
  if (!audioUnlocked) return;
  const source = sounds[name];
  if (!source) return;
  const sound = source.cloneNode();
  sound.volume = source.volume;
  sound.play().catch(() => {});
}

function rememberCounts() {
  previousCounts = {
    bombs: game.bombs.length,
    blasts: game.blasts.length,
    items: game.items.length,
  };
}

function playStateSounds() {
  if (game.bombs.length > previousCounts.bombs) playSfx("drop");
  if (game.blasts.length > previousCounts.blasts) playSfx("splash");
  if (game.items.length < previousCounts.items) playSfx("item");
  if (game.players.some((player) => player.trapped) && game.blasts.length > previousCounts.blasts) playSfx("pop");
  rememberCounts();
}

window.addEventListener("keydown", (event) => {
  unlockAudio();
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar", "Control"].includes(event.key)) {
    event.preventDefault();
  }
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

singleBtn.addEventListener("click", () => {
  unlockAudio();
  playSfx("click");
  setMode("single");
});
multiBtn.addEventListener("click", () => {
  unlockAudio();
  playSfx("click");
  setMode("multi");
});
restartBtn.addEventListener("click", () => {
  unlockAudio();
  playSfx("click");
  restart();
});
connectBtn.addEventListener("click", () => {
  unlockAudio();
  playSfx("click");
  connectMultiplayer();
});

function readInput() {
  return {
    up: keys.has("arrowup") || keys.has("w"),
    down: keys.has("arrowdown") || keys.has("s"),
    left: keys.has("arrowleft") || keys.has("a"),
    right: keys.has("arrowright") || keys.has("d"),
    drop: keys.has(" ") || keys.has("spacebar"),
    needle: keys.has("control"),
  };
}

function setMode(nextMode) {
  mode = nextMode;
  singleBtn.classList.toggle("active", mode === "single");
  multiBtn.classList.toggle("active", mode === "multi");
  modeLabel.textContent = mode === "single" ? K.single : K.multi;
  connectBtn.disabled = mode === "single";
  if (mode === "single") {
    closeSocket();
    restart();
  } else {
    overlayMessage(K.multi, K.multiHelp);
  }
}

function restart() {
  if (mode === "single") {
    game = createGame({ humans: 1, bots: 3, seed: Math.floor(Math.random() * 9000) + 1 });
    visualPositions.clear();
    rememberCounts();
    overlay.classList.add("hidden");
    return;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "restart" }));
  } else {
    connectMultiplayer();
  }
}

function connectMultiplayer() {
  if (mode !== "multi") setMode("multi");
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);
  statusLabel.textContent = K.connecting;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "hello") {
      playerId = message.playerId;
      overlayMessage(K.connected, K.connectedHelp);
    }
    if (message.type === "full") {
      overlayMessage(K.full, K.fullHelp);
    }
    if (message.type === "snapshot") {
      game = message.game;
      playersOnline = message.playersOnline ?? 0;
      playStateSounds();
    }
  });

  socket.addEventListener("close", () => {
    statusLabel.textContent = K.closed;
    if (mode === "multi") overlayMessage(K.closed, K.closedHelp);
  });

  socket.addEventListener("error", () => {
    overlayMessage(K.failed, K.failedHelp);
  });
}

function closeSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
  playersOnline = 0;
}

function updateSingle(dt) {
  const inputs = { p1: readInput() };
  for (const player of game.players) {
    if (player.bot) inputs[player.id] = decideBotInput(game, player, frame);
  }
  tickGame(game, inputs, dt);
  playStateSounds();
}

function updateMulti(now) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  if (now - lastSent > 45) {
    socket.send(JSON.stringify({ type: "input", input: readInput() }));
    lastSent = now;
  }
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateHud() {
  const statusMap = {
    playing: K.playing,
    waiting: K.waiting,
    ended: K.ended,
  };
  statusLabel.textContent = statusMap[game.status] ?? game.status;
  timeLabel.textContent = formatTime(game.timeLeft ?? 0);
  onlineLabel.textContent = mode === "multi" ? `${playersOnline}/4` : "AI 3";
  updateNeedleStatus();

  if (game.status === "ended") {
    overlayMessage(K.endedTitle, `${K.winner}: ${game.winner}`);
  } else if (mode === "single") {
    overlay.classList.add("hidden");
  } else if (game.status === "waiting") {
    overlayMessage(K.waitingTitle, K.waitingHelp);
  } else {
    overlay.classList.add("hidden");
  }
}

function updateNeedleStatus() {
  if (!needleStatus) return;
  needleStatus.replaceChildren(...game.players.map((player) => {
    const row = document.createElement("div");
    row.className = "needle-row";

    const name = document.createElement("span");
    name.textContent = player.name.replace("Player ", "P").replace("Bot ", "B");

    const badge = document.createElement("strong");
    badge.className = `needle-badge${player.hasNeedle ? "" : " used"}`;
    badge.textContent = player.hasNeedle ? "\ubcf4\uc720" : "\uc0ac\uc6a9";

    row.append(name, badge);
    return row;
  }));
}

function overlayMessage(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function drawRoundedRect(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

function drawPuffyCircle(cx, cy, radius, fill, stroke = "rgba(85,50,30,0.24)") {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.34, cy - radius * 0.38, radius * 0.22, radius * 0.13, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1;
}

function drawBoardBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#89e6fb");
  sky.addColorStop(0.55, "#8be0cc");
  sky.addColorStop(1, "#55be98");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 12; i += 1) {
    const cx = ((i * 137 + frame * 0.25) % (canvas.width + 90)) - 45;
    const cy = 34 + (i % 4) * 28;
    ctx.beginPath();
    ctx.arc(cx, cy, 10 + (i % 3) * 3, 0, Math.PI * 2);
    ctx.arc(cx + 16, cy + 2, 13, 0, Math.PI * 2);
    ctx.arc(cx + 31, cy, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMap() {
  drawBoardBackdrop();

  for (let y = 0; y < game.height; y += 1) {
    for (let x = 0; x < game.width; x += 1) {
      const px = x * tileSize;
      const py = y * tileSize;
      const tile = game.tiles[y][x];

      ctx.fillStyle = (x + y) % 2 === 0 ? "#78d1b5" : "#6bc5aa";
      ctx.fillRect(px, py, tileSize, tileSize);
      ctx.strokeStyle = "rgba(31, 104, 87, 0.18)";
      ctx.strokeRect(px + 0.5, py + 0.5, tileSize - 1, tileSize - 1);

      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(px + 8, py + 7, tileSize - 16, 3);

      if (tile === TILE.SOLID) {
        drawRoundedRect(px + 4, py + 4, tileSize - 8, tileSize - 8, 7, "#8ca5af");
        drawRoundedRect(px + 8, py + 8, tileSize - 16, 10, 4, "rgba(255,255,255,0.25)");
        ctx.strokeStyle = "#607982";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 6, py + 6, tileSize - 12, tileSize - 12);
        ctx.lineWidth = 1;
      }

      if (tile === TILE.BREAKABLE) {
        drawRoundedRect(px + 6, py + 7, tileSize - 12, tileSize - 14, 6, "#d98743");
        drawRoundedRect(px + 10, py + 11, tileSize - 20, 7, 4, "rgba(255,230,160,0.42)");
        ctx.strokeStyle = "#8d4e27";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px + 13, py + 17);
        ctx.lineTo(px + tileSize - 13, py + tileSize - 17);
        ctx.moveTo(px + tileSize - 13, py + 17);
        ctx.lineTo(px + 13, py + tileSize - 17);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  }
}

function drawItems() {
  for (const item of game.items) {
    const cx = item.x * tileSize + tileSize / 2;
    const cy = item.y * tileSize + tileSize / 2;
    drawPuffyCircle(cx, cy, 14, itemColors[item.type] ?? "#fff");
    ctx.fillStyle = "#55321e";
    ctx.font = "bold 14px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = item.type === "bomb" ? "B" : item.type === "power" ? "P" : "S";
    ctx.fillText(label, cx, cy + 1);
  }
}

function drawBombs() {
  for (const bomb of game.bombs) {
    const cx = bomb.x * tileSize + tileSize / 2;
    const cy = bomb.y * tileSize + tileSize / 2;
    const pulse = Math.sin(performance.now() / 110) * 2.5;
    drawPuffyCircle(cx, cy, 17 + pulse, "#63d9ff", "#1a91b6");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 5, 6, Math.PI * 0.9, Math.PI * 1.75);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawBlasts() {
  for (const blast of game.blasts) {
    for (const cell of blast.cells) {
      const px = cell.x * tileSize;
      const py = cell.y * tileSize;
      drawRoundedRect(px + 3, py + 9, tileSize - 6, tileSize - 18, 16, "rgba(42, 191, 255, 0.72)");
      drawRoundedRect(px + 9, py + 3, tileSize - 18, tileSize - 6, 16, "rgba(152, 239, 255, 0.62)");
      ctx.fillStyle = "rgba(255,255,255,0.66)";
      ctx.beginPath();
      ctx.arc(px + 17, py + 16, 5, 0, Math.PI * 2);
      ctx.arc(px + 31, py + 31, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFallbackPlayer(cx, cy, bob, skin) {
  drawPuffyCircle(cx, cy + bob, 17, skin.body, "rgba(80,45,30,0.35)");
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 3 + bob, 4, 0, Math.PI * 2);
  ctx.arc(cx + 6, cy - 3 + bob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#24303a";
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 2 + bob, 2, 0, Math.PI * 2);
  ctx.arc(cx + 5, cy - 2 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin.cheek;
  ctx.beginPath();
  ctx.arc(cx - 11, cy + 5 + bob, 3, 0, Math.PI * 2);
  ctx.arc(cx + 11, cy + 5 + bob, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpritePlayer(player, cx, cy, bob, skin) {
  const sheet = (mode === "single" ? player.id === "p1" : player.id === playerId)
    ? playerCharacterSheet
    : rivalCharacterSheet;

  if (!sheet.complete || sheet.naturalWidth === 0) {
    drawFallbackPlayer(cx, cy, bob, skin);
    return;
  }

  const frameIndex = characterFrames[player.dir ?? "down"] ?? 0;
  const frameWidth = sheet.naturalWidth / 4;
  const frameHeight = sheet.naturalHeight;
  const size = 58;
  const dx = cx - size / 2;
  const dy = cy - size * 0.72 + bob;
  ctx.drawImage(
    sheet,
    frameIndex * frameWidth,
    0,
    frameWidth,
    frameHeight,
    dx,
    dy,
    size,
    size
  );
}

function visualPositionFor(player) {
  const targetX = player.x * tileSize + tileSize / 2;
  const targetY = player.y * tileSize + tileSize / 2;
  const current = visualPositions.get(player.id);
  if (!current || Math.hypot(current.x - targetX, current.y - targetY) > tileSize * 1.5) {
    const fresh = { x: targetX, y: targetY };
    visualPositions.set(player.id, fresh);
    return fresh;
  }

  current.x += (targetX - current.x) * 0.34;
  current.y += (targetY - current.y) * 0.34;
  return current;
}

function drawPlayers() {
  for (const [index, player] of game.players.entries()) {
    const skin = playerSkins[index % playerSkins.length];
    const visual = visualPositionFor(player);
    const cx = visual.x;
    const cy = visual.y;
    const bob = Math.sin((frame + index * 13) / 9) * 1.5;
    ctx.globalAlpha = player.dead ? 0.3 : 1;

    ctx.fillStyle = "rgba(69, 45, 25, 0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 19, 17, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    drawSpritePlayer(player, cx, cy, bob, skin);

    if (player.id === playerId && mode === "multi") {
      ctx.strokeStyle = "#fff4a8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, 23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (player.trapped) {
      ctx.fillStyle = "rgba(159, 235, 255, 0.48)";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(cx - 7, cy - 9 + bob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#4d3021";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(player.name.replace("Player ", "P").replace("Bot ", "B"), cx, cy + 23);
  }
}

function draw() {
  drawMap();
  drawItems();
  drawBombs();
  drawBlasts();
  drawPlayers();
}

function loop(now) {
  const dt = Math.min(80, now - last);
  last = now;
  frame += 1;

  if (mode === "single") updateSingle(dt);
  if (mode === "multi") updateMulti(now);

  updateHud();
  draw();
  requestAnimationFrame(loop);
}

connectBtn.disabled = true;
requestAnimationFrame(loop);

