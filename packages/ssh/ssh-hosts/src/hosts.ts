/** OpenSSH configuration discovery and resolution. */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SshHostEntry } from './types.ts'
import { run } from './transport.ts'
import { HOST_ALIAS_PATTERN } from './probe.ts'

/** Absolute default user OpenSSH configuration path. */
export function defaultSshConfigPath(): string {
  return join(homedir(), '.ssh', 'config')
}

/**
 * Extract concrete host aliases from OpenSSH configuration text.
 * @param text - `~/.ssh/config` content.
 * @returns aliases in file order, excluding patterns and duplicates.
 */
export function parseHostAliases(text: string): string[] {
  const aliases: string[] = []
  const seen = new Set<string>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const match = /^(?:host)\s+(.+)$/i.exec(line)
    if (match === null) continue
    for (const candidate of match[1]?.trim().split(/\s+/) ?? []) {
      if (!HOST_ALIAS_PATTERN.test(candidate) || seen.has(candidate)) continue
      seen.add(candidate)
      aliases.push(candidate)
    }
  }
  return aliases
}

/** Resolved connection facts from `ssh -G`. */
interface ResolvedHost {
  readonly hostName?: string | undefined
  readonly user?: string | undefined
  readonly port?: number | undefined
}

/**
 * Parse the subset of `ssh -G` output this manager displays.
 * @param text - complete `ssh -G <alias>` stdout.
 * @returns resolved host name, user, and port.
 */
export function parseSshGOutput(text: string): ResolvedHost {
  const values = new Map<string, string>()
  for (const line of text.split('\n')) {
    const index = line.indexOf(' ')
    if (index <= 0) continue
    if (!values.has(line.slice(0, index))) values.set(line.slice(0, index), line.slice(index + 1).trim())
  }
  const port = values.get('port')
  return {
    ...(values.has('hostname') ? { hostName: values.get('hostname') } : {}),
    ...(values.has('user') ? { user: values.get('user') } : {}),
    ...(port !== undefined && /^\d+$/.test(port) ? { port: Number(port) } : {}),
  }
}

/**
 * Resolve one alias without connecting.
 * @param alias - OpenSSH host alias.
 * @returns resolved connection facts, or undefined when the alias is not configured.
 */
export async function resolveHost(alias: string): Promise<ResolvedHost | undefined> {
  const result = await run('ssh', ['-G', alias], { timeoutMs: 10_000, maxBytes: 1024 * 1024 })
  if (result.exitCode !== 0) return undefined
  return parseSshGOutput(result.stdout)
}

/**
 * Discover destinations from the user's OpenSSH configuration and saved records.
 * @param saved - aliases remembered by this manager.
 * @param configPath - OpenSSH configuration path.
 * @param concurrency - maximum concurrent `ssh -G` resolutions.
 * @returns sorted host entries; unresolved aliases keep their alias only.
 */
export async function listSshHosts(
  saved: Readonly<Record<string, { workspace?: string | undefined }>> = {},
  configPath: string = defaultSshConfigPath(),
  concurrency = 8,
): Promise<SshHostEntry[]> {
  let aliases: string[] = []
  try {
    aliases = parseHostAliases(await readFile(configPath, 'utf8'))
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const union = [...new Set([...aliases, ...Object.keys(saved)])].sort()
  const entries: SshHostEntry[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const index = next++
      const alias = union[index]
      if (alias === undefined) return
      if (!HOST_ALIAS_PATTERN.test(alias)) continue
      const resolved = await resolveHost(alias)
      const workspace = saved[alias]?.workspace
      entries.push({
        alias,
        source: aliases.includes(alias) ? 'ssh-config' : 'saved',
        ...resolved ?? {},
        ...(workspace === undefined ? {} : { workspace }),
      })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(union.length, 1)) }, async () => worker()))
  return entries.sort((left, right) => left.alias.localeCompare(right.alias))
}
