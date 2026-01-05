

import type {
  Note,
  Lock,
  Output,
  Transaction,
  CryptoProvider,
  PkhSeeds,
  Hash,
  PubKey,
} from './tx-core';
import {
  buildNoteName,
  noteIdFromName,
  buildUnsignedTransaction,
  countCollectedPkh,
  isTransactionFullySigned,
} from './tx-core';

/* ------------------------------------------
   Lock builders
------------------------------------------ */

/**
 * Create a simple single-signature lock.
 */
export function createSingleSigLock(pkh: Hash): Lock {
  return { kind: '%pkh', threshold: 1, pkhs: [pkh] };
}

/**
 * Create an M-of-N multisig lock.
 */
export function createMultisigLock(threshold: number, pkhs: Hash[]): Lock {
  if (threshold <= 0) throw new Error('Threshold must be > 0');
  if (threshold > pkhs.length) throw new Error('Threshold cannot exceed number of PKHs');
  if (new Set(pkhs).size !== pkhs.length) throw new Error('PKHs must be unique');
  
  return { kind: '%pkh', threshold, pkhs: pkhs.slice().sort() };
}

/**
 * Create a timelock that wraps another lock.
 */
export function createTimeLock(notBefore: number, inner: Lock): Lock {
  return { kind: '%tim', notBefore, inner };
}

/**
 * Create a hash-preimage lock.
 */
export function createHashLock(hash: Hash): Lock {
  return { kind: '%hax', hash };
}

/**
 * Create a burn lock (unspendable).
 */
export function createBurnLock(): Lock {
  return { kind: '%brn' };
}

/* ------------------------------------------
   Note builders
------------------------------------------ */

/**
 * Create a Note with consistent name derivation.
 */
export function createNote(args: {
  lock: Lock;
  amount: bigint;
  sourceDerivation: string;
  assetId?: string;
  crypto: CryptoProvider;
}): Note {
  const name = buildNoteName({
    lock: args.lock,
    sourceDerivation: args.sourceDerivation,
    crypto: args.crypto,
  });

  return {
    name,
    amount: args.amount,
    lock: args.lock,
    assetId: args.assetId,
  };
}

/* ------------------------------------------
   Transaction status helpers
------------------------------------------ */

export interface SpendStatus {
  noteId: string;
  lockKind: string;
  threshold?: number;
  collected?: number;
  signers?: PubKey[];
  complete: boolean;
}

export interface TransactionStatus {
  unsignedHash: Hash;
  totalInputs: bigint;
  totalOutputs: bigint;
  fee: bigint;
  spends: SpendStatus[];
  isFullySigned: boolean;
}

/**
 * Get detailed status of a transaction for UI display.
 */
