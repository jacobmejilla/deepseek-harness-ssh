/** Dedicated Harness home and Web process for one remote workspace. */

import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, mkdir, symlink } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { SshRemoteServer, SshRemoteSettings } from './types.ts'

/** Browser URL as printed by the Web application. */
const WEB_URL_PATTERN = /dsh web: (https?:\/\/\S+)/u

/**
 * Dedicated Harness home for one remote alias.
 * @param alias - OpenSSH alias.
 * @param mainHome - the invoking Harness home.
 * @returns absolute per-host home path.
 */
export function remoteHomeOf(alias: string, mainHome: string = resolveDshHome()): string {
  return join(mainHome, 'remotes', alias)
}

const SHARED_ENTRIES = ['.credentials.yaml', 'llm-deepseek', 'skills', 'cordis.patch.yml', 'settings.yaml', '.anonymous-user-id'] as const

/**
 * Create the per-host home and link the machine-local files a remote profile still shares.
 * @param alias - OpenSSH alias.
 * @param mainHome - the invoking Harness home.
 * @returns absolute per-host home path.
 */
export async function prepareRemoteHome(alias: string, mainHome: string = resolveDshHome()): Promise<string> {
  const home = remoteHomeOf(alias, mainHome)
  await mkdir(join(home, 'profiles'), { recursive: true, mode: 0o700 })
  for (const entry of SHARED_ENTRIES) {
    const source = join(mainHome, entry)
    const target = join(home, entry)
    try {
      await access(source)
    } catch { continue }
    try {
      await access(target)
    } catch {
      await symlink(source, target).catch((error: unknown) => {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      })
    }
  }
  return home
}

/**
 * Environment values the remote profile reads.
 * @param settings - provisioned remote settings.
 * @param home - per-host Harness home.
 * @returns environment overlay for the child process.
 */
export function remoteChildEnvironment(settings: SshRemoteSettings, home: string): NodeJS.ProcessEnv {
  return {
    DSH_HOME: home,
    DSH_SSH_HOST: settings.host,
    DSH_SSH_WORKSPACE: settings.workspace,
    DSH_SSH_HELPER: settings.helper,
    DSH_SSH_HELPER_HASH: settings.helperHash,
    DSH_SSH_LAUNCH_KIND: settings.launch.kind,
    ...(settings.launch.kind === 'node-script' ? { DSH_SSH_NODE: settings.launch.node } : {}),
    ...(settings.target === undefined ? {} : { DSH_SSH_TARGET: settings.target }),
    ...(settings.version === undefined ? {} : { DSH_SSH_VERSION: settings.version }),
  }
}

/** The CLI script that launched this process. */
export function dshEntryPath(): string {
  const entry = process.argv[1]
  if (entry === undefined) throw new Error('cannot resolve the dsh entry script for a child process')
  return entry
}

/**
 * Ask the OS for a free loopback port.
 * @returns an available TCP port number.
 */
export async function allocateLoopbackPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { resolve() })
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : undefined
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  if (port === undefined) throw new Error('could not allocate a loopback port')
  return port
}

/**
 * Parse the authenticated URL from Web startup output.
 * @param text - accumulated stdout/stderr.
 * @returns the URL when present.
 */
export function parseWebUrl(text: string): string | undefined {
  return WEB_URL_PATTERN.exec(text)?.[1]
}

/** Options for starting a detached remote Web process. */
export interface StartRemoteOptions {
  /** Provisioned remote settings. */
  readonly settings: SshRemoteSettings
  /** Per-host Harness home. */
  readonly home: string
  /** Requested loopback port; 0 or omission chooses a free port. */
  readonly port?: number
  /** Readiness deadline in milliseconds. */
  readonly timeoutMs?: number
  /** Caller cancellation. */
  readonly signal?: AbortSignal
}

/** Started remote server with its owned child process. */
export interface StartedRemote {
  /** Browser-ready server facts. */
  readonly server: SshRemoteServer
  /** Owned Web process. */
  readonly child: ChildProcess
}

/**
 * Start `dsh --profile ssh-remote` over the provisioned SSH settings and wait for its authenticated URL.
 * @param options - settings, home, port, deadline, and cancellation.
 * @returns the running server and its child.
 * @throws when the child exits or prints no URL before the deadline.
 */
export async function startRemoteServer(options: StartRemoteOptions): Promise<StartedRemote> {
  const port = options.port === undefined || options.port === 0 ? await allocateLoopbackPort() : options.port
  const log = createWriteStream(join(options.home, 'web.log'), { flags: 'a', mode: 0o600 })
  const child = spawn(process.execPath, [
    ...process.execArgv,
    dshEntryPath(),
    '--profile', 'ssh-remote',
    '--no-open',
    '--port', String(port),
  ], {
    env: { ...process.env, ...remoteChildEnvironment(options.settings, options.home) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  const exited = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(`remote Web process exited before readiness (${code ?? signal ?? 'unknown'})`))
    })
  })
  const url = new Promise<string>((resolve, reject) => {
    let text = ''
    const read = (chunk: Buffer): void => {
      text = (text + chunk.toString('utf8')).slice(-64 * 1024)
      const found = parseWebUrl(text)
      if (found !== undefined) resolve(found)
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.once('error', reject)
  })
  const timer = setTimeout(() => { child.kill('SIGKILL') }, options.timeoutMs ?? 90_000)
  const abort = (): void => { child.kill('SIGKILL') }
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const ready = await Promise.race([url, exited])
    return {
      child,
      server: { alias: options.settings.host, url: ready, pid: child.pid ?? -1, home: options.home },
    }
  } catch (error) {
    child.kill('SIGKILL')
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
