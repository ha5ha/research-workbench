# ADR-0018：Windows 本地 Job 的独立启动边界

- 状态：Accepted（2026-11-11，生产 Main/Core 两段 45 秒 Job 恢复验收通过）
- 关联：ADR-0007/0010，Windows 1.0 交付验收

## 问题与约束

真实 Main/Core 集成中，已批准的本地 Job 仍运行时关闭桌面，JS 的 before-quit / will-quit / process-exit 均立即发生，但 OS 进程约到 Job 完成才退出。Node detached+ignore+unref 的普通最小程序不能复现；完整 Main 取消 renderer、LSP、Core unref、overlapped stdio 均未解除。不能用强行 app.exit、缩短 Job、延长退出验收或取消后台计算掩盖问题。

## 候选与复用

| 候选                                                                  | 许可、维护与边界                                                               | 结论                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| 已有 Node child_process detached + ignore + unref                     | 无新依赖；当前 Node/Electron 已固定；Windows 集成仍有原生退出等待              | 非 Windows 保留；Windows 需替换启动边界 |
| 系统 Windows PowerShell 5.1 Start-Process，Hidden / PassThru，无 Wait | 复用已有系统 PowerShell；不分发或安装新软件；ShellExecute 启动建立独立进程边界 | 真实回归通过，采用为唯一 Windows 路径   |
| 自建原生 Win32 CreateProcess/Job Object addon                         | 需新增原生构建、ABI、签名和许可审计；当前只需单机独立启动                      | 暂不引入                                |

PowerShell 已用于本地命令执行，不增加依赖或 runtime。此处采用成熟系统进程启动能力，只编写路径引用、PID 核验与错误传递适配。没有第二套 Agent runtime 或多 Agent 调度。

## 决策边界

Windows 只向固定 PowerShell 脚本传当前运行所生成的 supervisor 文件、目录和现有 Node/Electron 可执行文件。路径先作为 PowerShell 单引号字符串转义，再将两个 Windows 参数各自双引号引用；不拼入研究命令。研究命令仍仅存在已冻结 job.json，由 supervisor 读取。

启动器仅获得 executionEnvironment 白名单，不获得模型凭据。Start-Process 不等待 Job 完成；PassThru 仅返回正整数 PID。Core 在启动前已经提交运行意图。PowerShell 自身未能创建时可判定失败；创建后的超时、非零退出或 PID 确认丢失均保留 unknown，经相同 runId / token / status 核对恢复，不能断言未提交，也不添加另一条重试或隐式 fallback。

## 验证与退出策略

必须先在真实 Electron/Main/Core 本地 Job 上复测：运行期间外杀 Core、关闭桌面、5 秒内真实 OS 退出、立即重开仍为 running，随后同一 Job 成功且无重复。再跑路径包含空格、中文和单引号的真实启动、启动失败、受管运行/取消/预算回归。

临时 Core bundle 的真实 Main 对照：Core-kill 后 156ms 退出、正常关闭 137ms 退出；两次立即重开均仍为 running，同一 Job 最终 score=6、n=2、sd=0，产物哈希一致且无重复 Job。此证据支持替换 Windows 启动边界；没有声称确定了 Electron 内部具体哪个继承句柄。

生产源接入后的正式验收：[报告](../project/2026-11-11-local-desktop-recovery.md)、[机器证据](../project/evidence/local-desktop-recovery-20261111.json)。同一套最终 Core/Main/preload bundle 执行两个真实 45 秒 Job；Core-kill 后直接 ChildProcess.exit 为 349.02ms，正常关闭为 148.52ms，均退出码 0。立即重开仍是同一 running Job，随后均成功、score=6/n=2/sd=0；重复幂等键未新增 Job，产物 SHA256 一致。脚本在开始和结束核验构建哈希一致。另有 14 项集成测试通过，覆盖带空格/中文/单引号路径、无 Wait、环境白名单、确认丢失后的重开恢复、确定启动失败、预算、取消与终止失败重试。

采用后回滚须先核对活动 Job；不得删除工作区记录或取消已经批准的后台计算。SSH 后端不使用此启动器。
