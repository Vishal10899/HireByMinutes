import React, { useState, useEffect } from 'react';
import { BrandLogo } from './BrandLogo';
import { RefreshCw } from 'lucide-react';

export const BrandedLoadingScreen: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message = 'Connecting securely to HireByMinute...',
  onRetry
}) => {
  const [displayMessage, setDisplayMessage] = useState(message);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setDisplayMessage('Backend server is waking up from sleep. This may take ~30 seconds on Render free tier...');
    }, 3500);

    const timer2 = setTimeout(() => {
      setShowRetry(true);
    }, 12000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="min-h-screen bg-aliceblue flex flex-col items-center justify-center p-6 text-center antialiased selection:bg-lightblue selection:text-midnight">
      <div className="flex flex-col items-center space-y-4 max-w-sm animate-fade-in">
        {/* Animated Brand Logo Mark */}
        <div className="relative">
          <BrandLogo size="lg" asLink={false} showText={false} />
          <div className="absolute -inset-2 border-2 border-moonstone/40 border-t-transparent rounded-2xl animate-spin" />
        </div>

        {/* Brand Text */}
        <div className="space-y-1.5 mt-2">
          <h2 className="text-base font-extrabold text-midnight tracking-tight">
            HireByMinute
          </h2>
          <p className="text-xs text-midnight/70 font-medium leading-relaxed max-w-xs mx-auto">
            {displayMessage}
          </p>
        </div>

        {showRetry && (
          <div className="pt-2 animate-fade-in">
            <button
              type="button"
              onClick={() => {
                if (onRetry) {
                  onRetry();
                } else {
                  window.location.reload();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-timberwolf text-xs font-semibold text-midnight hover:bg-aliceblue shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-moonstone" />
              <span>Retry Connection</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandedLoadingScreen;
