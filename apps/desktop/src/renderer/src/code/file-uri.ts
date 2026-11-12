/** LSP file URIs use three slashes for POSIX/drive paths and an authority for UNC. */
export function fileUri(root: string, path: string): string {
  const directory = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const full = `${directory}/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
  if (full.startsWith("//")) {
    const [authority, ...parts] = full.slice(2).split("/");
    return `file://${authority}/${parts.map(encodeURIComponent).join("/")}`;
  }
  const absolute = full.startsWith("/") ? full : `/${full}`;
  return `file://${absolute
    .split("/")
    .map((part, index) =>
      index === 1 && /^[a-z]:$/i.test(part)
        ? `${part[0]!.toLowerCase()}%3A`
        : encodeURIComponent(part)
    )
    .join("/")}`;
}
