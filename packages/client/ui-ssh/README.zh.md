---
description: "dsh Web 客户端的远端 SSH 浏览器：主机列表、连接操作和远端工作区打开。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-ssh

[English](README.md) | 中文

## 概述

`Remote SSH` 页面列出由 `@deepseek-ai/dsh-ssh-hosts` 发现的 OpenSSH 目的地，把本地 Web GUI 连接到远端主机，并显示当前远端连接。当页面本身运行在远端 profile 中时，它可以把一个绝对远端目录打开为工作区和会话。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者注记](#dev-note)

<a id="use-this-package"></a>
## 使用此包

把它与 `ui-layout`、`ui-sidebar`、`remote.workspace` 和 `uiWorkspace` 一起挂载。Host 行 `@deepseek-ai/dsh-ssh-hosts` 提供路由和 `__DSH_SSH__` 启动状态。

```yaml
- id: ui-ssh
  name: '@deepseek-ai/dsh-client-ui-ssh'
```

<a id="understand-the-implementation"></a>
## 理解实现

插件以 id `remote` 注册一个 keyed `main` 面板和一个 `sidebar.panellist` 条目。组件通过已认证的 `/api/ssh/hosts` 路由读取主机数据，并通过 `/api/ssh/connect` 启动服务器。打开远端目录时调用生成的 `workspace.create` Remote，然后调用 `ctx.uiWorkspace.openWorkspace`，因此会话以远端工作区路径创建，并在普通对话界面中打开。

<a id="further-exploration"></a>
## 延伸阅读

- [dsh-ssh-hosts](../../ssh/ssh-hosts/README.zh.md) — Host 管理器。
- [SSH 远端工作区](../../../SSH-REMOTE.md) — 本分支的用户指南。

<a id="model-experience"></a>
## 模型体验

无；浏览器面板只列出主机并启动远端工作区，不增加模型输入。

#### KV Cache 影响

无；后续模型交互由远端会话负责。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 面板只在 Web 组合中挂载。
- 连接操作会为每台主机启动独立的 Web 进程；页面在新标签页中打开其 URL，而不替换当前执行世界。
- 会话存在后，远端文件树就是普通的 Files 侧边栏；该页面只作为连接和工作区启动器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
