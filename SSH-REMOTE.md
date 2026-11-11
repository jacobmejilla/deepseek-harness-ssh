# SSH remote workspaces in this fork

Upstream DSH already ships a POSIX SSH provider family (`packages/ssh/ssh`,
`fs-ssh`, `subprocess-ssh`, `sandbox-ssh`). It moves Bash, the file tools, the
file tree, terminals, LSP and PTC execution to one remote host, but it is a
deployment-level composition: a user must hand-write a profile, build and
install the private helper archive, compute its SHA-256, and maintain a
dedicated `$DSH_HOME`. It adds no host discovery, no provisioning, no remote
explorer, and the Web UI's workspace picker remains host-filesystem-bound.

This fork adds the missing product surface:

| Piece | Package | What it does |
|---|---|---|
| Host manager | `packages/ssh/ssh-hosts` | Discovers `~/.ssh/config` destinations, probes the remote platform, installs the verified helper archive over `ssh`+`tar`, and starts one detached Web process per host. |
| Remote app bundle | `packages/bundle/ssh-app` | A profile bundle that disables the local filesystem/subprocess/sandbox providers and mounts the SSH family with `DSH_SSH_*` connection values. |
| Remote explorer | `packages/client/ui-ssh` | A left-sidebar page that lists hosts, connects from the local Web GUI, and opens remote directories as workspaces when already connected. |
| CLI | `dsh ssh ...` | `list`, `add`, `remove`, `probe`, `build-helper`, `install`, `connect`. |
| Workspace fixes | `packages/workspace/workspace`, `packages/api/session-controller` | Workspace canonicalization/stat and Session directory preparation now use the composed filesystem, so a path that exists only on the remote host is valid. |

## Prerequisites

- A POSIX client and a POSIX remote host (Linux glibc >= 2.28, or macOS >= 14).
- Passwordless, non-interactive OpenSSH authentication for the alias. The
  connection always uses `BatchMode=yes`, strict host-key checking, no agent
  forwarding, and an existing `known_hosts` entry.
- `ssh`, `tar`, and a writable remote `$HOME` and `/tmp`.
- The remote host must allow Unix-socket forwarding (OpenSSH default).

## Build the helper

The helper is a self-contained executable directory; the remote host needs no
Node, npm or checkout. Build the archive for this platform:

```sh
pnpm install
pnpm exec tsx scripts/build-exe-for-ssh-helper.ts --target=node24-linux-x64
# or, through the CLI:
pnpm dsh ssh build-helper
```

Archives land under `dist-exe/ssh-helper/`. Supported targets are
`node24-linux-x64`, `node24-linux-arm64`, `node24-macos-x64`, and
`node24-macos-arm64`. Each archive is written with a sibling `.sha256` file.

For a source checkout, `dsh ssh connect` finds that archive automatically. A
published installation can place one under `$DSH_HOME/ssh/helper/` or pass
`--helper-archive`.

## Use it

```sh
# Discover destinations
pnpm dsh ssh list

# Inspect the remote platform and selected target
pnpm dsh ssh probe my-host

# Remember a default workspace for the host (OpenSSH config stays the auth source)
pnpm dsh ssh add my-host --workspace /home/me/project

# Install or reuse the helper, then open the remote workspace
pnpm dsh ssh connect my-host --workspace /home/me/project

# Build the helper on demand
pnpm dsh ssh build-helper --target=node24-linux-x64
```

`connect` provisions the helper, writes a durable record under
`$DSH_HOME/ssh/hosts.json`, prepares a dedicated Harness home at
`$DSH_HOME/remotes/<alias>/`, and starts:

```sh
dsh --profile ssh-remote
```

with `DSH_SSH_HOST`, `DSH_SSH_WORKSPACE`, `DSH_SSH_HELPER`,
`DSH_SSH_HELPER_HASH` and the launch kind in its environment. The remote home
shares credentials, model settings, skills and the home patch by symlink, while
Sessions and Workspaces stay isolated per host. This matches the way VS Code
keeps one server-side data directory per remote.

## Remote explorer

Start the local Web UI (`pnpm dsh web`) and open **Remote SSH** in the left
sidebar:

- The local page lists discovered destinations and their remembered workspace.
  **Connect** provisions the helper if needed, starts a detached remote Web
  process, and opens its authenticated URL in a new tab.
- The connected page shows the active host, workspace and platform. Enter an
  absolute remote directory and choose **Open as session** to register it as a
  Workspace and open a Session there.

Inside a connected page, the normal DSH features operate on the remote host:

- Bash, file read/write/edit, the file tree, text preview, search (where a
  remote `rg`/search path applies), terminals, LSP processes started through
  the subprocess seam, and PTC (when a PTC bootstrap is configured).
- Model transport, Session storage, attachments and the Web UI remain local.

## What still assumes a local host

These upstream limitations remain, and the remote bundle disables the affected
rows where possible:

| Surface | Behavior |
|---|---|
| `grep`/`glob` tool | Disabled in `ssh-app`; the packaged `rg` path is a host path. `workspaceFiles.search` can still fail without a remote search binary. |
| Changed-files deliverable | Disabled; it captures git snapshots through host `node:fs`. |
| Open-in-app, native file reveal, directory pickers | Disabled; they are host GUI integrations. |
| Office conversion | The Office tool refuses conversion for remote workspaces. |
| File watching | `fs-ssh` does not implement `watch`; previews remain readable and refresh is manual. |
| Image adaptation for PTC | `fs-ssh` has no attachment path mapping. |
| Computer use / browser use | Host-owned capabilities and never routed to the remote. |

## Security notes

- Authentication is entirely OpenSSH's. This fork never handles passwords,
  private keys, agent forwarding, or `StrictHostKeyChecking=no`.
- The helper archive is verified locally against its manifest and optional
  sibling checksum; the running helper's own digest is then verified by the
  `SshConnection` handshake.
- The remote Web server binds loopback and uses DSH's normal launch-token and
  signed-cookie authentication. The local Web process starts it; the browser
  opens the tokenized URL.
- `$DSH_HOME/ssh/hosts.json` is written atomically with mode `0600`.

## Tests

```sh
pnpm exec vitest run packages/ssh/ssh-hosts/tests
pnpm exec vitest run packages/workspace/workspace/tests
```

The fork was verified end-to-end against a local OpenSSH server on
`127.0.0.1:2222`:

1. `dsh ssh probe dsh-e2e` detects Linux x64, glibc 2.39, and `tar`.
2. `dsh ssh install` transfers the 46 MB archive over `ssh`/`tar` and returns
   the executable digest.
3. The remote profile writes `remote-write-ok` through `ctx.fs` and runs
   `hostname; pwd` through `ctx.subprocess`.
4. The Web API creates a Session with a remote `cwd`, lists and reads remote
   files, and the file explorer shows the remote directory.
5. An agent prompt sent through the remote Web UI runs Bash remotely and replies
   with the remote hostname and workspace path.
6. The local Remote SSH panel lists hosts, connects, and opens the remote URL in
   a new tab.

## Fork

- Upstream: <https://github.com/deepseek-ai/deepseek-harness>
- Fork: <https://github.com/jacobmejilla/deepseek-harness-ssh>
- Branch: `feat/ssh-remote`

The fork keeps upstream package names and composition rules; the new packages
are additive and the only behavior changes to existing packages are the
filesystem-aware workspace path checks, the Session directory-preparation
guard, and the `executionWorld` capability on the filesystem seam.
