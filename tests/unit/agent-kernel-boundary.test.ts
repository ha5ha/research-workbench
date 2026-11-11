import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

it("keeps product semantics and SDK internals on their respective sides", async () => {
  const runtime = join(process.cwd(), "packages/agent-runtime/src");
  for (const file of await readdir(runtime)) {
    if (!file.endsWith(".ts")) continue;
    const source = await readFile(join(runtime, file), "utf8");
    expect(source, file).not.toMatch(
      /ResearchScope|ArtifactRef|create_experiment|finish_experiment|research_state|request_run|propose_claim|data_profile|record_note|taskbook|task book/i
    );
    expect(source, file).not.toMatch(
      /DefaultResourceLoader|DefaultPackageManager|discoverAndLoadExtensions|loadProjectContextFiles|SettingsManager\.create/
    );
  }
  for (const file of ["agent-tools.ts", "agent-chat.ts", "agent-spike.ts"]) {
    const source = await readFile(
      join(process.cwd(), "apps/core/src", file),
      "utf8"
    );
    expect(source, file).not.toMatch(/@earendil-works|@sinclair\/typebox/);
  }
});
