import React, { ButtonHTMLAttributes } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({
  selected = false,
  removable = false,
  onRemove,
  size = 'md',
  leftIcon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'min-h-[32px] px-2.5 py-1 text-xs gap-1.5',
    md: 'min-h-[38px] px-3.5 py-1.5 text-xs font-semibold gap-2',
    lg: 'min-h-[44px] px-4 py-2 text-sm font-semibold gap-2',
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`
        inline-flex items-center justify-center rounded-full border transition-all duration-180
        cursor-pointer whitespace-nowrap active:scale-95 select-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeClasses[size]}
        ${
          selected
            ? 'bg-midnight text-aliceblue border-midnight shadow-subtle'
            : 'bg-white text-midnight border-timberwolf/70 hover:border-moonstone hover:bg-aliceblue/40'
        }
        ${className}
      `}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {removable && onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 p-0.5 rounded-full hover:bg-black/10 transition-colors"
          aria-label="Remove"
        >
          ✕
        </span>
      )}
    </button>
  );
};

export default Chip;
