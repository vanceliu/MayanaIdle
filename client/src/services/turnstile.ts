const TURNSTILE_SITE_KEY = '0x4AAAAAADu3TydtRl_DNLol';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function getTurnstileToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.turnstile) {
      reject(new Error('Turnstile not loaded'));
      return;
    }

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '0';
    container.style.right = '0';
    container.style.zIndex = '-1';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    let widgetId: string;

    const cleanup = () => {
      try {
        window.turnstile!.remove(widgetId);
      } catch { /* ignore */ }
      try {
        document.body.removeChild(container);
      } catch { /* ignore */ }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Turnstile timeout'));
    }, 15000);

    widgetId = window.turnstile.render(container, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => {
        clearTimeout(timeout);
        cleanup();
        resolve(token);
      },
      'error-callback': () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('Turnstile challenge failed'));
      },
      'expired-callback': () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('Turnstile token expired'));
      },
    });
  });
}
