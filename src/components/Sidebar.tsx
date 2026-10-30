import type {ReactNode} from 'react';
import {GROUP_LABELS, type Tab, type TabGroup, TABS} from '../tabs';
import {TabIcon} from './TabBar';
import {Logo} from './Logo';

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** Stores with an unsure category: the deck that sorts them. */
  toSort: number;
  onSort: () => void;
  /** The account part at the bottom: source, sync, import, owner links. */
  children: ReactNode;
}

const SORT_ICON = 'M4 6h16M7 12h10M10 18h4';
const GROUPS: TabGroup[] = ['spending', 'more'];

/**
 * The wide-screen navigation: the views in two groups under small headings (Spending, with the stores to sort at its
 * end, then More), then the account.
 */
export function Sidebar({tab, onTab, toSort, onSort, children}: Props) {
  return (
    <aside className="sidebar">
      <a className="brand" href="/">
        <Logo />
        Tillroll
      </a>
      <nav className="side-nav" aria-label="Views">
        {GROUPS.map(group => (
          <div key={group} className="side-group" role="group" aria-labelledby={`side-group-${group}`}>
            <span className="side-heading" id={`side-group-${group}`}>
              {GROUP_LABELS[group]}
            </span>
            {TABS.filter(item => item.group === group).map(item => (
              <button
                key={item.key}
                type="button"
                className={`side-link${item.key === tab ? ' is-active' : ''}`}
                aria-current={item.key === tab ? 'page' : undefined}
                onClick={() => {
                  onTab(item.key);
                  window.scrollTo({top: 0});
                }}
              >
                <TabIcon path={item.icon} />
                {item.label}
              </button>
            ))}
            {group === 'spending' && toSort > 0 && (
              <button type="button" className="side-link" onClick={onSort}>
                <TabIcon path={SORT_ICON} />
                To sort
                <span className="badge">{toSort}</span>
              </button>
            )}
          </div>
        ))}
      </nav>
      <div className="side-account">{children}</div>
    </aside>
  );
}
