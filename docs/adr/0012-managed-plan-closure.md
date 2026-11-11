# ADR-0012：冻结方案撤回与替代

- 状态：Accepted（2026-11-11，所有者要求完成 1.0，主流程验收发现旧方案仍可误启动）
- 关联：ADR-0007/0009/0010

## 问题与复用选择

修改实验方案会产生新的冻结 plan，但旧的未运行 plan 永久留在待审列表，甚至已批准的旧方案仍可被启动。Renderer 隐藏不能构成执行边界；删除旧 plan 会破坏来源与审批历史。

沿用现有 contracts、RunStore 和 node:sqlite，不新增依赖。比较：①在冻结方案上追加不可变 closure，保留原批准与运行；②新增一套可变 plan 状态机与 UI 镜像；③删除/隐藏旧 plan。采用①，避免重新镜像批准/运行状态；②增加漂移面；③丢失审计或不能阻止 Core 执行。

## 决策

1. ManagedPlan 增加 `closure: null | {kind, at, actor, reason, replacementPlanId}`。kind 为 dismissed/superseded，actor 为 human/agent/system；system 仅用于版本迁移的真实归属。closure 不属于可执行内容摘要，不更改已批准的冻结 digest。
2. 新 plan 成功保存时，在同一事务内替代该实验所有尚无 Run、尚未关闭的旧 plan。Agent 能提出替代方案，但不能批准或启动；已有活动/历史 Run 保持原身份与状态。
3. 人类 RPC `plans.dismiss {id, reason}` 撤回具体方案，closure 与审计事件同事务保存。关闭记录只能写一次；重复撤回返回原审计，不改写理由。无模型撤回/批准/启动工具。
4. approve/start 必须检查数据库中的权威 closure，关闭方案不能产生新 Run。已有同幂等键 Run 优先返回，避免撤回后重试丢失已有 Job。snapshot 异步核验后由 Store 再次校验，阻止核验期间撤回的旧方案启动。
5. 一次性 `plan-closure-v1` 迁移给历史 JSON 补 closure，保留旧 JSON 作为数据库内不可变迁移备份。同实验历史未运行方案只保留最新一份，较旧方案带 system 来源替代记录；已有 Run 不改写。迁移与备份/事件一起提交或回滚。

## 验证与恢复

覆盖人类撤回后禁止批准/启动、Agent 新提议替代旧待审/已批准未运行方案、旧活动 Run 与幂等请求保留、状态核验期间撤回、记录/审计失败整事务回滚、历史迁移只执行一次并保留原 JSON。UI 从 closure 投影待审事项，不能另存隐藏状态。

不删除 plan、运行、快照或证据。回滚应用前关闭 Core、核对活动 Job并备份整个 `.research`；旧版本不认识 closure，不能继续写入或启动旧方案。将来替换存储时保留同一关闭/审计契约。
