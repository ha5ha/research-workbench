# packages/db

SQLite schema、迁移与 repository。

- WAL、FTS5、事件日志、乐观版本。
- 只依赖 contracts/domain。
- 迁移只增不改；数据修复单独脚本并留审计。
