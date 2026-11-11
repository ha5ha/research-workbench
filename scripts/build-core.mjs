import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { writeBuildManifest } from "./distribution-manifest.mjs";

const root = process.cwd();
const resources = join(root, "apps", "desktop", "resources");
const outfile = join(resources, "core", "cli.mjs");
const coreRequire = createRequire(join(root, "apps", "core", "package.json"));
const sshRequire = createRequire(coreRequire.resolve("ssh2/package.json"));

await rm(join(resources, "core"), { recursive: true, force: true });
await rm(join(resources, "skills"), { recursive: true, force: true });
await rm(join(resources, "fixtures"), { recursive: true, force: true });
await rm(join(resources, "templates"), { recursive: true, force: true });
await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [join(root, "apps", "core", "src", "cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  sourcemap: false,
  legalComments: "none",
  metafile: true,
  plugins: [
    {
      name: "ssh2-pure-js-only",
      setup(plugin) {
        // Optional native accelerators are deliberately excluded, including installations that built them.
        plugin.onResolve(
          {
            filter:
              /^(cpu-features|bufferutil|utf-8-validate|\.\/crypto\/build\/Release\/sshcrypto\.node)$/
          },
          () => ({ path: "ssh-native-disabled", namespace: "rw-ssh" })
        );
        plugin.onLoad({ filter: /.*/, namespace: "rw-ssh" }, () => ({
          contents:
            'throw new Error("Optional SSH native accelerator disabled");',
          loader: "js"
        }));
      }
    }
  ],
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

await writeBuildManifest(
  root,
  "core",
  Object.values(result.metafile.outputs)
    .flatMap((output) =>
      Object.entries(output.inputs)
        .filter(([, info]) => info.bytesInOutput > 0)
        .map(([path]) => path)
    )
    .filter((path) => !path.startsWith("rw-ssh:")),
  [outfile],
  Object.values(result.metafile.outputs).flatMap((output) =>
    output.imports.filter((item) => item.external).map((item) => item.path)
  )
);

const sshNotices = [
  "# Native SSH third-party notices\n\nThe bundled SSH adapter uses ssh2 1.17.0 without optional native accelerators.\n",
  ...(await Promise.all(
    [
      ["ssh2", "LICENSE"],
      ["asn1", "LICENSE"],
      ["safer-buffer", "LICENSE"],
      ["bcrypt-pbkdf", "LICENSE"],
      ["tweetnacl", "LICENSE"]
    ].map(async ([name, file]) => {
      const parentRequire =
        name === "safer-buffer"
          ? createRequire(sshRequire.resolve("asn1/package.json"))
          : name === "tweetnacl"
            ? createRequire(sshRequire.resolve("bcrypt-pbkdf/package.json"))
            : name === "ssh2"
              ? coreRequire
              : sshRequire;
      const packagePath = parentRequire.resolve(`${name}/package.json`);
      const meta = JSON.parse(await readFile(packagePath, "utf8"));
      return `\n## ${name} ${meta.version}\n\n${await readFile(join(dirname(packagePath), file), "utf8")}\n`;
    })
  ))
];
await writeFile(
  join(dirname(outfile), "SSH_THIRD_PARTY_NOTICES.md"),
  sshNotices.join("\n")
);

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
await cp(
  join(root, "packages", "research-skills", "templates"),
  join(resources, "templates"),
  { recursive: true }
);

console.log(`[build:core] ${outfile}`);
console.log(`[build:core] skills -> ${join(resources, "skills")}`);
console.log(`[build:core] fixtures -> ${join(resources, "fixtures")}`);
console.log(`[build:core] templates -> ${join(resources, "templates")}`);
