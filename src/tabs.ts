/** The six views, in the sidebar on wide screens and the tab bar on a phone. */
export type Tab = 'overview' | 'calendar' | 'categories' | 'stores' | 'payments' | 'stats'

export const TABS: { key: Tab; label: string; icon: string }[] = [
  // Small line icons, 24 by 24, drawn with the current color.
  { key: 'overview', label: 'Overview', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { key: 'calendar', label: 'Calendar', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01' },
  { key: 'categories', label: 'Categories', icon: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8h.01' },
  { key: 'stores', label: 'Stores', icon: 'M4 10v10h16V10M3 4h18l-1 6H4L3 4zM10 20v-5h4v5' },
  { key: 'payments', label: 'Payments', icon: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01' },
  { key: 'stats', label: 'Fun stats', icon: 'M12 3l2.2 5.6L20 11l-5.8 2.4L12 19l-2.2-5.6L4 11l5.8-2.4z' },
]

/** A phone's tab bar holds the views used most; the others open from its ⋯ menu. */
export const MENU_ONLY: Tab[] = ['calendar', 'stats']
export const PHONE_TABS = TABS.filter((item) => !MENU_ONLY.includes(item.key))
