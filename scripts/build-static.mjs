import { cp, mkdir, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await rm(".vercel/output", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await mkdir(".vercel/output/static", { recursive: true });

await cp("public", "dist", { recursive: true });
await cp("src", "dist/src", { recursive: true });

await cp("dist", ".vercel/output/static", { recursive: true });
await writeFile(
  ".vercel/output/config.json",
  JSON.stringify({ version: 3 }, null, 2)
);

console.log("Built static Vercel bundle in dist/");
console.log("Built Vercel static output in .vercel/output/static/");
