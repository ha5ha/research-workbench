# SSH 参数与闭环 UI 回归

日期：2026-11-11。真实 Electron、隔离临时用户配置/工作区，不读取日常配置。保持现有 OpenResearch 风格和组件，只新增远端任务根目录/Python 参数及批准前展示。

| 证据 | 验证内容 |
|---|---|
| [SSH 表单 1440](ssh-form-1440.png) / [390](ssh-form-390.png) | 可选目录、Python 路径，长路径无横向溢出 |
| [冻结预览 390](ssh-plan-390.png) | 批准动作前显示主机、目录、解释器、代码、命令和预算 |
| [自动报告](report.json) | 三尺寸旧闭环回归、新 SSH 字段持久到冻结计划、方向保存/失败保留、来源/决策/导出 |
| compass / plan-review / evidence-decision / save-error / focus 图片 | 本次重跑的本机确定性夹具流程，非真实科研结果截图 |

脚本：[verify-research-loop.mjs](../../../scripts/verify-research-loop.mjs)，设置 `RW_QA_SSH_FORM=1` 和 `RW_QA_OUTPUT` 可运行增量。QA 主机提供 Playwright；没有新增生产依赖。SSH 表单使用 `lab-gpu` 等虚构配置，保持未批准、未启动；截图不证明密码登录或服务器执行。真实服务器证据另见[维护验收](../../../docs/project/2026-11-11-real-ssh-validation.md)。

本轮第一次 QA 因驱动切换页面后未重新填写必填字段而未提交表单；修正驱动后通过。没有用跳过校验来让表单通过。新增字段和预览已人工看图，未另做独立视觉/UX 评审；沿用前轮的视觉约束。200% 缩放与检查器 overlay 打开态仍未补齐。
