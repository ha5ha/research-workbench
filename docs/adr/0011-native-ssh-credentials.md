# ADR-0011：原生 SSH 密码凭据与严格连接身份

- 状态：Accepted（2026-11-11，所有者持续授权 1.0 必要闭环；真实主机验收另行记录）
- 关联：ADR-0007、ADR-0008、ADR-0010

## 问题与约束

远端科研运行已复用固定 bootstrap/supervisor，但默认系统 OpenSSH 使用 BatchMode，外部 Paramiko 凭据桥接验收不能代替桌面原生密码设置。密码不得进入冻结计划、工作区、模型上下文、日志、命令行、环境变量或 Renderer 持久化。人工确认主机密钥后才可认证；连接身份必须冻结，密码轮换不改变计划。

## 候选、许可证与维护

| 候选                          | 许可、维护与固定身份                                                                                                                                                                                                                              | 适配结论                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 系统 OpenSSH + askpass helper | 系统工具不随产品分发；本机探测 OpenSSH_for_Windows_9.5p2 / LibreSSL 3.8.2。根许可为 BSD 或更宽松，无 GPL；Windows 上游持续维护，2026-10 有 Preview 发布。                                                                                         | 保留现有严格 known_hosts/密钥路径。原生密码可通过 askpass 实现，但需额外可信 helper、私有密码管道、调用者和生命周期验证，Windows 包装成本较高，暂不选。禁止向已承载任务 JSON 的 stdin 混写密码。 |
| ssh2                          | MIT；固定 npm 1.17.0，对应 tag v1.17.0、commit 844f1edfc41589737671f96a4f4e76afdf46abd4，2025-08-20 发布；master 2026-08-20 仍有提交。单维护者、发布节奏慢，公开 issue/PR 仍开放，不能据此承诺快速修复。tag CI 覆盖 Windows Node 16/18/20/22/24。 | 采用薄适配层提供密码认证与严格 hostVerifier；仍使用同一 SshRequestTransport 和 Job 协议，不引入 Agent runtime。                                                                                  |
| 既有 Paramiko 5.0.0 桥接      | LGPL，仅 ADR-0008 的外部验收工具，不纳入客户端和 Node 依赖。                                                                                                                                                                                      | 不作为原生分发依赖。                                                                                                                                                                             |

生产纯 JS 依赖闭包由 lockfile 固定：ssh2 1.17.0（MIT）→ asn1 0.2.6（MIT）→ safer-buffer 2.1.2（MIT）；ssh2 → bcrypt-pbkdf 1.0.2（清单 BSD-3-Clause，根 LICENSE 同含 BSD/ISC 文本）→ tweetnacl 0.14.5（Unlicense）。保留完整许可文本。ssh2 的 cpu-features/nan 与可选 sshcrypto.node 不构建、不随纯 JS bundle 分发；cpu-features 根 MIT，另含 buildcheck/nan/Google cpu_features 源码，若未来分发该分支，必须另做完整许可及 Electron ABI 验证。安装不运行新包生命周期脚本，保持现有 onlyBuiltDependencies 限制。

## 边界与实施

1. Main vault 使用 Electron safeStorage 保存用户目录密文，只返回非秘密 profile 摘要；不把密码写 env。Renderer 只在临时密码框持有输入，提交/取消清空。
2. 专用 Main IPC 校验主窗口主 frame。Main→Core 的 `$private.ssh.*` 控制消息在公开 RpcServer 前分流，不进入 Renderer method allowlist 或 Agent 工具；只返回固定错误类别和无秘密 ack。
3. profile 明确 hostname/port/username、人工确认的 SHA256 主机密钥指纹、递增 revision。未知主机的 probe 不带密码。连接身份变化清除 pin，重新人工确认；运行计划冻结非秘密连接身份并在提交、同步、取消前核对。密码轮换不改 revision。
4. Core 内存持有凭据，ssh2 仅在确认 pin 匹配后认证；关闭/清除/重启丢弃旧引用。密码不送远端运行环境。只支持 password，MFA/密码过期等明确失败，不自动回答任意 keyboard-interactive。
5. 保留系统 OpenSSH 的既有密钥路径与 CLI 使用方式。原生 profile 仅直连；不自行解释完整 ssh_config、ProxyCommand 或另建 supervisor。
6. 连接错误使用固定类别；禁用 ssh2 debug；私有参数、原始错误与服务端内容不得进入日志或事件。复用输出预算、超时、取消、token 重连核验与产物白名单。

## 验证与退出

使用本地 fixture SSH server 验证密码认证、未知/变化 host key 在认证前拒绝、错误密码、清除凭据、连接身份变化、超时与固定协议 JSON。测试扫描计划、错误、事件和 child argv/env 不含 fixture 密码。验证 Main sender 拒绝、safeStorage 失败、重启注入和 UI 三尺寸截图。Windows 打包 spike 必须验证纯 JS/WASM 路径，无 native addon、外部模块漏包及许可遗漏。

真实主机及实际凭据不用于实现测试。完整桌面远端流程通过现场验收前，文档仍标记预览。退出时删除可选原生 profile/适配器即可回到 OpenSSH 密钥路径；保留既有计划、Job 和证据，旧原生计划因缺少匹配 profile 明确失败，不静默切换目的主机。

## 来源

- [OpenSSH 许可](https://raw.githubusercontent.com/PowerShell/openssh-portable/latestw_all/LICENCE)、[Windows 发布](https://github.com/PowerShell/Win32-OpenSSH/releases)、[askpass 手册](https://raw.githubusercontent.com/openssh/openssh-portable/V_9_5_P1/ssh.1)
- [ssh2 固定包](https://raw.githubusercontent.com/mscdex/ssh2/v1.17.0/package.json)、[根许可](https://raw.githubusercontent.com/mscdex/ssh2/v1.17.0/LICENSE)、[API](https://raw.githubusercontent.com/mscdex/ssh2/v1.17.0/README.md)、[CI](https://raw.githubusercontent.com/mscdex/ssh2/v1.17.0/.github/workflows/ci.yml)、[维护记录](https://github.com/mscdex/ssh2/commits/master/)
- [asn1](https://raw.githubusercontent.com/joyent/node-asn1/master/LICENSE)、[safer-buffer](https://raw.githubusercontent.com/ChALkeR/safer-buffer/v2.1.2/LICENSE)、[bcrypt-pbkdf 完整许可](https://raw.githubusercontent.com/joyent/node-bcrypt-pbkdf/master/LICENSE)、[tweetnacl](https://raw.githubusercontent.com/dchest/tweetnacl-js/v0.14.5/LICENSE)
