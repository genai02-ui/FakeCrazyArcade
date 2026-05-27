import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4175);
const ROOT = process.cwd();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ogg": "audio/ogg",
};

function candidatePaths(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  return [
    join(ROOT, "dist", requested),
    join(ROOT, "public", requested),
    requested.startsWith("/src/") ? join(ROOT, requested) : null,
  ].filter(Boolean);
}

function findFile(pathname) {
  for (const candidate of candidatePaths(pathname)) {
    const filePath = normalize(candidate);
    if (!filePath.startsWith(ROOT)) continue;
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

export default function handler(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const filePath = findFile(url.pathname);

  if (!filePath) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

if (!process.env.VERCEL) {
  createServer(handler).listen(PORT, () => {
    console.log(`Static app server running at http://localhost:${PORT}`);
  });
}
