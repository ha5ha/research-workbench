// Maintainer utility: pin existing resolutions only; never fetch or upgrade.
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
const source=await readFile('pnpm-lock.yaml','utf8');
const lock=parse(source);const rows=new Map(),specifiers=new Map();
for(const [importer,sections] of Object.entries(lock.importers)){
  const path=join(importer,'package.json');const pkg=JSON.parse(await readFile(path,'utf8'));
  for(const section of ['dependencies','devDependencies','optionalDependencies'])for(const [name,value] of Object.entries(pkg[section]||{})){
    if(value.startsWith('workspace:'))continue;
    const entry=sections[section]?.[name];
    if(!entry)throw new Error(`Missing lock resolution: ${importer}/${name}`);
    const version=entry.version.split('(')[0];
    if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))throw new Error(`Non-semver resolution ${name}`);
    pkg[section][name]=version;
    if(specifiers.has(entry.specifier)&&specifiers.get(entry.specifier)!==version)throw new Error('Ambiguous specifier; pin manually');
    specifiers.set(entry.specifier,version);
    const installed=JSON.parse(await readFile(join(importer,'node_modules',name,'package.json'),'utf8'));
    if(installed.version!==version)throw new Error(`Installed version differs for ${name}`);
    rows.set(`${name}@${version}`,{name,version,license:typeof installed.license==='string'?installed.license:JSON.stringify(installed.license)||'UNKNOWN'});
  }
  await writeFile(path,JSON.stringify(pkg,null,2)+'\n');
}
await writeFile('pnpm-lock.yaml',source.replace(/^(\s+specifier: )([^\r\n]+)$/gm,(_,prefix,value)=>prefix+(specifiers.get(value)||value)));
const header='# 直接依赖与版本台账\n\n更新：2026-11-10。按现有 pnpm-lock 解析版本固定 manifest，未升级、未下载或新增依赖。许可字段取自已安装包 package.json；这是直接依赖清单，**不是传递依赖或二进制分发合规证明**。发布前仍需核对 LICENSE/NOTICE、Electron/Chromium、pi provider 传递依赖与素材。\n\n| 包 | 固定版本 | 声明许可证 |\n|---|---|---|\n';
await writeFile('docs/project/dependencies.md',header+[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(row=>`| ${row.name} | ${row.version} | ${row.license} |`).join('\n')+'\n\n系统 Git/OpenSSH/Python 不随本次代码分发；本机验证 Node 24.18.1、Git 2.53.0.windows.1（最终版本以验证记录为准）。远端主机运行 Python 3，实际版本应在真实 SSH 验收记录中补齐。\n');
console.log(`Pinned ${rows.size} existing direct dependencies; no resolution changes.`);
