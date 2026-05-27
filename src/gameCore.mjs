export const TILE = {
  EMPTY: 0,
  SOLID: 1,
  BREAKABLE: 2,
};

export const ITEM_TYPES = ["bomb", "power", "speed"];

export const COLORS = ["#2f80ed", "#f25f5c", "#20bf6b", "#f7b731"];

const WIDTH = 15;
const HEIGHT = 13;
const BOMB_TIME = 2100;
const BLAST_TIME = 420;
const TRAP_TIME = 3400;
const MOVE_BASE = 170;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function key(x, y) {
  return `${x},${y}`;
}

export function createMap(seed = 8) {
  const rand = mulberry32(seed);
  const tiles = [];
  const spawnSafe = new Set([
    "1,1", "2,1", "1,2",
    "13,11", "12,11", "13,10",
    "1,11", "2,11", "1,10",
    "13,1", "12,1", "13,2",
  ]);

  for (let y = 0; y < HEIGHT; y += 1) {
    const row = [];
    for (let x = 0; x < WIDTH; x += 1) {
      const border = x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) {
        row.push(TILE.SOLID);
      } else if (!spawnSafe.has(key(x, y)) && rand() < 0.58) {
        row.push(TILE.BREAKABLE);
      } else {
        row.push(TILE.EMPTY);
      }
    }
    tiles.push(row);
  }
  return tiles;
}

export function createGame({ seed = 8, humans = 1, bots = 3 } = {}) {
  const spawns = [
    { x: 1, y: 1 },
    { x: 13, y: 11 },
    { x: 1, y: 11 },
    { x: 13, y: 1 },
  ];
  const players = [];
  const total = Math.min(4, humans + bots);

  for (let i = 0; i < total; i += 1) {
    players.push({
      id: i === 0 ? "p1" : `p${i + 1}`,
      name: i < humans ? `Player ${i + 1}` : `Bot ${i + 1 - humans}`,
      bot: i >= humans,
      color: COLORS[i],
      x: spawns[i].x,
      y: spawns[i].y,
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
    });
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    tiles: createMap(seed),
    players,
    bombs: [],
    blasts: [],
    items: [],
    nextBombId: 1,
    nextItemId: 1,
    timeLeft: 180000,
    status: "playing",
    winner: null,
    seed,
  };
}

export function createInput() {
  return { up: false, down: false, left: false, right: false, drop: false, needle: false };
}

export function cloneSnapshot(state) {
  return {
    width: state.width,
    height: state.height,
    tiles: state.tiles.map((row) => row.slice()),
    players: state.players.map((p) => ({ ...p })),
    bombs: state.bombs.map((b) => ({ ...b })),
    blasts: state.blasts.map((b) => ({ ...b, cells: b.cells.map((c) => ({ ...c })) })),
    items: state.items.map((i) => ({ ...i })),
    timeLeft: state.timeLeft,
    status: state.status,
    winner: state.winner,
  };
}

function tileAt(state, x, y) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return TILE.SOLID;
  return state.tiles[y][x];
}

function bombAt(state, x, y) {
  return state.bombs.some((bomb) => bomb.x === x && bomb.y === y);
}

function isWalkable(state, x, y) {
  return tileAt(state, x, y) === TILE.EMPTY && !bombAt(state, x, y);
}

function activeBombCount(state, ownerId) {
  return state.bombs.filter((bomb) => bomb.ownerId === ownerId).length;
}

function maybeDropItem(state, x, y) {
  const roll = mulberry32((state.seed + 31) * (x + 3) * (y + 7) * (state.nextItemId + 11))();
  if (roll > 0.36) return;
  state.items.push({
    id: state.nextItemId++,
    x,
    y,
    type: ITEM_TYPES[Math.floor(roll * 100) % ITEM_TYPES.length],
  });
}

function explosionCells(state, bomb) {
  const cells = [{ x: bomb.x, y: bomb.y }];
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  for (const dir of dirs) {
    for (let step = 1; step <= bomb.power; step += 1) {
      const x = bomb.x + dir.x * step;
      const y = bomb.y + dir.y * step;
      const tile = tileAt(state, x, y);
      if (tile === TILE.SOLID) break;
      cells.push({ x, y });
      if (tile === TILE.BREAKABLE) break;
    }
  }
  return cells;
}

function explodeBomb(state, bomb) {
  const cells = explosionCells(state, bomb);
  for (const cell of cells) {
    if (tileAt(state, cell.x, cell.y) === TILE.BREAKABLE) {
      state.tiles[cell.y][cell.x] = TILE.EMPTY;
      maybeDropItem(state, cell.x, cell.y);
    }
  }
  state.blasts.push({ cells, timer: BLAST_TIME });
}

