# apps/desktop

Electron 桌面壳与 React renderer。

- `src/main`：窗口、菜单、托盘、自动更新、safeStorage、Core 生命周期。
- `src/preload`：白名单 IPC。
- `src/renderer`：对话、状态、实验记录、代码、设置。

禁止：直接连接 SQLite/文件系统/模型；绕过 Core 执行工具；引入覆盖原型的 UI 主题。
