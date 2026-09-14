/**
 * HireByMinute Design Tokens
 * 
 * Platform-agnostic design tokens shared between web (Tailwind / CSS)
 * and future native mobile applications (React Native / native sheets).
 * 
 * Single source of truth for:
 * - Brand & Theme Colors
 * - Spacing Scale
 * - Touch Target Sizing (WCAG 44px+ compliant)
 * - Typography Hierarchy
 * - Border Radius
 * - Elevation & Shadows
 * - Motion & Transitions
 */

export const colors = {
  // Brand Midnight (Primary deep slate/teal)
  midnight: {
    DEFAULT: '#004554',
    hover: '#003541',
    light: '#085C6E',
    dark: '#002832',
  },
  // Brand Moonstone (Vibrant cyan/teal accent)
  moonstone: {
    DEFAULT: '#44A6B5',
    hover: '#3A919E',
    light: '#E2F3F6',
    dark: '#2E7985',
  },
  // Brand Lightblue (Secondary accent & borders)
  lightblue: {
    DEFAULT: '#B2D5E2',
    light: '#CBE3ED',
    border: '#9DC7D7',
  },
  // Brand Aliceblue (Canvas & subtle surface)
  aliceblue: {
    DEFAULT: '#E9F1F6',
    surface: '#F4F8FA',
    light: '#FFFFFF',
    dark: '#DCE7EE',
  },
  // Brand Timberwolf (Borders, dividers & neutrals)
  timberwolf: {
    DEFAULT: '#D3D0C8',
    light: '#E4E2DC',
    dark: '#B8B4AA',
  },
  // Semantic State Colors
  semantic: {
    success: '#10B981', // Emerald 500
    successBg: '#ECFDF5',
    warning: '#F59E0B', // Amber 500
    warningBg: '#FFFBEB',
    error: '#EF4444', // Rose 500
    errorBg: '#FEF2F2',
    info: '#3B82F6', // Blue 500
    infoBg: '#EFF6FF',
  }
} as const;

export const touchTargets = {
  /** Minimum touch target size per WCAG 2.1 AA (44px) */
  min: 44,
  /** Standard comfortable button & input height (48px) */
  standard: 48,
  /** Large primary action height (52px) */
  comfortable: 52,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export const typography = {
  fontFamily: {
    sans: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  fontSize: {
    '2xs': { size: '10px', lineHeight: '14px' },
    xs: { size: '12px', lineHeight: '16px' },
    sm: { size: '14px', lineHeight: '20px' },
    base: { size: '16px', lineHeight: '24px' },
    lg: { size: '18px', lineHeight: '28px' },
    xl: { size: '20px', lineHeight: '28px' },
    '2xl': { size: '24px', lineHeight: '32px' },
    '3xl': { size: '30px', lineHeight: '36px' },
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  }
} as const;

export const shadows = {
  subtle: '0 1px 3px rgba(0, 69, 84, 0.04), 0 1px 2px rgba(0, 69, 84, 0.02)',
  card: '0 4px 20px -2px rgba(0, 69, 84, 0.05)',
  cardHover: '0 8px 24px -4px rgba(0, 69, 84, 0.08)',
  elevated: '0 14px 34px rgba(0, 69, 84, 0.09)',
  modal: '0 20px 40px -8px rgba(0, 69, 84, 0.18), 0 0 1px 1px rgba(0, 69, 84, 0.05)',
} as const;

export const transitions = {
  fast: '120ms cubic-bezier(0.16, 1, 0.3, 1)',
  normal: '180ms cubic-bezier(0.16, 1, 0.3, 1)',
  slow: '250ms cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const breakpoints = {
  xs: 375,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export default {
  colors,
  touchTargets,
  radius,
  spacing,
  typography,
  shadows,
  transitions,
  breakpoints,
};
