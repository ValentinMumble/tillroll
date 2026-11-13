import {type CSSProperties, useEffect, useRef} from 'react';
import {flushSync} from 'react-dom';
import {PHONE_TABS, type Tab} from '../tabs';

/** How far a sideways swipe must go to change tab. */
const SWIPE = 60;
/** Near the screen's sides a swipe is Safari's own (back and forward). */
const SIDE_MARGIN = 24;
/** How far the finger moves before the swipe knows if it goes sideways (a tab) or down (a scroll). */
const SLOP = 10;
/** The view follows the finger half as far, and barely toward a side with no more tabs. */
const FOLLOW = 0.5;
const EDGE_FOLLOW = 0.15;
/** After a swipe the view leaves to the side, then the next one comes in from the other side. */
const LEAVE_MS = 100;
const ENTER_MS = 200;
const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** What slides with a swipe: the view and its large title. The period bar and the tab bar stay put. */
function slidingParts() {
  return [...document.querySelectorAll<HTMLElement>('.main > .top > .brand, .main > .view')];
}

/** Moves the sliding parts by `offset` pixels, fading them a little as they go. */
function follow(offset: number) {
  for (const part of slidingParts()) {
    part.style.transform = `translateX(${offset}px)`;
    part.style.opacity = String(Math.max(0.5, 1 - Math.abs(offset) / 300));
  }
}

/** Puts the sliding parts back in place, smoothly from wherever the finger left them. */
function settle() {
  for (const part of slidingParts()) {
    const from = {transform: part.style.transform || 'none', opacity: part.style.opacity || '1'};
    part.style.transform = '';
    part.style.opacity = '';
    part.animate([from, {transform: 'none', opacity: 1}], {duration: 180, easing: EASE_OUT});
  }
}

/** Slides the view out toward `step` (1: the next tab, to the left), changes tab, and slides the new view in. */
async function slide(step: number, change: () => void) {
  const distance = window.innerWidth * 0.3;
  await Promise.all(
    slidingParts().map(
      part =>
        part.animate([{transform: `translateX(${-step * distance}px)`, opacity: 0}], {
          duration: LEAVE_MS,
          easing: 'ease-in',
          fill: 'forwards',
        }).finished,
    ),
  );
  flushSync(change);
  // The view stays, its content changes; the title may be a new element (the wordmark on Overview).
  for (const part of slidingParts()) {
    for (const animation of part.getAnimations()) animation.cancel();
    part.style.transform = '';
    part.style.opacity = '';
    part.animate(
      [
        {transform: `translateX(${step * distance}px)`, opacity: 0},
        {transform: 'none', opacity: 1},
      ],
      {
        duration: ENTER_MS,
        easing: EASE_OUT,
      },
    );
  }
}

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

/**
 * True when a touch starts on something that takes a sideways drag itself: a field, the map, the receipt's small chart,
 * a row that scrolls.
 */
function takesSidewaysDrag(target: Element) {
  if (target.closest('input, textarea, select, .leaflet-container, .pace-compare-plot')) return true;
  for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
    const {overflowX} = getComputedStyle(node);
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
}

/**
 * The phone layout's tab bar: a frosted capsule with a lens that slides under the chosen tab. A view opened from the
 * menu (Calendar, Money, Trips, Fun stats) has no tab: no lens then. A sideways swipe on the view moves to the next
 * tab (to the left) or the one before (to the right), as long as the tab bar shows and no dialog is open: the view
 * follows the finger, then slides out as the next one slides in (no motion with Reduce motion).
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
    // Sideways for sure: the view follows the finger and the page does not scroll.
    let dragging = false;
    let still = false;
    let sliding = false;

    /** The tab a swipe of `across` pixels leads to, if there is one that way. */
    function neighbour(across: number) {
      const {index: current} = latest.current;
      return current < 0 ? undefined : PHONE_TABS[current + (across < 0 ? 1 : -1)];
    }

    function onStart(event: TouchEvent) {
      start = null;
      dragging = false;
      const target = event.target;
      if (sliding || event.touches.length !== 1 || !(target instanceof Element) || !target.closest('.main')) return;
      // A view from the ⋯ menu (Calendar, Trips) has no tab to swipe from.
      if (latest.current.index < 0) return;
      if (!window.matchMedia('(max-width: 960px)').matches || document.querySelector('dialog[open]')) return;
      const {clientX, clientY} = event.touches[0];
      if (clientX < SIDE_MARGIN || clientX > window.innerWidth - SIDE_MARGIN || takesSidewaysDrag(target)) return;
      start = {left: clientX, top: clientY};
      still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    function onMove(event: TouchEvent) {
      if (!start) return;
      const across = event.touches[0].clientX - start.left;
      const down = event.touches[0].clientY - start.top;
      if (!dragging) {
        if (Math.abs(across) < SLOP && Math.abs(down) < SLOP) return;
        // A scroll down the page that drifts a little never changes tab.
        if (Math.abs(across) <= Math.abs(down)) {
          start = null;
          return;
        }
        dragging = true;
      }
      if (event.cancelable) event.preventDefault();
      if (!still) follow(across * (neighbour(across) ? FOLLOW : EDGE_FOLLOW));
    }
    async function onEnd(event: TouchEvent) {
      if (!start || !dragging) {
        start = null;
        return;
      }
      const across = event.changedTouches[0].clientX - start.left;
      start = null;
      dragging = false;
      const next = Math.abs(across) >= SWIPE ? neighbour(across) : undefined;
      if (!next) {
        if (!still) settle();
        return;
      }
      const {pick: choose} = latest.current;
      if (still) {
        choose(next.key);
        return;
      }
      sliding = true;
      try {
        await slide(across < 0 ? 1 : -1, () => choose(next.key));
      } finally {
        sliding = false;
      }
    }
    function onCancel() {
      if (dragging && !still) settle();
      start = null;
      dragging = false;
    }
    window.addEventListener('touchstart', onStart, {passive: true});
    // Not passive: once a swipe goes sideways, it stops the page from scrolling.
    window.addEventListener('touchmove', onMove, {passive: false});
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onCancel);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
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
