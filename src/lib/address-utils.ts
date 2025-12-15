// address-utils.ts
// Nockchain addresses are Base58-encoded (likely PKH or pubkey, similar to Bitcoin)

// Common Base58 alphabet (Bitcoin-style, no 0OIl)
// const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Regex for strict validation
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{40,60}$/; // Typical length range; adjust if known

/**
 * Basic validation for Nockchain recipient address
 * - Checks Base58 characters only
 * - Length reasonable (30-50 chars common for Base58 PKH)
 * - Starts with valid char (e.g., not invalid prefix if known)
 */
export function isValidNockchainAddress(address: string): boolean {
  if (typeof address !== 'string') return false;
  if (!BASE58_REGEX.test(address.trim())) return false;

  // Optional: Add checksum if protocol has one (like Bitcoin Bech32/Base58Check)
  // Currently no info → basic check sufficient for assignment

  return true;
}

/**
 * Validate recipient address and return error message if invalid
 */
export function validateRecipientAddress(address: string): string | null {
  if (!address || address.trim() === '') {
    return 'Address is required';
  }
  
  if (!isValidNockchainAddress(address)) {
    return 'Invalid address format. Must be 30-50 Base58 characters.';
  }
  
  return null; // Valid
}
