/** Ordinary jobs receive an explicit environment, never the model credential bag. */
const ALLOWED = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL",
  "VIRTUAL_ENV", "CONDA_PREFIX", "CUDA_VISIBLE_DEVICES", "NUMBER_OF_PROCESSORS"
]);

export function executionEnvironment(
  workspace: string,
  source: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(Object.entries(source).filter(([key, value]) =>
      value !== undefined && ALLOWED.has(key.toUpperCase())
    )),
    RW_WORKSPACE: workspace,
    // Electron's binary is also the packaged Node runtime used by supervisors.
    ELECTRON_RUN_AS_NODE: "1"
  };
}

export function redactSecrets(text: string, source = process.env): string {
  let result = text;
  for (const [key, value] of Object.entries(source)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|COOKIE|CREDENTIAL/i.test(key) && value && value.length >= 8) {
      result = result.split(value).join("[redacted]");
    }
  }
  return result;
}