export function getTransactionStatus(tx: Transaction, crypto: CryptoProvider): TransactionStatus {
  const spends: SpendStatus[] = tx.spends.map((s) => {
    const base = {
      noteId: s.noteId,
      lockKind: s.seeds.kind,
    };

    if (s.seeds.kind === '%pkh') {
      const seeds = s.seeds as PkhSeeds;
      const collected = countCollectedPkh(seeds, crypto);
      return {
        ...base,
        threshold: seeds.threshold,
        collected,
        signers: Object.keys(seeds.signatures),
        complete: collected >= seeds.threshold,
      };
    }

    if (s.seeds.kind === '%hax') {
      return {
        ...base,
        complete: !!s.seeds.preimage,
      };
    }

    if (s.seeds.kind === '%tim') {
      return {
        ...base,
        complete: false, // Simplified
      };
    }

    return {
      ...base,
      complete: false,
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const totalInputs = tx.spends.reduce((acc, _s) => {
    // Note: We don't have access to input amounts here
    // In a real app, you'd track this separately
    return acc;
  }, 0n);

  const totalOutputs = tx.outputs.reduce((acc, o) => acc + o.amount, 0n);

  return {
    unsignedHash: tx.unsignedHash,
    totalInputs,
    totalOutputs,
    fee: tx.fee,
    spends,
    isFullySigned: isTransactionFullySigned(tx, crypto),
  };
}

/* ------------------------------------------
   Multisig coordination helpers
------------------------------------------ */

export interface MultisigParticipant {
  pubkey: PubKey;
  pkh: Hash;
  hasSigned: boolean;
}

/**
 * Get the list of participants and their signing status for a %pkh spend.
 */
export function getMultisigParticipants(
  seeds: PkhSeeds,
  crypto: CryptoProvider,
  knownPubkeys?: Map<Hash, PubKey>
): MultisigParticipant[] {
  const signedPkhs = new Set<Hash>();
  const pubkeyByPkh = new Map<Hash, PubKey>();

  // Map signed pubkeys to their PKHs
  for (const pubkey of Object.keys(seeds.signatures)) {
    const pkh = crypto.hashPubkey(pubkey);
    signedPkhs.add(pkh);
    pubkeyByPkh.set(pkh, pubkey);
  }

  // Merge with known pubkeys
  if (knownPubkeys) {
    for (const [pkh, pubkey] of knownPubkeys) {
      if (!pubkeyByPkh.has(pkh)) {
        pubkeyByPkh.set(pkh, pubkey);
      }
    }
  }

  return seeds.pkhs.map((pkh) => ({
    pubkey: pubkeyByPkh.get(pkh) ?? `unknown:${pkh.slice(0, 8)}...`,
    pkh,
    hasSigned: signedPkhs.has(pkh),
  }));
}

/**
 * Check if a specific pubkey can sign a spend.
 */
export function canPubkeySign(pubkey: PubKey, seeds: PkhSeeds, crypto: CryptoProvider): boolean {
  const pkh = crypto.hashPubkey(pubkey);
  return seeds.pkhs.includes(pkh);
}

/**
 * Check if a specific pubkey has already signed a spend.
 */
export function hasPubkeySigned(pubkey: PubKey, seeds: PkhSeeds): boolean {
  return pubkey in seeds.signatures;
}

/* ------------------------------------------
   Fee calculation
------------------------------------------ */

export const DEFAULT_FEE_PER_WORD_NICKS = 32768n;
const DEFAULT_BYTES_PER_WORD = 8;

export interface FeePerWordEstimate {
  feePerWordNicks: bigint;
  bytesPerWord: number;
  wordCount: bigint;
  feeNicks: bigint;
}

export function feeNicksToNock(feeNicks: bigint): number {
  return Number(feeNicks) / 65536;
}

export function estimateFeePerWordFromByteLength(args: {
  byteLength: number;
  feePerWordNicks?: bigint;
  bytesPerWord?: number;
}): FeePerWordEstimate {
  const feePerWordNicks = args.feePerWordNicks ?? DEFAULT_FEE_PER_WORD_NICKS;
  const bytesPerWord = args.bytesPerWord ?? DEFAULT_BYTES_PER_WORD;

  const wordCount = BigInt(Math.ceil(Math.max(0, args.byteLength) / bytesPerWord));
  const feeNicks = wordCount * feePerWordNicks;

  return { feePerWordNicks, bytesPerWord, wordCount, feeNicks };
}

export function estimateFeePerWordFromBytes(args: {
  bytes: Uint8Array;
  feePerWordNicks?: bigint;
  bytesPerWord?: number;
}): FeePerWordEstimate {
  return estimateFeePerWordFromByteLength({
    byteLength: args.bytes.length,
    feePerWordNicks: args.feePerWordNicks,
    bytesPerWord: args.bytesPerWord,
  });
}

export function getFeeTiersFromFeeNicks(args: {
  feeNicks: bigint;
}): { low: number; medium: number; high: number } {
  const base = feeNicksToNock(args.feeNicks);

  return {
    low: Math.max(0.0001, base),
    medium: Math.max(0.0001, base * 1.25),
    high: Math.max(0.0001, base * 2),
  };
}

/* ------------------------------------------
   Simple transaction builder for UI
------------------------------------------ */

export interface SimpleTxParams {
  inputs: Note[];
  recipients: { address: string; amount: bigint }[];
  fee: bigint;
  changeAddress?: string;
  crypto: CryptoProvider;
}

/**
 * Build a transaction with automatic change calculation.
 */
export function buildSimpleTransaction(params: SimpleTxParams): Transaction {
  const { inputs, recipients, fee, changeAddress, crypto } = params;

  const totalIn = inputs.reduce((acc, n) => acc + n.amount, 0n);
  const totalOut = recipients.reduce((acc, r) => acc + r.amount, 0n);
  const changeAmount = totalIn - totalOut - fee;

  if (changeAmount < 0n) {
    throw new Error(`Insufficient funds: need ${totalOut + fee}, have ${totalIn}`);
  }

  const outputs: Output[] = recipients.map((r) => ({
    address: r.address,
    amount: r.amount,
  }));

  let change: Output | null = null;
  if (changeAmount > 0n && changeAddress) {
    change = { address: changeAddress, amount: changeAmount };
  }

  return buildUnsignedTransaction({
    notes: inputs,
    outputs,
    fee,
    change,
    crypto,
  });
}

/* ------------------------------------------
   Formatting helpers for UI
------------------------------------------ */

/**
 * Format a bigint amount for display (assumes 8 decimal places).
 */
export function formatAmount(amount: bigint, decimals = 8): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  
  if (fracStr === '') return whole.toString();
  return `${whole}.${fracStr}`;
}

/**
 * Parse a decimal string into bigint (assumes 8 decimal places).
 */
export function parseAmount(str: string, decimals = 8): bigint {
  const [whole, frac = ''] = str.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded);
}

/**
 * Truncate a hash for display.
 */
export function truncateHash(hash: string, chars = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`;
}

/**
 * Get a short identifier for a note.
 */
export function getNoteShortId(note: Note): string {
  const id = noteIdFromName(note.name);
  return truncateHash(id, 6);
}

