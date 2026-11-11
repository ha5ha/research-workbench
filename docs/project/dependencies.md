# 直接依赖与版本台账

更新：2026-11-11。现有依赖按 lock 解析版本固定；新增原生 SSH 依赖见 ADR-0011。许可字段取自已安装包及相应根许可；下表是直接依赖索引。实际分发闭包由 ADR-0014 的构建门禁另行收集，包含完整正文与官方 runtime notices；打包验收结果以发布记录为准。

## 直接适配的上游源码

| 项目 / 固定提交                                                    | 许可                              | 来源 → 本地落点                                                                                                                                                                                                    | 决策                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| alphaXiv/OpenResearch · `92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd` | MIT · Copyright (c) 2026 alphaXiv | `theme.css` → `packages/ui/src/tokens.css`；`PlanStrip.tsx` → ResearchActivity 审阅条；`ChatPanel.tsx` 的滚动跟随与 IME guard → ChatView；`ui/{Button,IconButton,MenuItem}.tsx` / `ModelPicker.tsx` → 共享基础控件 | [ADR-0009](../adr/0009-conversation-first-workspace.md)、[ADR-0019](../adr/0019-openresearch-chat-interactions.md)、[ADR-0020](../adr/0020-shared-openresearch-controls.md)；保留完整许可，无新增传递依赖 |
| Lucide React · `1.23.0`                                            | ISC + Feather-derived icons MIT   | 所需 `__iconNode` 数据 → `packages/ui/src/icon-nodes.ts`；官方 npm tarball SHA-512 与逐文件 SHA-256 → `packages/ui/vendor/lucide/SOURCES.json`                                                                     | [ADR-0020](../adr/0020-shared-openresearch-controls.md)；仅静态源码数据，无 icon runtime 或新增传递依赖；完整双许可保留                                                                                   |

完整版权和许可见根 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。这里区分源码适配与下面的 npm 依赖；不把“参考设计”计作整组件采用，也不复制上游权限和运行时。

共享展示工作区包 `@research-workbench/ui@1.0.0` 使用现有 `react@19.3.1` peer、开发类型 `@types/react@19.3.0`；Desktop 通过 `workspace:*` 链接，并固定于本仓库提交。该工作区范围不是外部漂移版本。

## npm 直接依赖

| 包                              | 固定版本 | 声明许可证    |
| ------------------------------- | -------- | ------------- |
| @codemirror/lang-javascript     | 6.2.5    | MIT           |
| @codemirror/lang-json           | 6.0.2    | MIT           |
| @codemirror/lang-markdown       | 6.5.2    | MIT           |
| @codemirror/lang-python         | 6.2.1    | MIT           |
| @codemirror/lsp-client          | 6.3.0    | MIT           |
| @codemirror/merge               | 6.12.3   | MIT           |
| @codemirror/search              | 6.7.2    | MIT           |
| @codemirror/state               | 6.7.6    | MIT           |
| @codemirror/view                | 6.43.15  | MIT           |
| @earendil-works/pi-ai           | 1.4.0    | MIT           |
| @earendil-works/pi-coding-agent | 1.4.0    | MIT           |
| @sinclair/typebox               | 0.34.52  | MIT           |
| @types/node                     | 24.19.2  | MIT           |
| @types/react                    | 19.3.0   | MIT           |
| @types/react-dom                | 19.3.0   | MIT           |
| @types/ssh2                     | 1.15.6   | MIT（仅开发） |
| @types/ws                       | 8.18.2   | MIT           |
| @vitejs/plugin-react            | 5.2.0    | MIT           |
| codemirror                      | 6.0.2    | MIT           |
| csv-parse                       | 6.2.1    | MIT           |
| diff                            | 9.0.0    | BSD-3-Clause  |
| electron                        | 45.0.0   | MIT           |
| electron-builder                | 26.18.0  | MIT           |
| electron-vite                   | 6.0.0    | MIT           |
| esbuild                         | 0.28.2   | MIT           |
| react                           | 19.3.1   | MIT           |
| react-dom                       | 19.3.1   | MIT           |
| prettier                        | 3.9.10   | MIT（仅开发） |
| simple-git                      | 4.0.2    | MIT           |
| ssh2                            | 1.17.0   | MIT           |
| tsx                             | 4.23.15  | MIT           |
| typescript                      | 5.9.3    | Apache-2.0    |
| typescript-language-server      | 6.0.2    | Apache-2.0    |
| vitest                          | 3.2.7    | MIT           |
| vscode-jsonrpc                  | 10.0.0   | MIT           |
| ws                              | 8.22.0   | MIT           |
| yaml                            | 2.9.1    | ISC           |
| zod                             | 3.25.76  | MIT           |

系统 Git/OpenSSH/Python 不随本次代码分发；本机验证 Node 24.18.1、Git 2.55.0.windows.3（最终版本以验证记录为准）。CI Actions 固定为 checkout v4.2.2、setup-node v4.4.0、pnpm/action-setup v4.1.0（官方 release 版本；尚未在远端运行）。远端主机运行 Python 3，实际版本应在真实 SSH 验收记录中补齐。

原生 SSH 的分发闭包：ssh2 1.17.0 → asn1 0.2.6 → safer-buffer 2.1.2（均 MIT）；ssh2 → bcrypt-pbkdf 1.0.2（BSD/ISC 完整文本）→ tweetnacl 0.14.5（Unlicense）。构建显式禁用 cpu-features 与 sshcrypto.node，未分发可选 native addon。完整许可见根 THIRD_PARTY_NOTICES.md，打包时同步生成 core/SSH_THIRD_PARTY_NOTICES.md。开发声明 @types/ssh2 及其传递声明包不进入 Core bundle。

`pnpm build:app && pnpm build:licenses` 从 esbuild/Rollup 实际输出模块、语言服务 sourcemap 精确版本和 Electron 45.0.0 官方 runtime notices 生成 `apps/desktop/resources/licenses/manifest.json` 与完整文本。该生成目录不入库，随 Windows portable 的 `resources/licenses` 分发；`beforePack` 再次核对产物哈希，拒绝缺正文、未知外部依赖或未经评审的许可。pi 等 npm 缺正文的固定来源补充在 `scripts/licenses/supplement-index.json`，含精确版本、tarball integrity/发布证明、commit 与文件哈希；构建过程离线。不扫描整个 pnpm 开发安装树，也不把 package.json.license 当作正文。Electron/Chromium HTML 作为官方条件/组件许可集合保留，不能把 Electron MIT 字段当作全部二进制许可。
