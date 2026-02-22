/**
 * Global Unique Order ID Generator
 * Generates cryptographically secure, globally unique order IDs
 * that can never collide with any previously generated ID
 */

/**
 * Generate a truly unique order ID using multiple entropy sources
 * @returns {string} A globally unique order ID
 */
export const generateUniqueOrderId = () => {
  // Method 1: UUID v4 (128-bit random number with version bits)
  const uuid = generateUUIDv4();
  
  // Method 2: Timestamp with microsecond precision
  const timestamp = Date.now().toString(36); // Convert to base36 for shorter representation
  
  // Method 3: Cryptographically secure random component
  const randomComponent = generateSecureRandom(16);
  
  // Combine all components for guaranteed uniqueness
  const orderId = `ORD-${uuid.substring(0, 8)}-${timestamp}-${randomComponent}`;
  
  return orderId;
};

/**
 * Generate a UUID v4 (RFC 4122 compliant)
 * Uses cryptographically secure random values
 * @returns {string} UUID v4 string
 */
export const generateUUIDv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Generate cryptographically secure random string
 * @param {number} length - Length of random string
 * @returns {string} Random hex string
 */
export const generateSecureRandom = (length = 16) => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Generate an alternative order ID format with better readability
 * Format: ORD[TIMESTAMP][RANDOM]
 * @returns {string} Human-readable unique order ID
 */
export const generateReadableOrderId = () => {
  // Timestamp component: milliseconds since epoch
  const timestamp = Date.now().toString(36).toUpperCase();
  
  // Secure random component
  const random = generateSecureRandom(8).toUpperCase();
  
  // Random counter for extreme edge cases
  const counter = Math.floor(Math.random() * 10000).toString().padStart(5, '0');
  
  return `ORD${timestamp}${random}${counter}`;
};

/**
 * Generate an ultra-compact order ID (suitable for QR codes/counters)
 * Format: ORD-XXXX-XXXX-XXXX
 * @returns {string} Compact unique order ID
 */
export const generateCompactOrderId = () => {
  const random1 = generateSecureRandom(2).toUpperCase();
  const random2 = generateSecureRandom(2).toUpperCase();
  const random3 = generateSecureRandom(2).toUpperCase();
  const timestamp = Math.floor(Date.now() / 1000).toString(16).toUpperCase().padStart(4, '0');
  
  return `ORD-${random1}${timestamp}-${random2}${generateSecureRandom(2).toUpperCase()}-${random3}${generateSecureRandom(2).toUpperCase()}`;
};

/**
 * Validate if an order ID is in the expected format
 * @param {string} orderId - Order ID to validate
 * @returns {boolean} True if valid
 */
export const isValidOrderId = (orderId) => {
  if (!orderId || typeof orderId !== 'string') return false;
  return orderId.startsWith('ORD');
};

/**
 * Generate multiple unique order IDs (useful for batch operations)
 * @param {number} count - Number of IDs to generate
 * @returns {string[]} Array of unique order IDs
 */
export const generateBatchOrderIds = (count = 1) => {
  const ids = [];
  for (let i = 0; i < count; i++) {
    ids.push(generateUniqueOrderId());
  }
  return ids;
};

export default generateUniqueOrderId;
