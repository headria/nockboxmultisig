


export type Hex = string;      // "deadbeef..."
export type Hash = string;     // protocol hash, typically hex
export type PubKey = string;   // chain-specific (hex/base58/etc)
export type Address = string;  // chain-specific
export type Signature = string;

export type NoteName = readonly [string, string]; // [hash(lock), source derivation]

/** A UTXO / Note */
export interface Note {
  name: NoteName;       // [hash(lock), source derivation]
  assetId?: string;
  amount: bigint;
  lock: Lock;
}

/** Derive a stable string ID if you want a single key */
export function noteIdFromName(name: NoteName): string {
  return `${name[0]}.${name[1]}`;
}

/** Lock primitives */
export type Lock =
  | { kind: "%pkh"; threshold: number; pkhs: Hash[] } // M-of-N pubkey-hashes
  | { kind: "%hax"; hash: Hash }                      // preimage lock (optional extension)
  | { kind: "%tim"; notBefore: number; inner: Lock }  // time lock wrapping another lock
  | { kind: "%brn" };                                 // impossible/burn

/** Output */
export interface Output {
  address: Address;
  amount: bigint;
  assetId?: string;
}

/** Spend (spend one note) */
export interface Spend {
  noteId: string; // derived from Note.name
  seeds: Seeds;
}

/** Seeds = proofs/witnesses */
export type Seeds =
  | PkhSeeds
  | HaxSeeds
  | TimSeeds
  | BrnSeeds;

export interface PkhSeeds {
  kind: "%pkh";
  threshold: number;
  pkhs: Hash[]; // normalized sorted list
  /** pubkey -> signature; membership validated by hashPubkey(pubkey) ∈ pkhs */
  signatures: Record<PubKey, Signature>;
}

export interface HaxSeeds {
  kind: "%hax";
  preimage?: Hex; // optional until provided
}

export interface TimSeeds {
  kind: "%tim";
  notBefore: number;
  inner: Seeds;
}

export interface BrnSeeds {
  kind: "%brn";
}

/** Transaction */
export interface Transaction {
  version: number;
  network?: string;
  spends: Spend[];
  outputs: Output[];
  fee: bigint;

  // derived
  unsignedHash: Hash;
}

/** Signer abstraction */
export interface Signer {
  pubkey: PubKey;
  sign(message: Uint8Array): Promise<Signature>;
}

/** Crypto primitives (chain-specific) */
export interface CryptoProvider {
  /** Hash arbitrary bytes -> protocol hash */
  hash(data: Uint8Array): Hash;

  /** Hash a pubkey into PKH as used by %pkh locks */
  hashPubkey(pubkey: PubKey): Hash;

  /** Verify signature over message */
  verify(pubkey: PubKey, message: Uint8Array, sig: Signature): boolean;
}

/* ------------------------------------------
   Deterministic canonical encoding helpers
------------------------------------------ */

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (typeof v === "bigint" ? `n:${v.toString()}` : v),
    0
  );
}

