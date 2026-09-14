import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = 'max-h-[90vh]',
  className = '',
}) => {
  // ESC key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Bottom sheet'}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-fade-in lg:hidden"
    >
      {/* Backdrop tap to dismiss */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel */}
      <div
        className={`relative w-full ${maxHeight} bg-white rounded-t-3xl border-t border-timberwolf/60 flex flex-col shadow-2xl animate-slide-up z-10 overflow-hidden ${className}`}
      >
        {/* Native mobile drag handle */}
        <div className="w-12 h-1.5 bg-timberwolf/80 rounded-full mx-auto my-3 shrink-0" />

        {/* Sheet Header */}
        {(title || subtitle) && (
          <div className="px-5 pb-3 border-b border-timberwolf/40 flex items-center justify-between shrink-0">
            <div>
              {title && (
                <h3 className="font-extrabold text-base text-midnight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-midnight/60 font-medium mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] rounded-full hover:bg-aliceblue text-midnight/70 hover:text-midnight transition-colors cursor-pointer flex items-center justify-center active:scale-95"
              aria-label="Close sheet"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Sheet Scrollable Body with safe area padding */}
        <div className="overflow-y-auto p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default BottomSheet;
