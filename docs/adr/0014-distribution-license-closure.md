# ADR-0014：实际分发闭包与完整第三方许可

- 状态：Accepted（2026-11-11，所有者要求可验证的 Windows 1.0 交付）
- 关联：ADR-0001/0005/0011；开源优先规范

## 问题与约束

根 NOTICE 与直接依赖表不能证明实际分发许可完整。Core 使用 esbuild、桌面使用 Rollup，语言服务 CLI 已由上游预打包，Electron 又包含 Chromium/Node 等二进制。扫描所有 pnpm 包会混入未分发的开发依赖；只看 package.json.license 会遗漏正文和 NOTICE。

## 候选、复用与维护

| 候选                                                                      | 许可与维护边界                                                         | 适配成本与结论                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| 现有 esbuild 0.28.2 metafile + electron-vite 6.0.0 / Rollup chunk.modules | 已固定、已使用的 MIT 构建工具；不升级或新增 SDK；构建本身持续验收      | 直接复用真实输出归属，采用             |
| license-checker 类安装树扫描器                                            | 需新增并锁定工具及其传递许可；安装树不等于 bundler tree-shaking 后闭包 | 无法单独证明实际分发，拒绝作为闭包来源 |
| 手写完整传递依赖表                                                        | 无新依赖但升级容易漏项，无法核对裁剪结果                               | 只保留审阅用补充来源，不作为自动闭包   |

此次只编写构建证据与许可文件装配胶水，不另造包解析器或引入第二套依赖管理工具。上游 npm 缺正文时，从相同版本 tarball 或该版本 gitHead 的官方仓库获取原文，固定来源和 SHA-256；正文随仓库维护，构建离线且不下载。不同版本的同名包不能替代。

## 决策

1. Core 记录实际有输出贡献的 esbuild inputs；Main/preload/renderer 记录 Rollup 渲染模块及外部 import。证据放 `.tmp/distribution`，不用整个 pnpm 安装树推断分发。
2. 通过每个真实输入最近的 package.json 识别包和精确版本。每个第三方必须有允许的许可证声明及完整 LICENSE/COPYING/NOTICE/ThirdPartyNotice 原文；缺失或未评审的许可失败，GPL/AGPL/LGPL 不得悄悄通过。
3. LSP 根据固定 CLI sourcemap 中的精确 pnpm 包版本恢复其上游预打包闭包。TypeScript 包收集 LICENSE.txt 和 ThirdPartyNoticeText.txt。无法识别的预打包来源失败。
4. Electron runtime 独立保留官方完整 LICENSE 与 LICENSES.chromium.html；后者包含平台/条件分支文本，不以全文出现 GPL 字样就认定直接链接 GPL。它作为官方二进制许可集合保留、单独登记版本与哈希，不能以 Electron 的 MIT 字段代替。
5. 生成 `resources/licenses/manifest.json`、按包归档的完整原文、产品 LICENSE 和根 THIRD_PARTY_NOTICES.md，显式通过 extraResources 进入 portable。manifest 只含包内相对路径、归属、版本、来源和哈希，不包含本机绝对路径。
6. 打包前校验 manifest 与构建产物哈希一致，拒绝未知外部依赖。只允许 Node 内置模块与 Electron runtime 外部导入。npm 包内嵌的额外第三方许可仍保留，不能仅用 SPDX 字段代替正文。
7. Main/preload 已完整打包普通 JS 依赖，显式排除 asar 中的 node_modules，避免 electron-builder 自动复制另一份未受实际输入证据约束的安装树。ws 的 bufferutil/utf-8-validate 与 SSH 的可选原生加速器在构建阶段明确禁用，保持已有纯 JS fallback。
8. electron-builder 使用已安装、固定版本的 `electron/dist`，避免另行下载与许可哈希证据不一致的 runtime；先检查 npm Electron 版本与 dist/version 相等，保留原始 Electron EXE 的 SHA-256。builder 会向 PE 资源注入 app.asar 完整性，因此冒烟另记实际包内 EXE 的 SHA-256，核对实际 runtime 版本、所有应用产物与许可文件哈希，不声称包内 EXE 与原始 Electron EXE 字节相等。

## 验证与退出

验证缺正文、禁止许可、未分发开发包排除、NOTICE 字节保留、未知外部依赖拒绝。实际 build:app 后生成闭包，再构建 Windows portable，核对 unpacked/portable 资源中的许可与实际 Core 冷启动/重开。保留 manifest 和 smoke 证据，禁止以截图或脚本存在声称完成。

升级 bundler、LSP、pi 或 Electron 后必须重新生成并审阅闭包，补充资料版本不匹配时失败。未来可替换为 SPDX/SBOM 工具，但必须保留真实 bundle 输入、预打包来源与完整原文的相同门禁；不用安装树扫描降低标准。
