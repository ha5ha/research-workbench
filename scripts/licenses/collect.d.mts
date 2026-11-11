export function checkLicense(
  name: string,
  license: unknown,
  documents: { name: string; bytes: Buffer }[]
): void;
export function checkExternals(name: string, externals: string[]): void;
export function collectDistribution(root: string): Promise<{
  packages: {
    name: string;
    version: string;
    documents: { path: string; sha256: string }[];
  }[];
}>;
