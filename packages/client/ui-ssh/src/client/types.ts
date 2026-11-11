/** Browser-facing SSH host and connection facts. */

/** One discovered SSH destination. */
export interface SshHostView {
  readonly alias: string
  readonly hostName?: string | undefined
  readonly user?: string | undefined
  readonly port?: number | undefined
  readonly source: 'ssh-config' | 'saved'
  readonly workspace?: string | undefined
}

/** Boot state injected into the page by the Host. */
export interface SshBootState {
  readonly mode: 'local' | 'remote'
  readonly active?: {
    readonly alias: string
    readonly workspace: string
    readonly target?: string | undefined
    readonly platform?: string | undefined
  } | undefined
}

/** `GET /api/ssh/hosts` response. */
export interface SshHostsView extends SshBootState {
  readonly hosts: readonly SshHostView[]
  readonly servers: readonly { readonly alias: string; readonly url: string; readonly pid: number }[]
}

/** Result of `POST /api/ssh/connect`. */
export type ConnectResult =
  | { readonly ok: true; readonly value: { readonly alias: string; readonly url: string } }
  | { readonly ok: false; readonly error: string }
