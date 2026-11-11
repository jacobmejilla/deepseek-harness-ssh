/**
 * `dsh ssh`: manage OpenSSH destinations, provision the version-matched remote
 * helper, and boot the remote Web profile with one command.
 * @module @deepseek-ai/dsh/ssh
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Command, CommanderError } from 'commander'
import {
  HOST_ALIAS_PATTERN,
  dshEntryPath,
  helperTargetOf,
  listSshHosts,
  prepareRemoteHome,
  probeHost,
  provisionHelper,
  parseHostAliases,
  readHostsFile,
  removeHostState,
  resolveHelperArchive,
  resolveHost,
  saveHostState,
} from '@deepseek-ai/dsh-ssh-hosts'
import type { SshRemoteSettings } from '@deepseek-ai/dsh-ssh-hosts'

interface CliOptions {
  readonly workspace?: string
  readonly helperArchive?: string
  readonly installRoot?: string
  readonly port?: string
  readonly open: boolean
  readonly hostname?: string
  readonly user?: string
  readonly identityFile?: string
}

function fail(message: string): never {
  throw new CommanderError(1, 'dsh.ssh.error', message)
}

async function printHosts(): Promise<void> {
  const file = await readHostsFile()
  const hosts = await listSshHosts(file.hosts)
  if (hosts.length === 0) {
    process.stdout.write('No SSH destinations found. Add a Host entry to ~/.ssh/config or run "dsh ssh add".\n')
    return
  }
  for (const host of hosts) {
    const state = file.hosts[host.alias]
    const target = host.hostName === undefined ? '' : ` ${host.user === undefined ? '' : `${host.user}@`}${host.hostName}${host.port === undefined ? '' : `:${String(host.port)}`}`
    const workspace = state?.workspace ?? host.workspace
    const installed = state?.helper === undefined ? '' : ' [helper installed]'
    process.stdout.write(`${host.alias}${target}${installed}${workspace === undefined ? '' : `  workspace ${workspace}`}\n`)
  }
}

/**
 * Append one managed Host block when the alias is not already configured.
 * @param alias - OpenSSH alias.
 * @param options - explicit connection fields.
 * @param configPath - OpenSSH configuration path.
 */
async function addManagedHost(alias: string, options: CliOptions, configPath = join(homedir(), '.ssh', 'config')): Promise<void> {
  let existing = ''
  try {
    existing = await readFile(configPath, 'utf8')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (parseHostAliases(existing).includes(alias)) return
  if (options.hostname === undefined) {
    fail(`host ${JSON.stringify(alias)} is not in ${configPath}; pass --hostname to add a managed entry`)
  }
  const lines = [
    '',
    `# BEGIN dsh ssh ${alias}`,
    `Host ${alias}`,
    `  HostName ${options.hostname}`,
    ...(options.user === undefined ? [] : [`  User ${options.user}`]),
    ...(options.port === undefined ? [] : [`  Port ${options.port}`]),
    ...(options.identityFile === undefined ? [] : [`  IdentityFile ${options.identityFile}`, '  IdentitiesOnly yes']),
    `# END dsh ssh ${alias}`,
    '',
  ]
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 })
  await appendFile(configPath, lines.join('\n'), { mode: 0o600 })
}

/**
 * Provision the helper for one alias unless a complete record already exists.
 * @param alias - OpenSSH alias.
 * @param options - workspace, archive, and install root.
 * @returns settings ready for the remote profile.
 */
async function ensureSettings(alias: string, options: CliOptions): Promise<SshRemoteSettings> {
  const probe = await probeHost(alias)
  const target = helperTargetOf(probe)
  const archive = await resolveHelperArchive(target, options.helperArchive)
  const saved = (await readHostsFile()).hosts[alias]
  const workspace = options.workspace ?? saved?.workspace
  const settings = await provisionHelper(alias, {
    archivePath: archive,
    ...(workspace === undefined ? {} : { workspace }),
    ...(options.installRoot === undefined ? {} : { installRoot: options.installRoot }),
  })
  await saveHostState(alias, {
    workspace: settings.workspace,
    helper: settings.helper,
    helperHash: settings.helperHash,
    ...(settings.target === undefined ? {} : { target: settings.target }),
    ...(settings.version === undefined ? {} : { version: settings.version }),
    lastConnectedAt: new Date().toISOString(),
  })
  process.stdout.write(`helper ${settings.helperHash.slice(0, 12)} installed on ${alias} (${settings.target ?? 'unknown target'})\n`)
  return settings
}

/**
 * Boot the remote Web profile in the foreground.
 * @param settings - provisioned remote settings.
 * @param alias - OpenSSH alias.
 * @param options - port and browser-open behavior.
 * @returns the child's exit code.
 */
