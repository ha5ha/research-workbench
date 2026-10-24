import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

export interface ImportedAttachment {
  name: string;
  path: string;
  size: number;
}

/**
 * Copy user-selected files into <workspace>/uploads and return stable
 * workspace-relative paths. The Agent only ever receives these relative paths.
 */
export async function importAttachments(
  workspaceRoot: string,
  sources: string[]
): Promise<ImportedAttachment[]> {
  const uploads = join(workspaceRoot, "uploads");
  await mkdir(uploads, { recursive: true });
  const files: ImportedAttachment[] = [];
  for (const source of sources) {
    const info = await stat(source);
    if (!info.isFile()) continue;
    if (info.size > 50 * 1024 * 1024) {
      throw new Error(`${basename(source)} 超过 50MB`);
    }
    const extension = extname(source);
    const stem = basename(source, extension).replace(
      /[^\w\u4e00-\u9fa5.-]+/g,
      "-"
    );
    const stored = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}-${stem}${extension}`;
    await copyFile(source, join(uploads, stored));
    files.push({
      name: basename(source),
      path: `uploads/${stored}`,
      size: info.size
    });
  }
  return files;
}
