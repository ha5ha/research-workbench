import ts from "typescript";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
const root = resolve(
  process.argv.find((arg) => arg.startsWith("--root="))?.slice(7) ??
    process.cwd()
);
const errors = [];
async function inspect(directory, forbidden) {
  for (const entry of await readdir(resolve(root, directory), {
    withFileTypes: true
  })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await inspect(path, forbidden);
    else if (/\.tsx?$/.test(path)) {
      const source = ts.createSourceFile(
        path,
        await readFile(resolve(root, path), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const visit = (node) => {
        let module;
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          module = node.moduleSpecifier.text;
        if (
          ts.isCallExpression(node) &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            node.expression.getText(source) === "require")
        )
          module = node.arguments[0].text;
        if (module && forbidden.test(module))
          errors.push(
            `${relative(process.cwd(), path)}: forbidden boundary import ${module}`
          );
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
}
await inspect(
  "apps/desktop/src/renderer",
  /^(node:|electron$|@research-workbench\/(core|db|agent-runtime|domain)|(?:fs|child_process|sqlite|better-sqlite3|simple-git)(?:\/|$))/
);
await inspect(
  "packages/contracts/src",
  /^(node:|electron$|@research-workbench\/(?!contracts)|.*pi-coding-agent)/
);
await inspect(
  "packages/domain/src",
  /^(node:|electron$|@research-workbench\/(core|db|agent-runtime)|.*pi-coding-agent)/
);
await inspect(
  "packages/agent-runtime/src",
  /^@research-workbench\/(domain|db|core)/
);
await inspect(
  "packages/ui/src",
  /^(node:|electron$|@research-workbench\/(core|db|agent-runtime|domain))/
);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Architecture boundary lint passed (static imports only; not an OS sandbox)."
  );