async function connectForeground(settings: SshRemoteSettings, alias: string, options: CliOptions): Promise<number> {
  const home = await prepareRemoteHome(alias)
  const args = ['--profile', 'ssh-remote']
  if (!options.open) args.push('--no-open')
  if (options.port !== undefined) args.push('--port', options.port)
  const child = spawn(process.execPath, [...process.execArgv, dshEntryPath(), ...args], {
    env: {
      ...process.env,
      DSH_HOME: home,
      DSH_SSH_HOST: settings.host,
      DSH_SSH_WORKSPACE: settings.workspace,
      DSH_SSH_HELPER: settings.helper,
      DSH_SSH_HELPER_HASH: settings.helperHash,
      DSH_SSH_LAUNCH_KIND: settings.launch.kind,
      ...(settings.launch.kind === 'node-script' ? { DSH_SSH_NODE: settings.launch.node } : {}),
      ...(settings.target === undefined ? {} : { DSH_SSH_TARGET: settings.target }),
      ...(settings.version === undefined ? {} : { DSH_SSH_VERSION: settings.version }),
    },
    stdio: 'inherit',
  })
  const forward = (signal: NodeJS.Signals): void => { child.kill(signal) }
  process.on('SIGINT', forward)
  process.on('SIGTERM', forward)
  const code = await new Promise<number>((resolve) => {
    child.once('exit', (exitCode, exitSignal) => {
      resolve(exitCode ?? (exitSignal === 'SIGINT' ? 130 : 1))
    })
  })
  process.off('SIGINT', forward)
  process.off('SIGTERM', forward)
  return code
}

/**
 * Run the `dsh ssh` management command family.
 * @param argv - arguments after `ssh`.
 * @returns the process exit code.
 */
export async function runSsh(argv: readonly string[]): Promise<number> {
  const program = new Command()
  program
    .name('dsh ssh')
    .description('discover SSH hosts, provision the remote helper, and open remote workspaces')
    .helpOption('-h, --help', 'show this help')
    .showHelpAfterError()
    .exitOverride()

  const common = (command: Command): Command => command
    .option('--workspace <path>', 'absolute remote workspace directory')
    .option('--helper-archive <path>', 'local SSH helper archive (.tar.gz)')
    .option('--install-root <path>', 'absolute remote helper install root')

  program.command('list')
    .description('list discovered SSH destinations')
    .action(async () => { await printHosts() })

  common(program.command('add'))
    .argument('<alias>', 'OpenSSH host alias')
    .option('--hostname <host>', 'host name for a new managed Host block')
    .option('--user <user>', 'remote user for a new managed Host block')
    .option('--port <port>', 'remote port for a new managed Host block')
    .option('--identity-file <path>', 'private key path for a new managed Host block')
    .description('remember an existing destination or append a managed Host block')
    .action(async (alias: string, options: CliOptions) => {
      if (!HOST_ALIAS_PATTERN.test(alias)) fail(`invalid SSH host alias ${JSON.stringify(alias)}`)
      await addManagedHost(alias, options)
      const resolved = await resolveHost(alias)
      if (resolved === undefined) fail(`host ${JSON.stringify(alias)} still does not resolve through OpenSSH configuration`)
      if (options.workspace !== undefined) {
        const file = await readHostsFile()
        await saveHostState(alias, { ...file.hosts[alias], workspace: options.workspace })
      }
      process.stdout.write(`added ${alias}\n`)
    })

  program.command('remove')
    .argument('<alias>', 'OpenSSH host alias')
    .description('forget a saved destination (credentials and Host blocks are untouched)')
    .action(async (alias: string) => {
      const removed = await removeHostState(alias)
      process.stdout.write(removed ? `removed ${alias}\n` : `${alias} had no saved record\n`)
    })

  program.command('build-helper')
    .description('build the native SSH helper archive for this platform')
    .option('--target <target>', 'helper target (defaults to the current platform)')
    .option('--skip-build', 'reuse the prepared JavaScript and native outputs')
    .action(async (options: { target?: string; skipBuild?: boolean }) => {
      const root = fileURLToPath(new URL('../../../', import.meta.url))
      const args = ['exec', 'tsx', 'scripts/build-exe-for-ssh-helper.ts']
      if (options.target !== undefined) args.push(`--target=${options.target}`)
      if (options.skipBuild === true) args.push('--skip-build')
      const code = await new Promise<number>((resolve) => {
        const child = spawn('pnpm', args, { cwd: root, stdio: 'inherit' })
        child.once('exit', (exitCode) => { resolve(exitCode ?? 1) })
      })
      if (code !== 0) fail('SSH helper build failed')
      process.stdout.write('helper archive written under dist-exe/ssh-helper/\n')
    })

  program.command('probe')
    .argument('<alias>', 'OpenSSH host alias')
    .description('inspect the remote OS, architecture, libc, Node and tar')
    .action(async (alias: string) => {
      const probe = await probeHost(alias)
      process.stdout.write(`${JSON.stringify({ ...probe, target: helperTargetOf(probe) }, null, 2)}\n`)
    })

  common(program.command('install'))
    .argument('<alias>', 'OpenSSH host alias')
    .description('install or reuse the verified remote helper')
    .action(async (alias: string, options: CliOptions) => {
      await ensureSettings(alias, options)
    })

  common(program.command('connect'))
    .argument('<alias>', 'OpenSSH host alias')
    .option('--port <port>', 'loopback port for the remote Web UI')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .description('provision and open a remote workspace in the Web UI')
    .action(async (alias: string, options: CliOptions) => {
      const settings = await ensureSettings(alias, options)
      const code = await connectForeground(settings, alias, options)
      process.exitCode = code
    })

  if (argv.length === 0) {
    program.help()
    return 0
  }
  try {
    await program.parseAsync([...argv], { from: 'user' })
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed') return 0
      if (error.message !== '') process.stderr.write(`${error.message}\n`)
      return error.exitCode
    }
    process.stderr.write(`dsh ssh: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
  return 0
}
