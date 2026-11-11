import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SshCredentialVault,
  assertSshSettingsSender
} from "../../apps/desktop/src/main/ssh-credentials.js";

const cleanup: string[] = [];
const fingerprint = `SHA256:${"A".repeat(43)}`;
const otherFingerprint = `SHA256:${"B".repeat(43)}`;
const fixturePassword = 'fixture-only-"not-a-real-password';
function encryption(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) =>
      Buffer.from([...value].reverse().join("")),
    decryptString: (value: Buffer) => [...value.toString()].reverse().join("")
  };
}
async function setup(available = true) {
  const root = await mkdtemp(join(tmpdir(), "rw-ssh-vault-"));
  cleanup.push(root);
  const path = join(root, "ssh-connections.json");
  return { path, vault: new SshCredentialVault(path, encryption(available)) };
}
const input = {
  label: "Test lab",
  hostname: "fixture.invalid",
  port: 22,
  username: "researcher",
  rememberPassword: true
};
afterEach(async () => {
  for (const root of cleanup.splice(0)) {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
      !root.includes("rw-ssh-vault-")
    )
      throw new Error("unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

describe("Main SSH credential vault", () => {
  it("returns only summaries, persists encrypted bytes, and rehydrates privately", async () => {
    const { path, vault } = await setup();
    const summary = await vault.save({ ...input, password: fixturePassword });
    expect(summary.profiles[0]).toMatchObject({
      hasCredential: true,
      credentialStorage: "encrypted",
      revision: 1,
      hostKeySha256: null
    });
    expect(JSON.stringify(summary)).not.toContain(fixturePassword);
    expect(await readFile(path, "utf8")).not.toContain(fixturePassword);
    const restarted = new SshCredentialVault(path, encryption());
    expect((await restarted.configuration()).profiles[0]?.password).toBe(
      fixturePassword
    );
  });

  it("keeps session-only passwords out of persistence and forgets them on restart", async () => {
    const { path, vault } = await setup(false);
    await expect(
      vault.save({ ...input, password: fixturePassword })
    ).rejects.toThrow("SSH_ENCRYPTION_UNAVAILABLE");
    const summary = await vault.save({
      ...input,
      rememberPassword: false,
      password: fixturePassword
    });
    expect(summary.profiles[0]?.credentialStorage).toBe("session");
    expect((await vault.configuration()).profiles[0]?.password).toBe(
      fixturePassword
    );
    expect(await readFile(path, "utf8")).not.toContain("encryptedPassword");
    expect(
      (await new SshCredentialVault(path, encryption(false)).list()).profiles[0]
        ?.hasCredential
    ).toBe(false);
    vault.dispose();
    expect((await vault.configuration()).profiles[0]?.password).toBeUndefined();
  });

  it("requires a matching fresh probe and changes identity only for destination or pin", async () => {
    const { vault } = await setup();
    const first = (await vault.save({ ...input, password: fixturePassword }))
      .profiles[0]!;
    await expect(vault.confirmHostKey(first.id, fingerprint)).rejects.toThrow(
      "SSH_HOST_KEY_UNCONFIRMED"
    );
    await vault.rememberProbe(first, fingerprint);
    const confirmed = (await vault.confirmHostKey(first.id, fingerprint))
      .profiles[0]!;
    expect(confirmed.revision).toBe(2);
    const rotated = (
      await vault.save({
        ...input,
        id: first.id,
        label: "Renamed",
        password: "fixture-rotation"
      })
    ).profiles[0]!;
    expect(rotated.revision).toBe(2);
    expect(rotated.hostKeySha256).toBe(fingerprint);
    await vault.rememberProbe(rotated, otherFingerprint);
    const changed = (
      await vault.save({
        ...input,
        id: first.id,
        hostname: "another-fixture.invalid"
      })
    ).profiles[0]!;
    expect(changed).toMatchObject({
      revision: 3,
      hostKeySha256: null,
      hasCredential: false
    });
    expect((await vault.configuration()).profiles[0]?.password).toBeUndefined();
    await expect(
      vault.confirmHostKey(first.id, otherFingerprint)
    ).rejects.toThrow("SSH_HOST_KEY_UNCONFIRMED");
    await expect(vault.rememberProbe(rotated, fingerprint)).rejects.toThrow(
      "SSH_IDENTITY_CHANGED"
    );
  });

  it("revokes persisted and session credentials without removing connection identity", async () => {
    const { vault } = await setup();
    const profile = (
      await vault.save({
        ...input,
        rememberPassword: false,
        password: fixturePassword
      })
    ).profiles[0]!;
    await vault.clearCredential(profile.id);
    expect((await vault.list()).profiles[0]).toMatchObject({
      id: profile.id,
      hasCredential: false,
      revision: 1
    });
    expect((await vault.configuration()).profiles[0]?.password).toBeUndefined();
  });

  it("uses fixed errors for invalid secret-bearing input and encryption failures", async () => {
    const { path, vault } = await setup();
    await expect(
      vault.save({
        ...input,
        hostname: fixturePassword,
        password: fixturePassword
      })
    ).rejects.toThrow(/^SSH_INVALID_INPUT$/);
    const failing = new SshCredentialVault(path, {
      ...encryption(),
      encryptString: () => {
        throw new Error(fixturePassword);
      }
    });
    await expect(
      failing.save({ ...input, password: fixturePassword })
    ).rejects.toThrow(/^SSH_ENCRYPTION_UNAVAILABLE$/);
  });
});

it("allows only the main window main frame to invoke SSH settings", () => {
  const frame = {};
  const contents = { mainFrame: frame };
  expect(() =>
    assertSshSettingsSender({ sender: contents, senderFrame: frame }, contents)
  ).not.toThrow();
  for (const event of [
    { sender: {}, senderFrame: frame },
    { sender: contents, senderFrame: {} },
    { sender: contents, senderFrame: null }
  ]) {
    expect(() => assertSshSettingsSender(event, contents)).toThrow(
      /^SSH_ACCESS_DENIED$/
    );
  }
  expect(() =>
    assertSshSettingsSender({ sender: contents, senderFrame: frame }, null)
  ).toThrow(/^SSH_ACCESS_DENIED$/);
});
