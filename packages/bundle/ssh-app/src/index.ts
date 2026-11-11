/**
 * Remote app bundle entry: the bundle carries no service of its own; its
 * `cordis.patch.yml` swaps the local filesystem, subprocess and sandbox
 * providers for the SSH family and reads the connection from `DSH_SSH_*`.
 * @module @deepseek-ai/dsh-ssh-app
 */

/** Cordis plugin name. */
export const name = 'ssh-app'
