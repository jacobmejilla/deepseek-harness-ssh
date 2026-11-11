/** Verified helper archive installation over OpenSSH. */

import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { x } from 'tar'
import { z } from 'zod'
import type { SshHelperTarget, SshProbe, SshRemoteSettings } from './types.ts'
import { helperTargetOf, probeHost } from './probe.ts'
import { quote, runSsh } from './transport.ts'

const targetSchema = z.enum(['node24-linux-x64', 'node24-linux-arm64', 'node24-macos-x64', 'node24-macos-arm64'])

const manifestSchema = z.object({
  format: z.literal(1),
  version: z.string().min(1),
  target: targetSchema,
  protocol: z.number().int().positive(),
  nodeVersion: z.string().min(1),
  files: z.array(z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mode: z.number().int().nonnegative(),
  })),
}).loose()

/** Verified metadata for one packaged helper archive. */
export interface HelperArchive {
  /** Absolute archive path. */
  readonly path: string
  /** SHA-256 of the complete archive. */
  readonly archiveSha256: string
  /** Release version recorded by the archive manifest. */
  readonly version: string
  /** Artifact target recorded by the archive manifest. */
  readonly target: SshHelperTarget
  /** Helper protocol version. */
  readonly protocol: number
  /** SHA-256 of the executable entry. */
  readonly executableSha256: string
}

/**
 * Hash a file once.
 * @param path - absolute file path.
 * @returns lowercase SHA-256.
 */
export async function fileDigest(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

/**
 * Read and verify one helper archive's manifest and optional sibling checksum.
 * @param path - absolute archive path.
 * @returns verified archive facts.
 * @throws when the archive is missing, malformed, or fails its published checksum.
 */
export async function inspectHelperArchive(path: string): Promise<HelperArchive> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`helper archive ${JSON.stringify(path)} is not a regular file`)
  const archiveSha256 = await fileDigest(path)
  try {
    const declared = (await readFile(`${path}.sha256`, 'utf8')).trim().split(/\s+/)[0]
    if (declared !== undefined && /^[0-9a-f]{64}$/.test(declared) && declared !== archiveSha256) {
      throw new Error(`helper archive digest ${archiveSha256} differs from its published checksum ${declared}`)
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-helper-manifest-'))
  try {
    await x({ file: path, cwd: temporary, filter: entry => entry === 'dsh-ssh-helper/manifest.json' })
    const parsed: unknown = JSON.parse(await readFile(join(temporary, 'dsh-ssh-helper', 'manifest.json'), 'utf8'))
    const manifest = manifestSchema.parse(parsed)
    if (manifest.protocol !== 3) throw new Error(`helper archive protocol ${String(manifest.protocol)} is not supported`)
    const entry = manifest.files.find(file => file.path === 'dsh-ssh-helper')
    if (entry === undefined) throw new Error('helper archive manifest omits the dsh-ssh-helper executable')
    return {
      path,
      archiveSha256,
      version: manifest.version,
      target: manifest.target,
      protocol: manifest.protocol,
      executableSha256: entry.sha256,
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

/** Options for one verified installation. */
export interface InstallOptions {
  /** Local helper archive; omission uses the caller's resolved default. */
  readonly archivePath: string
  /** Absolute remote workspace. */
  readonly workspace?: string | undefined
  /** Absolute remote install root; default `$HOME/.dsh/ssh-helper`. */
  readonly installRoot?: string | undefined
  /** Caller cancellation. */
  readonly signal?: AbortSignal | undefined
  /** Transfer deadline. */
  readonly timeoutMs?: number | undefined
}

/**
 * Install the verified helper into a versioned remote directory and return the connection settings.
 * @param alias - OpenSSH alias.
 * @param options - archive, workspace, install root, cancellation, and deadline.
 * @returns settings the SSH connection plugin can mount.
 * @throws when the remote platform is unsupported, the archive is invalid, or installation fails.
 */
export async function provisionHelper(alias: string, options: InstallOptions): Promise<SshRemoteSettings> {
  const archive = await inspectHelperArchive(options.archivePath)
  const probe: SshProbe = await probeHost(alias, { signal: options.signal })
  const target = helperTargetOf(probe)
  if (archive.target !== target) {
    throw new Error(`helper archive targets ${archive.target}, but ${JSON.stringify(alias)} reports ${target}`)
  }
  if (!probe.tar) throw new Error(`remote host ${JSON.stringify(alias)} has no tar command, which installation requires`)
  if (!probe.homeWritable) throw new Error(`remote home ${probe.home} is not writable`)
  if (!probe.tmpWritable) throw new Error('remote /tmp is not writable; the helper requires it for connection streams')
  const installRoot = options.installRoot ?? join(probe.home, '.dsh', 'ssh-helper')
  if (!installRoot.startsWith('/') || /[\0\r\n]/u.test(installRoot)) throw new Error('remote install root must be an absolute POSIX path')
  const directory = `${archive.version}-${target}-${archive.executableSha256.slice(0, 12)}`
  const final = `${installRoot}/${directory}`
  const helper = `${final}/dsh-ssh-helper`
  const workspace = options.workspace ?? probe.home
  const settings: SshRemoteSettings = {
    host: alias,
    helper,
    helperHash: archive.executableSha256,
    launch: { kind: 'executable' },
    workspace,
    target,
    version: archive.version,
  }
  const installed = await runSsh(alias, `test -x ${quote(helper)}`, { timeoutMs: 30_000, signal: options.signal })
  if (installed.exitCode === 0) return settings
  const incoming = `${installRoot}/.incoming-${randomBytes(6).toString('hex')}`
  const installCommand = [
    'umask 077',
    `mkdir -p ${quote(incoming)}`,
    `tar -xzf - -C ${quote(incoming)}`,
    `chmod 0755 ${quote(`${incoming}/dsh-ssh-helper/dsh-ssh-helper`)}`,
    `if [ -e ${quote(final)} ]; then rm -rf ${quote(incoming)}; else mv ${quote(`${incoming}/dsh-ssh-helper`)} ${quote(final)}; fi`,
    `rm -rf ${quote(incoming)}`,
  ].join(' && ')
  const bytes = await readFile(options.archivePath)
  const transferred = await runSsh(alias, installCommand, {
    input: bytes,
    timeoutMs: options.timeoutMs ?? 15 * 60_000,
    signal: options.signal,
  })
  if (transferred.exitCode !== 0) {
    await runSsh(alias, `rm -rf ${quote(incoming)}`, { timeoutMs: 30_000 }).catch(() => {})
    throw new Error(`helper installation on ${JSON.stringify(alias)} failed (exit ${String(transferred.exitCode)}): ${transferred.stderr.trim()}`)
  }
  const verified = await runSsh(alias, `test -x ${quote(helper)}`, { timeoutMs: 30_000, signal: options.signal })
  if (verified.exitCode !== 0) throw new Error(`helper installation on ${JSON.stringify(alias)} did not produce an executable at ${helper}`)
  return settings
}
