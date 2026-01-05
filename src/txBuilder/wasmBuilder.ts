import { wasm } from "@nockbox/iris-sdk";
import { ensureIrisWasm } from "@/lib/iris-wasm";

export interface ManagedLock {
  id: string;
  name: string;
  spendConditionProtobuf: Uint8Array;
}

export interface NoteData {
  note: wasm.Note;
  assets: bigint;
  firstName: string;
  lastName: string;
}

export interface SelectedInput {
  lockId: string;
  note: NoteData;
  id: string;
}

export interface Seed {
  lockId: string;
  amount: bigint;
  autoRefund?: boolean;
}

export interface Spend {
  inputId: string;
  input: SelectedInput;
  fee: bigint;
  seeds: Seed[];
}

export interface BuildArgs {
  spends: Spend[];
  locks: ManagedLock[];
  preimages?: Iterable<[string, Uint8Array]> | Map<string, Uint8Array>;
  feePerWord?: bigint;
}

export interface BuildResult {
  builder: wasm.TxBuilder | null;
  nockchainTx: wasm.NockchainTx | null;
  missingUnlocks: unknown[];
}

const JAM_MIME = "application/jam";
const DEFAULT_FEE_PER_WORD = 32768n; // 0.5 NOCK per word

export function calculateSpendTotals(spend: Spend): {
  totalOutgoing: bigint;
  remaining: bigint;
} {
  const seedsTotal = spend.seeds.reduce((sum, seed) => sum + seed.amount, 0n);
  const totalOutgoing = spend.fee + seedsTotal;
  const remaining = spend.input.note.assets - totalOutgoing;
  return { totalOutgoing, remaining };
}

export function isSpendBalanced(spend: Spend): boolean {
  const { totalOutgoing } = calculateSpendTotals(spend);
  return totalOutgoing <= spend.input.note.assets;
}

function getRemainingBalance(spend: Spend): bigint {
  return calculateSpendTotals(spend).remaining;
}

function addRefundSeed(
  spend: Spend,
  spendBuilder: wasm.SpendBuilder,
  defaultLock: ManagedLock,
): void {
  const remaining = getRemainingBalance(spend);
  if (remaining <= 0n) return;

  const refundSeedCondition = wasm.SpendCondition.fromProtobuf(
    defaultLock.spendConditionProtobuf,
  );
  const refundSeed = new wasm.Seed(
    null,
    wasm.LockRoot.fromSpendCondition(refundSeedCondition),
    remaining,
    wasm.NoteData.empty(),
    spend.input.note.note.hash(),
  );

  spendBuilder.seed(refundSeed);
}

function applyAllPreimages(
  builder: wasm.TxBuilder,
  preimages?: Iterable<[string, Uint8Array]> | Map<string, Uint8Array>,
): void {
  if (!preimages) return;
  const entries = preimages instanceof Map ? preimages.entries() : preimages;
  for (const [, jam] of entries) {
    try {
      builder.addPreimage(jam);
    } catch {
      // ignore
    }
  }
}

export function collectMissingUnlocks(builder: wasm.TxBuilder): unknown[] {
  const spends = builder.allSpends();
  const allMissing: unknown[] = [];
  const seen = new Set<string>();

  for (const spend of spends) {
    const missing = spend.missingUnlocks();
    for (const unlock of missing) {
      const key = JSON.stringify(unlock);
      if (!seen.has(key)) {
        seen.add(key);
        allMissing.push(unlock);
      }
    }
    spend.free();
  }

  return allMissing;
}

