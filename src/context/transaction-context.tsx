"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { TransactionData, Note, MultisigConfig, Output, Seed, WizardStep, SignatureRequest, DestinationLock } from "@/types";
import { useTransactionBuilder, type SigningPayload } from "@/hooks/useTransactionBuilder";
import type { Transaction } from "@/txBuilder";
import { 
  saveTransaction, 
  updateTransaction, 
  createTransactionId,
  StoredTransaction 
} from "@/lib/transaction-storage";
import { createJamBlob, exportUnsignedTransaction, type ExportedTxArtifacts } from "@/txBuilder/wasmBuilder";

type TxBuilderHook = ReturnType<typeof useTransactionBuilder>;

interface TransactionContextType {
  currentStep: WizardStep | number;
  setCurrentStep: (step: WizardStep | number) => void;
  transactionData: TransactionData;
  updateSelectedNotes: (notes: Note[]) => void;
  updateMultisigConfig: (config: MultisigConfig) => void;
  updateOutputs: (outputs: Output[]) => void;
  updateSeeds: (seeds: Seed[]) => void;
  updateFee: (fee: number) => void;
  updateDestinationLock: (lock: DestinationLock | undefined) => void;
  signatureRequests: SignatureRequest[];
  updateSignatureRequest: (id: string, signature: string) => void;
  resetTransaction: () => void;
  canProceed: (step: WizardStep | number) => boolean;
  // Transaction builder
  builtTransaction: Transaction | null;
  txError: string | null;
  isBuilding: boolean;
  isSigning: boolean;
  wasmBuilder: TxBuilderHook["wasmBuilder"];
  nockchainTx: TxBuilderHook["nockchainTx"];
  missingUnlocks: TxBuilderHook["missingUnlocks"];
  feeReport: TxBuilderHook["feeReport"];
  buildTx: (overrides?: { outputs?: Output[]; fee?: number }) => Promise<Transaction | null>;
  signTx: (pubkey: string) => Promise<void>;
  getTxStatus: () => { isFullySigned: boolean; spends: Array<{ noteId: string; threshold: number; collected: number; complete: boolean }> } | null;
  exportTx: () => string | null;
  getUnsignedTxArtifacts: () => ExportedTxArtifacts | null;
  downloadUnsignedTx: (filename?: string) => void;
  getSigningPayload: () => SigningPayload | null;
  signedTx: unknown | null;
  setSignedTx: (tx: unknown | null) => void;
  // Storage
  currentTxId: string | null;
  saveToStorage: (walletAddress: string) => void;
  updateStoredTx: (walletAddress: string, updates: Partial<StoredTransaction>) => void;
}

