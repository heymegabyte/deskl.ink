import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('deskl.ink: #root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register the offline service worker (progressive enhancement). It's network-first for
// navigations and never touches /api/*, so it can't affect the control plane or live desktops;
// registration failures are ignored (the app works identically without it). See public/sw.js.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW is an enhancement — ignore registration failures */
    });
  });
}
