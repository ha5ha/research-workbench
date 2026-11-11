# ADR-0008：真实项目的 SSH 验收与远端工作区

- 状态：Accepted（2026-11-11，所有者提供真实科研项目及 SSH，授权实际验证）
- 关联：ADR-0007、项目路线 G5

## 问题与约束

真实项目已有密码连接的本机加密凭据，默认 OpenSSH 的 BatchMode 密钥认证未通过；服务器只允许写入项目工作区。原实现把所有 Job 固定放在远端用户 home，无法满足该约束。现有科研任务及 dirty 修改必须保留；本轮只在独立目录对已归档预测做 CPU 算术复核，不启动训练/推理，不晋级科学结论。

## 候选与决定

| 候选 | 许可证/状态 | 决定、成本与边界 |
|---|---|---|
| 系统 OpenSSH | 系统工具，不随产品分发；本机版本见验收记录 | 保留默认实现及严格 host-key/BatchMode。它禁用密码交互，不能把项目密码连接成功写成默认密钥路径通过。 |
| 既有项目 Paramiko 凭据连接 | 验收主机已安装 5.0.0；LGPL，未复制或加入 Node/客户端依赖，不分发 | 只作为本轮外部验收工具，通过受信任的构造函数注入传输，执行相同固定 bootstrap/supervisor。凭据仅由项目既有代理在内存解密；不进入计划、命令行、日志或仓库。 |
| ssh2 | 官方仓库 MIT；本轮未引入、未完整核验传递依赖 | 加入完整密码/凭据设置和打包面超出本次验收；后置，不能因此另建一套运行协议。 |

没有新增或升级生产依赖。传输注入仅限 Core 构造接口，RPC/模型不能选择任意本地程序。默认客户端仍要求预配置的非交互 SSH 密钥；密码设置 UI 尚未交付。

## 实施

1. RunProposal 允许显式远端 Job 根目录与 Python 可执行文件，校验绝对 POSIX 路径并进入冻结摘要；Python 路径也进入可比身份。
2. 远端逐级检查目录链接；只能在所批准 Job 根目录的独立 UUID 子目录写入，不覆盖已有科学结果。未填写时保留旧默认目录，兼容已有 Run。
3. 上传后核对冻结文件 SHA-256；同一 Job 重连先核验 token，不重新提交。
4. 验收使用本地隔离工作区和项目已有、已允许同步的预测表；原始医学影像、checkpoint 与凭据不进入快照。

## 验证与退出

单测覆盖参数拒绝、传输边界与允许产物；现场覆盖两次真实远端重算、关闭并重开验收进程/数据库、同键防重、取消与证据回收。结果见[验收报告](../project/2026-11-11-real-ssh-validation.md)，失败也保留；不等于强杀生产 Core 或默认密码 UI 验收。回滚保留 Job/日志，移除可选配置即可；已生成证据不自动删除。

来源：[OpenSSH ssh](https://man.openbsd.org/ssh)、[BatchMode](https://man.openbsd.org/OpenBSD-current/man5/ssh_config)、[Paramiko client](https://docs.paramiko.org/en/stable/api/client.html)、[Paramiko 仓库](https://github.com/paramiko/paramiko)、[ssh2](https://github.com/mscdex/ssh2)。密码和密钥两种认证的区别以实际连接结果记录，不由文档推断。
