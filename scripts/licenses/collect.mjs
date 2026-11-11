import {
  readFile,
  readdir,
  realpath,
  stat,
  mkdir,
  rm,
  copyFile,
  writeFile
} from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "../distribution-manifest.mjs";

const allowed = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "Unlicense",
  "0BSD",
  "CC0-1.0",
  "BlueOak-1.0.0"
]);
const licenseFile =
  /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$|^thirdpartynotice/i;
export function checkLicense(name, license, documents) {
  if (typeof license !== "string" || !license.trim())
    throw new Error(`${name}: missing license declaration`);
  const parts = license
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND)\s+/)
    .map((part) => part.trim());
  if (parts.some((part) => !allowed.has(part)))
    throw new Error(`${name}: unreviewed or prohibited license ${license}`);
  if (
    !documents.length ||
    documents.every(
      (document) => !/^(?:licen[cs]e|copying)/i.test(document.name)
    )
  )
    throw new Error(`${name}: full LICENSE/COPYING text missing`);
  for (const document of documents) {
    if (document.bytes.length < 50)
      throw new Error(`${name}: empty/truncated ${document.name}`);
    if (
      /^(?:licen[cs]e|copying)/i.test(document.name) &&
      /GNU\s+(?:AFFERO\s+|LESSER\s+)?GENERAL\s+PUBLIC\s+LICENSE/i.test(
        document.bytes.toString()
      )
    )
      throw new Error(
        `${name}: copyleft text requires explicit review (${document.name})`
      );
  }
}

export function checkExternals(name, externals) {
  const builtins = new Set(
    builtinModules.flatMap((value) => [
      value,
      value.replace(/^node:/, ""),
      `node:${value.replace(/^node:/, "")}`
    ])
  );
  for (const dependency of externals)
    if (dependency !== "electron" && !builtins.has(dependency))
      throw new Error(`${name}: unaccounted external ${dependency}`);
}

async function owner(file, root) {
  let directory = dirname(await realpath(file));
  for (;;) {
    try {
      const meta = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8")
      );
      if (meta.name && meta.version) return { directory, meta };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (dirname(directory) === directory)
      throw new Error(`No package owner: ${relative(root, file)}`);
    directory = dirname(directory);
  }
}

