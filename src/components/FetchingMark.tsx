import {useEffect, useState} from 'react';
import {Logo} from './Logo';

/**
 * On a phone, the moving logo stays in view while new payments come in: once the header and its logo have scrolled
 * away, a small circle under the period bar carries it. Wide screens keep the logo in the sidebar, always in view.
 */
export function FetchingMark() {
  const [headerAway, setHeaderAway] = useState(false);
  useEffect(() => {
    const header = document.querySelector('.main > .top');
    if (!header) return;
    const observer = new IntersectionObserver(([entry]) => setHeaderAway(!entry.isIntersecting));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  if (!headerAway) return null;
  return (
    <span className="fetching-mark" aria-hidden="true">
      <Logo busy />
    </span>
  );
}
