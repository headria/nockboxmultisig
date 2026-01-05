"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/context/wallet-context";
import { ensureIrisWasm } from "@/lib/iris-wasm";
import {
  MockCryptoProvider,
  createMockSigner,
  createMultisigLock,
  createSingleSigLock,
  createNote,
  buildSimpleTransaction,
  signSpend,
  getTransactionStatus,
  exportTx,
  importTx,
  formatAmount,
  parseAmount,
} from "@/txBuilder";
import type { Transaction, Note as TxNote, Lock, CryptoProvider, Hash } from "@/txBuilder";
import {
  buildWasmTransaction,
  getFeeReport as getWasmFeeReport,
} from "@/txBuilder/wasmBuilder";
import type {
  ManagedLock,
  Seed as BuilderSeed,
  Spend as BuilderSpend,
  SelectedInput as BuilderSelectedInput,
} from "@/txBuilder/wasmBuilder";
import type { Note as UINote, Pubkey, Output as UIOutput, Seed } from "@/types";

export interface SigningPayload {
  rawTx: RawTx;
  notes: WasmNote[];
  spendConditions: WasmSpendCondition[];
  release: () => void;
}
// Use mock crypto for development
const crypto: CryptoProvider = MockCryptoProvider;

type IrisWasmModule = Awaited<ReturnType<typeof ensureIrisWasm>>;
type WasmTxBuilder = IrisWasmModule["TxBuilder"]["prototype"];
type NockchainTx = IrisWasmModule["NockchainTx"]["prototype"];
type RawTx = IrisWasmModule["RawTx"]["prototype"];
type WasmNote = IrisWasmModule["Note"]["prototype"];
type WasmSpendCondition = IrisWasmModule["SpendCondition"]["prototype"];
type WasmPkh = IrisWasmModule["Pkh"]["prototype"];

interface FeeReport {
  currentFee: bigint | null;
  calculatedFee: bigint | null;
  feeSufficient: boolean;
}

const NICKS_PER_NOCK = 65536n;
const EMPTY_FEE_REPORT: FeeReport = {
  currentFee: null,
  calculatedFee: null,
  feeSufficient: false,
};

// Convert UI Note to txBuilder Note
function uiNoteToTxNote(uiNote: UINote, lock: Lock): TxNote {
  return createNote({
    lock,
    amount: parseAmount(uiNote.amount.toString()),
    sourceDerivation: `${uiNote.txHash}:${uiNote.index}`,
    assetId: uiNote.asset,
    crypto,
  });
}

// Get PKH from pubkey
function getPkh(pubkey: string): Hash {
  return crypto.hashPubkey(pubkey);
}

export interface TransactionBuilderState {
  transaction: Transaction | null;
  error: string | null;
  isBuilding: boolean;
  isSigning: boolean;
  wasmBuilder: WasmTxBuilder | null;
  nockchainTx: NockchainTx | null;
  missingUnlocks: unknown[];
  feeReport: FeeReport;
}

export interface TransactionBuilderActions {
  buildTransaction: (params: {
    notes: UINote[];
    outputs: UIOutput[];
    seeds: Seed[];
    multisigConfig: { m: number; pubkeys: Pubkey[] };
    fee: number;
    changeAddress?: string;
    destinationLock?: { threshold: number; signers: Pubkey[] };
  }) => Promise<Transaction | null>;
  
  signTransaction: (params: {
    pubkey: string;
    noteId?: string;
  }) => Promise<Transaction | null>;
  
  getStatus: () => {
    isFullySigned: boolean;
    spends: Array<{
      noteId: string;
      threshold: number;
      collected: number;
      complete: boolean;
    }>;
  } | null;
  
  exportTransaction: () => string | null;
  importTransaction: (json: string) => Transaction | null;
  reset: () => void;
  getSigningPayload: () => SigningPayload | null;
}

