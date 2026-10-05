import React, { useState, useEffect } from 'react';
import { backendStatus, BackendStatusInfo } from '../../services/backendStatus';
import { api } from '../../services/api';
import { Sparkles, RefreshCw, X, AlertCircle } from 'lucide-react';

export const ServerStatusBanner: React.FC = () => {
  const [status, setStatus] = useState<BackendStatusInfo>(() => backendStatus.getStatus());
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    return backendStatus.subscribe((newStatus) => {
      setStatus(newStatus);
      // Reset dismissal when state transitions to waking up or error
      if (newStatus.state === 'waking_up' || newStatus.state === 'error') {
        setDismissed(false);
      }
    });
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await api.getHealth();
    } catch {
      // Backend status is updated inside api fetch
    } finally {
      setRetrying(false);
    }
  };

  // Only render if backend is waking up or errored, and not manually dismissed
  if (dismissed || (status.state !== 'waking_up' && status.state !== 'error')) {
    return null;
  }

  const isWaking = status.state === 'waking_up';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full z-40 transition-all duration-200 border-b text-xs sm:text-sm py-2 px-4 flex items-center justify-between gap-3 shadow-xs ${
        isWaking
          ? 'bg-amber-50 text-amber-900 border-amber-200/80'
          : 'bg-rose-50 text-rose-900 border-rose-200/80'
      }`}
    >
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isWaking ? (
            <div className="relative flex items-center justify-center shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping absolute" />
              <span className="w-2 h-2 rounded-full bg-amber-600 relative" />
            </div>
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}

          <div className="truncate">
            <span className="font-bold mr-1">
              {isWaking ? 'Server Waking Up:' : 'Connection Notice:'}
            </span>
            <span className="text-opacity-90 font-medium">
              {isWaking
                ? 'Backend is starting up on Render (free tier cold start ~30s). Public pages work immediately; live actions will connect in a moment.'
                : 'Backend took longer than expected to wake up.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
              isWaking
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                : 'bg-rose-100 hover:bg-rose-200 text-rose-950 border-rose-300'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} />
            <span>{retrying ? 'Connecting...' : 'Check Status'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 rounded text-current opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServerStatusBanner;
