# 原生 SSH 密码实现与本地验证

日期：2026-11-11。设计边界见 [ADR-0011](../adr/0011-native-ssh-credentials.md)。此次不连接真实主机、不读取既有凭据。

## 实现

设置 → SSH 保存直连 profile，显示可用于计划 host 的稳定别名。密码默认由 Main 的 Electron safeStorage 加密保存；可选择仅本次会话，系统加密不可用时不降级明文。Renderer 提交后清空密码框；列表仅返回 hasCredential/存储方式。

首次读取主机指纹时不发送密码。用户与可信来源核对 SHA256 指纹后明确确认；指纹变化拒绝连接，改址/用户/端口变化清旧 pin 与密码。Core 只接收 Main 私有控制消息，公开 RPC/Agent 无凭据接口。连接密码不进入命令、环境、任务 payload、计划或日志；私有错误只返回固定类别。

计划冻结 id/hostname/port/username/pin/revision，无密码。改 label 或轮换密码不影响连接身份；修改 endpoint/pin 后旧计划不能提交、回收或取消到另一机器。system OpenSSH 的严格 known_hosts/BatchMode 密钥路径继续可用。全部路径复用固定 bootstrap/supervisor 与 token/上传哈希/产物白名单。

## 已运行的本地验证

- 5 项 native SSH 集成与 3 项 SSH executor 单测：无认证探测、未确认拒绝、严格 pin、错误密码、命令/JSON 无秘密、清除凭据、恶意服务端密码回显拒绝、连接身份变化/移除拒绝。
- 6 项 vault 与 3 项 CoreBridge 回归：加密/会话、改址、fresh probe、IPC 来源、私有回应、分块日志抑制及轮换/停止释放秘密引用。
- typecheck、边界 lint 与 build:core 通过。
- 实际 15.4 MB Core bundle 本地 SSH fixture：冻结/批准/submit → 停 Core → 新进程重新配置 → 同 Job 成功回收 score=7 → 幂等不重提交 → 清除密码拒绝。工作区（含数据库）和进程输出扫描未发现 fixture 密码。
- 分发目录核对仅有 cli.mjs 与 SSH_THIRD_PARTY_NOTICES.md。可选 native binding/cpu-features 由构建插件明确禁用，五个实际生产依赖的完整许可随 bundle 分发。

fixture 只模拟受管协议响应，没有执行远端 Python。Windows Node 24.18.1 上通过不等于 Electron 安装包、真实密码服务器、ProxyJump/MFA 或长期运行验收。Electron 视觉与真实主机结果由后续现场记录补充；此前仍是预览。

## 运行与恢复

`pnpm build:core` 后运行 `node scripts/verify-native-ssh.mjs`。测试只在临时 rw-native-ssh-package 目录写 fixture 并清理。退出原生密码支持时清除设置凭据即可回到既有系统 OpenSSH 路径；原生计划缺失匹配 profile 时明确拒绝，不静默改用另一目的主机。保留已有 Job、计划和证据。
