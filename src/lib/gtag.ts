/**
 * Utility for tracking Google Analytics events.
 * This wraps the window.gtag call to handle cases where it might not be defined.
 */

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID;

type GtagFn = (...args: unknown[]) => void;

function getGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { gtag?: GtagFn };
  return typeof w.gtag === "function" ? w.gtag : undefined;
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string) => {
  const gtag = getGtag();
  if (gtag) {
    gtag("config", GA_TRACKING_ID, {
      page_path: url,
    });
  }
};

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export const trackEvent = (
  action: string,
  params?: Record<string, unknown>
) => {
  const gtag = getGtag();
  if (gtag) {
    gtag("event", action, params);
  }
};
