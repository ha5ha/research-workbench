import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export async function writeBuildManifest(
  root,
  name,
  inputs,
  outputs,
  externals
) {
  const normalize = (path) =>
    relative(root, resolve(root, path)).replaceAll("\\", "/");
  const path = resolve(root, ".tmp/distribution", `${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        schemaVersion: 1,
        name,
        inputs: [...new Set(inputs.map(normalize))].sort(),
        outputs: await Promise.all(
          outputs
            .sort()
            .map(async (file) => ({
              path: normalize(file),
              sha256: sha256(await readFile(file))
            }))
        ),
        externals: [...new Set(externals)].sort()
      },
      null,
      2
    ) + "\n"
  );
}
