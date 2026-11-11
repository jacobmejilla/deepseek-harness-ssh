/** Wire and durable records for managed SSH remote workspaces. */

/** One SSH destination discovered from OpenSSH configuration or saved by this manager. */
export interface SshHostEntry {
  /** OpenSSH alias passed to the `ssh` client. */
  readonly alias: string
  /** Resolved host name reported by `ssh -G`, when available. */
  readonly hostName?: string | undefined
  /** Resolved user reported by `ssh -G`, when available. */
  readonly user?: string | undefined
  /** Resolved port reported by `ssh -G`, when available. */
  readonly port?: number | undefined
  /** Where this destination was found. */
  readonly source: 'ssh-config' | 'saved'
  /** Preferred remote workspace remembered for the destination. */
  readonly workspace?: string | undefined
}

/** Remote facts a connection attempt must know before provisioning. */
export interface SshProbe {
  /** Kernel name: `Linux` or `Darwin`. */
  readonly os: 'Linux' | 'Darwin'
  /** Kernel architecture: `x86_64`, `aarch64`, or `arm64`. */
  readonly arch: 'x86_64' | 'aarch64' | 'arm64'
  /** Absolute remote home directory. */
  readonly home: string
  /** `getconf GNU_LIBC_VERSION` output on Linux, when present. */
  readonly glibc?: string | undefined
  /** `sw_vers -productVersion` output on macOS, when present. */
  readonly macOS?: string | undefined
  /** Absolute remote Node.js path, when present. */
  readonly node?: string | undefined
  /** Whether the remote `tar` command is available. */
  readonly tar: boolean
  /** Whether the remote home directory is writable. */
  readonly homeWritable: boolean
  /** Whether the remote temporary directory is writable. */
  readonly tmpWritable: boolean
}

/** Supported helper artifact targets. */
export type SshHelperTarget = 'node24-linux-x64' | 'node24-linux-arm64' | 'node24-macos-x64' | 'node24-macos-arm64'

/** Values the SshConnection plugin needs for one remote workspace. */
export interface SshRemoteSettings {
  /** OpenSSH alias. */
  readonly host: string
  /** Absolute path to the installed helper entry or executable. */
  readonly helper: string
  /** Lowercase SHA-256 of that artifact. */
  readonly helperHash: string
  /** Launch form accepted by the version-matched helper. */
  readonly launch: { readonly kind: 'executable' } | { readonly kind: 'node-script'; readonly node: string }
  /** Absolute remote workspace directory. */
  readonly workspace: string
  /** Artifact target used for provisioning. */
  readonly target?: SshHelperTarget | undefined
  /** Release version installed on the remote host. */
  readonly version?: string | undefined
}

/** Durable per-host record stored in `$DSH_HOME/ssh/hosts.json`. */
export interface SshHostState {
  /** Remembered remote workspace. */
  readonly workspace?: string | undefined
  /** Installed helper absolute path. */
  readonly helper?: string | undefined
  /** Lowercase helper SHA-256. */
  readonly helperHash?: string | undefined
  /** Artifact target. */
  readonly target?: SshHelperTarget | undefined
  /** Installed release version. */
  readonly version?: string | undefined
  /** ISO timestamp of the last successful connection. */
  readonly lastConnectedAt?: string | undefined
}

/** Durable file format for managed hosts. */
export interface SshHostsFile {
  readonly format: 1
  readonly hosts: Readonly<Record<string, SshHostState>>
}

/** One remote server started by the host manager. */
export interface SshRemoteServer {
  /** OpenSSH alias this server uses. */
  readonly alias: string
  /** Authenticated Web URL including the launch token. */
  readonly url: string
  /** Process identity owned by this manager. */
  readonly pid: number
  /** Dedicated Harness home holding this host's Sessions and profile. */
  readonly home: string
}

/** Browser boot state: whether this page is already remote and, if so, which host. */
export interface SshBootState {
  /** `remote` when this Harness instance runs with SSH providers mounted. */
  readonly mode: 'local' | 'remote'
  /** Active remote connection in remote mode. */
  readonly active?: {
    readonly alias: string
    readonly workspace: string
    readonly target?: SshHelperTarget | undefined
    readonly platform?: string | undefined
  } | undefined
}

/** `GET /api/ssh/hosts` response. */
export interface SshHostsView extends SshBootState {
  /** Discovered destinations, sorted by alias. */
  readonly hosts: readonly SshHostEntry[]
  /** Live remote servers started from this Harness process. */
  readonly servers: readonly Pick<SshRemoteServer, 'alias' | 'url' | 'pid'>[]
}
