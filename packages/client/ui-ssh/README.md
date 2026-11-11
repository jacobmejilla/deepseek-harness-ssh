---
description: "Remote SSH explorer for the dsh web client: host list, connect actions, and remote workspace opening."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-ssh

English | [中文](README.zh.md)

## Summary

The `Remote SSH` page lists OpenSSH destinations discovered by `@deepseek-ai/dsh-ssh-hosts`, connects the local Web GUI to a remote host, and shows the active remote connection. When the page already runs in a remote profile, it opens an absolute remote directory as a Workspace and Session.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount it beside `ui-layout`, `ui-sidebar`, `remote.workspace` and `uiWorkspace`. The Host row `@deepseek-ai/dsh-ssh-hosts` supplies the routes and the `__DSH_SSH__` boot state.

```yaml
- id: ui-ssh
  name: '@deepseek-ai/dsh-client-ui-ssh'
```

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin registers a keyed `main` panel and a `sidebar.panellist` entry under the id `remote`. The component reads host data through the authenticated `/api/ssh/hosts` route and starts a server through `/api/ssh/connect`. Opening a remote directory calls the generated `workspace.create` Remote and then `ctx.uiWorkspace.openWorkspace`, so the Session is created with the remote workspace path and opened in the normal conversation surface.

<a id="further-exploration"></a>
## Further Exploration

- [dsh-ssh-hosts](../../ssh/ssh-hosts/README.md) — Host manager.
- [SSH remote workspaces](../../../SSH-REMOTE.md) — user guide for this fork.

## Model Experience

None, as the browser panel lists hosts and starts remote workspaces without adding model input.

#### KV Cache effect

None; the remote Session owns every later model interaction.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The panel is mounted only in the Web composition.
- Connect actions start a separate Web process per host; the page opens its URL in a new tab rather than replacing the current execution world.
- The remote tree itself is the normal Files sidebar once a Session exists; the page intentionally stays a connection and workspace launcher.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
