/** Durable local host records under the Harness home. */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { SshHostState, SshHostsFile } from './types.ts'

const helperTargetSchema = z.enum(['node24-linux-x64', 'node24-linux-arm64', 'node24-macos-x64', 'node24-macos-arm64'])

const hostStateSchema = z.object({
  workspace: z.string().startsWith('/').optional(),
  helper: z.string().startsWith('/').optional(),
  helperHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  target: helperTargetSchema.optional(),
  version: z.string().min(1).optional(),
  lastConnectedAt: z.string().min(1).optional(),
}).strict()

const hostsFileSchema = z.object({
  format: z.literal(1),
  hosts: z.record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/), hostStateSchema),
}).strict()

/** Absolute path of the managed host record file. */
export function hostsFilePath(home: string = resolveDshHome()): string {
  return join(home, 'ssh', 'hosts.json')
}

/**
 * Read every managed host record.
 * @param path - record file path.
 * @returns the parsed file, or an empty file when none exists.
 * @throws when an existing file is malformed.
 */
export async function readHostsFile(path: string = hostsFilePath()): Promise<SshHostsFile> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return hostsFileSchema.parse(parsed)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { format: 1, hosts: {} }
    throw error
  }
}

/**
 * Atomically replace the managed host record file.
 * @param file - complete record contents.
 * @param path - record file path.
 */
export async function writeHostsFile(file: SshHostsFile, path: string = hostsFilePath()): Promise<void> {
  hostsFileSchema.parse(file)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

/**
 * Persist one host record while preserving every other record.
 * @param alias - OpenSSH alias.
 * @param state - record to store.
 * @param path - record file path.
 */
export async function saveHostState(alias: string, state: SshHostState, path: string = hostsFilePath()): Promise<void> {
  const file = await readHostsFile(path)
  await writeHostsFile({ format: 1, hosts: { ...file.hosts, [alias]: state } }, path)
}

/**
 * Remove one host record while preserving every other record.
 * @param alias - OpenSSH alias.
 * @param path - record file path.
 * @returns whether a record was removed.
 */
export async function removeHostState(alias: string, path: string = hostsFilePath()): Promise<boolean> {
  const file = await readHostsFile(path)
  if (!(alias in file.hosts)) return false
  const hosts = Object.fromEntries(Object.entries(file.hosts).filter(([key]) => key !== alias))
  await writeHostsFile({ format: 1, hosts }, path)
  return true
}
