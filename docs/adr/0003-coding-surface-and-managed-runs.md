# ADR-0003：代码工作面与受管科研运行

- 状态：Accepted
- 日期：2026-10-23
- 关联：[工程实施方案](../product/desktop_agent_implementation_plan_v1.md)、[内核/科研边界规范](../standards/02-agent-kernel-and-research-boundary.md)

## 背景

产品不只是“科研记录 Agent”。用户明确要求同时具备：

- 改代码：读代码、打补丁、运行命令、跑测试、看 diff；
- 对话：讨论、规划、问答、工具调用；
- 科研特性：课题/问题/任务书/审批/受管运行/产物/证据。

早期方案在文字上把“科研闭环”放在最前，容易被实现成“科研功能很多、但普通 coding 不好用”的产品。本 ADR 固化正确关系：**通用 coding/chat 是一等底座，科研是可选叠加层。**

## 决策

1. **一个 Agent 内核，三类工作面**
   - 对话：控制面；
   - 代码：文件树、编辑/补丁、diff、终端、测试、Git；
   - 科研：课题、问题、任务书、审批、受管运行、产物、证据。
2. 不新增“coding agent runtime”或“research agent runtime”；同一 pi 内核、同一会话、同一权限框架。
3. 代码工作面是内核能力，不是科研层的特殊分支。项目可以只有对话和代码，没有问题树。
4. 科研对象是可选叠加；普通 coding 会话不强制创建研究问题或任务书。
5. 两条执行路径严格分开：
   - **交互式编码/命令**：Agent 在 workspace 内读写、运行测试；记录 diff、terminal 日志、快照和权限审计。
   - **受管科研运行**：只有冻结任务书后由 RunManager 启动；绑定代码 revision、配置、输入、预算、执行器和产物清单。
6. 任务书批准时冻结代码 revision；交互式修改不会自动改变已批准运行。代码变化后继续实验，必须生成新任务书版本或显式重新绑定新 run。
7. Phase 1 先通过真实 coding 任务验收；Phase 2 再叠加科研归档。

## 不选择

- **把代码 Tab 继续做成只读预览**：无法满足日常 coding。
- **单独做两个应用/两个 Agent**：会分裂会话、权限和上下文，维护成本高。
- **把交互式 Shell 和受管运行混成一条路径**：会破坏运行台账、预算、产物和复现性。
- **要求所有代码任务先建研究问题**：普通 coding 被科研结构阻塞。
- **直接嵌入完整 VS Code**：首版过重，也不是原型的视觉目标。

## 后果

- 正面：产品是完整通用 Agent；科研功能建立在真实 coding 能力上；两条执行路径的审计边界清晰。
- 成本：代码工作面需要文件树、diff、终端、Git 和快照，Phase 1 工作量增加。
- 风险：代码工作面容易膨胀成 IDE；以“Agent 变更审阅 + 终端 + diff”为首版边界，不追求编辑器功能对齐 VS Code。
- 风险：用户可能在任务书批准后继续改代码；必须通过 revision 绑定和新版本提示阻止“静默漂移”。

## 验收

- 在一个真实小仓库中完成：读文件 → 改代码 → 跑测试 → 查看 diff → 回滚。
- 对话中的变更卡能跳到代码工作面。
- 任务书批准后修改代码，受管运行仍使用冻结 revision；新代码需新版本/新 run。
- 普通 coding 项目可以在没有问题树的情况下使用。
- 代码工作面仍通过 ToolGateway，越界写/执行被拦截。

## 参考

- [Codex approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [pi SDK](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [垂直 Agent 调研](../research/2026-10-23-vertical-agent-patterns.md)
