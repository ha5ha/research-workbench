// Explicit maintainer-only acquisition; never called by build/package.
// Reads official pinned archives/texts, verifies bytes, and executes no upstream code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const downloads = new Map();
async function get(url) {
  if (downloads.has(url)) return downloads.get(url);
  const request = download(url);
  downloads.set(url, request);
  return request;
}
async function download(url) {
  const raw = url.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([a-f0-9]{40})\/(.+)$/
  );
  const transportUrl = raw
    ? `https://api.github.com/repos/${raw[1]}/contents/${raw[3]}?ref=${raw[2]}`
    : url;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(transportUrl, {
        signal: AbortSignal.timeout(30000),
        headers: {
          Accept: raw ? "application/vnd.github+json" : "*/*",
          "User-Agent": "research-workbench-license-audit"
        }
      });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      if (raw) {
        const result = await response.json();
        assert.equal(result.encoding, "base64");
        return Buffer.from(result.content, "base64");
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}
function untar(archive) {
  const bytes = gunzipSync(archive),
    files = new Map();
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, "");
    if (!name) break;
    const size =
      Number.parseInt(
        header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(),
        8
      ) || 0;
    if ([0, 48].includes(header[156]))
      files.set(name, bytes.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
const lsp = [
  "commander@15.0.0",
  "crypto-random-string@4.0.0",
  "deepmerge@4.3.1",
  "find-up-simple@1.0.1",
  "p-debounce@5.1.1",
  "package-up@5.0.0",
  "temp-dir@3.0.0",
  "tempy@3.2.0",
  "unique-string@3.0.0",
  "vscode-jsonrpc@9.0.3",
  "vscode-languageserver-protocol@3.18.4",
  "vscode-languageserver-textdocument@1.0.15",
  "vscode-languageserver-types@3.18.4",
  "vscode-languageserver@10.1.2",
  "vscode-uri@3.2.0",
  "which@7.0.0"
];
const pi = [
  "agent-core",
  "ai",
  "codemode",
  "coding-agent",
  "mcp",
  "telemetry",
  "tui"
].map((name) => `@earendil-works/pi-${name}@1.4.0`);
const pins = {
  pi: {
    repository: "earendil-works/pi",
    commit: "4a080252f06caf63a525d7873c5d94d3c23887e0",
    licenseSha256:
      "0457f5bcec3b3b211605dfb5d1a49042fd638f3686a410fe099c24a25af13c48"
  },
  standardwebhooks: {
    repository: "standard-webhooks/standard-webhooks",
    commit: "b4d2c14fc5b4ccff3ff271e3b087dff812254c59",
    licenseSha256:
      "5ec8c7b26b64d881a6706617bed25c049f97f2f35de034c756de8546fd6dbe27"
  },
  dataUri: {
    repository: "TooTallNate/node-data-uri-to-buffer",
    commit: "85cd8c854aefbf1bb636789d80364cfac8ea1583",
    readmeSha256:
      "a7cc4332acfa1f9b6530e01aac77fefe74f2efa32579215fddaa473013f9a25c"
  }
};
async function acquire(spec) {
  const split = spec.lastIndexOf("@"),
    name = spec.slice(0, split),
    version = spec.slice(split + 1);
  const metadataUrl = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
  const metadata = JSON.parse(await get(metadataUrl));
  assert.equal(metadata.name, name);
  assert.equal(metadata.version, version);
  assert.ok(metadata.dist.integrity.startsWith("sha512-"));
  const archive = await get(metadata.dist.tarball);
  const digest = createHash("sha512").update(archive).digest();
  assert.equal(`sha512-${digest.toString("base64")}`, metadata.dist.integrity);
  const files = untar(archive),
    packageMeta = JSON.parse(files.get("package/package.json"));
  assert.equal(packageMeta.name, name);
  assert.equal(packageMeta.version, version);
  const source = {
    url: metadata.dist.tarball,
    integrity: metadata.dist.integrity,
    metadataUrl
  };
  const documents = [...files]
    .filter(([path]) =>
      /^package\/(?:licen[cs]e|copying|notice)(?:[._-].*)?$|^package\/thirdpartynotice/i.test(
        path
      )
    )
    .map(([path, bytes]) => ({
      name: path.slice(8),
      bytes,
      url: metadata.dist.tarball
    }));
  if (name.startsWith("@earendil-works/")) {
    const pin = pins.pi;
    const provenanceUrl = metadata.dist.attestations.url;
    const attestations = JSON.parse(await get(provenanceUrl));
    const payload = Buffer.from(
      attestations.attestations.find(
        (item) => item.predicateType === "https://slsa.dev/provenance/v1"
      ).bundle.dsseEnvelope.payload,
      "base64"
    );
    const statement = JSON.parse(payload);
    assert.ok(
      statement.subject.some(
        (item) => item.digest.sha512 === digest.toString("hex")
      )
    );
    assert.ok(
      statement.predicate.buildDefinition.resolvedDependencies.some(
        (item) =>
          item.uri.startsWith(`git+https://github.com/${pin.repository}@`) &&
          item.digest.gitCommit === pin.commit
      )
    );
    const raw = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}`;
    const sourceDirectory = packageMeta.repository.directory;
    assert.ok(/^packages\/[a-z-]+$/.test(sourceDirectory));
    const upstreamPackage = JSON.parse(
      await get(`${raw}/${sourceDirectory}/package.json`)
    );
    assert.equal(upstreamPackage.name, name);
    assert.equal(upstreamPackage.version, version);
    assert.equal(upstreamPackage.license, "MIT");
    const bytes = await get(`${raw}/LICENSE`);
    assert.equal(sha256(bytes), pin.licenseSha256);
    documents.push({ name: "LICENSE", bytes, url: `${raw}/LICENSE` });
    Object.assign(source, {
      repository: pin.repository,
      commit: pin.commit,
      provenanceUrl,
      provenancePayloadSha256: sha256(payload),
      licenseRetrieval:
        "GitHub official Contents API, base64 decoded without text rewriting",
      verification:
        "Official npm SLSA payload subject SHA512 matched archive and resolvedDependencies commit; Sigstore signature not independently verified"
    });
  } else if (name === "standardwebhooks") {
    const pin = pins.standardwebhooks;
    assert.equal(metadata.gitHead, pin.commit);
    const raw = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}`;
    const upstreamPackage = JSON.parse(
      await get(`${raw}/libraries/javascript/package.json`)
    );
    assert.equal(upstreamPackage.version, version);
    assert.equal(upstreamPackage.license, "MIT");
    const bytes = await get(`${raw}/libraries/LICENSE`);
    assert.equal(sha256(bytes), pin.licenseSha256);
    documents.push({ name: "LICENSE", bytes, url: `${raw}/libraries/LICENSE` });
    Object.assign(source, { repository: pin.repository, gitHead: pin.commit });
  } else if (name === "data-uri-to-buffer") {
    const pin = pins.dataUri;
    assert.equal(metadata.gitHead, pin.commit);
    const raw = `https://raw.githubusercontent.com/${pin.repository}/${pin.commit}`;
    const upstreamPackage = JSON.parse(await get(`${raw}/package.json`));
    assert.equal(upstreamPackage.version, version);
    assert.equal(upstreamPackage.license, "MIT");
    const readme = await get(`${raw}/README.md`);
    assert.equal(sha256(readme), pin.readmeSha256);
    const start = readme.indexOf(Buffer.from("(The MIT License)")),
      end = readme.indexOf(Buffer.from("[rfc]:"), start);
    assert.equal(start, 1775);
    assert.ok(end > start);
    documents.push({
      name: "LICENSE-from-README.txt",
      bytes: readme.subarray(start, end),
      url: `${raw}/README.md#license`
    });
    Object.assign(source, {
      repository: pin.repository,
      gitHead: pin.commit,
      readmeSha256: sha256(readme),
      extraction: {
        startByte: start,
        endByteExclusive: end,
        startMarker: "(The MIT License)",
        endMarker: "[rfc]:"
      }
    });
  }
  assert.ok(
    documents.some((document) => /^licen[cs]e|^copying/i.test(document.name)),
    `${spec}: full text missing`
  );
  const folder = `supplements/${name.replaceAll("/", "__")}@${version}`;
  await mkdir(join(base, folder), { recursive: true });
  const result = [];
  for (const document of documents) {
    const path = `${folder}/${document.name}`;
    assert.ok(document.bytes.length > 50);
    await writeFile(join(base, path), document.bytes);
    result.push({
      path,
      sha256: sha256(document.bytes),
      sourceUrl: document.url
    });
  }
  console.log(`[license-source] ${spec}: ${result.length} full document(s)`);
  return {
    name,
    version,
    license: packageMeta.license,
    source,
    documents: result
  };
}
const specs = [
  ...lsp,
  ...pi,
  "standardwebhooks@1.1.1",
  "data-uri-to-buffer@4.0.1"
];
const packages = [];
for (let offset = 0; offset < specs.length; offset += 5)
  packages.push(
    ...(await Promise.all(specs.slice(offset, offset + 5).map(acquire)))
  );
await writeFile(
  join(base, "supplement-index.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      packages: packages.sort((a, b) => a.name.localeCompare(b.name))
    },
    null,
    2
  ) + "\n"
);
