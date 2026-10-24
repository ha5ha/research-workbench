# 05 · 科研代码规范

这条规范约束 Agent 和人类对项目代码的修改。目标不是“代码能跑”，而是**可读、可维护、可复现、可归档**。

## 1. 项目结构

默认模板：

```text
src/                      可复用库代码
experiments/<experiment>/ 每次实验一个目录
  README.md               目的、假设、设计
  config.yaml             参数与 seed
  run.py                  入口
scripts/                  工具脚本
tests/                    自动检查
data/                     原始/不可变输入
results/                  生成输出，按 run id 分组
```

- 不允许把脚本随手丢在根目录。
- 实验入口、配置、输出必须分离。
- 先复用现有模块，再新增抽象。
- 生成物不写进源码目录。

## 2. 代码质量

- 遵循项目现有命名、导入、错误处理风格。
- 最小 diff；不做无关重构。
- 不使用绝对路径；从项目根解析。
- 行为变更必须有测试。
- 完成前运行 formatter、linter、typecheck、tests。
- 不提交大文件、缓存、凭据、原始数据。

## 3. 实验与归档

每个实验记录：

- experiment id / run id
- 任务书或目的
- 配置、seed、命令、环境
- 代码 baseline 与 end diff / commit
- 输出、日志、artifact manifest
- 失败也保留

## 4. Agent 工作流

```text
读 AGENTS.md / 现有代码
→ 说明要改哪些文件
→ 最小 diff
→ 写文件/执行命令审批
→ 跑检查
→ 汇总改动与结果
→ 归入对话或实验记录
```

Agent 不能：

- 自己批准自己的写入、命令或实验
- 跳过检查就宣布完成
- 把功能代码改动伪装成实验证据
- 用“能跑”替代可维护性

## 5. 强制点

- 项目根 `AGENTS.md` 是硬约束；内置模板只提供默认值。
- 写文件、终端命令、Git commit 必须走审批。
- Git 只生成 diff/快照；默认不自动 commit，用户可选择自动 commit。
- 实验记录以实验开始时的 baseline 为边界，不能把无关工作区改动算进实验。
