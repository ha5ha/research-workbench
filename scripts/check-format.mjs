import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import prettier from "prettier";

let base = process.argv.find((arg) => arg.startsWith("--base="))?.slice(7);
if (!base && process.argv.includes("--ci")) {
  base = process.env.BASE_REV;
  if (!base || /^0+$/.test(base)) base = "HEAD^";
}
const git = (args) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
const files = [
  ...new Set(
    base
      ? git(["diff", "--name-only", "--diff-filter=ACMR", "-z", base, "HEAD"])
      : [
          ...git(["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"]),
          ...git(["ls-files", "--others", "--exclude-standard", "-z"])
        ]
  )
];
const checked = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const info = await prettier.getFileInfo(file, {
    ignorePath: ".prettierignore"
  });
  if (!info.ignored && info.inferredParser) checked.push(file);
}
if (checked.length)
  execFileSync(
    process.execPath,
    [
      "node_modules/prettier/bin/prettier.cjs",
      process.argv.includes("--write") ? "--write" : "--check",
      ...checked
    ],
    { stdio: "inherit" }
  );
else process.stdout.write("No changed formattable source files.\n");
