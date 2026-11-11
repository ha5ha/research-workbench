import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import {
  SshConnectionProfileSchema,
  SshHostKeySchema,
  SshProfileIdSchema,
  SshProfileSaveInputSchema,
  type SshConnectionProfile,
  type SshPrivateConfiguration,
  type SshProfileSummary,
  type SshSettingsSummary
} from "@research-workbench/contracts";

interface CredentialEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface StoredProfile {
  profile: SshConnectionProfile;
  encryptedPassword?: string;
}

/** Main-only vault. Callers never receive a password through the summary API. */
export class SshCredentialVault {
  private sessions = new Map<string, string>();
  private candidates = new Map<
    string,
    { revision: number; fingerprint: string }
  >();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly encryption: CredentialEncryption
  ) {}

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action, action);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<StoredProfile[]> {
    try {
      const info = await lstat(this.path);
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        info.nlink > 1 ||
        info.size > 1024 * 1024
      ) {
        throw new Error("SSH_ACCESS_DENIED");
      }
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("profiles" in parsed) ||
        !Array.isArray(parsed.profiles) ||
        parsed.profiles.length > 100
      )
        throw new Error();
      const ids = new Set<string>();
      return parsed.profiles.map((entry: unknown) => {
        if (!entry || typeof entry !== "object" || !("profile" in entry))
          throw new Error();
        const profile = SshConnectionProfileSchema.parse(entry.profile);
        if (ids.has(profile.id)) throw new Error();
        ids.add(profile.id);
        const encryptedPassword =
          "encryptedPassword" in entry ? entry.encryptedPassword : undefined;
        if (
          encryptedPassword !== undefined &&
          (typeof encryptedPassword !== "string" ||
            encryptedPassword.length > 8192 ||
            !/^[A-Za-z0-9+/]+=*$/.test(encryptedPassword))
        )
          throw new Error();
        return { profile, ...(encryptedPassword ? { encryptedPassword } : {}) };
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
      throw new Error("SSH_INVALID_INPUT");
    }
  }

  private async write(profiles: StoredProfile[]): Promise<void> {
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, profiles }), {
        flag: "wx",
        mode: 0o600
      });
      await rename(temporary, this.path);
    } catch {
      throw new Error("SSH_ACCESS_DENIED");
    }
  }

  private password(entry: StoredProfile): string | undefined {
    const session = this.sessions.get(entry.profile.id);
    if (session !== undefined) return session;
    if (!entry.encryptedPassword || !this.encryption.isEncryptionAvailable())
      return undefined;
    try {
      return (
        this.encryption.decryptString(
          Buffer.from(entry.encryptedPassword, "base64")
        ) || undefined
      );
    } catch {
      return undefined;
    }
  }

  private summary(entries: StoredProfile[]): SshSettingsSummary {
    return {
      encryptionAvailable: this.encryption.isEncryptionAvailable(),
      profiles: entries.map((entry): SshProfileSummary => {
        const hasCredential = Boolean(this.password(entry));
        return {
          ...entry.profile,
          hasCredential,
          credentialStorage: !hasCredential
            ? "missing"
            : this.sessions.has(entry.profile.id)
              ? "session"
              : "encrypted"
        };
      })
    };
  }

  list(): Promise<SshSettingsSummary> {
    return this.serial(async () => this.summary(await this.read()));
  }

  save(raw: unknown): Promise<SshSettingsSummary> {
    return this.serial(async () => {
      const input = SshProfileSaveInputSchema.safeParse(raw);
      if (!input.success) throw new Error("SSH_INVALID_INPUT");
      const value = input.data;
      const entries = await this.read();
      const previous = value.id
        ? entries.find((entry) => entry.profile.id === value.id)
        : undefined;
      if (value.id && !previous) throw new Error("SSH_PROFILE_MISSING");
      if (!previous && entries.length >= 100)
        throw new Error("SSH_INVALID_INPUT");
      if (
        value.password &&
        value.rememberPassword &&
        !this.encryption.isEncryptionAvailable()
      ) {
        throw new Error("SSH_ENCRYPTION_UNAVAILABLE");
      }
      const id = previous?.profile.id ?? `ssh-${randomUUID()}`;
      const endpointChanged = Boolean(
        previous &&
        (previous.profile.hostname !== value.hostname ||
          previous.profile.port !== value.port ||
          previous.profile.username !== value.username)
      );
      const profile: SshConnectionProfile = {
        id,
        label: value.label,
        hostname: value.hostname,
        port: value.port,
        username: value.username,
        revision: (previous?.profile.revision ?? 1) + (endpointChanged ? 1 : 0),
        hostKeySha256: endpointChanged
          ? null
          : (previous?.profile.hostKeySha256 ?? null)
      };
      let encryptedPassword = endpointChanged
        ? undefined
        : previous?.encryptedPassword;
      if (value.password) {
        if (value.rememberPassword) {
          try {
            encryptedPassword = this.encryption
              .encryptString(value.password)
              .toString("base64");
          } catch {
            throw new Error("SSH_ENCRYPTION_UNAVAILABLE");
          }
        } else encryptedPassword = undefined;
      }
      const next = {
        profile,
        ...(encryptedPassword ? { encryptedPassword } : {})
      };
      await this.write(
        previous
          ? entries.map((entry) => (entry === previous ? next : entry))
          : [...entries, next]
      );
      if (endpointChanged || (value.password && value.rememberPassword))
        this.sessions.delete(id);
      if (value.password && !value.rememberPassword)
        this.sessions.set(id, value.password);
      if (endpointChanged) this.candidates.delete(id);
      return this.summary(
        previous
          ? entries.map((entry) => (entry === previous ? next : entry))
          : [...entries, next]
      );
    });
  }

  clearCredential(rawId: unknown): Promise<SshSettingsSummary> {
    return this.serial(async () => {
      const id = SshProfileIdSchema.safeParse(rawId);
      if (!id.success) throw new Error("SSH_INVALID_INPUT");
      const entries = await this.read();
      if (!entries.some((entry) => entry.profile.id === id.data))
        throw new Error("SSH_PROFILE_MISSING");
      const next = entries.map((entry) =>
        entry.profile.id === id.data ? { profile: entry.profile } : entry
      );
      await this.write(next);
      this.sessions.delete(id.data);
      return this.summary(next);
    });
  }

  getProfile(rawId: unknown): Promise<SshConnectionProfile> {
    return this.serial(async () => {
      const id = SshProfileIdSchema.safeParse(rawId);
      if (!id.success) throw new Error("SSH_INVALID_INPUT");
      const entry = (await this.read()).find(
        (item) => item.profile.id === id.data
      );
      if (!entry) throw new Error("SSH_PROFILE_MISSING");
      return { ...entry.profile };
    });
  }

  rememberProbe(
    profile: SshConnectionProfile,
    rawFingerprint: unknown
  ): Promise<void> {
    return this.serial(async () => {
      const fingerprint = SshHostKeySchema.safeParse(rawFingerprint);
      const current = (await this.read()).find(
        (entry) => entry.profile.id === profile.id
      )?.profile;
      if (
        !fingerprint.success ||
        !current ||
        current.revision !== profile.revision
      )
        throw new Error("SSH_IDENTITY_CHANGED");
      this.candidates.set(profile.id, {
        revision: profile.revision,
        fingerprint: fingerprint.data
      });
    });
  }

  confirmHostKey(
    rawId: unknown,
    rawFingerprint: unknown
  ): Promise<SshSettingsSummary> {
    return this.serial(async () => {
      const id = SshProfileIdSchema.safeParse(rawId);
      const fingerprint = SshHostKeySchema.safeParse(rawFingerprint);
      if (!id.success || !fingerprint.success)
        throw new Error("SSH_INVALID_INPUT");
      const entries = await this.read();
      const entry = entries.find((item) => item.profile.id === id.data);
      const candidate = this.candidates.get(id.data);
      if (!entry) throw new Error("SSH_PROFILE_MISSING");
      if (
        !candidate ||
        candidate.revision !== entry.profile.revision ||
        candidate.fingerprint !== fingerprint.data
      ) {
        throw new Error("SSH_HOST_KEY_UNCONFIRMED");
      }
      const changed = entry.profile.hostKeySha256 !== fingerprint.data;
      const next = entries.map((item) =>
        item !== entry
          ? item
          : {
              ...item,
              profile: {
                ...item.profile,
                hostKeySha256: fingerprint.data,
                revision: item.profile.revision + (changed ? 1 : 0)
              }
            }
      );
      await this.write(next);
      this.candidates.delete(id.data);
      return this.summary(next);
    });
  }

  /** Only CoreBridge may receive this result. Never return it through Renderer IPC. */
  configuration(): Promise<SshPrivateConfiguration> {
    return this.serial(async () => ({
      profiles: (await this.read()).map((entry) => {
        const password = this.password(entry);
        return {
          profile: { ...entry.profile },
          ...(password ? { password } : {})
        };
      })
    }));
  }

  dispose(): void {
    this.sessions.clear();
    this.candidates.clear();
  }
}

/** An iframe or another window must not invoke credential operations. */
export function assertSshSettingsSender(
  event: { sender: unknown; senderFrame: unknown },
  contents: { mainFrame: unknown } | null
): void {
  if (
    !contents ||
    event.sender !== contents ||
    event.senderFrame !== contents.mainFrame
  ) {
    throw new Error("SSH_ACCESS_DENIED");
  }
}
