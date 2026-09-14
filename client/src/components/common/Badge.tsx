import React, { HTMLAttributes } from 'react';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'accent'
  | 'outline';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  dotPulse?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-aliceblue text-midnight border border-timberwolf/60',
  success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-900 border border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border border-rose-200',
  info: 'bg-blue-50 text-blue-800 border border-blue-200',
  accent: 'bg-moonstone/10 text-moonstone-dark border border-moonstone/30',
  outline: 'bg-transparent text-midnight/80 border border-timberwolf',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-midnight/60',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-blue-500',
  accent: 'bg-moonstone',
  outline: 'bg-midnight/40',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-2 py-0.5 rounded-full',
  md: 'text-xs px-2.5 py-1 rounded-full font-semibold',
  lg: 'text-xs px-3 py-1.5 rounded-full font-bold',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  dot = false,
  dotPulse = false,
  children,
  className = '',
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 leading-none transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]} ${dotPulse ? 'animate-pulse' : ''}`}
        />
      )}
      {children}
    </span>
  );
};

export default Badge;
