import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const resources = join(root, "apps", "desktop", "resources");
const outfile = join(resources, "core", "cli.mjs");

await rm(join(resources, "core"), { recursive: true, force: true });
await rm(join(resources, "skills"), { recursive: true, force: true });
await rm(join(resources, "fixtures"), { recursive: true, force: true });
await mkdir(dirname(outfile), { recursive: true });

await build({
  entryPoints: [join(root, "apps", "core", "src", "cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  sourcemap: false,
  legalComments: "none",
  banner: {
    js: [
      'import { createRequire as __rwCreateRequire } from "node:module";',
      'import { fileURLToPath as __rwFileURLToPath } from "node:url";',
      'import { dirname as __rwDirname } from "node:path";',
      "const require = __rwCreateRequire(import.meta.url);",
      "const __filename = __rwFileURLToPath(import.meta.url);",
      "const __dirname = __rwDirname(__filename);"
    ].join("\n")
  },
  logLevel: "info"
});

await cp(
  join(root, "packages", "research-skills", "skills"),
  join(resources, "skills"),
  { recursive: true }
);
await cp(
  join(root, "packages", "research-skills", "fixtures"),
  join(resources, "fixtures"),
  { recursive: true }
);

console.log(`[build:core] ${outfile}`);
console.log(`[build:core] skills -> ${join(resources, "skills")}`);
console.log(`[build:core] fixtures -> ${join(resources, "fixtures")}`);
