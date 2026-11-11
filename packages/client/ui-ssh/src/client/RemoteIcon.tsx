/** Decorative globe glyph for the Remote SSH sidebar entry. */
import { IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * @param props - sidebar icon share: square edge and selected state.
 * @returns the globe glyph without a wrapper element.
 */
export function RemoteIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconGlobeOutlineRegular size={size} />
}
