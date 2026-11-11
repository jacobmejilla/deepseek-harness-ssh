---
description: "SSH destination discovery, remote helper provisioning, and detached Web processes for one remote workspace."
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh-hosts

English | [中文](README.zh.md)

## Summary

`dsh-ssh-hosts` turns an existing OpenSSH alias into a ready remote Harness workspace. It discovers concrete `Host` entries from `~/.ssh/config`, probes the remote OS, architecture, libc, Node and `tar`, installs the verified helper archive over `ssh` + `tar`, and starts one detached `dsh --profile ssh-remote` process per host. The Host also serves the Web panel's `GET /api/ssh/hosts`, `POST /api/ssh/connect`, and `POST /api/ssh/stop` routes and injects the page's `__DSH_SSH__` boot state.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount it in a Web composition beside `connection` and `webServer`. Its optional configuration names a local helper archive, a remote install root, or a transfer deadline; every deployment value otherwise comes from the launcher environment consumed by `@deepseek-ai/dsh-ssh-app`.

```yaml
- id: ssh-hosts
  name: '@deepseek-ai/dsh-ssh-hosts'
  config:
    helperArchive: /opt/dsh/dsh-ssh-helper-0.2.2-rc.2-linux-x64.tar.gz
    installRoot: /home/me/.dsh/ssh-helper
```

The pure functions (`probeHost`, `listSshHosts`, `provisionHelper`, `startRemoteServer`) are also used by `dsh ssh`; the Cordis service is only the browser-facing manager.

<a id="understand-the-implementation"></a>
## Understand the implementation

`SshHosts` scans the OpenSSH configuration, resolves each alias with `ssh -G` without connecting, and exposes saved records under `$DSH_HOME/ssh/hosts.json`. `provisionHelper` reads the archive manifest, verifies the sibling checksum when present, maps the remote platform to a supported target, transfers the archive with the remote `tar`, and returns the executable digest for the connection handshake. `startRemoteServer` creates a per-host Harness home, links machine-local credentials and skills, allocates a loopback port, and reads the authenticated URL from the child's output.

<a id="further-exploration"></a>
## Further Exploration

- [SSH subsystem](../../../docs/subsystems/ssh.md) — transport and provider contracts.
- [SSH remote workspaces](../../../SSH-REMOTE.md) — user guide for this fork.
- [ssh-app bundle](../../bundle/ssh-app/README.md) — the remote profile composition.

## Model Experience

None, as destination discovery, helper provisioning, and process launch do not construct model input.

#### KV Cache effect

None; the remote profile consumers own any request-prefix change.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Helper archives must be built per target; this fork does not download them.
- Only glibc Linux x64/arm64 and macOS 14+ x64/arm64 are supported.
- Host authentication is entirely OpenSSH's; the manager never prompts.
- Remote-only workspace paths rely on the composed filesystem; host-GUI integrations remain unavailable.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
