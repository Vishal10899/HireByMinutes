import React from 'react';
import { BrandLogo } from './BrandLogo';

export const BrandedLoadingScreen: React.FC<{ message?: string }> = ({
  message = 'Connecting securely to HireByMinutes...'
}) => {
  return (
    <div className="min-h-screen bg-aliceblue flex flex-col items-center justify-center p-6 text-center antialiased selection:bg-lightblue selection:text-midnight">
      <div className="flex flex-col items-center space-y-4 max-w-xs animate-fade-in">
        {/* Animated Brand Logo Mark */}
        <div className="relative">
          <BrandLogo size="lg" asLink={false} showText={false} />
          <div className="absolute -inset-2 border-2 border-moonstone/40 border-t-transparent rounded-2xl animate-spin" />
        </div>

        {/* Brand Text */}
        <div className="space-y-1 mt-2">
          <h2 className="text-base font-extrabold text-midnight tracking-tight">
            HireByMinutes
          </h2>
          <p className="text-xs text-midnight/60 font-medium">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
};
export default BrandedLoadingScreen;
