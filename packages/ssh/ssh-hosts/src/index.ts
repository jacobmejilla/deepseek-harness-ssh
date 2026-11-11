/**
 * Host-side SSH remote-workspace manager: OpenSSH destination discovery,
 * verified helper provisioning, and one detached Web process per remote host.
 * @module @deepseek-ai/dsh-ssh-hosts
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { helperTargetOf, probeHost, HOST_ALIAS_PATTERN } from './probe.ts'
import { listSshHosts } from './hosts.ts'
import { provisionHelper } from './install.ts'
import { prepareRemoteHome, startRemoteServer } from './launch.ts'
import { readHostsFile, saveHostState } from './state.ts'
import type { SshBootState, SshHostEntry, SshHostsView, SshRemoteServer, SshRemoteSettings } from './types.ts'
import type { ChildProcess } from 'node:child_process'
import { z } from 'zod'

export type * from './types.ts'
export { HOST_ALIAS_PATTERN, helperTargetOf, parseProbeOutput, probeHost, versionAtLeast } from './probe.ts'
export { defaultSshConfigPath, listSshHosts, parseHostAliases, parseSshGOutput, resolveHost } from './hosts.ts'
export { fileDigest, inspectHelperArchive, provisionHelper } from './install.ts'
export {
  allocateLoopbackPort, dshEntryPath, parseWebUrl, prepareRemoteHome, remoteChildEnvironment, remoteHomeOf, startRemoteServer,
} from './launch.ts'
export type { HelperArchive, InstallOptions } from './install.ts'
export type { StartedRemote, StartRemoteOptions } from './launch.ts'
export { hostsFilePath, readHostsFile, removeHostState, saveHostState, writeHostsFile } from './state.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Managed SSH destinations and remote Web processes. */
    sshHosts: SshHosts
  }
}

/** Manager configuration. */
export interface Config {
  /** Local helper archive used when no target-specific archive is found. */
  readonly helperArchive?: string
  /** Absolute remote install root; default `$HOME/.dsh/ssh-helper`. */
  readonly installRoot?: string
  /** Maximum retained helper transfer time in milliseconds. */
  readonly transferTimeoutMs?: number
}

const connectBodySchema = z.object({
  alias: z.string().regex(HOST_ALIAS_PATTERN),
  workspace: z.string().startsWith('/').optional(),
  port: z.number().int().min(1).max(65535).optional(),
}).strict()

const stopBodySchema = z.object({ alias: z.string().regex(HOST_ALIAS_PATTERN) }).strict()

/**
 * Resolve a target-specific helper archive from configuration, the Harness home, or a source checkout.
 * @param target - detected helper target.
 * @param configured - configured archive path, when present.
 * @returns the first existing archive path.
 * @throws when no archive exists for the target.
 */
export async function resolveHelperArchive(target: string, configured?: string): Promise<string> {
  const explicit = configured ?? process.env.DSH_SSH_HELPER_ARCHIVE
  if (explicit !== undefined && explicit !== '') return explicit
  const candidates: string[] = []
  const home = resolveDshHome()
  for (const directory of [join(home, 'ssh', 'helper'), fileURLToPath(new URL('../../../../dist-exe/ssh-helper/', import.meta.url))]) {
    try {
      for (const entry of await readdir(directory)) {
        const suffix = target.startsWith('node24-') ? target.slice('node24-'.length) : target
        if (entry.endsWith(`-${suffix}.tar.gz`) || entry.endsWith(`-${target}.tar.gz`)) candidates.push(join(directory, entry))
      }
    } catch { /* absent candidate directory */ }
  }
  const found = candidates.sort().at(-1)
  if (found === undefined) {
    throw new Error(
      `no SSH helper archive for ${target}; build one with "pnpm exec tsx scripts/build-exe-for-ssh-helper.ts" `
      + `or place it under ${join(home, 'ssh', 'helper')}`,
    )
  }
  return found
}

/** Owned Web process for one alias. */
interface OwnedServer {
  readonly server: SshRemoteServer
  readonly child: ChildProcess
}

/** SSH destination discovery, provisioning, and detached remote Web processes. */
export class SshHosts extends Service {
  static Config: schema<Config> = schema.object({
    helperArchive: schema.string(),
    installRoot: schema.string(),
    transferTimeoutMs: schema.number().default(15 * 60_000),
  })

  static inject = ['connection', 'webServer']

