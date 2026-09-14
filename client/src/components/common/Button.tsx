import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  fullWidthOnMobile?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  to?: string; // If provided, renders as react-router-dom Link with button styling
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  fullWidthOnMobile = false,
  isLoading = false,
  icon,
  iconRight,
  to,
  className = '',
  disabled,
  ...props
}) => {
  // Base sizing guaranteeing minimum 44px touch target (WCAG 2.5.5) and 48px standard height
  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-[44px] h-11 px-4 text-xs font-semibold gap-1.5 rounded-xl',
    md: 'min-h-[48px] h-12 px-5 text-sm font-semibold gap-2 rounded-xl',
    lg: 'min-h-[52px] h-13 px-6 text-base font-bold gap-2.5 rounded-2xl'
  };

  const variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-midnight text-aliceblue hover:bg-midnight-hover shadow-subtle hover:shadow-card active:scale-[0.99] border border-midnight/10 focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:ring-offset-2',
    secondary:
      'bg-lightblue/45 text-midnight hover:bg-lightblue/70 border border-lightblue active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:ring-offset-2',
    accent:
      'bg-moonstone text-white hover:bg-moonstone-hover shadow-subtle hover:shadow-card active:scale-[0.99] border border-moonstone/20 focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:ring-offset-2',
    outline:
      'bg-white text-midnight border-2 border-timberwolf hover:border-moonstone hover:text-midnight-hover shadow-subtle active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-moonstone focus-visible:ring-offset-2',
    ghost:
      'bg-transparent text-midnight hover:bg-lightblue/35 active:bg-lightblue/50 focus-visible:ring-2 focus-visible:ring-moonstone',
    danger:
      'bg-red-600 text-white hover:bg-red-700 shadow-subtle hover:shadow-card active:scale-[0.99] border border-red-700/20 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2'
  };

  const widthClass = fullWidth
    ? 'w-full'
    : fullWidthOnMobile
    ? 'w-full sm:w-auto'
    : 'w-auto';

  const baseClasses = `
    inline-flex items-center justify-center font-medium transition-all duration-150 select-none
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${widthClass}
    ${className}
  `.trim();

  const content = (
    <>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0 mr-1.5" />}
      {!isLoading && icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
      {!isLoading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={baseClasses}>
        {content}
      </Link>
    );
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={baseClasses}
      {...props}
    >
      {content}
    </button>
  );
};
export default Button;
