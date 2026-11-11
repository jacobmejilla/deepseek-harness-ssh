/** Process boundaries for the manager: OpenSSH invocations and local Git-free state reads. */

import { spawn } from 'node:child_process'

/** Options shared by every non-interactive OpenSSH operation this package performs. */
export const SSH_BASE_ARGS = [
  '-T',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'ForwardAgent=no',
  '-o', 'ClearAllForwardings=yes',
  '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=10',
  '-o', 'ServerAliveCountMax=3',
] as const

/** Quote one POSIX shell word. */
export function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** Result of one completed child process. */
export interface SshCommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
}

/** One command failure with the child's diagnostics appended. */
export class SshCommandError extends Error {
  /**
   * @param message - Actionable description of the failed command.
   * @param result - Captured child streams and termination facts.
   */
  constructor(message: string, readonly result: SshCommandResult) {
    super(message)
    this.name = 'SshCommandError'
  }
}

/** Options for one child process invocation. */
export interface SshCommandOptions {
  /** Hard deadline; expiry terminates the child. */
  readonly timeoutMs?: number | undefined
  /** Caller cancellation; abort terminates the child. */
  readonly signal?: AbortSignal | undefined
  /** Bytes written to stdin before it closes. */
  readonly input?: Uint8Array | undefined
  /** Retained stdout/stderr byte cap. */
  readonly maxBytes?: number | undefined
}

/**
 * Run one child process to completion with bounded output.
 * @param command - executable name or absolute path.
 * @param args - argument vector passed without shell interpretation.
 * @param options - deadline, cancellation, stdin bytes, and retained output cap.
 * @returns the completed process outcome.
 * @throws SshCommandError when the process cannot start or exceeds its deadline.
 */
export async function run(command: string, args: readonly string[], options: SshCommandOptions = {}): Promise<SshCommandResult> {
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024
  const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let stdoutBytes = 0
  let stderrBytes = 0
  const capture = (chunks: Buffer[], chunk: Buffer, retained: number): number => {
    const room = maxBytes - retained
    if (room <= 0) return retained
    const slice = chunk.length > room ? chunk.subarray(0, room) : chunk
    chunks.push(slice)
    return retained + slice.length
  }
  child.stdout.on('data', (chunk: Buffer) => { stdoutBytes = capture(stdout, chunk, stdoutBytes) })
  child.stderr.on('data', (chunk: Buffer) => { stderrBytes = capture(stderr, chunk, stderrBytes) })
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => { resolve({ code, signal }) })
  })
  const deadline = { timedOut: false }
  const timer = options.timeoutMs === undefined
    ? undefined
    : setTimeout(() => { deadline.timedOut = true; child.kill('SIGKILL') }, options.timeoutMs)
  const abort = (): void => { child.kill('SIGKILL') }
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.input !== undefined) child.stdin.end(options.input)
  else child.stdin.end()
  try {
    let exit: { code: number | null; signal: NodeJS.Signals | null }
    try {
      exit = await closed
    } catch (error) {
      throw new SshCommandError(`cannot run ${command}: ${error instanceof Error ? error.message : String(error)}`, {
        stdout: '', stderr: '', exitCode: null, signal: null,
      })
    }
    const result: SshCommandResult = {
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
      exitCode: exit.code,
      signal: exit.signal,
    }
    if (deadline.timedOut) throw new SshCommandError(`${command} exceeded its ${String(options.timeoutMs)} ms deadline`, result)
    if (options.signal?.aborted === true) throw new SshCommandError(`${command} was cancelled`, result)
    return result
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

/**
 * Run one command in the remote user's login shell over OpenSSH.
 * @param alias - OpenSSH host alias.
 * @param command - POSIX shell command text; callers quote interpolated values.
 * @param options - deadline, cancellation, stdin bytes, and retained output cap.
 * @returns the completed process outcome; a non-zero exit is returned, not thrown.
 */
export async function runSsh(alias: string, command: string, options: SshCommandOptions = {}): Promise<SshCommandResult> {
  return await run('ssh', [...SSH_BASE_ARGS, alias, command], options)
}