function applyBlastHits(state) {
  const blastKeys = new Set();
  for (const blast of state.blasts) {
    for (const cell of blast.cells) blastKeys.add(key(cell.x, cell.y));
  }

  for (const player of state.players) {
    if (player.dead || player.trapped) continue;
    if (player.needleGrace > 0) continue;
    if (blastKeys.has(key(player.x, player.y))) {
      player.trapped = true;
      player.trapTimer = TRAP_TIME;
    }
  }

  for (const bomb of state.bombs) {
    if (blastKeys.has(key(bomb.x, bomb.y))) bomb.timer = Math.min(bomb.timer, 1);
  }
}

function collectItems(state, player) {
  const index = state.items.findIndex((item) => item.x === player.x && item.y === player.y);
  if (index < 0) return;
  const [item] = state.items.splice(index, 1);
  if (item.type === "bomb") player.bombsMax = Math.min(5, player.bombsMax + 1);
  if (item.type === "power") player.power = Math.min(6, player.power + 1);
  if (item.type === "speed") player.speed = Math.min(4, player.speed + 1);
}

function movePlayer(state, player, input, dt) {
  if (player.dead || player.trapped) return;
  player.moveCooldown = Math.max(0, player.moveCooldown - dt);
  if (player.moveCooldown > 0) return;

  const dirs = [
    input.up && { x: 0, y: -1 },
    input.down && { x: 0, y: 1 },
    input.left && { x: -1, y: 0 },
    input.right && { x: 1, y: 0 },
  ].filter(Boolean);
  if (dirs.length === 0) return;

  const dir = dirs[0];
  if (dir.x < 0) player.dir = "left";
  if (dir.x > 0) player.dir = "right";
  if (dir.y < 0) player.dir = "up";
  if (dir.y > 0) player.dir = "down";
  const nx = player.x + dir.x;
  const ny = player.y + dir.y;
  if (!isWalkable(state, nx, ny)) return;
  player.x = nx;
  player.y = ny;
  player.moveCooldown = Math.max(72, MOVE_BASE - player.speed * 24);
  collectItems(state, player);
}

function placeBomb(state, player, input) {
  if (player.dead || player.trapped) return;
  if (!input.drop) {
    player.dropLatch = false;
    return;
  }
  if (player.dropLatch) return;
  player.dropLatch = true;
  if (bombAt(state, player.x, player.y)) return;
  if (activeBombCount(state, player.id) >= player.bombsMax) return;
  state.bombs.push({
    id: state.nextBombId++,
    ownerId: player.id,
    x: player.x,
    y: player.y,
    timer: BOMB_TIME,
    power: player.power,
  });
}

function useNeedle(player, input) {
  if (!player.trapped || player.dead || !input.needle || !player.hasNeedle) return;
  player.hasNeedle = false;
  player.needleUsed = true;
  player.needleGrace = 900;
  player.trapped = false;
  player.trapTimer = 0;
}

function resolveTraps(state, dt) {
  for (const trapped of state.players) {
    if (!trapped.trapped || trapped.dead) continue;
    trapped.trapTimer -= dt;
    const helper = state.players.find((p) => (
      !p.dead && !p.trapped && p.id !== trapped.id && p.x === trapped.x && p.y === trapped.y
    ));
    if (helper) {
      if (helper.color === trapped.color) {
        trapped.trapped = false;
        trapped.trapTimer = 0;
      } else {
        trapped.dead = true;
        trapped.trapped = false;
      }
    }
    if (trapped.trapTimer <= 0) {
      trapped.dead = true;
      trapped.trapped = false;
    }
  }
}

function resolveWin(state) {
  if (state.status !== "playing") return;
  const alive = state.players.filter((p) => !p.dead);
  if (alive.length <= 1) {
    state.status = "ended";
    state.winner = alive[0]?.name ?? "No one";
  }
  if (state.timeLeft <= 0) {
    state.status = "ended";
    state.winner = "Time over";
  }
}

export function tickGame(state, inputs, dt) {
  if (state.status !== "playing") return state;
  state.timeLeft = Math.max(0, state.timeLeft - dt);

  for (const player of state.players) {
    player.needleGrace = Math.max(0, (player.needleGrace ?? 0) - dt);
    const input = inputs[player.id] ?? createInput();
    useNeedle(player, input);
    placeBomb(state, player, input);
    movePlayer(state, player, input, dt);
  }

  for (const bomb of state.bombs) bomb.timer -= dt;
  const exploding = state.bombs.filter((bomb) => bomb.timer <= 0);
  state.bombs = state.bombs.filter((bomb) => bomb.timer > 0);
  for (const bomb of exploding) explodeBomb(state, bomb);

  applyBlastHits(state);
  resolveTraps(state, dt);

  for (const blast of state.blasts) blast.timer -= dt;
  state.blasts = state.blasts.filter((blast) => blast.timer > 0);

  resolveWin(state);
  return state;
}

