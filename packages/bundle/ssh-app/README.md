---
description: "Remote POSIX execution profile bundle: SSH filesystem, subprocess, terminal and sandbox providers over one OpenSSH host."
kind: "package-bundle"
---

# @deepseek-ai/dsh-ssh-app

English | [中文](README.zh.md)

## Summary

`dsh-ssh-app` is the third layer of the `ssh-remote` profile. It disables the local filesystem, subprocess and sandbox providers, inserts the SSH family, and reads the connection from the launcher environment. It also disables the host-only consumers that cannot address a remote execution world.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Boot the shipped `ssh-remote` profile with the `DSH_SSH_*` environment set by `dsh ssh connect`:

```sh
DSH_SSH_HOST=my-host \
DSH_SSH_WORKSPACE=/home/me/project \
DSH_SSH_HELPER=/home/me/.dsh/ssh-helper/.../dsh-ssh-helper \
DSH_SSH_HELPER_HASH=<sha256> \
DSH_SSH_LAUNCH_KIND=executable \
dsh --profile ssh-remote
```

`dsh ssh connect` performs provisioning and starts this profile for you.

<a id="understand-the-implementation"></a>
## Understand the implementation

The patch replaces `fs-sandbox`, `subprocess` and `sandbox` by disabling them and inserting `dsh-fs-ssh`, `dsh-subprocess-ssh` and `dsh-sandbox-ssh` under new ids. It points `sandbox-policy.workspaceRoot` and `working-directory.defaultDirectory` at the remote workspace and disables `open-in-app`, `file-reference-local`, `directory-picker`, `tool-fs-search`, `workspace-changes`, `deliverable-file-references`, `ui-open-in-app` and `ui-deliverables`.

<a id="further-exploration"></a>
## Further Exploration

- [dsh-ssh](../../ssh/ssh/README.md) — connection and helper verification.
- [SSH subsystem](../../../docs/subsystems/ssh.md) — execution coordinates.
- [SSH remote workspaces](../../../SSH-REMOTE.md) — user guide for this fork.

## Model Experience

Indirectly, through the SSH providers it mounts, whose existing tool consumers own every model-visible result.

#### KV Cache effect

None; provider consumers own any request-prefix change.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Sessions and Workspaces are isolated in a per-host Harness home.
- Remote helper archives are not downloaded automatically.
- File watching, local search packaging, Office conversion and host GUI integrations remain local-only.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
