# 直接依赖与版本台账

更新：2026-11-12。现有依赖按 lock 解析版本固定；原生 SSH 见 ADR-0011，审计开发门禁见 [ADR-0022](../adr/0022-audit-reliability-and-quality-gates.md)。许可字段取自已安装包及相应根许可；下表是直接依赖索引。实际分发闭包由 ADR-0014 的构建门禁另行收集，包含完整正文与官方 runtime notices；打包验收结果以发布记录为准。

## 直接适配的上游源码

| 项目 / 固定提交                                                    | 许可                              | 来源 → 本地落点                                                                                                                                                                                                    | 决策                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| alphaXiv/OpenResearch · `92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd` | MIT · Copyright (c) 2026 alphaXiv | `theme.css` → `packages/ui/src/tokens.css`；`PlanStrip.tsx` → ResearchActivity 审阅条；`ChatPanel.tsx` 的滚动跟随与 IME guard → ChatView；`ui/{Button,IconButton,MenuItem}.tsx` / `ModelPicker.tsx` → 共享基础控件 | [ADR-0009](../adr/0009-conversation-first-workspace.md)、[ADR-0019](../adr/0019-openresearch-chat-interactions.md)、[ADR-0020](../adr/0020-shared-openresearch-controls.md)；保留完整许可，无新增传递依赖 |
| Lucide React · `1.23.0`                                            | ISC + Feather-derived icons MIT   | 所需 `__iconNode` 数据 → `packages/ui/src/icon-nodes.ts`；官方 npm tarball SHA-512 与逐文件 SHA-256 → `packages/ui/vendor/lucide/SOURCES.json`                                                                     | [ADR-0020](../adr/0020-shared-openresearch-controls.md)；仅静态源码数据，无 icon runtime 或新增传递依赖；完整双许可保留                                                                                   |

完整版权和许可见根 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。这里区分源码适配与下面的 npm 依赖；不把“参考设计”计作整组件采用，也不复制上游权限和运行时。

共享展示工作区包 `@research-workbench/ui@1.0.0` 使用现有 `react@19.3.1` peer、开发类型 `@types/react@19.3.0`；Desktop 通过 `workspace:*` 链接，并固定于本仓库提交。该工作区范围不是外部漂移版本。

## npm 直接依赖

| 包                              | 固定版本 | 声明许可证           |
| ------------------------------- | -------- | -------------------- |
| @codemirror/lang-javascript     | 6.2.5    | MIT                  |
| @codemirror/lang-json           | 6.0.2    | MIT                  |
| @codemirror/lang-markdown       | 6.5.2    | MIT                  |
| @codemirror/lang-python         | 6.2.1    | MIT                  |
| @codemirror/lsp-client          | 6.3.0    | MIT                  |
| @codemirror/merge               | 6.12.3   | MIT                  |
| @codemirror/search              | 6.7.2    | MIT                  |
| @codemirror/state               | 6.7.6    | MIT                  |
| @codemirror/view                | 6.43.15  | MIT                  |
| @earendil-works/pi-ai           | 1.4.0    | MIT                  |
| @earendil-works/pi-coding-agent | 1.4.0    | MIT                  |
| @playwright/test                | 1.65.0   | Apache-2.0（仅开发） |
| @sinclair/typebox               | 0.34.52  | MIT                  |
| @types/node                     | 24.19.2  | MIT                  |
| @types/react                    | 19.3.0   | MIT                  |
| @types/react-dom                | 19.3.0   | MIT                  |
| @types/ssh2                     | 1.15.6   | MIT（仅开发）        |
| @types/ws                       | 8.18.2   | MIT                  |
| @vitejs/plugin-react            | 5.2.0    | MIT                  |
| codemirror                      | 6.0.2    | MIT                  |
| csv-parse                       | 6.2.1    | MIT                  |
| diff                            | 9.0.0    | BSD-3-Clause         |
| electron                        | 45.0.0   | MIT                  |
| electron-builder                | 26.18.0  | MIT                  |
| electron-vite                   | 6.0.0    | MIT                  |
| esbuild                         | 0.28.2   | MIT                  |
| eslint                          | 10.14.0  | MIT（仅开发）        |
| eslint-plugin-react-hooks       | 7.1.1    | MIT（仅开发）        |
| react                           | 19.3.1   | MIT                  |
| react-dom                       | 19.3.1   | MIT                  |
| prettier                        | 3.9.10   | MIT（仅开发）        |
| simple-git                      | 4.0.2    | MIT                  |
| ssh2                            | 1.17.0   | MIT                  |
| stylelint                       | 18.0.0   | MIT（仅开发）        |
| tsx                             | 4.23.15  | MIT                  |
| typescript                      | 5.9.3    | Apache-2.0           |
| typescript-eslint               | 8.72.2   | MIT（仅开发）        |
| typescript-language-server      | 6.0.2    | Apache-2.0           |
| vitest                          | 3.2.7    | MIT                  |
| vscode-jsonrpc                  | 10.0.0   | MIT                  |
| ws                              | 8.22.0   | MIT                  |
| yaml                            | 2.9.1    | ISC                  |
| zod                             | 3.25.76  | MIT                  |