const defaultTransactionData: TransactionData = {
  selectedNotes: [],
  multisigConfig: {
    m: 2,
    n: 3,
    pubkeys: [],
  },
  outputs: [],
  seeds: [],
  fee: 0.001,
};

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const [currentStep, setCurrentStep] = useState<WizardStep | number>(1);
  const [transactionData, setTransactionData] = useState<TransactionData>(defaultTransactionData);
  const [signatureRequests, setSignatureRequests] = useState<SignatureRequest[]>([]);
  const [currentTxId, setCurrentTxId] = useState<string | null>(null);
  const [signedTx, setSignedTx] = useState<unknown | null>(null);
  
  // Transaction builder hook
  const txBuilder = useTransactionBuilder();

  const updateSelectedNotes = useCallback((notes: Note[]) => {
    setTransactionData((prev) => ({ ...prev, selectedNotes: notes }));
  }, []);

  const updateMultisigConfig = useCallback((config: MultisigConfig) => {
    setTransactionData((prev) => ({ ...prev, multisigConfig: config }));
    setSignatureRequests(
      config.pubkeys.map((pk) => ({
        id: pk.id,
        pubkey: pk.pubkey,
        label: pk.label,
        signed: false,
      }))
    );
  }, []);

  const updateOutputs = useCallback((outputs: Output[]) => {
    setTransactionData((prev) => ({ ...prev, outputs }));
  }, []);

  const updateSeeds = useCallback((seeds: Seed[]) => {
    setTransactionData((prev) => ({ ...prev, seeds }));
  }, []);

  const updateFee = useCallback((fee: number) => {
    setTransactionData((prev) => ({ ...prev, fee }));
  }, []);

  const updateDestinationLock = useCallback((lock: DestinationLock | undefined) => {
    setTransactionData((prev) => ({ ...prev, destinationLock: lock }));
  }, []);

  const updateSignatureRequest = useCallback((id: string, signature: string) => {
    setSignatureRequests((prev) =>
      prev.map((req) =>
        req.id === id ? { ...req, signed: true, signature } : req
      )
    );
  }, []);

  const resetTransaction = useCallback(() => {
    setCurrentStep(1);
    setTransactionData(defaultTransactionData);
    setSignatureRequests([]);
    txBuilder.reset();
    setSignedTx(null);
  }, [txBuilder]);

  // Build transaction using txBuilder
  const buildTx = useCallback(async (overrides?: { outputs?: Output[]; fee?: number }) => {
    setSignedTx(null);
    const tx = await txBuilder.buildTransaction({
      notes: transactionData.selectedNotes,
      outputs: overrides?.outputs ?? transactionData.outputs,
      seeds: transactionData.seeds,
      multisigConfig: {
        m: transactionData.multisigConfig.m,
        pubkeys: transactionData.multisigConfig.pubkeys,
      },
      fee: overrides?.fee ?? transactionData.fee,
      // Pass destination lock for multisig outputs
      destinationLock: transactionData.destinationLock ? {
        threshold: transactionData.destinationLock.threshold,
        signers: transactionData.destinationLock.signers,
      } : undefined,
    });
    return tx;
  }, [txBuilder, transactionData]);

  // Sign transaction
  const signTx = useCallback(async (pubkey: string) => {
    const tx = await txBuilder.signTransaction({ pubkey });
    if (tx) {
      // Update signature requests based on tx status
      const status = txBuilder.getStatus();
      if (status) {
        setSignatureRequests((prev) =>
          prev.map((req) => {
            // Check if this pubkey's signature is now in the tx
            const spend = status.spends[0];
            if (spend && spend.collected > prev.filter((r) => r.signed).length) {
              // A new signature was added
              if (req.pubkey === pubkey) {
                return { ...req, signed: true, signature: "sig_" + pubkey.slice(0, 8) };
              }
            }
            return req;
          })
        );
      }
    }
  }, [txBuilder]);

  const canProceed = useCallback(
    (step: WizardStep | number): boolean => {
      switch (step) {
        case 1: // Outputs & Seeds
          return transactionData.outputs.length > 0;
        case 2: // Configure Multisig
          return (
            transactionData.multisigConfig.pubkeys.length >= transactionData.multisigConfig.n &&
            transactionData.multisigConfig.m <= transactionData.multisigConfig.n &&
            transactionData.multisigConfig.m >= 1
          );
        case 3: // Fees & Review
          return transactionData.fee > 0 && transactionData.selectedNotes.length > 0;
        case 4: // Sign & Broadcast
          return signatureRequests.filter((r) => r.signed).length >= transactionData.multisigConfig.m;
        default:
          return false;
      }
    },
    [transactionData, signatureRequests]
  );

  const getUnsignedTxArtifacts = useCallback((): ExportedTxArtifacts | null => {
    if (!txBuilder.nockchainTx) return null;
    return exportUnsignedTransaction(txBuilder.nockchainTx);
  }, [txBuilder.nockchainTx]);

  const downloadUnsignedTx = useCallback(
    (filename = "unsigned-tx.jam") => {
      const artifacts = getUnsignedTxArtifacts();
      if (!artifacts) return;
      createJamBlob(artifacts.unsignedBytes, filename);
    },
    [getUnsignedTxArtifacts],
  );

  // Save current transaction to local storage
  const saveToStorage = useCallback((walletAddress: string) => {
    if (!walletAddress) return;
    
    const txId = currentTxId || createTransactionId();
    if (!currentTxId) {
      setCurrentTxId(txId);
    }
    
    const isSingleSigner = transactionData.multisigConfig.pubkeys.length === 0;
    const totalAmount = transactionData.outputs.reduce((sum, o) => sum + o.amount, 0);
    const recipient = transactionData.outputs[0]?.address || "";
    
    const storedTx: StoredTransaction = {
      id: txId,
      type: isSingleSigner ? "single" : "multisig",
      amount: totalAmount,
      recipient,
      fee: transactionData.fee,
      unsignedTxHex: txBuilder.exportTransaction() || undefined,
      status: "pending",
      requiredSigs: isSingleSigner ? 1 : transactionData.multisigConfig.m,
      collectedSigs: signatureRequests.filter(r => r.signed).length,
      signers: isSingleSigner 
        ? [{ pubkey: walletAddress, label: "Your Wallet", signed: false }]
        : transactionData.multisigConfig.pubkeys.map(pk => ({
            pubkey: pk.pubkey,
            label: pk.label,
            signed: signatureRequests.find(r => r.pubkey === pk.pubkey)?.signed || false,
          })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    saveTransaction(walletAddress, storedTx);
  }, [currentTxId, transactionData, signatureRequests, txBuilder]);

  // Update stored transaction
  const updateStoredTx = useCallback((walletAddress: string, updates: Partial<StoredTransaction>) => {
    if (!walletAddress || !currentTxId) return;
    updateTransaction(walletAddress, currentTxId, updates);
  }, [currentTxId]);

  return (
    <TransactionContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        transactionData,
        updateSelectedNotes,
        updateMultisigConfig,
        updateOutputs,
        updateSeeds,
        updateFee,
        updateDestinationLock,
        signatureRequests,
        updateSignatureRequest,
        resetTransaction,
        canProceed,
        // Transaction builder
        builtTransaction: txBuilder.transaction,
        txError: txBuilder.error,
        isBuilding: txBuilder.isBuilding,
        isSigning: txBuilder.isSigning,
        wasmBuilder: txBuilder.wasmBuilder,
        nockchainTx: txBuilder.nockchainTx,
        missingUnlocks: txBuilder.missingUnlocks,
        feeReport: txBuilder.feeReport,
        buildTx,
        signTx,
        getTxStatus: txBuilder.getStatus,
        exportTx: txBuilder.exportTransaction,
        getUnsignedTxArtifacts,
        downloadUnsignedTx,
        getSigningPayload: txBuilder.getSigningPayload,
        signedTx,
        setSignedTx,
        // Storage
        currentTxId,
        saveToStorage,
        updateStoredTx,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransaction() {
  const context = useContext(TransactionContext);
  if (context === undefined) {
    throw new Error("useTransaction must be used within a TransactionProvider");
  }
  return context;
}