export function deepCanonicalize<T>(
  value: T,
  opts?: { sortArrays?: boolean; arraySortKey?: (x: unknown) => string }
): T {
  const sortArrays = opts?.sortArrays ?? false;
  const arraySortKey = opts?.arraySortKey ?? ((x) => canonicalStringify(x));

  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;

    if (Array.isArray(v)) {
      const mapped = v.map(walk);
      if (!sortArrays) return mapped;
      return mapped.slice().sort((a, b) => {
        const ka = arraySortKey(a);
        const kb = arraySortKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
    }

    const keys = Object.keys(v).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = walk((v as Record<string, unknown>)[k]);
    return out;
  };

  return walk(value) as T;
}

export function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/* ------------------------------------------
   Lock canonical encoding + hashing
------------------------------------------ */

/** Deterministic lock encoding so hash(lock) is stable across builders */
export function encodeLock(lock: Lock): Uint8Array {
  const canonical = canonicalizeLock(lock);
  return utf8ToBytes(canonicalStringify(canonical));
}

function canonicalizeLock(lock: Lock): unknown {
  switch (lock.kind) {
    case "%pkh":
      return deepCanonicalize({
        kind: "%pkh",
        threshold: lock.threshold,
        pkhs: lock.pkhs.slice().sort(),
      });

    case "%hax":
      return deepCanonicalize({
        kind: "%hax",
        hash: lock.hash,
      });

    case "%tim":
      return deepCanonicalize({
        kind: "%tim",
        notBefore: lock.notBefore,
        inner: canonicalizeLock(lock.inner),
      });

    case "%brn":
      return { kind: "%brn" };

    default: {
      const _never: never = lock;
      return _never;
    }
  }
}

/** hash(lock) used for note.name[0] */
export function lockHash(lock: Lock, crypto: CryptoProvider): Hash {
  return crypto.hash(encodeLock(lock));
}

/** Convenience: build Note.name with consistent lock hash */
export function buildNoteName(args: {
  lock: Lock;
  sourceDerivation: string;
  crypto: CryptoProvider;
}): NoteName {
  return [lockHash(args.lock, args.crypto), args.sourceDerivation] as const;
}

/** Guard: ensure note.name[0] matches hash(lock) */
export function assertNoteNameMatchesLock(note: Note, crypto: CryptoProvider): void {
  const expected = lockHash(note.lock, crypto);
  if (note.name[0] !== expected) {
    throw new Error(`Note.name[0] mismatch: expected ${expected}, got ${note.name[0]}`);
  }
}

/** Optional: validate a list of notes */
export function validateNotes(notes: Note[], crypto: CryptoProvider): void {
  for (const n of notes) {
    assertNoteNameMatchesLock(n, crypto);
    if (n.amount <= 0n) throw new Error("Note amount must be > 0.");
  }
}

/* ------------------------------------------
   Unsigned payload encoding (what signers sign)
------------------------------------------ */

/**
 * Deterministic encoding of unsigned payload.
 * Everyone signs EXACTLY this bytes output.
 */
export function encodeUnsignedPayload(tx: Omit<Transaction, "unsignedHash">): Uint8Array {
  const canonical = deepCanonicalize(
    {
      version: tx.version,
      network: tx.network ?? null,
      fee: tx.fee,

      // deterministic order
      spends: tx.spends
        .slice()
        .sort((a, b) => (a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0))
        .map((s) => ({
          noteId: s.noteId,
          seeds: canonicalizeSeeds(s.seeds),
        })),

      outputs: tx.outputs
        .slice()
        .sort((a, b) => {
          const aa = `${a.assetId ?? ""}|${a.address}|${a.amount.toString()}`;
          const bb = `${b.assetId ?? ""}|${b.address}|${b.amount.toString()}`;
          return aa < bb ? -1 : aa > bb ? 1 : 0;
        })
        .map((o) => ({
          address: o.address,
          amount: o.amount,
          assetId: o.assetId ?? null,
        })),
    },
    { sortArrays: false }
  );

  return utf8ToBytes(canonicalStringify(canonical));
}

function canonicalizeSeeds(seeds: Seeds): unknown {
  switch (seeds.kind) {
    case "%pkh": {
      const pkhs = seeds.pkhs.slice().sort();
      const sigEntries = Object.entries(seeds.signatures)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([pubkey, signature]) => ({ pubkey, signature }));

      return deepCanonicalize({
        kind: "%pkh",
        threshold: seeds.threshold,
        pkhs,
        sigEntries,
      });
    }

    case "%hax":
      return deepCanonicalize({ kind: "%hax", preimage: seeds.preimage ?? null });

    case "%tim":
      return deepCanonicalize({
        kind: "%tim",
        notBefore: seeds.notBefore,
        inner: canonicalizeSeeds(seeds.inner),
      });

    case "%brn":
      return { kind: "%brn" };

    default: {
      const _never: never = seeds;
      return _never;
    }
  }
}

/* ------------------------------------------
   Locks -> Seeds, Notes -> Spends
------------------------------------------ */

export function assertValidPkhLock(lock: Extract<Lock, { kind: "%pkh" }>): void {
  const uniq = new Set(lock.pkhs);
  if (uniq.size !== lock.pkhs.length) throw new Error("Lock pkhs must be unique.");
  if (lock.threshold <= 0) throw new Error("Threshold must be > 0.");
  if (lock.threshold > lock.pkhs.length) throw new Error("Threshold cannot exceed number of pkhs.");
}

export function seedsFromLock(lock: Lock): Seeds {
  switch (lock.kind) {
    case "%pkh":
      assertValidPkhLock(lock);
      return {
        kind: "%pkh",
        threshold: lock.threshold,
        pkhs: lock.pkhs.slice().sort(),
        signatures: {},
      };

    case "%hax":
      return { kind: "%hax" };

    case "%tim":
      return { kind: "%tim", notBefore: lock.notBefore, inner: seedsFromLock(lock.inner) };

    case "%brn":
      return { kind: "%brn" };

    default: {
      const _never: never = lock;
      return _never;
    }
  }
}