export function buildWasmTransaction(args: BuildArgs): BuildResult {
  const { spends, locks, preimages, feePerWord } = args;

  const allBalanced = spends.length > 0 && spends.every(isSpendBalanced);
  if (!allBalanced) {
    return { builder: null, nockchainTx: null, missingUnlocks: [] };
  }

  try {
    const builder = new wasm.TxBuilder(feePerWord ?? DEFAULT_FEE_PER_WORD);

    for (const spend of spends) {
      const lock = locks.find((l) => l.id === spend.input.lockId);
      if (!lock) continue;

      const refundLockProtobuf =
        spend.seeds.length > 0
          ? locks.find((l) => l.id === spend.seeds[0]?.lockId)?.spendConditionProtobuf
          : lock.spendConditionProtobuf;

      const noteClone = wasm.Note.fromProtobuf(spend.input.note.note.toProtobuf());
      const spendConditionClone = wasm.SpendCondition.fromProtobuf(
        lock.spendConditionProtobuf,
      );
      const refundLockClone = refundLockProtobuf
        ? wasm.SpendCondition.fromProtobuf(refundLockProtobuf)
        : null;

      const spendBuilder = new wasm.SpendBuilder(
        noteClone,
        spendConditionClone,
        refundLockClone,
      );

      for (const seed of spend.seeds) {
        const seedLock = locks.find((l) => l.id === seed.lockId);
        if (!seedLock) continue;

        const seedSpendCondition = wasm.SpendCondition.fromProtobuf(
          seedLock.spendConditionProtobuf,
        );
        const seedObj = new wasm.Seed(
          null,
          wasm.LockRoot.fromSpendCondition(seedSpendCondition),
          seed.amount,
          wasm.NoteData.empty(),
          spend.input.note.note.hash(),
        );
        spendBuilder.seed(seedObj);
      }

      addRefundSeed(spend, spendBuilder, lock);

      if (spend.fee > 0n) {
        spendBuilder.fee(spend.fee);
      }

      spendBuilder.computeRefund(false);
      builder.spend(spendBuilder);
    }

    applyAllPreimages(builder, preimages);
    const missingUnlocks = collectMissingUnlocks(builder);

    let nockchainTx: wasm.NockchainTx | null = null;
    try {
      nockchainTx = builder.build();
    } catch {
      nockchainTx = null;
    }

    return { builder, nockchainTx, missingUnlocks };
  } catch (error) {
    console.error("Failed to build WASM transaction", error);
    return { builder: null, nockchainTx: null, missingUnlocks: [] };
  }
}

export interface ExportedTxArtifacts {
  unsignedBytes: Uint8Array;
  rawBytes: Uint8Array;
  txId: string;
}

export function exportUnsignedTransaction(tx: wasm.NockchainTx): ExportedTxArtifacts {
  const rawTx = tx.toRawTx();
  const protobuf = rawTx.toProtobuf();
  const unsignedBytes = new Uint8Array(new TextEncoder().encode(JSON.stringify(protobuf)));
  const rawBytes = new Uint8Array(rawTx.toJam());
  const txId = tx.id.value ?? tx.id.toString();
  return { unsignedBytes, rawBytes, txId };
}

export function exportSignedTransaction(tx: wasm.NockchainTx): ExportedTxArtifacts {
  return exportUnsignedTransaction(tx);
}

export function createJamBlob(bytes: Uint8Array, filename: string): void {
  const normalized = new Uint8Array(bytes);
  const blob = new Blob([normalized], { type: JAM_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function decodeUnsignedTransaction(jamBytes: any): Promise<wasm.RawTx> {
  await ensureIrisWasm();
  if (jamBytes instanceof Uint8Array) {
    // Try RawTx.fromJam first
    try {
      return wasm.RawTx.fromJam(jamBytes);
    } catch {
      // Fall back to NockchainTx.fromJam then convert
      const nockTx = wasm.NockchainTx.fromJam(jamBytes);
      return nockTx.toRawTx();
    }
  } else if (typeof jamBytes === 'string') {
    const parsed = JSON.parse(jamBytes);
    return wasm.RawTx.fromProtobuf(parsed);
  } else {
    // Already a JS object (parsed JSON)
    return wasm.RawTx.fromProtobuf(jamBytes);
  }
}

export async function decodeSignedTransaction(jamBytes: any): Promise<wasm.RawTx> {
  await ensureIrisWasm();
  if (jamBytes instanceof Uint8Array) {
    // Try RawTx.fromJam first
    try {
      return wasm.RawTx.fromJam(jamBytes);
    } catch {
      // Fall back to NockchainTx.fromJam then convert
      const nockTx = wasm.NockchainTx.fromJam(jamBytes);
      return nockTx.toRawTx();
    }
  } else if (typeof jamBytes === 'string') {
    const parsed = JSON.parse(jamBytes);
    return wasm.RawTx.fromProtobuf(parsed);
  } else {
    // Already a JS object (parsed JSON)
    return wasm.RawTx.fromProtobuf(jamBytes);
  }
}

export function getFeeReport(builder: wasm.TxBuilder | null): {
  currentFee: bigint | null;
  calculatedFee: bigint | null;
  feeSufficient: boolean;
} {
  if (!builder) {
    return { currentFee: null, calculatedFee: null, feeSufficient: false };
  }

  let calcFee: bigint;
  try {
    calcFee = builder.calcFee();
  } catch (error) {
    console.warn("Failed to calculate fee", error);
    return { currentFee: null, calculatedFee: null, feeSufficient: false };
  }

  let curFee: bigint;
  try {
    curFee = builder.curFee();
  } catch (error) {
    console.warn("Failed to read current fee", error);
    return { currentFee: null, calculatedFee: calcFee, feeSufficient: false };
  }

  return {
    currentFee: curFee,
    calculatedFee: calcFee,
    feeSufficient: curFee >= calcFee,
  };
}
