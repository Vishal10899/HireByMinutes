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
 * Resolves and sanitizes Razorpay credentials from environment variables or database platform_settings.
 * Automatically detects and corrects if Key ID and Key Secret were inverted/swapped during deployment.
 * @param {object} [customEnv=process.env]
 * @param {object} [dbSettings={}] - Optional database platform_settings map
 * @returns {object} Resolved credentials object
 */
function resolveRazorpayCredentials(customEnv = process.env, dbSettings = {}) {
  // Check database settings first if available, then fallback to environment variables
  const rawKeyId = (dbSettings.razorpay_key_id || customEnv.RAZORPAY_KEY_ID || '').toString();
  const rawKeySecret = (dbSettings.razorpay_key_secret || customEnv.RAZORPAY_KEY_SECRET || '').toString();
  const rawWebhookSecret = (dbSettings.razorpay_webhook_secret || customEnv.RAZORPAY_WEBHOOK_SECRET || '').toString();

  let keyId = rawKeyId.trim().replace(/^["']|["']$/g, '');
  let keySecret = rawKeySecret.trim().replace(/^["']|["']$/g, '');
  const webhookSecret = rawWebhookSecret.trim().replace(/^["']|["']$/g, '');

  let isSwapped = false;
  // Detect if Key ID and Key Secret were accidentally swapped/inverted during deployment:
  // Legitimate Razorpay Key IDs strictly start with 'rzp_live_' or 'rzp_test_'.
  // If keySecret has 'rzp_live_' or 'rzp_test_' while keyId does NOT, they are definitely inverted.
  const secretLooksLikeKeyId = keySecret.startsWith('rzp_live_') || keySecret.startsWith('rzp_test_');
  const keyIdLooksLikeSecret = keyId.length > 0 && !keyId.startsWith('rzp_live_') && !keyId.startsWith('rzp_test_');

  if (secretLooksLikeKeyId && keyIdLooksLikeSecret) {
    isSwapped = true;
    const temp = keyId;
    keyId = keySecret;
    keySecret = temp;
  }

  const isConfigured = Boolean(keyId && keySecret && !keyId.includes('placeholder'));
  const mode = keyId.startsWith('rzp_live_') ? 'live' : keyId.startsWith('rzp_test_') ? 'test' : 'unknown';

  return {
    keyId,
    keySecret,
    webhookSecret,
    isSwapped,
    isConfigured,
    mode,
    source: dbSettings.razorpay_key_id ? 'database' : (customEnv.RAZORPAY_KEY_ID ? 'environment' : 'none')
  };
}

/**
 * Safe diagnostics for Razorpay credentials without exposing secrets.
 * @param {object} [customEnv=process.env]
 * @param {object} [dbSettings={}]
 * @returns {object} Safe diagnostics object
 */
function getRazorpaySafeDiagnostics(customEnv = process.env, dbSettings = {}) {
  const rawKeyId = customEnv.RAZORPAY_KEY_ID || '';
  const rawKeySecret = customEnv.RAZORPAY_KEY_SECRET || '';
  const rawWebhookSecret = customEnv.RAZORPAY_WEBHOOK_SECRET || '';

  const resolved = resolveRazorpayCredentials(customEnv, dbSettings);
  const keyId = resolved.keyId;
  const keySecret = resolved.keySecret;
  const webhookSecret = resolved.webhookSecret;

  let keyPrefix = 'none';
  if (keyId.startsWith('rzp_live_')) keyPrefix = 'rzp_live';
  else if (keyId.startsWith('rzp_test_')) keyPrefix = 'rzp_test';
  else if (keyId.length > 0) keyPrefix = 'custom_or_unknown';

  const maskedKeyId = keyId.length >= 8 
    ? `${keyId.slice(0, 4)}...${keyId.slice(-4)}`
    : (keyId.length > 0 ? 'configured' : 'none');

  return {
    isConfigured: resolved.isConfigured,
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
    keyIdHasWhitespace: rawKeyId !== rawKeyId.trim().replace(/^["']|["']$/g, ''),
    keySecretHasWhitespace: rawKeySecret !== rawKeySecret.trim().replace(/^["']|["']$/g, ''),
    webhookSecretHasWhitespace: rawWebhookSecret !== rawWebhookSecret.trim().replace(/^["']|["']$/g, ''),
    isSwapped: resolved.isSwapped,
    mode: resolved.mode,
    source: resolved.source,
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
  resolveRazorpayCredentials,
  getRazorpaySafeDiagnostics
};
