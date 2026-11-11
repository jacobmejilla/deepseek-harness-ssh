import { describe, expect, it } from 'vitest'
import { helperTargetOf, parseProbeOutput, versionAtLeast } from '../src/probe.ts'
import type { SshProbe } from '../src/types.ts'

function probe(overrides: Partial<SshProbe> = {}): SshProbe {
  return {
    os: 'Linux', arch: 'x86_64', home: '/home/dev', glibc: 'glibc 2.39', tar: true,
    homeWritable: true, tmpWritable: true, ...overrides,
  }
}

describe('parseProbeOutput', () => {
  it('reads key/value and bare flag lines', () => {
    expect(parseProbeOutput('os=Linux\narch=x86_64\nhome-writable\ntar=/usr/bin/tar\n')).toEqual({
      os: 'Linux', arch: 'x86_64', 'home-writable': true, tar: '/usr/bin/tar',
    })
  })

  it('keeps the last repeated value', () => {
    expect(parseProbeOutput('home=/one\nhome=/two\n')).toEqual({ home: '/two' })
  })
})

describe('versionAtLeast', () => {
  it('compares dotted numeric versions', () => {
    expect(versionAtLeast('2.39', '2.28')).toBe(true)
    expect(versionAtLeast('2.28', '2.28.0')).toBe(true)
    expect(versionAtLeast('2.17', '2.28')).toBe(false)
    expect(versionAtLeast('14.0', '14')).toBe(true)
    expect(versionAtLeast('13.7', '14')).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(versionAtLeast('glibc', '2.28')).toBe(false)
  })
})

describe('helperTargetOf', () => {
  it('maps Linux architectures and enforces glibc 2.28', () => {
    expect(helperTargetOf(probe())).toBe('node24-linux-x64')
    expect(helperTargetOf(probe({ arch: 'aarch64' }))).toBe('node24-linux-arm64')
    expect(helperTargetOf(probe({ arch: 'arm64' }))).toBe('node24-linux-arm64')
    expect(() => helperTargetOf(probe({ glibc: 'glibc 2.17' }))).toThrow(/older than/)
    expect(() => helperTargetOf(probe({ glibc: undefined }))).toThrow(/musl/)
  })

  it('maps macOS architectures and enforces macOS 14', () => {
    expect(helperTargetOf(probe({ os: 'Darwin', arch: 'arm64', macOS: '15.1', glibc: undefined })))
      .toBe('node24-macos-arm64')
    expect(helperTargetOf(probe({ os: 'Darwin', arch: 'x86_64', macOS: '14.0', glibc: undefined })))
      .toBe('node24-macos-x64')
    expect(() => helperTargetOf(probe({ os: 'Darwin', arch: 'arm64', macOS: '13.6', glibc: undefined })))
      .toThrow(/macOS 14/)
  })
})
