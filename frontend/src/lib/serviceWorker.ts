/**
 * Service worker is only for production offline shell support.
 * In development we unregister any existing worker and clear caches so
 * Vite HMR and normal reloads always show the latest code.
 */
export async function setupServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // App works without offline support.
    });
  });
}
