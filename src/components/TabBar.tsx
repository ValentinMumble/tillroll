import type { CSSProperties } from 'react'

export type Tab = 'overview' | 'categories' | 'stores' | 'payments'

const TABS: { key: Tab; label: string; icon: string }[] = [
  // Small line icons, 24 by 24, drawn with the current color.
  { key: 'overview', label: 'Overview', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { key: 'categories', label: 'Categories', icon: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8h.01' },
  { key: 'stores', label: 'Stores', icon: 'M4 10v10h16V10M3 4h18l-1 6H4L3 4zM10 20v-5h4v5' },
  { key: 'payments', label: 'Payments', icon: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01' },
]

interface Props {
  tab: Tab
  onTab: (tab: Tab) => void
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
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={item.icon} />
          </svg>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
