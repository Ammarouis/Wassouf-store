export interface AnalyticsPayload {
  type: 'search' | 'whatsapp_click' | 'product_view';
  term?: string;
  productCode?: string;
  branchCode?: string;
}

export function trackEvent(payload: AnalyticsPayload): void {
  if (typeof window === 'undefined') return;
  const data = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon('/api/analytics/event', new Blob([data], { type: 'application/json' }));
      if (accepted) return;
    }
  } catch {
    // Use the keepalive fetch fallback below.
  }
  fetch('/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data,
    keepalive: true,
  }).catch(() => undefined);
}