export function buildSpends(notes: Note[]): Spend[] {
  const sorted = notes
    .slice()
    .sort((a, b) => {
      const ida = noteIdFromName(a.name);
      const idb = noteIdFromName(b.name);
      return ida < idb ? -1 : ida > idb ? 1 : 0;
    });

  return sorted.map((n) => ({
    noteId: noteIdFromName(n.name),
    seeds: seedsFromLock(n.lock),
  }));
}

export function sumInputs(notes: Note[]): bigint {
  return notes.reduce((acc, n) => acc + n.amount, 0n);
}

export function sumOutputs(outputs: Output[]): bigint {
  return outputs.reduce((acc, o) => acc + o.amount, 0n);
}

/* ------------------------------------------
   Build unsigned transaction
------------------------------------------ */

export function buildUnsignedTransaction(args: {
  version?: number;
  network?: string;
  notes: Note[];
  outputs: Output[];
  fee: bigint;
  change?: Output | null;
  crypto: CryptoProvider;
}): Transaction {
  const version = args.version ?? 1;

  // strict note consistency
  validateNotes(args.notes, args.crypto);

  const outputs: Output[] = args.change ? [...args.outputs, args.change] : [...args.outputs];

  if (outputs.length === 0) throw new Error("At least one output is required.");
  for (const o of outputs) if (o.amount <= 0n) throw new Error("Output amount must be > 0.");
  if (args.fee < 0n) throw new Error("Fee cannot be negative.");

  const inputTotal = sumInputs(args.notes);
  const outputTotal = sumOutputs(outputs);
  if (inputTotal < outputTotal + args.fee) {
    throw new Error(`Insufficient funds: inputs=${inputTotal} outputs+fee=${outputTotal + args.fee}`);
  }

  const spends = buildSpends(args.notes);

  const base: Omit<Transaction, "unsignedHash"> = {
    version,
    network: args.network,
    spends,
    outputs,
    fee: args.fee,
  };

  const bytes = encodeUnsignedPayload(base);
  const unsignedHash = args.crypto.hash(bytes);

  return { ...base, unsignedHash };
}

/* ------------------------------------------
   %pkh signing / verification / collection
------------------------------------------ */

function pkhIsAllowed(crypto: CryptoProvider, pubkey: PubKey, pkhs: readonly Hash[]): boolean {
  const pkh = crypto.hashPubkey(pubkey);
  console.log("pkhIsAllowed", pubkey, pkh, pkhs);
  // Check both the hash and the pubkey directly (for base58 format compatibility)
  return pkhs.includes(pkh) || pkhs.includes(pubkey as Hash);
}

export function countCollectedPkh(seeds: PkhSeeds, crypto: CryptoProvider): number {
  // Count unique PKHs that have at least one signature provided
  const seenPkhs = new Set<Hash>();
  let count = 0;

  for (const pubkey of Object.keys(seeds.signatures)) {
    const pkh = crypto.hashPubkey(pubkey);
    console.log("countCollectedPkh", count, pkh, seeds.pkhs);
    // Check both hash and direct match for base58 format compatibility
    if (!seeds.pkhs.includes(pkh) && !seeds.pkhs.includes(pubkey as Hash)) continue;
    if (seenPkhs.has(pkh)) continue;
    seenPkhs.add(pkh);
    count++;
  }
  return count;
}

export function isPkhComplete(seeds: PkhSeeds, crypto: CryptoProvider): boolean {
  return countCollectedPkh(seeds, crypto) >= seeds.threshold;
}

/** Attach sig (validates membership by PKH) */
export function attachSignatureToSpend(args: {
  tx: Transaction;
  noteId: string;
  pubkey: PubKey;
  signature: Signature;
  crypto: CryptoProvider;
}): Transaction {
  const { tx, noteId, pubkey, signature, crypto } = args;

  const spends = tx.spends.map((s) => {
    if (s.noteId !== noteId) return s;

    if (s.seeds.kind !== "%pkh") throw new Error("attachSignatureToSpend: only %pkh supported.");

    const seeds = s.seeds;
    if (!pkhIsAllowed(crypto, pubkey, seeds.pkhs)) {
      throw new Error("Signer not allowed: hash(pubkey) not in lock pkhs.");
    }

    return {
      ...s,
      seeds: {
        ...seeds,
        signatures: { ...seeds.signatures, [pubkey]: signature },
      },
    };
  });

  return { ...tx, spends };
}

