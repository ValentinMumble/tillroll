import type { CSSProperties } from 'react'
import { type Tab, TABS } from '../tabs'

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

/** The phone layout's tab bar: a frosted capsule with a lens that slides under the chosen tab. */
export function TabBar({ tab, onTab }: Props) {
  const index = TABS.findIndex((item) => item.key === tab)
  return (
    <nav
      className="tabbar glass"
      aria-label="Sections"
      style={{ '--count': TABS.length, '--index': index } as CSSProperties}
    >
      <span className="tab-glow" aria-hidden="true" />
      {TABS.map((item) => (
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