export function useTransactionBuilder(): TransactionBuilderState & TransactionBuilderActions {
  const { wallet } = useWallet();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [wasmBuilder, setWasmBuilder] = useState<WasmTxBuilder | null>(null);
  const [nockchainTx, setNockchainTx] = useState<NockchainTx | null>(null);
  const [missingUnlocks, setMissingUnlocks] = useState<unknown[]>([]);
  const [feeReport, setFeeReport] = useState<FeeReport>(EMPTY_FEE_REPORT);

  const buildTransaction = useCallback(async (params: {
    notes: UINote[];
    outputs: UIOutput[];
    seeds: Seed[];
    multisigConfig: { m: number; pubkeys: Pubkey[] };
    fee: number;
    changeAddress?: string;
    destinationLock?: { threshold: number; signers: Pubkey[] };
  }): Promise<Transaction | null> => {
    setIsBuilding(true);
    setError(null);

    try {
      const { notes, outputs, seeds, multisigConfig, fee, changeAddress, destinationLock } = params;

      if (!wallet.address && multisigConfig.pubkeys.length === 0) {
        throw new Error("Please connect your wallet to build a transaction.");
      }

      const wasm = await ensureIrisWasm();
      const wasmResult = await buildWasmArtifacts({
        wasm,
        notes,
        outputs,
        seeds,
        multisigConfig,
        fee,
        walletAddress: wallet.address,
        changeAddress,
        destinationLock,
      });

      setWasmBuilder(wasmResult.builder);
      setNockchainTx(wasmResult.nockchainTx);
      setMissingUnlocks(wasmResult.missingUnlocks);
      setFeeReport(wasmResult.feeReport);

      // Create the appropriate lock for legacy transaction (for compatibility)
      let lock: Lock;
      if (multisigConfig.pubkeys.length === 0) {
        const defaultPkh = crypto.hashPubkey(wallet.address ?? "default-wallet-pubkey");
        lock = createSingleSigLock(defaultPkh);
      } else {
        const pkhs = multisigConfig.pubkeys.map((pk) => getPkh(pk.pubkey));
        lock = createMultisigLock(multisigConfig.m, pkhs);
      }

      const txNotes = notes.map((n) => uiNoteToTxNote(n, lock));

      const recipients = outputs.map((o) => ({
        address: o.address,
        amount: parseAmount(o.amount.toString()),
      }));

      const seedOutputs = seeds.map((s) => ({
        address: changeAddress || wallet.address || "seed-output",
        amount: parseAmount(s.amount.toString()),
      }));

      const allRecipients = [...recipients, ...seedOutputs];

      const tx = buildSimpleTransaction({
        inputs: txNotes,
        recipients: allRecipients,
        fee: parseAmount(fee.toString()),
        changeAddress,
        crypto,
      });

      setTransaction(tx);
      return tx;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to build transaction";
      setError(message);
      setWasmBuilder(null);
      setNockchainTx(null);
      setMissingUnlocks([]);
      setFeeReport(EMPTY_FEE_REPORT);
      console.error("Build transaction error:", err);
      return null;
    } finally {
      setIsBuilding(false);
    }
  }, [wallet.address]);

  const signTransaction = useCallback(async (params: {
    pubkey: string;
    noteId?: string;
  }): Promise<Transaction | null> => {
    if (!transaction) {
      setError("No transaction to sign");
      return null;
    }

    setIsSigning(true);
    setError(null);

    try {
      const { pubkey, noteId } = params;
      const signer = createMockSigner(pubkey);

      // If noteId specified, sign that spend; otherwise sign all spends
      let signedTx = transaction;
      
      if (noteId) {
        signedTx = await signSpend({
          tx: signedTx,
          noteId,
          signer,
          crypto,
        });
      } else {
        // Sign all spends that this signer can sign
        for (const spend of transaction.spends) {
          if (spend.seeds.kind === "%pkh") {
            const pkh = getPkh(pubkey);
            if (spend.seeds.pkhs.includes(pkh)) {
              try {
                signedTx = await signSpend({
                  tx: signedTx,
                  noteId: spend.noteId,
                  signer,
                  crypto,
                });
              } catch {
                // Already signed or can't sign, continue
              }
            }
          }
        }
      }

      setTransaction(signedTx);
      return signedTx;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign transaction";
      setError(message);
      console.error("Sign transaction error:", err);
      return null;
    } finally {
      setIsSigning(false);
    }
  }, [transaction]);

  const getStatus = useCallback(() => {
    if (!transaction) return null;

    const status = getTransactionStatus(transaction, crypto);
    
    return {
      isFullySigned: status.isFullySigned,
      spends: status.spends.map((s) => ({
        noteId: s.noteId,
        threshold: s.threshold ?? 1,
        collected: s.collected ?? 0,
        complete: s.complete,
      })),
    };
  }, [transaction]);

  const exportTransaction = useCallback(() => {
    if (!transaction) return null;
    return exportTx(transaction);
  }, [transaction]);

  const importTransaction = useCallback((json: string) => {
    try {
      const tx = importTx(json);
      setTransaction(tx);
      setError(null);
      return tx;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to import transaction";
      setError(message);
      return null;
    }
  }, []);

  const getSigningPayload = useCallback((): SigningPayload | null => {
    if (!wasmBuilder || !nockchainTx) return null;
    const txNotes = wasmBuilder.allNotes();
    const rawTx = nockchainTx.toRawTx();

    return {
      rawTx,
      notes: txNotes.notes,
      spendConditions: txNotes.spendConditions,
      release: () => {
        try {
          txNotes.free();
        } catch {
          // ignore
        }
      },
    };
  }, [wasmBuilder, nockchainTx]);

  const reset = useCallback(() => {
    setTransaction(null);
    setError(null);
    setIsBuilding(false);
    setIsSigning(false);
    setWasmBuilder(null);
    setNockchainTx(null);
    setMissingUnlocks([]);
    setFeeReport(EMPTY_FEE_REPORT);
  }, []);

  return {
    transaction,
    error,
    isBuilding,
    isSigning,
    wasmBuilder,
    nockchainTx,
    missingUnlocks,
    feeReport,
    buildTransaction,
    signTransaction,
    getStatus,
    exportTransaction,
    importTransaction,
    reset,
    getSigningPayload,
  };
}

