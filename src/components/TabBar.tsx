import type { CSSProperties } from 'react'
import { PHONE_TABS, type Tab } from '../tabs'

interface Props {
  tab: Tab
  onTab: (tab: Tab) => void
}

/** A tab's line icon, 24 by 24, drawn with the current color. */
export function TabIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

/**
 * The phone layout's tab bar: a frosted capsule with a lens that slides under the chosen tab. A view opened from the
 * menu (Calendar, Fun stats) has no tab: no lens then.
 */
export function TabBar({ tab, onTab }: Props) {
  const index = PHONE_TABS.findIndex((item) => item.key === tab)
  return (
    <nav
      className="tabbar glass"
      aria-label="Sections"
      style={{ '--count': PHONE_TABS.length, '--index': index } as CSSProperties}
    >
      {index >= 0 && <span className="tab-glow" aria-hidden="true" />}
      {PHONE_TABS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`tab${item.key === tab ? ' is-active' : ''}`}
          aria-current={item.key === tab ? 'page' : undefined}
          onClick={() => {
            onTab(item.key)
            window.scrollTo({ top: 0 })
          }}
        >
          <TabIcon path={item.icon} />
          {item.label}
        </button>
      ))}
    </nav>
  )
}