系统 Git/OpenSSH/Python 不随本次代码分发；本机验证 Node 24.18.1、Git 2.55.0.windows.3（最终版本以验证记录为准）。开发 Node 范围为 `^22.22.2 || ^24.15.0 || >=26.0.0`，与 Stylelint 18 engines 一致；CI 精确使用 Node 24.18.1 / pnpm 10.34.5。CI Actions 固定完整提交：checkout v4.2.2 `11bd71901bbe5b1630ceea73d27597364c9af683`、setup-node v4.4.0 `49933ea5288caeca8642d1e84afbd3f7d6820020`、pnpm/action-setup v4.1.0 `7088e561eb65bb68695d245aa206f005ef30921d`、upload-artifact v4.6.2 `ea165f8d65b6e75b540449e92b4886f43607fa02`。官方 tag 已核对，并已在 Windows/Linux/macOS 远端 runner 实际完成 frozen install 与质量门禁，证据见[审计复验](validation.md#audit-2026-11-12)。远端主机运行 Python 3，实际版本以真实 SSH 验收为准。

新增开发工具不进入客户端生产 bundle。2026-11-12 按五个新增直接依赖解析已安装的传递依赖，共 165 个精确 name/version 条目，无缺失声明；许可族为 MIT、MIT-0、ISC、Apache-2.0、BSD-2/3-Clause、BlueOak-1.0.0、CC-BY-4.0、CC0-1.0 和 PSF-2.0。完整安装树保留其 LICENSE/NOTICE；锁文件固定解析版本，构建仍以实际生产模块逐件收集正文，开发扫描不能代替分发门禁。ESLint 接入 `@eslint/*`/Espree/AJV，typescript-eslint 接入同版本 parser/plugin/estree/utils，React Hooks 接入 Babel/Hermes/Zod，Stylelint 接入 PostCSS/CSSTools，Playwright Test 接入同版本 playwright/playwright-core；没有新 Agent runtime、状态库或 UI 主题。

原生 SSH 的分发闭包：ssh2 1.17.0 → asn1 0.2.6 → safer-buffer 2.1.2（均 MIT）；ssh2 → bcrypt-pbkdf 1.0.2（BSD/ISC 完整文本）→ tweetnacl 0.14.5（Unlicense）。构建显式禁用 cpu-features 与 sshcrypto.node，未分发可选 native addon。完整许可见根 THIRD_PARTY_NOTICES.md，打包时同步生成 core/SSH_THIRD_PARTY_NOTICES.md。开发声明 @types/ssh2 及其传递声明包不进入 Core bundle。

`pnpm build:app && pnpm build:licenses` 从 esbuild/Rollup 实际输出模块、语言服务 sourcemap 精确版本和 Electron 45.0.0 官方 runtime notices 生成 `apps/desktop/resources/licenses/manifest.json` 与完整文本。该生成目录不入库，随 Windows portable 的 `resources/licenses` 分发；`beforePack` 再次核对产物哈希，拒绝缺正文、未知外部依赖或未经评审的许可。pi 等 npm 缺正文的固定来源补充在 `scripts/licenses/supplement-index.json`，含精确版本、tarball integrity/发布证明、commit 与文件哈希；构建过程离线。不扫描整个 pnpm 开发安装树，也不把 package.json.license 当作正文。Electron/Chromium HTML 作为官方条件/组件许可集合保留，不能把 Electron MIT 字段当作全部二进制许可。