// Utility exports for components
export { formatAmount, parseAmount, getPkh };
export { crypto as cryptoProvider };

interface WasmBuildParams {
  wasm: IrisWasmModule;
  notes: UINote[];
  outputs: UIOutput[];
  seeds: Seed[];
  multisigConfig: { m: number; pubkeys: Pubkey[] };
  fee: number;
  walletAddress?: string | null;
  changeAddress?: string;
  destinationLock?: { threshold: number; signers: Pubkey[] };
}

interface PendingAmount {
  lockId: string;
  amount: bigint;
}

async function buildWasmArtifacts(params: WasmBuildParams): Promise<{
  builder: WasmTxBuilder | null;
  nockchainTx: NockchainTx | null;
  missingUnlocks: unknown[];
  feeReport: FeeReport;
}> {
  const { wasm, notes, outputs, seeds, multisigConfig, fee, walletAddress, changeAddress, destinationLock } = params;

  if (notes.length === 0) {
    throw new Error("Please select at least one note before building a transaction.");
  }

  const managedLocks: ManagedLock[] = [];
  const lockMap = new Map<string, ManagedLock>();

  const spendingLock = createPrimaryLock(wasm, multisigConfig, walletAddress);
  managedLocks.push(spendingLock);
  lockMap.set(spendingLock.id, spendingLock);

  // Create destination multisig lock if configured
  let destinationMultisigLock: ManagedLock | null = null;
  if (destinationLock && destinationLock.signers.length >= 2) {
    const hashes = destinationLock.signers.map((s) => s.pubkey);
    const threshold = Math.max(1, Math.min(destinationLock.threshold, hashes.length));
    const pkh = new wasm.Pkh(BigInt(threshold), hashes);
    const spendCondition = wasm.SpendCondition.newPkh(pkh);
    const protobuf = spendCondition.toProtobuf();
    spendCondition.free();

    destinationMultisigLock = {
      id: `dest-multisig:${threshold}:${hashes.length}`,
      name: `Multisig ${threshold}-of-${hashes.length}`,
      spendConditionProtobuf: protobuf,
    };
    managedLocks.push(destinationMultisigLock);
    lockMap.set(destinationMultisigLock.id, destinationMultisigLock);
  }

  const builderInputs: BuilderSelectedInput[] = notes.map((note, index) => {
    if (!note.protobufNote) {
      throw new Error("A selected note is missing on-chain data. Please refresh notes and try again.");
    }

    const wasmNote = wasm.Note.fromProtobuf(note.protobufNote);
    return {
      id: note.id ?? `note-${index}`,
      lockId: spendingLock.id,
      note: {
        note: wasmNote,
        assets: wasmNote.assets,
        firstName: note.txHash ?? "",
        lastName: String(note.index ?? index),
      },
    };
  });

  const recipientAmounts: PendingAmount[] = [];
  const ensureRecipientLock = (address: string): ManagedLock => {
    const normalized = address?.trim();
    if (!normalized) {
      throw new Error("A valid recipient address is required before adding an output.");
    }

    const key = `recipient:${normalized}`;
    const existing = lockMap.get(key);
    if (existing) return existing;

    const lock = createRecipientLock(wasm, key, normalized);
    managedLocks.push(lock);
    lockMap.set(key, lock);
    return lock;
  };

  outputs.forEach((output) => {
    if (!output.address || output.amount <= 0) return;
    // Use destination multisig lock if configured, otherwise derive from address
    const lock = destinationMultisigLock || ensureRecipientLock(output.address);
    recipientAmounts.push({
      lockId: lock.id,
      amount: toNicks(output.amount),
    });
  });

  if (recipientAmounts.length === 0) {
    throw new Error("Please enter at least one valid recipient with a positive amount.");
  }

  const seedAddress =
    changeAddress?.trim() || walletAddress?.trim() || null;

  if (seeds.length > 0) {
    if (!seedAddress) {
      throw new Error("Please provide a change address or connect your wallet before allocating change outputs.");
    }

    const lock = ensureRecipientLock(seedAddress);
    seeds.forEach((seed) => {
      if (seed.amount <= 0) return;
      recipientAmounts.push({
        lockId: lock.id,
        amount: toNicks(seed.amount),
      });
    });
  }

  const spends: BuilderSpend[] = builderInputs.map((input) => ({
    inputId: input.id,
    input,
    fee: 0n,
    seeds: [],
  }));

  const feeNicks = toNicks(Math.max(0, fee || 0));
  const totalInputs = builderInputs.reduce((sum, input) => sum + input.note.assets, 0n);
  const totalOutputs = recipientAmounts.reduce((sum, item) => sum + item.amount, 0n);

  if (totalOutputs + feeNicks > totalInputs) {
    throw new Error("Selected notes do not have enough balance for outputs plus fees.");
  }

  distributeFeeAcrossSpends(spends, feeNicks);
  distributeAmountsAcrossSpends(spends, recipientAmounts);

  const result = buildWasmTransaction({
    spends,
    locks: managedLocks,
  });

  return {
    builder: result.builder,
    nockchainTx: result.nockchainTx,
    missingUnlocks: result.missingUnlocks,
    feeReport: getWasmFeeReport(result.builder),
  };
}

