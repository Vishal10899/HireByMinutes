// =============================================================================
// HIREBYMINUTES — CLIENT CENTRALIZED CURRENCY UTILITIES
// =============================================================================
// Standard Platform Currency: Indian Rupee (INR - ₹)
// Smallest Currency Unit: Paise (1 Rupee = 100 Paise)
// =============================================================================

export const CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

/**
 * Formats a monetary amount into standard Indian Rupee notation (e.g. ₹100, ₹1,000, ₹1,00,000, ₹1,250.50).
 * Uses en-IN locale grouping: last 3 digits, then groups of 2 digits.
 * @param amount - Amount in Rupees
 * @param options - Formatting options
 * @returns Formatted INR currency string
 */
export const formatINR = (
  amount: number | string | null | undefined,
  options: { symbol?: boolean; forceDecimals?: boolean } = {}
): string => {
  const { symbol = true, forceDecimals = true } = options;
  if (amount === null || amount === undefined || amount === '') {
    return symbol ? `${CURRENCY_SYMBOL}0.00` : '0.00';
  }
  const num = Number(amount);
  if (isNaN(num) || !isFinite(num)) {
    return symbol ? `${CURRENCY_SYMBOL}0.00` : '0.00';
  }

  const hasDecimals = forceDecimals || (num % 1 !== 0);
  const formattedNumber = num.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  });

  return symbol ? `${CURRENCY_SYMBOL}${formattedNumber}` : formattedNumber;
};

/**
 * Converts Rupees to integer Paise.
 */
export const toPaise = (rupees: number | string): number => {
  const num = Number(rupees);
  if (isNaN(num) || !isFinite(num) || num < 0) return 0;
  return Math.round(Math.round(num * 100));
};

/**
 * Converts integer Paise to Rupees.
 */
export const toRupees = (paise: number | string): number => {
  const num = Number(paise);
  if (isNaN(num) || !isFinite(num) || num < 0) return 0;
  return Number((num / 100).toFixed(2));
};
