/** Opened from the home screen: no browser around the page, so no browser bar and no pull to refresh of its own. */
export function isHomeScreenApp() {
  const navigatorWithStandalone = navigator as Navigator & {standalone?: boolean};
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}
