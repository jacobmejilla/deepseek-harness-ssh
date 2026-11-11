import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readHostsFile, removeHostState, saveHostState, writeHostsFile } from '../src/state.ts'

const roots: string[] = []

async function temporary(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ssh-state-'))
  roots.push(root)
  return join(root, 'hosts.json')
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('host state', () => {
  it('returns an empty file when none exists', async () => {
    expect(await readHostsFile(await temporary())).toEqual({ format: 1, hosts: {} })
  })

  it('round-trips and preserves other records', async () => {
    const path = await temporary()
    await saveHostState('alpha', { workspace: '/work', helperHash: 'a'.repeat(64) }, path)
    await saveHostState('beta', { workspace: '/other' }, path)
    expect(await readHostsFile(path)).toMatchObject({ hosts: { alpha: { workspace: '/work' }, beta: { workspace: '/other' } } })
    expect(await removeHostState('alpha', path)).toBe(true)
    expect(await removeHostState('alpha', path)).toBe(false)
    expect((await readHostsFile(path)).hosts.beta?.workspace).toBe('/other')
    expect((await readFile(path, 'utf8')).endsWith('\n')).toBe(true)
  })

  it('rejects malformed durable data', async () => {
    const path = await temporary()
    await writeFile(path, '{"format":2,"hosts":{}}\n')
    await expect(readHostsFile(path)).rejects.toThrow()
    await expect(writeHostsFile({ format: 1, hosts: { bad: { workspace: 'relative' } } }, path)).rejects.toThrow()
  })
})