/** Verify signature over canonical unsigned payload */
export function verifySignatureOnTx(args: {
  tx: Transaction;
  pubkey: PubKey;
  signature: Signature;
  crypto: CryptoProvider;
}): boolean {
  const { tx, pubkey, signature, crypto } = args;

  const unsigned: Omit<Transaction, "unsignedHash"> = {
    version: tx.version,
    network: tx.network,
    spends: tx.spends,
    outputs: tx.outputs,
    fee: tx.fee,
  };

  const bytes = encodeUnsignedPayload(unsigned);
  return crypto.verify(pubkey, bytes, signature);
}

/** Sign and attach signature for a specific spend */
export async function signSpend(args: {
  tx: Transaction;
  noteId: string;
  signer: Signer;
  crypto: CryptoProvider;
}): Promise<Transaction> {
  const { tx, noteId, signer, crypto } = args;

  const target = tx.spends.find((s) => s.noteId === noteId);
  if (!target) throw new Error("Unknown noteId for spend.");
  if (target.seeds.kind !== "%pkh") throw new Error("signSpend: only %pkh supported.");

  // membership check
  if (!pkhIsAllowed(crypto, signer.pubkey, target.seeds.pkhs)) {
    throw new Error("Signer not in lock: hash(pubkey) not in pkhs.");
  }

  const unsigned: Omit<Transaction, "unsignedHash"> = {
    version: tx.version,
    network: tx.network,
    spends: tx.spends,
    outputs: tx.outputs,
    fee: tx.fee,
  };

  const bytes = encodeUnsignedPayload(unsigned);
  const sig = await signer.sign(bytes);

  if (!crypto.verify(signer.pubkey, bytes, sig)) {
    throw new Error("Signature verification failed.");
  }

  return attachSignatureToSpend({ tx, noteId, pubkey: signer.pubkey, signature: sig, crypto });
}

/* ------------------------------------------
   Seed satisfaction (recursive) + fully signed
------------------------------------------ */

function isSeedsSatisfied(seeds: Seeds, crypto: CryptoProvider, now?: number): boolean {
  switch (seeds.kind) {
    case "%pkh":
      return isPkhComplete(seeds, crypto);

    case "%hax":
      return !!seeds.preimage;

    case "%tim": {
      const t = now ?? Math.floor(Date.now() / 1000);
      if (t < seeds.notBefore) return false;
      return isSeedsSatisfied(seeds.inner, crypto, now);
    }

    case "%brn":
      return false;

    default: {
      const _never: never = seeds;
      return _never;
    }
  }
}

export function isTransactionFullySigned(tx: Transaction, crypto: CryptoProvider, now?: number): boolean {
  return tx.spends.every((s) => isSeedsSatisfied(s.seeds, crypto, now));
}

/* ------------------------------------------
   Export / Import (share unsigned/partial signed)
------------------------------------------ */

export function exportTx(tx: Transaction): string {
  const canonical = deepCanonicalize(tx, { sortArrays: false });
  return canonicalStringify(canonical);
}

export function importTx(json: string): Transaction {
  const parsed = JSON.parse(json, (_k, v) => {
    if (typeof v === "string" && v.startsWith("n:")) return BigInt(v.slice(2));
    return v;
  });

  if (typeof parsed?.version !== "number") throw new Error("Invalid tx: missing version.");
  if (typeof parsed?.unsignedHash !== "string") throw new Error("Invalid tx: missing unsignedHash.");
  if (!Array.isArray(parsed?.spends)) throw new Error("Invalid tx: missing spends.");
  if (!Array.isArray(parsed?.outputs)) throw new Error("Invalid tx: missing outputs.");

  return parsed as Transaction;
}

