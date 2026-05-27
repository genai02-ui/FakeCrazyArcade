import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await cp("public", "dist", { recursive: true });
await cp("src", "dist/src", { recursive: true });

console.log("Built static Vercel bundle in dist/");
