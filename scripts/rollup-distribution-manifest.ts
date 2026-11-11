import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";

// Uses Rollup's final rendered modules, rather than installed dependencies.
export function distributionManifest(name: string) {
  // electron-vite loads bundled config modules from its own temporary path.
  const root = resolve(process.cwd(), "../..");
  return {
    name: `distribution-manifest-${name}`,
    writeBundle(
      this: {
        getModuleIds(): IterableIterator<string>;
        getModuleInfo(id: string): { isIncluded: boolean | null } | null;
      },
      options: { dir?: string },
      bundle: Record<string, any>
    ) {
      const inputs = new Set<string>(),
        externals = new Set<string>();
      const outputs: { path: string; sha256: string }[] = [];
      const normalize = (path: string) =>
        relative(root, path).replaceAll("\\", "/");
      // Vite extracts CSS into assets, so its rendered JavaScript length is zero.
      for (const id of this.getModuleIds()) {
        const cleaned = id.replace(/\?.*$/, "");
        if (
          /\.(?:css|scss|sass|less|styl)$/.test(cleaned) &&
          this.getModuleInfo(id)?.isIncluded &&
          /^(?:[A-Za-z]:|\/)/.test(cleaned)
        )
          inputs.add(normalize(cleaned));
      }
      for (const item of Object.values(bundle)) {
        if (item.type === "chunk") {
          for (const [id, module] of Object.entries(item.modules) as [
            string,
            { renderedLength: number }
          ][]) {
            const cleaned = id.replace(/^\0/, "").replace(/\?commonjs.*$/, "");
            if (module.renderedLength > 0 && /^(?:[A-Za-z]:|\/)/.test(cleaned))
              inputs.add(normalize(cleaned));
          }
          for (const dependency of [...item.imports, ...item.dynamicImports])
            if (!bundle[dependency]) externals.add(dependency);
        }
        const path = resolve(options.dir ?? ".", item.fileName);
        outputs.push({
          path: normalize(path),
          sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
        });
      }
      const path = resolve(root, ".tmp/distribution", `${name}.json`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify(
          {
            schemaVersion: 1,
            name,
            inputs: [...inputs].sort(),
            outputs: outputs.sort((a, b) => a.path.localeCompare(b.path)),
            externals: [...externals].sort()
          },
          null,
          2
        ) + "\n"
      );
    }
  };
}