export async function signImportedTxJson(args: {
  json: string;
  signer: Signer;
  crypto: CryptoProvider;
}): Promise<string> {
  const tryImport = (src: string): Transaction => {
    try {
      return importTx(src);
    } catch {
      /* ignore */
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(src, (_k, v) => {
        if (typeof v === "string" && v.startsWith("n:")) return BigInt(v.slice(2));
        return v;
      });
    } catch {
      throw new Error("Invalid JSON input");
    }

    if (typeof parsed === "string") {
      return tryImport(parsed);
    }

    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (typeof o.signedTxHex === "string") return tryImport(o.signedTxHex);
      if (typeof o.unsignedTxHex === "string") return tryImport(o.unsignedTxHex);
      if (
        typeof (o as { version?: unknown }).version === "number" &&
        typeof (o as { unsignedHash?: unknown }).unsignedHash === "string" &&
        Array.isArray((o as { spends?: unknown }).spends) &&
        Array.isArray((o as { outputs?: unknown }).outputs)
      ) {
        return o as unknown as Transaction;
      }
    }

    throw new Error("Invalid transaction format");
  };

  const parsed = tryImport(args.json);

  let next = parsed;
  for (const spend of parsed.spends) {
    try {
      next = await signSpend({ tx: next, noteId: spend.noteId, signer: args.signer, crypto: args.crypto });
    } catch {
      /* ignore */
    }
  }

  return exportTx(next);
}

/* ------------------------------------------
   Merge partially signed txs
------------------------------------------ */

export function mergePartiallySignedTx(a: Transaction, b: Transaction): Transaction {
  if (a.unsignedHash !== b.unsignedHash) {
    throw new Error("Cannot merge: unsignedHash differs.");
  }

  const bByNote = new Map(b.spends.map((s) => [s.noteId, s]));

  const spends: Spend[] = a.spends.map((sa) => {
    const sb = bByNote.get(sa.noteId);
    if (!sb) return sa;

    if (sa.seeds.kind !== sb.seeds.kind) {
      throw new Error(`Cannot merge: seeds kind mismatch for ${sa.noteId}`);
    }

    if (sa.seeds.kind === "%pkh") {
      const A = sa.seeds;
      const B = sb.seeds as PkhSeeds;

      if (A.threshold !== B.threshold) throw new Error("Cannot merge: threshold differs.");
      if (canonicalStringify(A.pkhs.slice().sort()) !== canonicalStringify(B.pkhs.slice().sort())) {
        throw new Error("Cannot merge: pkhs differ.");
      }

      return {
        ...sa,
        seeds: {
          ...A,
          signatures: { ...A.signatures, ...B.signatures },
        },
      };
    }

    if (sa.seeds.kind === "%hax") {
      return {
        ...sa,
        seeds: { kind: "%hax" as const, preimage: sa.seeds.preimage ?? (sb.seeds as HaxSeeds).preimage },
      };
    }

    if (sa.seeds.kind === "%tim") {
      const A = sa.seeds as TimSeeds;
      const B = sb.seeds as TimSeeds;
      if (A.notBefore !== B.notBefore) throw new Error("Cannot merge: timelock notBefore differs.");

      return {
        ...sa,
        seeds: {
          kind: "%tim" as const,
          notBefore: A.notBefore,
          inner: mergeSeeds(A.inner, B.inner),
        },
      };
    }

    if (sa.seeds.kind === "%brn") return sa;

    const _never: never = sa.seeds;
    return _never;
  });

  return { ...a, spends };
}

function mergeSeeds(a: Seeds, b: Seeds): Seeds {
  if (a.kind !== b.kind) throw new Error("Cannot merge seeds: kind differs.");

  if (a.kind === "%pkh") {
    const A = a as PkhSeeds;
    const B = b as PkhSeeds;
    if (A.threshold !== B.threshold) throw new Error("Cannot merge pkh seeds: threshold differs.");
    if (canonicalStringify(A.pkhs.slice().sort()) !== canonicalStringify(B.pkhs.slice().sort())) {
      throw new Error("Cannot merge pkh seeds: pkhs differ.");
    }
    return { ...A, signatures: { ...A.signatures, ...B.signatures } };
  }

  if (a.kind === "%hax") {
    const A = a as HaxSeeds;
    const B = b as HaxSeeds;
    return { kind: "%hax", preimage: A.preimage ?? B.preimage };
  }

  if (a.kind === "%tim") {
    const A = a as TimSeeds;
    const B = b as TimSeeds;
    if (A.notBefore !== B.notBefore) throw new Error("Cannot merge tim seeds: notBefore differs.");
    return { kind: "%tim", notBefore: A.notBefore, inner: mergeSeeds(A.inner, B.inner) };
  }

  if (a.kind === "%brn") return { kind: "%brn" };

  const _never: never = a;
  return _never;
}
