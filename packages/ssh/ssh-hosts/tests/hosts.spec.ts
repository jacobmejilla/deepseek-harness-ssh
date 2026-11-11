import { describe, expect, it } from 'vitest'
import { parseHostAliases, parseSshGOutput } from '../src/hosts.ts'

describe('parseHostAliases', () => {
  it('reads concrete aliases, ignores patterns, comments, and duplicates', () => {
    const text = [
      '# comment',
      'Host alpha beta',
      '  HostName example.com',
      'Host * !blocked',
      'Host gamma',
      'Host alpha',
      'Match host delta',
      'host epsilon',
    ].join('\n')
    expect(parseHostAliases(text)).toEqual(['alpha', 'beta', 'gamma', 'epsilon'])
  })
})

describe('parseSshGOutput', () => {
  it('resolves hostname, user, and port without connecting', () => {
    expect(parseSshGOutput('user jacob\nhostname 127.0.0.1\nport 2222\n')).toEqual({
      hostName: '127.0.0.1', user: 'jacob', port: 2222,
    })
  })

  it('omits malformed ports and absent keys', () => {
    expect(parseSshGOutput('hostname example.com\nport nope\n')).toEqual({ hostName: 'example.com' })
  })
})