function createPrimaryLock(
  wasm: IrisWasmModule,
  multisigConfig: { m: number; pubkeys: Pubkey[] },
  walletAddress?: string | null,
): ManagedLock {
  if (multisigConfig.pubkeys.length === 0) {
    const normalized = walletAddress?.trim();
    if (!normalized) {
      throw new Error("Please connect your wallet or supply a valid change address before building.");
    }
    return createRecipientLock(wasm, `pkh:${normalized}`, normalized);
  }

  const hashes = multisigConfig.pubkeys.map((pk) => pk.pubkey);
  const threshold = Math.max(1, Math.min(multisigConfig.m, hashes.length || 1));
  const pkh = new wasm.Pkh(BigInt(threshold), hashes);
  const spendCondition = wasm.SpendCondition.newPkh(pkh);
  const protobuf = spendCondition.toProtobuf();
  spendCondition.free();

  return {
    id: `multisig:${threshold}:${hashes.join(",")}`,
    name: `Multisig ${threshold}-of-${hashes.length}`,
    spendConditionProtobuf: protobuf,
  };
}

function createRecipientLock(wasm: IrisWasmModule, lockId: string, address: string): ManagedLock {
  const normalized = address?.trim();
  if (!normalized) {
    throw new Error("A valid recipient address is required before building the transaction.");
  }

  let pkh: WasmPkh;
  try {
    pkh = wasm.Pkh.single(normalized);
  } catch (err) {
    console.error("Failed to derive PKH for address:", normalized, err);
    throw new Error("Recipient address is not a valid Iris PKH. Please double-check the address and try again.");
  }

  const spendCondition = wasm.SpendCondition.newPkh(pkh);
  const protobuf = spendCondition.toProtobuf();
  spendCondition.free();

  return {
    id: lockId,
    name: `Lock ${address}`,
    spendConditionProtobuf: protobuf,
  };
}

function toNicks(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0n;
  }
  return BigInt(Math.round(amount * Number(NICKS_PER_NOCK)));
}

function getSpendUsed(spend: BuilderSpend): bigint {
  const seedTotal = spend.seeds.reduce((sum, seed) => sum + seed.amount, 0n);
  return spend.fee + seedTotal;
}

function distributeFeeAcrossSpends(spends: BuilderSpend[], totalFee: bigint): void {
  if (totalFee <= 0n) return;
  let remaining = totalFee;

  for (const spend of spends) {
    if (remaining <= 0n) break;
    const capacity = spend.input.note.assets - getSpendUsed(spend);
    if (capacity <= 0n) continue;
    const feeShare = remaining <= capacity ? remaining : capacity;
    spend.fee += feeShare;
    remaining -= feeShare;
  }

  if (remaining > 0n) {
    throw new Error("Unable to allocate enough fee across the selected notes.");
  }
}

function distributeAmountsAcrossSpends(spends: BuilderSpend[], amounts: PendingAmount[]): void {
  const queue = amounts
    .filter((item) => item.amount > 0n)
    .map((item) => ({ ...item }));

  for (const spend of spends) {
    if (queue.length === 0) break;
    let capacity = spend.input.note.assets - getSpendUsed(spend);
    if (capacity <= 0n) continue;

    while (capacity > 0n && queue.length > 0) {
      const target = queue[0];
      const allocation = target.amount <= capacity ? target.amount : capacity;
      const seed: BuilderSeed = {
        lockId: target.lockId,
        amount: allocation,
      };
      spend.seeds.push(seed);
      target.amount -= allocation;
      capacity -= allocation;
      if (target.amount <= 0n) {
        queue.shift();
      }
    }
  }

  if (queue.some((item) => item.amount > 0n)) {
    throw new Error("Unable to allocate outputs across the selected notes. Try selecting more notes.");
  }
}
