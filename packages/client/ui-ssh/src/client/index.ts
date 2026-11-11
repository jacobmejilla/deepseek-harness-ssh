/**
 * Remote SSH explorer: a left-sidebar page that lists OpenSSH destinations,
 * starts a remote Web workspace, and (when this page is already remote) opens
 * remote directories as Sessions.
 * @module @deepseek-ai/dsh-client-ui-ssh/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { de, en, es, fr, ja, pt, ru, zh, NS, type SshRemoteKey } from './locales.ts'
import { RemoteIcon } from './RemoteIcon.tsx'
import { RemotePanel, type RemotePanelInjected } from './RemotePanel.tsx'
import type { ConnectResult, SshBootState, SshHostsView } from './types.ts'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remote SSH panel copy. */
    sshRemote: SshRemoteKey
  }
}

const PANEL_ID = 'remote' as MainPanelId

declare global {
  /** Host-injected remote-mode boot state. */
  var __DSH_SSH__: SshBootState | undefined
}

/** Services the panel reads. */
export const inject = ['slots', 'locale', 'remote', 'remote.workspace', 'uiWorkspace']

const LOCAL_BOOT: SshBootState = { mode: 'local' }

async function listHosts(): Promise<SshHostsView> {
  const response = await fetch('/api/ssh/hosts', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await response.json() as SshHostsView
}

async function connectHost(alias: string, workspace: string | undefined): Promise<string> {
  const response = await fetch('/api/ssh/connect', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias, ...(workspace === undefined ? {} : { workspace }) }),
  })
  const result = await response.json() as ConnectResult
  if (!result.ok) throw new Error(result.error)
  return result.value.url
}

/**
 * Register the Remote SSH page and its sidebar entry.
 * @param ctx - Client root Context with slots, locale, Remote, and workspace navigation.
 */
export function apply(ctx: ClientContext): void {
  const bootState = globalThis.__DSH_SSH__ ?? LOCAL_BOOT
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-ssh: dictionaries')
  const openRemoteWorkspace = async (path: string): Promise<void> => {
    const created = await ctx.remote.workspace.create({ path })
    if (!created.ok) throw new Error(created.error.message)
    await ctx.uiWorkspace.openWorkspace(created.value.workspace.workspaceId)
  }
  const injected = (): RemotePanelInjected => ({ listHosts, connectHost, openRemoteWorkspace, bootState })
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: injected,
  }, RemotePanel)), 'ui-ssh: main panel')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 30,
    locale: NS,
    label: () => t('panel'),
  }, RemoteIcon)), 'ui-ssh: sidebar entry')
}
