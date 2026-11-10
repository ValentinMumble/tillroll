import {useEffect, useRef} from 'react';
import {isHomeScreenApp} from '../device';

/** How far to pull (half the finger's drag) before letting go refreshes. */
const THRESHOLD = 64;

interface Props {
  /** What a refresh does: sync the banks for the owner, load the page again otherwise. */
  onRefresh: () => Promise<unknown>;
}

/**
 * Pull to refresh, in the home-screen app only, with the logo as its only sign: at the top of the page, a drag down
 * shortens the logo's bars (--pull on the page, from 0 to 1), down to dots at the line; let go there and they move
 * while the refresh runs. Never under an open dialog.
 */
export function PullToRefresh({onRefresh}: Props) {
  // The latest refresh, so the touch listeners added once always call it.
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  });

  useEffect(() => {
    if (!isHomeScreenApp()) return;
    const page = document.documentElement;
    let startY: number | null = null;
    let startX = 0;
    let distance = 0;
    let busy = false;

    function show(pull: number) {
      if (pull > 0) page.style.setProperty('--pull', String(Math.min(pull / THRESHOLD, 1)));
      else page.style.removeProperty('--pull');
      page.classList.toggle('is-pulling', pull > 0);
    }
    function onStart(event: TouchEvent) {
      if (busy || window.scrollY > 0 || event.touches.length !== 1 || document.querySelector('dialog[open]')) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
    }
    function onMove(event: TouchEvent) {
      if (startY === null) return;
      const drag = event.touches[0].clientY - startY;
      const across = Math.abs(event.touches[0].clientX - startX);
      // A drag up, a swipe sideways (to another tab), or the page scrolling after all: no pull.
      distance = drag > across && window.scrollY <= 0 ? Math.min(drag / 2, THRESHOLD * 1.4) : 0;
      show(distance);
    }
    async function onEnd() {
      if (startY === null) return;
      startY = null;
      show(0);
      if (distance < THRESHOLD) return;
      busy = true;
      try {
        await refresh.current();
      } finally {
        busy = false;
        distance = 0;
      }
    }
    const end = () => void onEnd();
    window.addEventListener('touchstart', onStart, {passive: true});
    window.addEventListener('touchmove', onMove, {passive: true});
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      show(0);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

  return null;
}
