import type {MouseEvent} from 'react';

/** Opened from the home screen: no browser around the page, so no browser bar and no pull to refresh of its own. */
export function isHomeScreenApp() {
  const navigatorWithStandalone = navigator as Navigator & {standalone?: boolean};
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

/**
 * On a phone the payment lists are for fixing categories: a tap anywhere on a payment, off its own buttons, links and
 * fields, opens its category. True for such a tap (the phone layout's width, as the stylesheet has it).
 */
export function opensCategory(event: MouseEvent) {
  if (!window.matchMedia('(max-width: 560px)').matches) return false;
  return !(event.target as HTMLElement).closest('button, a, input, form');
}
