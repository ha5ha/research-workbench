import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const root = process.cwd();
const resources = join(root, "apps", "desktop", "resources", "lsp");
const require = createRequire(join(root, "apps", "core", "package.json"));
const cli = require.resolve("typescript-language-server/lib/cli.mjs");
const typescriptPackage = require.resolve("typescript/package.json");

await rm(resources, { recursive: true, force: true });
await mkdir(join(resources, "vendor"), { recursive: true });
await cp(cli, join(resources, "cli.mjs"));
await cp(dirname(typescriptPackage), join(resources, "vendor", "typescript"), {
  recursive: true,
  dereference: true
});
console.log(`[build:lsp] ${join(resources, "cli.mjs")}`);
console.log(`[build:lsp] typescript -> ${join(resources, "vendor", "typescript")}`);
