/** The views, in the sidebar on wide screens, and the tab bar or its ⋯ menu on a phone. */
export type Tab = 'overview' | 'calendar' | 'categories' | 'stores' | 'payments' | 'money' | 'trips' | 'stats';

/**
 * Spending: where the money goes, period by period. More: what it adds up to (money in and kept, savings), the trips,
 * and the fun facts.
 */
export type TabGroup = 'spending' | 'more';

export const TABS: {key: Tab; label: string; icon: string; group: TabGroup}[] = [
  // Small line icons, 24 by 24, drawn with the current color.
  {key: 'overview', label: 'Overview', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', group: 'spending'},
  {
    key: 'payments',
    label: 'Payments',
    icon: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    group: 'spending',
  },
  {key: 'categories', label: 'Categories', icon: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8h.01', group: 'spending'},
  {key: 'stores', label: 'Stores', icon: 'M4 10v10h16V10M3 4h18l-1 6H4L3 4zM10 20v-5h4v5', group: 'spending'},
  {
    key: 'calendar',
    label: 'Calendar',
    icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01',
    group: 'spending',
  },
  {
    key: 'money',
    label: 'Money',
    icon: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
    group: 'more',
  },
  {
    key: 'trips',
    label: 'Trips',
    icon: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    group: 'more',
  },
  {key: 'stats', label: 'Fun stats', icon: 'M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z', group: 'more'},
];

export const GROUP_LABELS: Record<TabGroup, string> = {spending: 'Spending', more: 'More'};

/** A phone's tab bar holds the views used most; the others open from its ⋯ menu. */
export const MENU_ONLY: Tab[] = ['calendar', 'money', 'trips', 'stats'];
export const PHONE_TABS = TABS.filter(item => !MENU_ONLY.includes(item.key));

/** A view from the address's #: older names lead to the view that took their place. */
export function tabOf(name: string): Tab | null {
  if (name === 'savings') return 'money';
  return TABS.some(item => item.key === name) ? (name as Tab) : null;
}
