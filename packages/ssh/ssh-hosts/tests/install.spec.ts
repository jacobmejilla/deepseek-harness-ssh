import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { create } from 'tar'
import { inspectHelperArchive } from '../src/install.ts'
import { quote } from '../src/transport.ts'

const roots: string[] = []

async function archive(executable = 'helper-bytes'): Promise<{ path: string; executableSha256: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ssh-archive-'))
  roots.push(root)
  const product = join(root, 'dsh-ssh-helper')
  await mkdir(product)
  await writeFile(join(product, 'dsh-ssh-helper'), executable, { mode: 0o755 })
  const executableSha256 = createHash('sha256').update(executable).digest('hex')
  await writeFile(join(product, 'manifest.json'), `${JSON.stringify({
    format: 1, version: '1.2.3', target: 'node24-linux-x64', protocol: 3, nodeVersion: 'v24.0.0',
    files: [{ path: 'dsh-ssh-helper', sha256: executableSha256, mode: 0o755 }],
  }, null, 2)}\n`)
  const path = join(root, 'helper.tar.gz')
  await create({ cwd: root, file: path, gzip: true }, ['dsh-ssh-helper'])
  return { path, executableSha256 }
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('inspectHelperArchive', () => {
  it('reads and hashes the packaged helper', async () => {
    const fixture = await archive()
    const inspected = await inspectHelperArchive(fixture.path)
    expect(inspected).toMatchObject({
      version: '1.2.3', target: 'node24-linux-x64', protocol: 3, executableSha256: fixture.executableSha256,
    })
    expect(inspected.archiveSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses an archive whose sibling checksum differs', async () => {
    const fixture = await archive()
    await writeFile(`${fixture.path}.sha256`, `${'0'.repeat(64)}  helper.tar.gz\n`)
    await expect(inspectHelperArchive(fixture.path)).rejects.toThrow(/published checksum/)
  })

  it('refuses an archive without the executable manifest entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-ssh-archive-'))
    roots.push(root)
    await mkdir(join(root, 'dsh-ssh-helper'))
    await writeFile(join(root, 'dsh-ssh-helper', 'manifest.json'), JSON.stringify({
      format: 1, version: '1.2.3', target: 'node24-linux-x64', protocol: 3, nodeVersion: 'v24.0.0', files: [],
    }))
    const path = join(root, 'helper.tar.gz')
    await create({ cwd: root, file: path, gzip: true }, ['dsh-ssh-helper'])
    await expect(inspectHelperArchive(path)).rejects.toThrow(/omits/)
  })
})

describe('quote', () => {
  it('survives spaces and single quotes', () => {
    expect(quote("a b'c")).toBe("'a b'\\''c'")
  })
})
