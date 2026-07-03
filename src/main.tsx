import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './state/AuthProvider';
import { LocaleProvider } from './state/LocaleProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </LocaleProvider>
  </StrictMode>
);

// Register the service worker for offline/installable PWA support (prod only,
// so the Vite dev HMR server is never intercepted by the cache).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
} else if ('serviceWorker' in navigator) {
  // In development, tear down any service worker + caches left over from a
  // previous production build. A cache-first SW would otherwise keep serving
  // stale JS so new code changes never appear on the dev server.
  navigator.serviceWorker.getRegistrations().then((regs) => {
    let hadSw = false;
    regs.forEach((reg) => {
      hadSw = true;
      reg.unregister();
    });
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    }
    if (hadSw) window.location.reload();
  });
}
