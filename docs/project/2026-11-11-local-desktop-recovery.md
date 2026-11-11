# Windows 本地 Job 桌面恢复验收

更新：2026-11-11。最终生产 Main/preload/Core bundle 的两个真实 45 秒本地 Job 均通过退出、重开、同 Job 恢复与产物核验。修复决策见 [ADR-0018](../adr/0018-windows-local-job-launch.md)，完整时间线与构建身份见[机器证据](evidence/local-desktop-recovery-20261111.json)。

## 实际结果

| 场景                                | 实际 Electron 退出 | 立即重开            | 最终结果                      |
| ----------------------------------- | ------------------ | ------------------- | ----------------------------- |
| 强杀测试拥有的 Core PID，再关闭桌面 | 349.02ms，退出码 0 | 原 Job 仍为 running | succeeded；score=6、n=2、sd=0 |
| Job 运行中正常关闭桌面              | 148.52ms，退出码 0 | 原 Job 仍为 running | succeeded；score=6、n=2、sd=0 |

退出耗时从请求关闭前计时，到直接启动的 Electron `ChildProcess.exit` 事件为止；门禁为 5 秒。窗口关闭和 JS quit 事件不能代替该测量。计算在 45 秒后由实际脚本产生两行 seed 指标；两段期间均未取消或重启计算。重开后重复原幂等键仍返回原 Job，最终总数恰为两个。

两个 `results/metrics.json` 均为 43 字节，SHA256 为 `727be7bc657bce930b021574610edfbef9283290fcc1f4f2a5971172e1b57260`，均由 Core 完成产物及指标核验。

## 构建身份

| 产物                                         | SHA256                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Core `apps/desktop/resources/core/cli.mjs`   | `1283a2e22489e2b57bd34858b353d66bda448c24b74180d0e497fc92d6410434` |
| Main `apps/desktop/out/main/index.cjs`       | `6b4c35ec16ff6950a79aa9213c9c97539d1a20c0b8897bd13b2a40c4d5c77cca` |
| preload `apps/desktop/out/preload/index.cjs` | `9f120233283acc9aae25fb07af3c7c6e64d26ec314055c288800ceaf8c6ebf5d` |

验收脚本开始及结束时核验以上文件未变化。执行入口为 `scripts/verify-desktop-recovery.mjs`，通过已批准的 UI 审阅按钮启动计划，随后使用隔离 profile/workspace，通过真实 Main/preload RPC 核对记录。测试没有模型请求或模型凭据。

## 回归与边界

实际执行 `pnpm exec vitest run tests/integration/local-launcher.test.ts tests/integration/managed-runs.test.ts tests/integration/local-supervisor-termination.test.ts`，14/14 通过。覆盖真实含空格、中文和单引号的路径、启动器不等待 Job、环境白名单、启动确认丢失后重开同 Job、确定失败、幂等、冻结轮次、产物、seed 身份、预算、取消，以及 Windows 进程树终止失败后重试。

Windows 启动器复用系统 PowerShell `Start-Process`；非 Windows 启动路径保持原有 detached Node 方式。确认丢失保留 unknown，不能自动重提；用户应核对同一 Job 的 status/token。恢复或回滚前须先核对活动 Job，不能删除其记录或取消已经批准的计算。

本记录验证确定性本地计算的桌面生命周期恢复；真实 SSH、真实模型、便携包、干净机器和长期计算使用各自验收记录。
