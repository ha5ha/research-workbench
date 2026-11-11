# ADR-0007：受管科研闭环与 OpenResearch 风格演进

- 状态：Accepted（2026-11-10，所有者明确要求实现闭环、参考开源及 UI 向 OpenResearch 靠齐）
- 关联：ADR-0001/0003/0006；项目路线 G0–G5

## 授权与范围

所有者在整体梳理后明确要求“实现这些闭环”，并指定 UI 尽量向 OpenResearch 靠齐。因此进入闭环实现，不再受历史 Phase 0 的“仅静态壳/不执行真实实验”限制。单 runtime、Core 副作用、人工确认、证据来源和许可证限制继续生效。UI 保留字号下限与响应式，采用安静的中性色、细边框、研究树、紧凑工具栏、清晰运行详情；不复制品牌或素材。

## 开源评估

| 候选 | 许可/维护证据 | 适配与选择 |
| --- | --- | --- |
| [OpenResearch](https://github.com/alphaXiv/OpenResearch) | 根 MIT 已核验；官方 release 与当日 Canary 见 2026-11-10 调研 | 参考实验/Run 分离、冻结快照、detached supervisor、CLI/Skill、结果核验；不复制代码，不 fork 桌面/后端 |
| [Temporal TS SDK](https://github.com/temporalio/sdk-typescript) | 官方持续维护；未纳入依赖，传递依赖/分发未完整核验 | 需要服务与 worker 运维，超出本地单用户桌面边界；暂不采用 |
| [BullMQ](https://github.com/taskforcesh/bullmq) | 官方仓库有许可与发布；未纳入依赖，未完成传递依赖核验 | 引入额外队列服务、任务状态与研究台账映射；当前不采用 |
| [OpenSSH](https://www.openssh.org/manual.html) / [ssh2](https://github.com/mscdex/ssh2) | 系统 OpenSSH 不随本产品分发；ssh2 未纳入依赖 | 采用系统 ssh 的严格 host-key/BatchMode、现有 ssh config；ssh2 需新增认证/打包维护面，后置 |

现有 Node/SQLite/pi/Git 均继续复用，不增加库。Run supervisor、身份核对、manifest 和科研状态为本产品核心边界，自行实现有限机制，参考上述公开思想；没有复制第三方文件，因此不新增第三方代码归属。系统 Git/OpenSSH/Python 记录实际探测版本，缺失时明确失败，不自动安装；外部程序不使用 latest 下载。后续若捆绑二进制必须另行核验许可及 NOTICE。

## 决策与验证

1. 实验与受管 Run 独立；新 Run 引用冻结计划、Git revision、输入哈希、评测协议和预算。仅运行提交过的代码，未提交改动不进入快照。
2. 模型可提议 Run/Claim，审批和确认只由人类入口调用。批准内容变更后失效；已确认结论不静默覆盖。
3. SQLite 先记录 intent/幂等键，再启动独立 supervisor；取消/超时/退出码、完整日志和状态写文件，Core 重开后核对同一身份。未知状态不重跑。
4. artifact 按字节采集与哈希，指标从 JSON/CSV 解析；缺件/损坏不能当成功。代码 diff 与产物采集分离。
5. 同协议/输入/环境组才比较；Claim 引用具体 Run/artifact/hash，支持/反证与决策单独保存。Compass 从这些记录投影。
6. SSH 仅支持用户配置、已知 host key 的非交互连接与 Python3 supervisor；先做受控后端测试，没有真实主机不宣称真实 SSH 验收通过。

验证包括两轮小型真实本地计算、失败/缺件、未批准/只读拒绝、重复提交、取消/超时、Core 关闭重开、哈希篡改及跨协议拒绝比较；UI 三尺寸与真实入口走查。旧 experiments 保留，新增版本表迁移不伪造历史身份。回滚前停止/核对活动 Job，保留数据库和 .research/jobs，旧版不访问新表。

退出策略：保留公开 contracts；执行器可替换，研究状态不依赖 supervisor/SSH 内部类型；不扩展为通用编排平台。Windows Shell 是受审批的执行环境，不构成 OS 级沙箱。

## 版本固定与工程检查增量

现有 35 个直接依赖按原 lock 的解析版本精确固定，未升级/新增，传递解析与 integrity 不变；frozen-lockfile 离线校验通过。依赖台账记录包声明许可证，不冒充完整分发审计。新增静态依赖边界 lint 和 CI/PR/Issue 模板；CI Actions 固定官方 release 版本，远端尚未运行。未使用新的 runtime/数据库/视觉库。
