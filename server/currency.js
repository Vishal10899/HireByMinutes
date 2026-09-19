// =============================================================================
// HIREBYMINUTES — CENTRALIZED CURRENCY CONFIGURATION & FINANCIAL UTILITIES
// =============================================================================
// Authoritative currency standards for the HireByMinute platform.
// Standard Platform Currency: Indian Rupee (INR - ₹)
// Smallest Currency Unit: Paise (1 Rupee = 100 Paise)
// =============================================================================

const CURRENCY = 'INR';
const CURRENCY_SYMBOL = '₹';

/**
 * Safely converts Rupee amount (major unit) to integer Paise (smallest unit).
 * Avoids JavaScript floating-point representation bugs by rounding to nearest integer.
 * @param {number|string} rupees - Monetary amount in Rupees
 * @returns {number} Integer paise (>= 0)
 */
function toPaise(rupees) {
  const num = Number(rupees);
  if (isNaN(num) || !isFinite(num) || num < 0) return 0;
  return Math.round(Math.round(num * 100));
}

/**
 * Safely converts Paise (smallest unit) to Rupees (major unit) with 2 decimals.
 * @param {number|string} paise - Amount in integer paise
 * @returns {number} Rupees as a 2-decimal number
 */
function toRupees(paise) {
  const num = Number(paise);
  if (isNaN(num) || !isFinite(num) || num < 0) return 0;
  return Number((num / 100).toFixed(2));
}

/**
 * Formats a monetary amount into standard Indian Rupee notation (e.g. ₹1,000, ₹1,00,000, ₹1,250.50).
 * Uses en-IN locale grouping: last 3 digits, then groups of 2 digits.
 * @param {number|string|null|undefined} amount - Amount in Rupees
 * @param {object} [options]
 * @param {boolean} [options.symbol=true] - Whether to prepend ₹ symbol
 * @param {boolean} [options.forceDecimals=false] - Whether to show decimals even if .00
 * @returns {string} Formatted INR currency string
 */
function formatINR(amount, options = {}) {
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
}

/**
 * Safe diagnostics for Razorpay credentials without exposing secrets.
 * @returns {object} Safe diagnostics object
 */
function getRazorpaySafeDiagnostics(customEnv = process.env) {
  const rawKeyId = customEnv.RAZORPAY_KEY_ID || '';
  const rawKeySecret = customEnv.RAZORPAY_KEY_SECRET || '';
  const rawWebhookSecret = customEnv.RAZORPAY_WEBHOOK_SECRET || '';

  const keyId = rawKeyId.trim().replace(/^["']|["']$/g, '');
  const keySecret = rawKeySecret.trim().replace(/^["']|["']$/g, '');
  const webhookSecret = rawWebhookSecret.trim().replace(/^["']|["']$/g, '');

  let keyPrefix = 'none';
  if (keyId.startsWith('rzp_live_')) keyPrefix = 'rzp_live';
  else if (keyId.startsWith('rzp_test_')) keyPrefix = 'rzp_test';
  else if (keyId.length > 0) keyPrefix = 'custom_or_unknown';

  const maskedKeyId = keyId.length >= 8 
    ? `${keyId.slice(0, 4)}...${keyId.slice(-4)}`
    : (keyId.length > 0 ? 'configured' : 'none');

  return {
    isConfigured: Boolean(keyId && keySecret),
    key_exists: Boolean(keyId),
    keyIdConfigured: Boolean(keyId),
    key_prefix: keyPrefix,
    key_length: keyId.length,
    maskedKeyId,
    sanitizedKeyId: keyId,
    secret_exists: Boolean(keySecret),
    keySecretConfigured: Boolean(keySecret),
    secret_length: keySecret.length,
    webhook_secret_exists: Boolean(webhookSecret),
    webhookSecretConfigured: Boolean(webhookSecret),
    webhook_secret_length: webhookSecret.length,
    keyIdHasWhitespace: rawKeyId !== keyId,
    keySecretHasWhitespace: rawKeySecret !== keySecret,
    webhookSecretHasWhitespace: rawWebhookSecret !== webhookSecret,
    environment: customEnv.NODE_ENV || 'development',
    currency_requested: CURRENCY
  };
}

module.exports = {
  CURRENCY,
  CURRENCY_SYMBOL,
  toPaise,
  toRupees,
  formatINR,
  getRazorpaySafeDiagnostics
};
