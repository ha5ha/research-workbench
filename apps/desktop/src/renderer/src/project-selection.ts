/** Local filesystem names are already decoded; '%' is valid data. */
export function projectNameFromRoot(root: string | null): string {
  if (!root) return "未命名研究";
  const name = root.split(/[\\/]/).filter(Boolean).at(-1) ?? "未命名研究";
  return name === "workspace" ? "未命名研究" : name;
}