function dangerMap(state) {
  const danger = new Set();
  for (const blast of state.blasts) {
    for (const cell of blast.cells) danger.add(key(cell.x, cell.y));
  }
  for (const bomb of state.bombs) {
    for (const cell of explosionCells(state, bomb)) danger.add(key(cell.x, cell.y));
  }
  return danger;
}

function timedDangerMap(state, extraBomb = null) {
  const danger = new Map();
  const add = (cell, start, end) => {
    const cellKey = key(cell.x, cell.y);
    const current = danger.get(cellKey);
    if (current === undefined || start < current.start) danger.set(cellKey, { start, end });
  };

  for (const blast of state.blasts) {
    for (const cell of blast.cells) add(cell, 0, blast.timer);
  }

  for (const bomb of [...state.bombs, extraBomb].filter(Boolean)) {
    const start = Math.max(0, bomb.timer ?? BOMB_TIME);
    for (const cell of explosionCells(state, bomb)) add(cell, start, start + BLAST_TIME);
  }
  return danger;
}

function isCellSafeAt(danger, x, y, time) {
  const window = danger.get(key(x, y));
  if (window === undefined) return true;
  return time < window.start - 260 || time > window.end + 180;
}

function canEnterForPath(state, x, y, startX, startY) {
  if (x === startX && y === startY) return tileAt(state, x, y) === TILE.EMPTY;
  return isWalkable(state, x, y);
}

function findSafePath(state, player, options = {}) {
  const {
    danger = timedDangerMap(state),
    avoidBombOrigin = false,
    requireOutsideDanger = false,
    target = null,
    maxDepth = 18,
    frame = 0,
  } = options;
  const dirs = [
    { name: "up", x: 0, y: -1 },
    { name: "right", x: 1, y: 0 },
    { name: "down", x: 0, y: 1 },
    { name: "left", x: -1, y: 0 },
  ];
  const offset = (frame + player.id.length) % dirs.length;
  const orderedDirs = dirs.slice(offset).concat(dirs.slice(0, offset));
  const stepMs = Math.max(72, MOVE_BASE - player.speed * 24);
  const firstStepDelay = Math.max(0, player.moveCooldown ?? 0);
  const queue = [{
    x: player.x,
    y: player.y,
    depth: 0,
    first: null,
  }];
  const visited = new Set([key(player.x, player.y)]);
  let best = null;

  while (queue.length > 0) {
    const node = queue.shift();
    const arriveAt = node.depth * stepMs;
    const safe = isCellSafeAt(danger, node.x, node.y, arriveAt);
    const outsideBlastPath = (!avoidBombOrigin && !requireOutsideDanger) || !danger.has(key(node.x, node.y));
    const awayFromOrigin = !avoidBombOrigin || node.x !== player.x || node.y !== player.y;
    const isTarget = target && node.x === target.x && node.y === target.y;

    if (node.depth > 0 && safe && outsideBlastPath && awayFromOrigin) {
      if (!target || isTarget) return node.first;
      const score = Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
      if (!best || score < best.score) best = { score, first: node.first };
    }

    if (node.depth >= maxDepth) continue;

    for (const dir of orderedDirs) {
      const nx = node.x + dir.x;
      const ny = node.y + dir.y;
      const nextKey = key(nx, ny);
      if (visited.has(nextKey)) continue;
      if (!canEnterForPath(state, nx, ny, player.x, player.y)) continue;
      const nextDepth = node.depth + 1;
      const nextTime = firstStepDelay + Math.max(0, nextDepth - 1) * stepMs;
      if (!isCellSafeAt(danger, nx, ny, nextTime)) continue;
      visited.add(nextKey);
      queue.push({
        x: nx,
        y: ny,
        depth: nextDepth,
        first: node.first ?? dir,
      });
    }
  }

  return best?.first ?? null;
}

function canEscapeAfterBomb(state, player) {
  if (bombAt(state, player.x, player.y)) return false;
  if (activeBombCount(state, player.id) >= player.bombsMax) return false;
  const futureBomb = {
    id: -1,
    ownerId: player.id,
    x: player.x,
    y: player.y,
    timer: BOMB_TIME,
    power: player.power,
  };
  return Boolean(findSafePath(state, player, {
    danger: timedDangerMap(state, futureBomb),
    avoidBombOrigin: true,
    requireOutsideDanger: true,
    maxDepth: 16,
  }));
}

