/** Electron adds a transport prefix; keep the actionable service message. */
export function requestError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    ""
  );
}
