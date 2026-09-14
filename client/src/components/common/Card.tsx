import React from 'react';

export type CardVariant =
  | 'default'
  | 'highlighted'
  | 'primary'
  | 'interactive'
  | 'emptyState'
  | 'warning'
  | 'success';

export type CardPadding = 'none' | 'compact' | 'comfortable';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: CardVariant;
  padding?: CardPadding;
  icon?: React.ReactNode;
  iconBg?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'comfortable',
  icon,
  iconBg,
  title,
  subtitle,
  footer,
  children,
  className = '',
  onClick,
  ...props
}) => {
  // Consistent 16px border-radius across all card variants
  const baseBorderRadius = 'rounded-2xl';

  const paddingClasses: Record<CardPadding, string> = {
    none: 'p-0',
    compact: 'p-4 sm:p-5',
    comfortable: 'p-6 sm:p-8'
  };

  const variantClasses: Record<CardVariant, string> = {
    default:
      'bg-white border border-timberwolf/70 shadow-subtle text-midnight',
    highlighted:
      'bg-lightblue/30 border-2 border-lightblue hover:border-moonstone/60 shadow-subtle text-midnight transition-colors',
    primary:
      'bg-midnight border border-midnight text-aliceblue shadow-card',
    interactive:
      'bg-white border border-timberwolf/80 shadow-subtle hover:shadow-card-hover hover:border-moonstone active:scale-[0.995] transition-all cursor-pointer text-midnight',
    emptyState:
      'bg-aliceblue-surface/70 border-2 border-dashed border-timberwolf text-center text-midnight',
    warning:
      'bg-amber-50/90 border border-amber-200 text-amber-950 shadow-subtle',
    success:
      'bg-emerald-50/90 border border-emerald-200 text-emerald-950 shadow-subtle'
  };

  const isClickable = Boolean(onClick) || variant === 'interactive';

  return (
    <div
      onClick={onClick}
      className={`
        ${baseBorderRadius}
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        flex flex-col justify-between
        ${isClickable ? 'cursor-pointer' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      <div>
        {/* Standardized Icon Treatment */}
        {icon && (
          <div
            className={`
              w-11 h-11 rounded-xl flex items-center justify-center mb-5 shrink-0
              ${iconBg ? iconBg : variant === 'primary' ? 'bg-midnight-light text-moonstone' : 'bg-lightblue/80 text-midnight'}
            `.trim()}
          >
            {icon}
          </div>
        )}

        {/* Standardized Title & Spacing */}
        {title && (
          <h3
            className={`
              text-xl sm:text-2xl font-bold tracking-tight mb-2
              ${variant === 'primary' ? 'text-aliceblue' : 'text-midnight'}
            `.trim()}
          >
            {title}
          </h3>
        )}

        {/* Subtitle / Description */}
        {subtitle && (
          <p
            className={`
              text-sm leading-relaxed mb-6
              ${variant === 'primary' ? 'text-aliceblue/80' : 'text-midnight/75'}
            `.trim()}
          >
            {subtitle}
          </p>
        )}

        {/* Custom Body Content */}
        {children}
      </div>

      {/* Standardized CTA / Footer Positioning */}
      {footer && (
        <div className="mt-6 sm:mt-8 pt-2">
          {footer}
        </div>
      )}
    </div>
  );
};
export default Card;