function opponentInBombLine(state, player) {
  const futureBomb = {
    id: -1,
    ownerId: player.id,
    x: player.x,
    y: player.y,
    timer: BOMB_TIME,
    power: player.power,
  };
  const blastKeys = new Set(explosionCells(state, futureBomb).map((cell) => key(cell.x, cell.y)));
  return state.players.some((other) => (
    other.id !== player.id &&
    !other.dead &&
    !other.trapped &&
    blastKeys.has(key(other.x, other.y))
  ));
}

function nearestTarget(state, player, candidates) {
  return candidates
    .filter((candidate) => tileAt(state, candidate.x, candidate.y) === TILE.EMPTY)
    .sort((a, b) => (
      Math.abs(a.x - player.x) + Math.abs(a.y - player.y) -
      (Math.abs(b.x - player.x) + Math.abs(b.y - player.y))
    ))[0] ?? null;
}

function nearbyBreakable(state, x, y) {
  return [
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 },
  ].some((cell) => tileAt(state, cell.x, cell.y) === TILE.BREAKABLE);
}

function nearbyOpponent(state, player) {
  return state.players.some((other) => (
    other.id !== player.id &&
    !other.dead &&
    !other.trapped &&
    Math.abs(other.x - player.x) + Math.abs(other.y - player.y) <= player.power
  ));
}

export function decideBotInput(state, player, frame = 0) {
  const input = createInput();
  if (player.dead) return input;
  if (player.trapped) {
    if (player.hasNeedle) input.needle = true;
    return input;
  }

  const danger = dangerMap(state);
  const timedDanger = timedDangerMap(state);
  const dirs = [
    { name: "up", x: 0, y: -1 },
    { name: "right", x: 1, y: 0 },
    { name: "down", x: 0, y: 1 },
    { name: "left", x: -1, y: 0 },
  ];
  const shuffled = dirs.slice((frame + player.id.length) % 4).concat(dirs.slice(0, (frame + player.id.length) % 4));
  const hereDanger = danger.has(key(player.x, player.y));

  if (hereDanger) {
    const safe = findSafePath(state, player, {
      danger: timedDanger,
      requireOutsideDanger: true,
      frame,
      maxDepth: 18,
    }) ??
      shuffled.find((dir) => (
        isWalkable(state, player.x + dir.x, player.y + dir.y) &&
        !danger.has(key(player.x + dir.x, player.y + dir.y))
      ));
    if (safe) input[safe.name] = true;
    return input;
  }

  const shouldBomb = (
    nearbyBreakable(state, player.x, player.y) ||
    nearbyOpponent(state, player) ||
    opponentInBombLine(state, player)
  );
  if (shouldBomb && canEscapeAfterBomb(state, player)) {
    input.drop = true;
    const escape = findSafePath(state, player, {
      danger: timedDangerMap(state, {
        id: -1,
        ownerId: player.id,
        x: player.x,
        y: player.y,
        timer: BOMB_TIME,
        power: player.power,
      }),
      avoidBombOrigin: true,
      requireOutsideDanger: true,
      frame,
      maxDepth: 16,
    });
    if (escape) input[escape.name] = true;
    return input;
  }

  const item = state.items
    .filter((candidate) => !danger.has(key(candidate.x, candidate.y)))
    .sort((a, b) => (
      Math.abs(a.x - player.x) + Math.abs(a.y - player.y) -
      (Math.abs(b.x - player.x) + Math.abs(b.y - player.y))
    ))[0];

  if (item) {
    const move = findSafePath(state, player, { danger: timedDanger, target: item, frame, maxDepth: 18 });
    if (move) input[move.name] = true;
    return input;
  }

  const humanTargets = state.players.filter((other) => other.id !== player.id && !other.dead && !other.trapped);
  const nearestOpponent = nearestTarget(state, player, humanTargets);
  if (nearestOpponent) {
    const chase = findSafePath(state, player, { danger: timedDanger, target: nearestOpponent, frame, maxDepth: 12 });
    if (chase && frame % 20 < 15) {
      input[chase.name] = true;
      return input;
    }
  }

  const wander = findSafePath(state, player, { danger: timedDanger, frame, maxDepth: 8 }) ??
    shuffled.find((dir) => (
      isWalkable(state, player.x + dir.x, player.y + dir.y) &&
      !danger.has(key(player.x + dir.x, player.y + dir.y))
    ));
  if (wander && frame % 18 < 10) input[wander.name] = true;
  return input;
}

export function resetGame(state, options = {}) {
  const next = createGame(options);
  Object.assign(state, next);
  return state;
}
