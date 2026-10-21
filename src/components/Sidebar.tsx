import type { ReactNode } from 'react'
import { type Tab, TABS } from '../tabs'
import { TabIcon } from './TabBar'

interface Props {
  tab: Tab
  onTab: (tab: Tab) => void
  /** Stores with an unsure category: the deck that sorts them. */
  toSort: number
  onSort: () => void
  /** The account part at the bottom: source, sync, import, owner links. */
  children: ReactNode
}

const SORT_ICON = 'M4 6h16M7 12h10M10 18h4'

/** The wide-screen navigation: the four views, the stores to sort, then the account. */
export function Sidebar({ tab, onTab, toSort, onSort, children }: Props) {
  return (
    <aside className="sidebar">
      <a className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          💸
        </span>
        Tillroll
      </a>
      <nav className="side-nav" aria-label="Views">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`side-link${item.key === tab ? ' is-active' : ''}`}
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
        {toSort > 0 && (
          <button type="button" className="side-link" onClick={onSort}>
            <TabIcon path={SORT_ICON} />
            To sort
            <span className="badge">{toSort}</span>
          </button>
        )}
      </nav>
      <div className="side-account">{children}</div>
    </aside>
  )
}
