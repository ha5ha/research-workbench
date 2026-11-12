import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import prettier from "prettier";

it("fails the real architecture command for a renderer filesystem import", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-gate-"));
  try {
    for (const path of [
      "apps/desktop/src/renderer",
      "packages/contracts/src",
      "packages/domain/src",
      "packages/agent-runtime/src",
      "packages/ui/src"
    ])
      await mkdir(join(root, path), { recursive: true });
    await writeFile(
      join(root, "apps/desktop/src/renderer/invalid.ts"),
      'import { readFile } from "node:fs/promises";\nvoid readFile;\n'
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/lint-boundaries.mjs", `--root=${root}`],
      { encoding: "utf8", windowsHide: true }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "forbidden boundary import node:fs/promises"
    );
  } finally {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-gate-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects unused code and conditional React hooks with the production ESLint config", async () => {
  const lint = new ESLint();
  const [result] = await lint.lintText(
    'import { useState } from "react";\nfunction Bad({ enabled }: { enabled: boolean }) { const unused = 1; if (enabled) useState(0); return null; }\nexport { Bad };\n',
    { filePath: "apps/desktop/src/renderer/src/gate-fixture.tsx" }
  );
  expect(result!.messages.map((message) => message.ruleId)).toEqual(
    expect.arrayContaining([
      "@typescript-eslint/no-unused-vars",
      "react-hooks/rules-of-hooks"
    ])
  );
});
it("rejects hard-coded CSS colors and cross-feature rules using the production Stylelint config", async () => {
  const result = await stylelint.lint({
    code: ".records-leak { color: #fff; }",
    codeFilename: resolve("apps/desktop/src/renderer/src/styles/code.css"),
    configFile: "stylelint.config.mjs"
  });
  expect(result.errored).toBe(true);
  expect(result.results[0]!.warnings.map((warning) => warning.rule)).toEqual(
    expect.arrayContaining(["color-no-hex", "research/feature-ownership"])
  );
});
it("rejects a real TypeScript type error and malformed Prettier input", async () => {
  const root = await mkdtemp(join(tmpdir(), "rw-gate-"));
  try {
    const file = join(root, "invalid.ts");
    await writeFile(
      file,
      'const value: number = "wrong";\nexport { value };\n'
    );
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        file,
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--types",
        "node",
        "--typeRoots",
        resolve("node_modules/@types")
      ],
      { encoding: "utf8", windowsHide: true }
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("TS2322");
    expect(
      await prettier.check("const value=   1", { parser: "typescript" })
    ).toBe(false);
  } finally {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-gate-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
