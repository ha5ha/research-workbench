import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
// Build-only JavaScript is deliberately shared with the packaging command.
import {
  checkLicense,
  checkExternals,
  collectDistribution
} from "../../scripts/licenses/collect.mjs";

const mit = Buffer.from(
  "MIT License\n\nCopyright fixture\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software."
);
describe("distribution license gate", () => {
  it("requires full text in addition to a permissive declaration", () => {
    expect(() => checkLicense("fixture@1", "MIT", [])).toThrow(/text missing/);
    expect(() =>
      checkLicense("fixture@1", "MIT", [{ name: "NOTICE", bytes: mit }])
    ).toThrow(/text missing/);
    expect(() =>
      checkLicense("fixture@1", "MIT", [{ name: "LICENSE", bytes: mit }])
    ).not.toThrow();
  });
  it("rejects prohibited and unknown licenses including misleading metadata", () => {
    for (const license of [
      "GPL-3.0-only",
      "AGPL-3.0",
      "LGPL-2.1",
      "MIT OR GPL-2.0",
      "CUSTOM",
      undefined
    ])
      expect(() =>
        checkLicense("fixture@1", license, [{ name: "LICENSE", bytes: mit }])
      ).toThrow();
    expect(() =>
      checkLicense("fixture@1", "MIT", [
        {
          name: "LICENSE",
          bytes: Buffer.from(
            "GNU GENERAL PUBLIC LICENSE\n" + "fixture".repeat(20)
          )
        }
      ])
    ).toThrow(/copyleft/);
  });
  it("permits only accounted runtime external imports", () => {
    expect(() =>
      checkExternals("core", ["node:sqlite", "fs", "electron"])
    ).not.toThrow();
    expect(() => checkExternals("core", ["missing-runtime-package"])).toThrow(
      /unaccounted external/
    );
  });
  it("collects actual inputs and full NOTICE bytes while excluding unused development packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "rw-license-test-"));
    const put = async (path: string, bytes: string | Buffer) => {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), bytes);
    };
    const pkg = async (
      path: string,
      name: string,
      version = "1.0.0",
      license = "MIT"
    ) => {
      await put(
        `${path}/package.json`,
        JSON.stringify({ name, version, license })
      );
      await put(`${path}/LICENSE`, mit);
    };
    try {
      await put("LICENSE", mit);
      await put("THIRD_PARTY_NOTICES.md", "fixture source notice");
      await pkg("node_modules/used", "used");
      await put("node_modules/used/index.js", "export const fixture=1");
      const notice = Buffer.from(
        "Preserve this full copyright notice and whitespace.\r\n".repeat(3)
      );
      await put("node_modules/used/NOTICE", notice);
      await pkg(
        "node_modules/unused-dev",
        "unused-dev",
        "1.0.0",
        "GPL-3.0-only"
      );
      const tls = "apps/core/node_modules/typescript-language-server";
      await pkg(tls, "typescript-language-server", "6.0.2");
      await put(
        `${tls}/lib/cli.mjs.map`,
        JSON.stringify({
          sources: [
            "../node_modules/.pnpm/prebundled@1.0.0/node_modules/prebundled/index.js"
          ]
        })
      );
      await pkg(
        "node_modules/.pnpm/prebundled@1.0.0/node_modules/prebundled",
        "prebundled"
      );
      await pkg(
        "apps/core/node_modules/typescript",
        "typescript",
        "5.9.3",
        "Apache-2.0"
      );
      await put(
        "apps/core/node_modules/typescript/ThirdPartyNoticeText.txt",
        notice
      );
      await put("apps/desktop/resources/lsp/cli.mjs", "fixture");
      const electron = "apps/desktop/node_modules/electron";
      await pkg(electron, "electron", "45.0.0");
      await put(`${electron}/dist/version`, "45.0.0");
      await put(`${electron}/dist/LICENSE`, mit);
      await put(`${electron}/dist/LICENSES.chromium.html`, notice);
      await put(
        `${electron}/dist/${process.platform === "win32" ? "electron.exe" : "electron"}`,
        "fixture binary"
      );
      for (const name of ["core", "main", "preload", "renderer"])
        await put(
          `.tmp/distribution/${name}.json`,
          JSON.stringify({
            name,
            inputs: name === "core" ? ["node_modules/used/index.js"] : [],
            outputs: [],
            externals: ["node:fs"]
          })
        );
      const manifest = await collectDistribution(root);
      expect(
        manifest.packages.some((item: { name: string }) => item.name === "used")
      ).toBe(true);
      expect(
        manifest.packages.some(
          (item: { name: string }) => item.name === "unused-dev"
        )
      ).toBe(false);
      const used = manifest.packages.find(
        (item: { name: string }) => item.name === "used"
      );
      if (!used) throw new Error("used package missing");
      const output = used.documents.find((item: { path: string }) =>
        item.path.endsWith("NOTICE")
      );
      if (!output) throw new Error("NOTICE missing");
      expect(
        await readFile(
          join(root, "apps/desktop/resources/licenses", output.path)
        )
      ).toEqual(notice);
      expect(JSON.stringify(manifest)).not.toContain(root);
    } finally {
      if (
        !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
        !root.includes("rw-license-test-")
      )
        throw new Error("unsafe fixture cleanup");
      await rm(root, { recursive: true, force: true });
    }
  });
});
