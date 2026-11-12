import { expect, it } from "vitest";
import { fileUri } from "../../apps/desktop/src/renderer/src/code/file-uri.js";

it.each([
  ["/home/runner/project", "", "file:///home/runner/project/"],
  ["/private/var/project/", "src/a.ts", "file:///private/var/project/src/a.ts"],
  [
    "C:\\Users\\runner\\project",
    "src\\a.ts",
    "file:///c%3A/Users/runner/project/src/a.ts"
  ],
  ["\\\\server\\share\\project", "a.ts", "file://server/share/project/a.ts"],
  [
    "/data/100% ?#中文",
    "a #%.ts",
    "file:///data/100%25%20%3F%23%E4%B8%AD%E6%96%87/a%20%23%25.ts"
  ]
])("encodes the LSP path %s + %s", (root, path, expected) => {
  expect(fileUri(root, path)).toBe(expected);
});