export async function collectDistribution(root) {
  const resources = join(root, "apps/desktop/resources");
  const destination = join(resources, "licenses");
  const supplementRoot = join(root, "scripts/licenses");
  let supplements = [];
  try {
    supplements = JSON.parse(
      await readFile(join(supplementRoot, "supplement-index.json"), "utf8")
    ).packages;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const packages = new Map(),
    buildEvidence = [];
  const add = (meta, directory, area, input, source) => {
    if (
      meta.name.startsWith("@research-workbench/") ||
      meta.name === "research-workbench"
    )
      return;
    const key = `${meta.name}@${meta.version}`;
    if (!packages.has(key))
      packages.set(key, {
        name: meta.name,
        version: meta.version,
        license:
          meta.license ?? meta.licenses?.map((item) => item.type).join(" OR "),
        directory,
        areas: new Set(),
        inputs: new Set(),
        source
      });
    const entry = packages.get(key);
    entry.areas.add(area);
    if (input) entry.inputs.add(input);
  };
  for (const area of ["core", "main", "preload", "renderer"]) {
    const evidence = JSON.parse(
      await readFile(join(root, ".tmp/distribution", `${area}.json`), "utf8")
    );
    checkExternals(area, evidence.externals);
    for (const output of evidence.outputs)
      if (sha256(await readFile(resolve(root, output.path))) !== output.sha256)
        throw new Error(`${area}: stale build evidence ${output.path}`);
    for (const input of evidence.inputs) {
      const found = await owner(resolve(root, input), root);
      const withinPackage = relative(
        found.directory,
        await realpath(resolve(root, input))
      ).replaceAll("\\", "/");
      add(found.meta, found.directory, area, withinPackage);
    }
    buildEvidence.push({ ...evidence, inputs: undefined });
  }
  const require = createRequire(join(root, "apps/core/package.json"));
  const tlsRoot = dirname(
    require.resolve("typescript-language-server/package.json")
  );
  const tlsMeta = JSON.parse(
    await readFile(join(tlsRoot, "package.json"), "utf8")
  );
  add(tlsMeta, tlsRoot, "lsp", "lib/cli.mjs");
  const sourceMapBytes = await readFile(join(tlsRoot, "lib/cli.mjs.map"));
  const sourceMap = JSON.parse(sourceMapBytes);
  const bundled = new Map();
  for (const source of sourceMap.sources) {
    if (!source.includes("node_modules/")) continue;
    const match = source.match(
      /node_modules\/\.pnpm\/([^/]+)\/node_modules\/(@[^/]+\/[^/]+|[^/]+)\//
    );
    if (!match) throw new Error(`LSP: unaccounted prebundled source ${source}`);
    const name = match[2],
      prefix = `${name.replace("/", "+")}@`;
    if (!match[1].startsWith(prefix))
      throw new Error(`LSP: cannot derive exact version ${source}`);
    const version = match[1].slice(prefix.length).split("_")[0];
    bundled.set(`${name}@${version}`, { name, version });
  }
  const installed = await readdir(join(root, "node_modules/.pnpm"));
  if (!bundled.size)
    throw new Error(
      "LSP: prebundled source map has no identifiable dependency evidence"
    );
  for (const [key, item] of bundled) {
    const prefix = `${item.name.replace("/", "+")}@${item.version}`;
    const directoryName = installed.find(
      (name) => name === prefix || name.startsWith(`${prefix}_`)
    );
    const directory = directoryName
      ? join(
          root,
          "node_modules/.pnpm",
          directoryName,
          "node_modules",
          item.name
        )
      : null;
    const supplement = supplements.find(
      (entry) => `${entry.name}@${entry.version}` === key
    );
    const meta = directory
      ? JSON.parse(await readFile(join(directory, "package.json"), "utf8"))
      : supplement;
    if (!meta)
      throw new Error(`LSP: exact-version license unavailable for ${key}`);
    if (meta.name !== item.name || meta.version !== item.version)
      throw new Error(`LSP: exact-version metadata mismatch for ${key}`);
    add(meta, directory, "lsp-prebundled", undefined, {
      evidence: "typescript-language-server/lib/cli.mjs.map",
      sourceMapSha256: sha256(sourceMapBytes)
    });
  }
  const tsRoot = dirname(require.resolve("typescript/package.json"));
  add(
    JSON.parse(await readFile(join(tsRoot, "package.json"), "utf8")),
    tsRoot,
    "lsp-typescript",
    "entire package"
  );
  const lspOutputs = [];
  async function inspectLsp(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspectLsp(path);
      else if (entry.isFile())
        lspOutputs.push({
          path: relative(root, path).replaceAll("\\", "/"),
          sha256: sha256(await readFile(path))
        });
      else
        throw new Error(
          `LSP: non-regular distributed asset ${relative(root, path)}`
        );
    }
  }
  await inspectLsp(join(resources, "lsp"));
  buildEvidence.push({
    schemaVersion: 1,
    name: "lsp",
    outputs: lspOutputs.sort((a, b) => a.path.localeCompare(b.path)),
    externals: []
  });
  // Validate all packages before replacing the previous complete output.
  const entries = [];
  for (const [key, entry] of [...packages].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const documents = [];
    if (entry.directory)
      for (const name of (await readdir(entry.directory))
        .filter((name) => licenseFile.test(name))
        .sort()) {
        const path = join(entry.directory, name);
        if ((await stat(path)).isFile())
          documents.push({
            name,
            bytes: await readFile(path),
            source: "installed-package"
          });
      }
    const supplement = supplements.find(
      (item) => item.name === entry.name && item.version === entry.version
    );
    if (supplement)
      for (const document of supplement.documents) {
        const path = resolve(supplementRoot, document.path);
        if (!path.startsWith(resolve(supplementRoot) + sep))
          throw new Error(`${key}: supplement escaped source directory`);
        const bytes = await readFile(path);
        if (sha256(bytes) !== document.sha256)
          throw new Error(`${key}: changed supplement ${document.path}`);
        documents.push({
          name: document.path.split(/[\\/]/).at(-1),
          bytes,
          source: document.sourceUrl || supplement.source?.url,
          provenance: supplement.source
        });
      }
    checkLicense(key, entry.license, documents);
    entries.push({
      ...entry,
      directory: undefined,
      areas: [...entry.areas].sort(),
      inputs: [...entry.inputs].sort(),
      documents
    });
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const folder = `packages/${entry.name.replaceAll("/", "__")}@${entry.version}`;
    await mkdir(join(destination, folder), { recursive: true });
    entry.documents = await Promise.all(
      entry.documents.map(async (document, index) => {
        const path = `${folder}/${index}-${document.name}`;
        await writeFile(join(destination, path), document.bytes);
        return {
          path,
          sha256: sha256(document.bytes),
          source: document.source,
          provenance: document.provenance
        };
      })
    );
  }
  const desktopRequire = createRequire(join(root, "apps/desktop/package.json"));
  const electronRoot = dirname(desktopRequire.resolve("electron/package.json"));
  const electronVersion = (
    await readFile(join(electronRoot, "dist/version"), "utf8")
  ).trim();
  const electronMeta = JSON.parse(
    await readFile(join(electronRoot, "package.json"), "utf8")
  );
  if (electronMeta.version !== electronVersion)
    throw new Error("Electron package/runtime version mismatch");
  const runtime = {
    name: "electron",
    version: electronVersion,
    source: `https://github.com/electron/electron/releases/tag/v${electronVersion}`,
    binarySha256: sha256(
      await readFile(
        join(
          electronRoot,
          "dist",
          process.platform === "win32" ? "electron.exe" : "electron"
        )
      )
    ),
    documents: []
  };
  for (const name of ["LICENSE", "LICENSES.chromium.html"]) {
    const bytes = await readFile(join(electronRoot, "dist", name));
    if (bytes.length < 100) throw new Error(`Electron: incomplete ${name}`);
    const path = `electron/${name}`;
    await mkdir(join(destination, "electron"), { recursive: true });
    await writeFile(join(destination, path), bytes);
    runtime.documents.push({ path, sha256: sha256(bytes) });
  }
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    await copyFile(join(root, name), join(destination, name));
  const manifest = {
    schemaVersion: 1,
    basis:
      "Rendered bundle inputs; exact LSP source-map versions; official Electron runtime notices",
    builds: buildEvidence,
    packages: entries,
    runtime
  };
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
  await writeFile(
    join(destination, "README.txt"),
    "Research Workbench third-party distribution notices\n\nmanifest.json records exact versions, rendered component ownership, build hashes and full notice hashes. packages/ retains complete upstream documents. electron/ retains Electron LICENSE and official Chromium/Node third-party notices. Root THIRD_PARTY_NOTICES.md records adapted source and SSH notices.\n"
  );
  console.log(
    `[licenses] ${entries.length} exact third-party packages + Electron ${electronVersion}; full texts -> ${relative(root, destination)}`
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await collectDistribution(process.cwd());
