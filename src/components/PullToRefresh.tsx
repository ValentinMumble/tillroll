import {useEffect, useRef, useState} from 'react';
import {isHomeScreenApp} from '../homeScreen';

/** How far the circle comes down (half the finger's drag) before letting go refreshes. */
const THRESHOLD = 64;

interface Props {
  /** What a refresh does: sync the banks for the owner, load the page again otherwise. */
  onRefresh: () => Promise<unknown>;
}

/**
 * Pull to refresh, in the home-screen app only: at the top of the page, a drag down brings a circle that turns as it
 * comes; let go past the line and it spins while the refresh runs. Never under an open dialog.
 */
export function PullToRefresh({onRefresh}: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // The latest refresh, so the touch listeners added once always call it.
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  });

  useEffect(() => {
    if (!isHomeScreenApp()) return;
    let startY: number | null = null;
    let distance = 0;
    let busy = false;

    function onStart(event: TouchEvent) {
      if (busy || window.scrollY > 0 || event.touches.length !== 1 || document.querySelector('dialog[open]')) return;
      startY = event.touches[0].clientY;
    }
    function onMove(event: TouchEvent) {
      if (startY === null) return;
      const drag = event.touches[0].clientY - startY;
      // A drag up, or the page scrolling after all: no pull.
      distance = drag > 0 && window.scrollY <= 0 ? Math.min(drag / 2, THRESHOLD * 1.4) : 0;
      setPull(distance);
    }
    async function onEnd() {
      if (startY === null) return;
      startY = null;
      if (distance < THRESHOLD) {
        setPull(0);
        return;
      }
      busy = true;
      setRefreshing(true);
      try {
        await refresh.current();
      } finally {
        busy = false;
        distance = 0;
        setRefreshing(false);
        setPull(0);
      }
    }
    const end = () => void onEnd();
    window.addEventListener('touchstart', onStart, {passive: true});
    window.addEventListener('touchmove', onMove, {passive: true});
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

  if (pull === 0 && !refreshing) return null;
  const ready = refreshing || pull >= THRESHOLD;
  return (
    <div
      className={`pull-refresh${ready ? ' is-ready' : ''}${refreshing ? ' is-refreshing' : ''}`}
      style={{transform: `translate(-50%, ${refreshing ? THRESHOLD : pull}px)`}}
      role="status"
    >
      <span
        className="pull-refresh-icon"
        aria-hidden="true"
        style={refreshing ? undefined : {rotate: `${pull * 4}deg`}}
      >
        ↻
      </span>
      <span className="visually-hidden">{refreshing ? 'Refreshing' : ready ? 'Let go to refresh' : ''}</span>
    </div>
  );
}
