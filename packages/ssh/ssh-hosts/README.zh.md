---
description: "为一个远端工作区发现 SSH 目的地、安装远端辅助进程并启动独立 Web 进程。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh-hosts

[English](README.md) | 中文

## 概述

`dsh-ssh-hosts` 把已有的 OpenSSH 别名变成可用的远端 Harness 工作区。它从 `~/.ssh/config` 发现具体的 `Host` 条目，探测远端操作系统、架构、libc、Node 和 `tar`，通过 `ssh` + `tar` 安装经过校验的辅助进程归档，并为每台主机启动一个独立的 `dsh --profile ssh-remote` 进程。Host 端还提供 Web 面板使用的 `GET /api/ssh/hosts`、`POST /api/ssh/connect`、`POST /api/ssh/stop` 路由，并注入页面的 `__DSH_SSH__` 启动状态。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者注记](#dev-note)

<a id="use-this-package"></a>
## 使用此包

把它与 `connection`、`webServer` 一起挂载到 Web 组合中。可选配置指定本地辅助进程归档、远端安装根目录或传输超时；其余部署值来自 `@deepseek-ai/dsh-ssh-app` 读取的启动环境。

```yaml
- id: ssh-hosts
  name: '@deepseek-ai/dsh-ssh-hosts'
  config:
    helperArchive: /opt/dsh/dsh-ssh-helper-0.2.2-rc.2-linux-x64.tar.gz
    installRoot: /home/me/.dsh/ssh-helper
```

纯函数（`probeHost`、`listSshHosts`、`provisionHelper`、`startRemoteServer`）也供 `dsh ssh` 使用；Cordis 服务只是面向浏览器的管理器。

<a id="understand-the-implementation"></a>
## 理解实现

`SshHosts` 扫描 OpenSSH 配置，用 `ssh -G` 在不建立连接的情况下解析每个别名，并把记录保存在 `$DSH_HOME/ssh/hosts.json`。`provisionHelper` 读取归档清单，存在同名校验文件时先校验，把远端平台映射到受支持的目标，使用远端 `tar` 传输归档，并返回连接握手所需的可执行文件摘要。`startRemoteServer` 创建每主机独立的 Harness home，链接机器本地的凭据和技能，分配回环端口，并从子进程输出中读取带认证令牌的 URL。

<a id="further-exploration"></a>
## 延伸阅读

- [SSH 子系统](../../../docs/subsystems/ssh.zh.md) — 传输与提供方契约。
- [SSH 远端工作区](../../../SSH-REMOTE.md) — 本分支的用户指南。
- [ssh-app 组合包](../../bundle/ssh-app/README.zh.md) — 远端 profile 组合。

<a id="model-experience"></a>
## 模型体验

无；目的地发现、辅助进程安装和进程启动都不构造模型输入。

#### KV Cache 影响

无；远端 profile 的消费者负责请求前缀变化。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 辅助进程归档必须按目标平台构建；本分支不会自动下载。
- 仅支持 glibc Linux x64/arm64 和 macOS 14+ x64/arm64。
- 主机认证完全由 OpenSSH 负责；管理器不会提示输入凭据。
- 仅存在于远端的路径依赖组合文件系统；主机 GUI 集成仍不可用。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
