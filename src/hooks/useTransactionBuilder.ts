"use client";

import { useCallback, useState } from "react";
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
import type {
  Transaction,
  Note as TxNote,
  Lock,
  CryptoProvider,
  Hash,
} from "@/txBuilder";
import type { Note as UINote, Pubkey, Output as UIOutput, Seed } from "@/types";

// Use mock crypto for development
const crypto: CryptoProvider = MockCryptoProvider;

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
}

export interface TransactionBuilderActions {
  buildTransaction: (params: {
    notes: UINote[];
    outputs: UIOutput[];
    seeds: Seed[];
    multisigConfig: { m: number; pubkeys: Pubkey[] };
    fee: number;
    changeAddress?: string;
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
}

export function useTransactionBuilder(): TransactionBuilderState & TransactionBuilderActions {
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const buildTransaction = useCallback(async (params: {
    notes: UINote[];
    outputs: UIOutput[];
    seeds: Seed[];
    multisigConfig: { m: number; pubkeys: Pubkey[] };
    fee: number;
    changeAddress?: string;
  }): Promise<Transaction | null> => {
    setIsBuilding(true);
    setError(null);

    try {
      const { notes, outputs, seeds, multisigConfig, fee, changeAddress } = params;

      // Create the appropriate lock based on whether we have multisig pubkeys
      let lock: Lock;
      if (multisigConfig.pubkeys.length === 0) {
        // Single-signer mode: use a default PKH from the wallet
        // For now, create a mock single-sig lock with a placeholder PKH
        const defaultPkh = crypto.hashPubkey("default-wallet-pubkey");
        lock = createSingleSigLock(defaultPkh);
      } else {
        // Multisig mode: create multisig lock from pubkeys
        const pkhs = multisigConfig.pubkeys.map((pk) => getPkh(pk.pubkey));
        lock = createMultisigLock(multisigConfig.m, pkhs);
      }

      // Convert UI notes to tx notes with the lock
      const txNotes = notes.map((n) => uiNoteToTxNote(n, lock));

      // Build recipients from outputs
      const recipients = outputs.map((o) => ({
        address: o.address,
        amount: parseAmount(o.amount.toString()),
      }));

      // Add seeds as additional outputs (to self/change address)
      const seedOutputs = seeds.map((s) => ({
        address: changeAddress || "seed-output",
        amount: parseAmount(s.amount.toString()),
      }));

      const allRecipients = [...recipients, ...seedOutputs];

      // Build the transaction
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
      console.error("Build transaction error:", err);
      return null;
    } finally {
      setIsBuilding(false);
    }
  }, []);

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

  const reset = useCallback(() => {
    setTransaction(null);
    setError(null);
    setIsBuilding(false);
    setIsSigning(false);
  }, []);

  return {
    transaction,
    error,
    isBuilding,
    isSigning,
    buildTransaction,
    signTransaction,
    getStatus,
    exportTransaction,
    importTransaction,
    reset,
  };
}

// Utility exports for components
export { formatAmount, parseAmount, getPkh };
export { crypto as cryptoProvider };
