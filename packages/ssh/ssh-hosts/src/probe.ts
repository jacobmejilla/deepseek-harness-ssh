/** Remote platform detection for helper target selection. */

import type { SshHelperTarget, SshProbe } from './types.ts'
import { quote, runSsh, type SshCommandOptions } from './transport.ts'

/** OpenSSH alias syntax accepted by `SshConnection`. */
export const HOST_ALIAS_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/

const PROBE_SCRIPT = [
  'printf "os=%s\\n" "$(uname -s)"',
  'printf "arch=%s\\n" "$(uname -m)"',
  'printf "home=%s\\n" "$HOME"',
  'printf "node=%s\\n" "$(command -v node 2>/dev/null || true)"',
  'printf "tar=%s\\n" "$(command -v tar 2>/dev/null || true)"',
  'if command -v getconf >/dev/null 2>&1; then printf "glibc=%s\\n" "$(getconf GNU_LIBC_VERSION 2>/dev/null || true)"; fi',
  'if [ "$(uname -s)" = Darwin ]; then printf "macos=%s\\n" "$(sw_vers -productVersion 2>/dev/null || true)"; fi',
  'if [ -w "$HOME" ]; then echo home-writable; fi',
  'if [ -w /tmp ]; then echo tmp-writable; fi',
].join('\n')

/** Parsed key/value facts from the probe script. */
export type ProbeFacts = Record<string, string | true>

/**
 * Parse `key=value` and bare-flag lines.
 * @param text - complete remote stdout.
 * @returns the last value for each repeated key.
 */
export function parseProbeOutput(text: string): ProbeFacts {
  const facts: ProbeFacts = {}
  for (const line of text.split('\n')) {
    if (line === '') continue
    const index = line.indexOf('=')
    if (index < 0) { facts[line] = true; continue }
    facts[line.slice(0, index)] = line.slice(index + 1)
  }
  return facts
}

/**
 * Compare dotted numeric versions.
 * @param actual - reported version text without a product prefix.
 * @param minimum - minimum accepted version.
 * @returns whether `actual` is at least `minimum`.
 */
export function versionAtLeast(actual: string, minimum: string): boolean {
  const left = actual.split('.').map(part => Number.parseInt(part, 10))
  const right = minimum.split('.').map(part => Number.parseInt(part, 10))
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    if (a !== b) return a > b
  }
  return true
}

/**
 * Map detected architecture to the packaged helper target.
 * @param probe - validated remote facts.
 * @returns the helper artifact target.
 * @throws when the OS, architecture, libc, or macOS release is unsupported.
 */
export function helperTargetOf(probe: SshProbe): SshHelperTarget {
  if (probe.os === 'Linux') {
    const glibc = probe.glibc?.match(/glibc\s+([0-9]+(?:\.[0-9]+)+)/)?.[1]
    if (glibc === undefined) throw new Error('remote Linux has no glibc report; musl and unknown libc targets are unsupported')
    if (!versionAtLeast(glibc, '2.28')) throw new Error(`remote glibc ${glibc} is older than the supported 2.28 baseline`)
    switch (probe.arch) {
      case 'x86_64': return 'node24-linux-x64'
      case 'aarch64':
      case 'arm64': return 'node24-linux-arm64'
      default: throw new Error(`remote architecture ${String(probe.arch)} has no Linux helper artifact`)
    }
  }
  const macOS = probe.macOS
  if (macOS === undefined || !versionAtLeast(macOS, '14')) {
    throw new Error(`remote macOS ${macOS ?? '(unknown)'} is older than the supported macOS 14 baseline`)
  }
  switch (probe.arch) {
    case 'x86_64': return 'node24-macos-x64'
    case 'aarch64':
    case 'arm64': return 'node24-macos-arm64'
    default: throw new Error(`remote architecture ${String(probe.arch)} has no macOS helper artifact`)
  }
}

/**
 * Inspect one SSH destination without installing anything.
 * @param alias - OpenSSH host alias.
 * @param options - deadline and caller cancellation.
 * @returns validated remote platform facts.
 * @throws when the alias is invalid, SSH fails, or a required fact is missing.
 */
export async function probeHost(alias: string, options: SshCommandOptions = {}): Promise<SshProbe> {
  if (!HOST_ALIAS_PATTERN.test(alias)) throw new Error(`invalid SSH host alias ${JSON.stringify(alias)}`)
  const result = await runSsh(alias, `sh -c ${quote(PROBE_SCRIPT)}`, { timeoutMs: 30_000, ...options })
  if (result.exitCode !== 0) {
    throw new Error(`SSH probe for ${JSON.stringify(alias)} failed (exit ${String(result.exitCode)}): ${result.stderr.trim()}`)
  }
  const facts = parseProbeOutput(result.stdout)
  const os = facts.os
  if (os !== 'Linux' && os !== 'Darwin') throw new Error(`remote OS ${String(os)} is unsupported`)
  const arch = facts.arch
  if (arch !== 'x86_64' && arch !== 'aarch64' && arch !== 'arm64') {
    throw new Error(`remote architecture ${String(arch)} is unsupported`)
  }
  const home = facts.home
  if (typeof home !== 'string' || !home.startsWith('/') || /[\0\r\n]/u.test(home)) {
    throw new Error(`remote home is not an absolute POSIX path: ${String(home)}`)
  }
  const probe: SshProbe = {
    os,
    arch,
    home,
    ...(typeof facts.glibc === 'string' && facts.glibc !== '' ? { glibc: facts.glibc } : {}),
    ...(typeof facts.macos === 'string' && facts.macos !== '' ? { macOS: facts.macos } : {}),
    ...(typeof facts.node === 'string' && facts.node !== '' ? { node: facts.node } : {}),
    tar: typeof facts.tar === 'string' && facts.tar !== '',
    homeWritable: facts['home-writable'] === true,
    tmpWritable: facts['tmp-writable'] === true,
  }
  // Validate the target now so unsupported hosts fail before any transfer.
  helperTargetOf(probe)
  return probe
}
