# 研究与架构参考

本目录保存影响架构决策的外部调研，不等于已采用。

- [垂直领域 Agent 的内核 / 领域特性分层调研（2026-10-23）](2026-10-23-vertical-agent-patterns.md)
  - 对照 Codex/pi、FinRobot、Aviary、CAI、Sierra、Microsoft Copilot Studio、Harvey。
  - 结论：薄内核 + 厚领域层；领域状态独立于聊天；单 Agent + 参数化领域工具；三层控制。
  - 对应提案：[ADR-0002](../adr/0002-domain-pack-and-research-environment.md)（Proposed）。

引用商业产品时只依据公开文档/论文，不声称审计其内部实现。
