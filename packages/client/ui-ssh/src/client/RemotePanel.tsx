/** Remote SSH panel: host list and connect actions locally, remote workspace opening when connected. */
import { useEffect, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SshBootState, SshHostsView } from './types.ts'
import type { NS } from './locales.ts'
import css from './RemotePanel.module.css'

/** Services and boot facts projected into the panel by the plugin body. */
export interface RemotePanelInjected {
  /** Read the Host's discovered destinations and live servers. */
  readonly listHosts: () => Promise<SshHostsView>
  /** Provision a host and return its authenticated remote Web URL. */
  readonly connectHost: (alias: string, workspace: string | undefined) => Promise<string>
  /** Create a Session at one remote directory and open it. */
  readonly openRemoteWorkspace: (path: string) => Promise<void>
  /** Static mode and active-connection values injected at page boot. */
  readonly bootState: SshBootState
}

/**
 * @param props - slot runtime share plus the injected Host operations.
 * @returns the Remote SSH page.
 */
export function RemotePanel({
  t, listHosts, connectHost, openRemoteWorkspace, bootState,
}: PropsRuntime<'main'> & InjectFace<RemotePanelInjected> & PropsLocale<typeof NS>) {
  const [view, setView] = useState<SshHostsView | undefined>(undefined)
  const [loading, setLoading] = useState(bootState.mode === 'local')
  const [error, setError] = useState<string | undefined>(undefined)
  const [connecting, setConnecting] = useState<string | undefined>(undefined)
  const [workspace, setWorkspace] = useState('')
  const [path, setPath] = useState(bootState.active?.workspace ?? '')
  const [opening, setOpening] = useState(false)
  const [openedUrl, setOpenedUrl] = useState<string | undefined>(undefined)

  const refresh = async (): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setView(await listHosts())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (bootState.mode === 'local') void refresh()
    // The boot state is immutable for the page lifetime.
  }, [])

  const connect = async (alias: string, fallbackWorkspace?: string): Promise<void> => {
    setConnecting(alias)
    setError(undefined)
    setOpenedUrl(undefined)
    try {
      const requested = workspace.trim() === '' ? fallbackWorkspace : workspace.trim()
      const url = await connectHost(alias, requested)
      setOpenedUrl(url)
      globalThis.open(url, '_blank', 'noopener,noreferrer')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setConnecting(undefined)
    }
  }

  const open = async (): Promise<void> => {
    if (path.trim() === '') return
    setOpening(true)
    setError(undefined)
    try {
      await openRemoteWorkspace(path.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setOpening(false)
    }
  }

  if (bootState.mode === 'remote') {
    return (
      <div className={css.page}>
        <header className={css.header}>
          <h1 className={css.title}>{t('remote.title')}</h1>
          <p className={css.description}>{t('remote.description')}</p>
        </header>
        <section className={css.section}>
          <dl className={css.facts}>
            <dt className={css.factName}>{t('remote.host')}</dt>
            <dd className={css.factValue}>{bootState.active?.alias ?? '—'}</dd>
            <dt className={css.factName}>{t('remote.workspace')}</dt>
            <dd className={css.factValue}>{bootState.active?.workspace ?? '—'}</dd>
            <dt className={css.factName}>{t('remote.platform')}</dt>
            <dd className={css.factValue}>{bootState.active?.platform ?? bootState.active?.target ?? '—'}</dd>
          </dl>
        </section>
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{t('remote.openPath')}</h2>
          <form className={css.form} onSubmit={(event) => { event.preventDefault(); void open() }}>
            <Input
              className={css.field ?? ''}
              value={path}
              onChange={(event) => { setPath(event.target.value) }}
              placeholder={t('remote.openPathPlaceholder')}
              spellCheck={false}
              aria-label={t('remote.openPath')}
            />
            <Button variant="primary" type="submit" disabled={opening || path.trim() === ''}>
              {opening ? t('remote.opening') : t('remote.open')}
            </Button>
          </form>
          <p className={css.description}>{t('remote.hint')}</p>
          {error === undefined ? null : <div className={css.error} role="alert">{t('remote.openFailed', { message: error })}</div>}
        </section>
      </div>
    )
  }

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.title}>{t('title')}</h1>
        <p className={css.description}>{t('description')}</p>
      </header>
      <section className={css.section}>
        <h2 className={css.sectionTitle}>{t('local.title')}</h2>
        <p className={css.description}>{t('local.description')}</p>
        <div className={css.form}>
          <Input
            className={css.field ?? ''}
            value={workspace}
            onChange={(event) => { setWorkspace(event.target.value) }}
            placeholder={t('local.workspacePlaceholder')}
            spellCheck={false}
            aria-label={t('local.workspace')}
          />
          <Button type="button" onClick={() => { void refresh() }} disabled={loading}>
            {t('local.refresh')}
          </Button>
        </div>
      </section>
      <section className={css.section}>
        <h2 className={css.sectionTitle}>{t('local.hosts')}</h2>
        {error === undefined ? null : <div className={css.error} role="alert">{t('local.failed', { message: error })}</div>}
        {openedUrl === undefined ? null : (
          <div className={css.linkRow}>
            <span>{t('remote.title')}</span>
            <a className={css.link} href={openedUrl} target="_blank" rel="noreferrer">{openedUrl}</a>
          </div>
        )}
        {connecting === undefined ? null : <div className={css.notice}>{t('local.installing')}</div>}
        {loading
          ? <div className={css.notice}>{t('local.connecting')}</div>
          : view === undefined || view.hosts.length === 0
            ? <div className={css.notice}>{t('local.noHosts')}</div>
            : (
              <div className={css.hosts}>
                {view.hosts.map((host) => {
                  const destination = host.hostName === undefined
                    ? host.source
                    : `${host.user === undefined ? '' : `${host.user}@`}${host.hostName}${host.port === undefined ? '' : `:${String(host.port)}`}`
                  const saved = host.workspace
                  return (
                    <div className={css.host} key={host.alias}>
                      <div className={css.hostMain}>
                        <span className={css.alias}>{host.alias}</span>
                        <span className={css.destination}>{destination}</span>
                        {saved === undefined ? null : <span className={css.workspaceLine}>{saved}</span>}
                      </div>
                      <Button
                        variant="primary"
                        type="button"
                        disabled={connecting !== undefined}
                        onClick={() => { void connect(host.alias, host.workspace) }}
                      >
                        {connecting === host.alias ? t('local.connecting') : t('local.connect')}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
      </section>
    </div>
  )
}
