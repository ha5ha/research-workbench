/** Ordinary jobs receive an explicit environment, never the model credential bag. */
const ALLOWED = new Set([
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "LC_ALL",
  "VIRTUAL_ENV",
  "CONDA_PREFIX",
  "CUDA_VISIBLE_DEVICES",
  "NUMBER_OF_PROCESSORS"
]);

export function executionEnvironment(
  workspace: string,
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(source).filter(
        ([key, value]) => value !== undefined && ALLOWED.has(key.toUpperCase())
      )
    ),
    RW_WORKSPACE: workspace,
    // Electron's binary is also the packaged Node runtime used by supervisors.
    ELECTRON_RUN_AS_NODE: "1"
  };
}

export function redactSecrets(text: string, source = process.env): string {
  let result = text;
  for (const [key, value] of Object.entries(source)) {
    if (
      /KEY|TOKEN|SECRET|PASSWORD|COOKIE|CREDENTIAL/i.test(key) &&
      value &&
      value.length >= 8
    ) {
      result = result.split(value).join("[redacted]");
    }
  }
  return result;
}

/** Retain only a possible secret prefix so pipe chunk boundaries cannot expose it. */
export class SecretOutputRedactor {
  private pending = "";
  private readonly secrets: string[];
  constructor(source: NodeJS.ProcessEnv = process.env) {
    this.secrets = [
      ...new Set(
        Object.entries(source)
          .filter(
            ([key, value]) =>
              /KEY|TOKEN|SECRET|PASSWORD|COOKIE|CREDENTIAL/i.test(key) &&
              value &&
              value.length >= 8
          )
          .map(([, value]) => value!)
      )
    ].sort((a, b) => b.length - a.length);
  }

  write(text: string): string {
    const buffer = this.pending + text;
    const output: string[] = [];
    let start = 0;
    for (let index = 0; index < buffer.length;) {
      const rest = buffer.slice(index);
      if (
        this.secrets.some(
          (secret) => rest.length < secret.length && secret.startsWith(rest)
        )
      ) {
        output.push(buffer.slice(start, index));
        this.pending = rest;
        return output.join("");
      }
      const match = this.secrets.find((secret) =>
        buffer.startsWith(secret, index)
      );
      if (match) {
        output.push(buffer.slice(start, index), "[redacted]");
        index += match.length;
        start = index;
      } else index += 1;
    }
    output.push(buffer.slice(start));
    this.pending = "";
    return output.join("");
  }

  end(): string {
    let output = this.pending;
    this.pending = "";
    for (const secret of this.secrets)
      output = output.split(secret).join("[redacted]");
    return output;
  }
}
