/** Typed dictionaries for the Remote SSH panel. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sshRemote'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'panel': '远程 SSH',
  'title': '远程 SSH',
  'description': '在远程主机上使用文件工具、Bash、终端和会话。',
  'local.title': '连接到主机',
  'local.description': '从 ~/.ssh/config 发现的目的地。连接后会在新的浏览器标签页中打开远程工作区。',
  'local.hosts': 'SSH 主机',
  'local.noHosts': '没有找到 SSH 主机。请先在 ~/.ssh/config 中添加 Host 条目。',
  'local.workspace': '远程工作区',
  'local.workspacePlaceholder': '留空使用远程主目录',
  'local.connect': '连接',
  'local.connecting': '正在连接…',
  'local.failed': '连接失败：{message}',
  'local.refresh': '刷新',
  'local.installing': '正在安装远程助手并启动服务器，这可能需要几分钟。',
  'remote.title': '已连接的远程工作区',
  'remote.description': '此页面中的文件、Bash、终端和会话都在远程主机上运行。',
  'remote.host': '主机',
  'remote.workspace': '工作区',
  'remote.platform': '平台',
  'remote.openPath': '远程目录',
  'remote.openPathPlaceholder': '/home/user/project',
  'remote.open': '作为会话打开',
  'remote.opening': '正在打开…',
  'remote.openFailed': '无法打开远程目录：{message}',
  'remote.hint': '远程目录必须是主机上已存在的绝对路径。',
} as const

/** Key domain of the Remote SSH namespace. */
export type SshRemoteKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source. */
export const en: Record<SshRemoteKey, string> = {
  'panel': 'Remote SSH',
  'title': 'Remote SSH',
  'description': 'Use file tools, Bash, terminals, and sessions on a remote host.',
  'local.title': 'Connect to a host',
  'local.description': 'Destinations discovered from ~/.ssh/config. Connecting opens the remote workspace in a new browser tab.',
  'local.hosts': 'SSH hosts',
  'local.noHosts': 'No SSH hosts found. Add a Host entry to ~/.ssh/config first.',
  'local.workspace': 'Remote workspace',
  'local.workspacePlaceholder': 'Leave blank to use the remote home directory',
  'local.connect': 'Connect',
  'local.connecting': 'Connecting…',
  'local.failed': 'Connection failed: {message}',
  'local.refresh': 'Refresh',
  'local.installing': 'Installing the remote helper and starting the server; this can take a few minutes.',
  'remote.title': 'Connected remote workspace',
  'remote.description': 'Files, Bash, terminals, and sessions on this page run on the remote host.',
  'remote.host': 'Host',
  'remote.workspace': 'Workspace',
  'remote.platform': 'Platform',
  'remote.openPath': 'Remote directory',
  'remote.openPathPlaceholder': '/home/user/project',
  'remote.open': 'Open as session',
  'remote.opening': 'Opening…',
  'remote.openFailed': 'Could not open the remote directory: {message}',
  'remote.hint': 'The remote directory must be an existing absolute path on the host.',
}

/** Japanese copy, key-identical to English. */
export const ja = { ...en } satisfies Record<SshRemoteKey, string>
/** Spanish copy, key-identical to English. */
export const es = { ...en } satisfies Record<SshRemoteKey, string>
/** French copy, key-identical to English. */
export const fr = { ...en } satisfies Record<SshRemoteKey, string>
/** German copy, key-identical to English. */
export const de = { ...en } satisfies Record<SshRemoteKey, string>
/** Russian copy, key-identical to English. */
export const ru = { ...en } satisfies Record<SshRemoteKey, string>
/** Portuguese copy, key-identical to English. */
export const pt = { ...en } satisfies Record<SshRemoteKey, string>
