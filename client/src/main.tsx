import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Safe handling for stale chunk/deployment errors (avoids infinite reload loop)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const errorMsg = event?.message || '';
    const isChunkFailure =
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('Importing a module script failed');

    if (isChunkFailure) {
      const reloadKey = 'hbm_chunk_retry_' + window.location.pathname;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        window.location.reload();
      }
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