  private readonly owned = new Map<string, OwnedServer>()
  private readonly config: Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'sshHosts')
    this.config = config
  }

  /**
   * Whether this process already runs against a remote execution world.
   * @returns `remote` when the SSH profile supplied a host, otherwise `local`.
   */
  get mode(): 'local' | 'remote' {
    return process.env.DSH_SSH_HOST === undefined ? 'local' : 'remote'
  }

  /**
   * Active remote connection facts for browser boot state.
   * @returns the page's remote/local mode and active host when remote.
   */
  bootState(): SshBootState {
    const alias = process.env.DSH_SSH_HOST
    if (alias === undefined) return { mode: 'local' }
    return {
      mode: 'remote',
      active: {
        alias,
        workspace: process.env.DSH_SSH_WORKSPACE ?? '',
        ...(process.env.DSH_SSH_TARGET === undefined ? {} : { target: process.env.DSH_SSH_TARGET as import('./types.ts').SshHelperTarget }),
        ...(process.env.DSH_SSH_PLATFORM === undefined ? {} : { platform: process.env.DSH_SSH_PLATFORM }),
      },
    }
  }

  /**
   * Static boot state injected into the page.
   * @returns the index-injection listener disposer.
   */
  installBootState(): () => void {
    return this.ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
      table.push({ kind: 'global', name: '__DSH_SSH__', value: this.bootState() })
    })
  }

  /**
   * List OpenSSH destinations and live remote servers.
   * @returns the browser view.
   */
  async list(): Promise<SshHostsView> {
    const file = await readHostsFile()
    const hosts: SshHostEntry[] = await listSshHosts(file.hosts)
    return {
      ...this.bootState(),
      hosts,
      servers: [...this.owned.values()].map(entry => ({
        alias: entry.server.alias, url: entry.server.url, pid: entry.server.pid,
      })),
    }
  }

  /**
   * Provision the remote helper and start a detached Web process.
   * @param alias - OpenSSH alias.
   * @param workspace - requested remote workspace; defaults to the remote home.
   * @param port - requested loopback port.
   * @returns the started server.
   */
  async connect(alias: string, workspace?: string, port?: number): Promise<SshRemoteServer> {
    if (this.mode === 'remote') throw new Error('this Harness already runs against a remote host')
    const running = this.owned.get(alias)
    if (running !== undefined) return running.server
    const probe = await probeHost(alias)
    const target = helperTargetOf(probe)
    const archive = await resolveHelperArchive(target, this.config.helperArchive)
    const settings: SshRemoteSettings = await provisionHelper(alias, {
      archivePath: archive,
      ...(workspace === undefined ? {} : { workspace }),
      ...(this.config.installRoot === undefined ? {} : { installRoot: this.config.installRoot }),
      timeoutMs: this.config.transferTimeoutMs,
    })
    await saveHostState(alias, {
      workspace: settings.workspace,
      helper: settings.helper,
      helperHash: settings.helperHash,
      ...(settings.target === undefined ? {} : { target: settings.target }),
      ...(settings.version === undefined ? {} : { version: settings.version }),
      lastConnectedAt: new Date().toISOString(),
    })
    const home = await prepareRemoteHome(alias)
    const started = await startRemoteServer({ settings, home, ...(port === undefined ? {} : { port }) })
    const owned: OwnedServer = { server: started.server, child: started.child }
    this.owned.set(alias, owned)
    started.child.once('exit', () => { if (this.owned.get(alias) === owned) this.owned.delete(alias) })
    this.ctx.effect(() => () => {
      const entry = this.owned.get(alias)
      if (entry !== undefined) entry.child.kill('SIGTERM')
    }, `ssh-hosts:${alias}`)
    return started.server
  }

  /**
   * Stop one managed remote Web process.
   * @param alias - OpenSSH alias.
   * @returns whether a process was stopped.
   */
  stop(alias: string): boolean {
    const entry = this.owned.get(alias)
    if (entry === undefined) return false
    this.owned.delete(alias)
    entry.child.kill('SIGTERM')
    return true
  }

  /**
   * Mount routes and boot-state injection.
   * @returns nothing.
   */
  [Service.init](): void {
    this.ctx.effect(() => this.installBootState(), 'ssh-hosts: boot state')
    this.ctx.effect(() => this.ctx.connection.fetch.register({
      path: '/api/ssh/hosts',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => Response.json(await this.list()),
    }), 'ssh-hosts: list route')
    this.ctx.effect(() => this.ctx.connection.fetch.register({
      path: '/api/ssh/connect',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = connectBodySchema.parse(await request.json())
          const server = await this.connect(body.alias, body.workspace, body.port)
          return Response.json({ ok: true, value: server })
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 })
        }
      },
    }), 'ssh-hosts: connect route')
    this.ctx.effect(() => this.ctx.connection.fetch.register({
      path: '/api/ssh/stop',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const body = stopBodySchema.parse(await request.json())
          return Response.json({ ok: true, stopped: this.stop(body.alias) })
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 })
        }
      },
    }), 'ssh-hosts: stop route')
  }

  /**
   * Stop every managed remote Web process.
   * @returns nothing.
   */
  dispose(): void {
    for (const alias of [...this.owned.keys()]) this.stop(alias)
  }
}

export default SshHosts
