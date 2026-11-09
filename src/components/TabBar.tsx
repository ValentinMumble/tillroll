import {type CSSProperties, useEffect, useRef} from 'react';
import {PHONE_TABS, type Tab} from '../tabs';

/** How far a sideways swipe must go to change tab. */
const SWIPE = 60;
/** Near the screen's sides a swipe is Safari's own (back and forward). */
const SIDE_MARGIN = 24;

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
}

/** A tab's line icon, 24 by 24, drawn with the current color. */
export function TabIcon({path}: {path: string}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** True when a touch starts on something that takes a sideways drag itself: a field, the map, a row that scrolls. */
function takesSidewaysDrag(target: Element) {
  if (target.closest('input, textarea, select, .leaflet-container')) return true;
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    const {overflowX} = getComputedStyle(node);
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
}

/**
 * The phone layout's tab bar: a frosted capsule with a lens that slides under the chosen tab. A view opened from the
 * menu (Calendar, Money, Trips, Fun stats) has no tab: no lens then. A sideways swipe on the view moves to the next
 * tab (to the left) or the one before (to the right), as long as the tab bar shows and no dialog is open.
 */
export function TabBar({tab, onTab}: Props) {
  const index = PHONE_TABS.findIndex(item => item.key === tab);

  function pick(next: Tab) {
    onTab(next);
    window.scrollTo({top: 0});
  }

  // The latest tab and pick, so the touch listeners added once always use them.
  const latest = useRef({index, pick});
  useEffect(() => {
    latest.current = {index, pick};
  });

  useEffect(() => {
    let start: {left: number; top: number} | null = null;

    function onStart(event: TouchEvent) {
      start = null;
      const target = event.target;
      if (event.touches.length !== 1 || !(target instanceof Element) || !target.closest('.main')) return;
      if (!window.matchMedia('(max-width: 960px)').matches || document.querySelector('dialog[open]')) return;
      const {clientX, clientY} = event.touches[0];
      if (clientX < SIDE_MARGIN || clientX > window.innerWidth - SIDE_MARGIN || takesSidewaysDrag(target)) return;
      start = {left: clientX, top: clientY};
    }
    function onEnd(event: TouchEvent) {
      if (!start) return;
      const across = event.changedTouches[0].clientX - start.left;
      const down = event.changedTouches[0].clientY - start.top;
      start = null;
      // Mostly sideways and far enough: a scroll down the page that drifts a little never changes tab.
      if (Math.abs(across) < SWIPE || Math.abs(across) < 2 * Math.abs(down)) return;
      const {index: current, pick: choose} = latest.current;
      const next = current < 0 ? undefined : PHONE_TABS[current + (across < 0 ? 1 : -1)];
      if (next) choose(next.key);
    }
    function onCancel() {
      start = null;
    }
    window.addEventListener('touchstart', onStart, {passive: true});
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onCancel);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, []);

  return (
    <nav
      className="tabbar glass"
      aria-label="Sections"
      style={{'--count': PHONE_TABS.length, '--index': index} as CSSProperties}
    >
      {index >= 0 && <span className="tab-glow" aria-hidden="true" />}
      {PHONE_TABS.map(item => (
        <button
          key={item.key}
          type="button"
          className={`tab${item.key === tab ? ' is-active' : ''}`}
          aria-current={item.key === tab ? 'page' : undefined}
          onClick={() => pick(item.key)}
        >
          <TabIcon path={item.icon} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}
