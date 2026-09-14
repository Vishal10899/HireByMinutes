import React from 'react';
import { Button, ButtonProps } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  actionVariant?: ButtonProps['variant'];
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  actionVariant = 'primary',
  secondaryActionText,
  onSecondaryAction,
  className = '',
}) => {
  return (
    <div
      className={`p-8 sm:p-12 text-center rounded-2xl bg-white border border-timberwolf/70 shadow-subtle flex flex-col items-center justify-center max-w-md mx-auto ${className}`}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-aliceblue text-moonstone flex items-center justify-center border border-timberwolf/40 mb-4 shadow-subtle">
          {icon}
        </div>
      )}

      <h3 className="text-base sm:text-lg font-bold text-midnight tracking-tight mb-1.5">
        {title}
      </h3>

      {description && (
        <p className="text-xs sm:text-sm text-midnight/70 leading-relaxed max-w-sm mb-6">
          {description}
        </p>
      )}

      {(actionText || secondaryActionText) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {actionText && onAction && (
            <Button
              variant={actionVariant}
              size="md"
              onClick={onAction}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {actionText}
            </Button>
          )}

          {secondaryActionText && onSecondaryAction && (
            <Button
              variant="outline"
              size="md"
              onClick={onSecondaryAction}
              className="w-full sm:w-auto min-h-[44px]"
            >
              {secondaryActionText}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
