---
description: "远端 POSIX 执行 profile 组合包：在一个 OpenSSH 主机上使用 SSH 文件系统、子进程、终端和沙箱提供方。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-ssh-app

[English](README.md) | 中文

## 概述

`dsh-ssh-app` 是 `ssh-remote` profile 的第三层。它关闭本地文件系统、子进程和沙箱提供方，插入 SSH 系列提供方，并从启动环境读取连接信息。它还关闭无法访问远端执行世界的主机专用消费者。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者注记](#dev-note)

<a id="use-this-package"></a>
## 使用此包

用 `dsh ssh connect` 设置 `DSH_SSH_*` 环境后启动内置的 `ssh-remote` profile：

```sh
DSH_SSH_HOST=my-host \
DSH_SSH_WORKSPACE=/home/me/project \
DSH_SSH_HELPER=/home/me/.dsh/ssh-helper/.../dsh-ssh-helper \
DSH_SSH_HELPER_HASH=<sha256> \
DSH_SSH_LAUNCH_KIND=executable \
dsh --profile ssh-remote
```

`dsh ssh connect` 会完成安装并为你启动这个 profile。

<a id="understand-the-implementation"></a>
## 理解实现

补丁关闭 `fs-sandbox`、`subprocess` 和 `sandbox`，并以新 id 插入 `dsh-fs-ssh`、`dsh-subprocess-ssh` 和 `dsh-sandbox-ssh`。它把 `sandbox-policy.workspaceRoot` 和 `working-directory.defaultDirectory` 指向远端工作区，并关闭 `open-in-app`、`file-reference-local`、`directory-picker`、`tool-fs-search`、`workspace-changes`、`deliverable-file-references`、`ui-open-in-app` 和 `ui-deliverables`。

<a id="further-exploration"></a>
## 延伸阅读

- [dsh-ssh](../../ssh/ssh/README.zh.md) — 连接与辅助进程校验。
- [SSH 子系统](../../../docs/subsystems/ssh.zh.md) — 执行坐标。
- [SSH 远端工作区](../../../SSH-REMOTE.md) — 本分支的用户指南。

<a id="model-experience"></a>
## 模型体验

间接地，通过它挂载的 SSH 提供方；这些提供方现有的工具消费者负责所有模型可见结果。

#### KV Cache 影响

无；提供方消费者负责请求前缀变化。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 会话和工作区隔离在每主机独立的 Harness home 中。
- 远端辅助进程归档不会自动下载。
- 文件监听、本地搜索打包、Office 转换和主机 GUI 集成仍只在本地。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
