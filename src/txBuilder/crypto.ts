 

import type { CryptoProvider, Hash, PubKey, Signature } from './tx-core';

/* ------------------------------------------
   FNV-1a 64-bit hash (fast, non-cryptographic)
   Used for deterministic hashing in testing
------------------------------------------ */

function fnv1a64(bytes: Uint8Array): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}

function fnv1aHash(data: Uint8Array): Hash {
  const h = fnv1a64(data);
  return h.toString(16).padStart(16, '0');
}

/* ------------------------------------------
   Mock Crypto Provider (for testing/demo)
------------------------------------------ */

/**
 * Mock crypto provider using FNV-1a hashing.
 * Signatures are just `mock-sig:${pubkey}:${hash(message)}`.
 * Useful for testing without real cryptographic operations.
 */
export const MockCryptoProvider: CryptoProvider = {
  hash(data: Uint8Array): Hash {
    return fnv1aHash(data);
  },

  hashPubkey(pubkey: PubKey): Hash {
    const bytes = new TextEncoder().encode(pubkey);
    return fnv1aHash(bytes);
  },

  verify(pubkey: PubKey, message: Uint8Array, sig: Signature): boolean {
    const msgHash = fnv1aHash(message);
    const expected = `mock-sig:${pubkey}:${msgHash}`;
    return sig === expected;
  },
};

/**
 * Create a mock signer for testing.
 */
export function createMockSigner(pubkey: PubKey) {
  return {
    pubkey,
    async sign(message: Uint8Array): Promise<Signature> {
      const msgHash = fnv1aHash(message);
      return `mock-sig:${pubkey}:${msgHash}`;
    },
  };
}

/* ------------------------------------------
   Web Crypto Provider (SHA-256 based)
------------------------------------------ */

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Async crypto provider using Web Crypto API.
 * Note: This requires async operations, so we provide sync wrappers
 * that cache results or use a simpler hash for synchronous contexts.
 */
export const WebCryptoProvider: CryptoProvider = {
  hash(data: Uint8Array): Hash {
    // For sync operation, use FNV-1a
    // In real production, you'd want to use the async version
    return fnv1aHash(data);
  },

  hashPubkey(pubkey: PubKey): Hash {
    const bytes = new TextEncoder().encode(pubkey);
    return fnv1aHash(bytes);
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verify(_pubkey: PubKey, _message: Uint8Array, _sig: Signature): boolean {
    // In production, implement actual signature verification
    // For now, return true for demo purposes
    console.warn('WebCryptoProvider.verify: Not implemented, returning true');
    return true;
  },
};

/**
 * Async hash function using SHA-256.
 * Use this when you need cryptographically secure hashing.
 */
export async function sha256Hash(data: Uint8Array): Promise<Hash> {
  const hashBytes = await sha256(data);
  return bytesToHex(hashBytes);
}

/**
 * Async pubkey hash using SHA-256.
 */
export async function sha256PubkeyHash(pubkey: PubKey): Promise<Hash> {
  const bytes = new TextEncoder().encode(pubkey);
  const hashBytes = await sha256(bytes);
  return bytesToHex(hashBytes);
}
