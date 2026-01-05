"use client";

import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet } from "@/context/wallet-context";
import {
  StoredTransaction,
  getPendingTransactions,
  getCompletedTransactions,
  saveTransaction,
  updateTransaction,
  createTransactionId,
} from "@/lib/transaction-storage";
import { countCollectedPkh, createMockSigner, exportTx, formatAmount, importTx, MockCryptoProvider, signSpend, type CryptoProvider, type Transaction } from "@/txBuilder";
import { decodeSignedTransaction, decodeUnsignedTransaction } from "@/txBuilder/wasmBuilder";
import { wasmTxToTransaction } from "@/txBuilder/wasmConversion";
import { signTxWithIris } from "@/txBuilder/helpers2";

// Utility function for base64 encoding
const uint8ToBase64 = (uint8: Uint8Array): string => btoa(String.fromCharCode(...uint8));
import {
  FileText,
  Clock,
  CheckCircle2,
  Pen,
  Eye,
  Wallet,
  Loader2,
  RefreshCw,
  Upload,
  Download,
  Copy,
  Send
} from "lucide-react";
import { toast } from "sonner";

export default function TransactionsPage() {
  const { wallet, connect, isConnecting, signRawTx, broadcastTransaction } = useWallet();
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingTransactions, setPendingTransactions] = useState<StoredTransaction[]>([]);
  const [completedTransactions, setCompletedTransactions] = useState<StoredTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signingTxId, setSigningTxId] = useState<string | null>(null);
  const [broadcastingTxId, setBroadcastingTxId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState("overview");
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  const normalizeHex = (value: string): string => {
    const trimmed = value.trim();
    const no0x = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
    return no0x.toLowerCase();
  };

  const pkhAwareCrypto: CryptoProvider = {
    ...MockCryptoProvider,
    hashPubkey(pubkey: string) {
      const normalized = normalizeHex(pubkey);
      const isHex = /^[0-9a-f]+$/i.test(normalized);
      if (isHex && normalized.length === 16) return normalized;
      return MockCryptoProvider.hashPubkey(pubkey);
    },
  };

  const truncateMiddle = (s: string, left = 10, right = 8) => {
    if (!s) return s;
    if (s.length <= left + right + 3) return s;
    return `${s.slice(0, left)}...${s.slice(-right)}`;
  };

  const parseTxJsonLenient = (raw: string): string => {
    const text = raw.trim();
    try {
      importTx(text);
      return text;
    } catch {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") {
        const next = parsed;
        importTx(next);
        return next;
      }

      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.signedTxHex === "string") {
          const next = obj.signedTxHex;
          importTx(next);
          return next;
        }
        if (typeof obj.unsignedTxHex === "string") {
          const next = obj.unsignedTxHex;
          importTx(next);
          return next;
        }
      }

      const next = JSON.stringify(parsed);
      importTx(next);
      return next;
    }
  };

  const parseStoredTx = (tx: StoredTransaction): Transaction | null => {
    // Try unsignedTxHex first, then signedTxHex, then sourceJson
    const candidates = [tx.unsignedTxHex, tx.signedTxHex, tx.sourceJson].filter(Boolean) as string[];
    console.log('parseStoredTx candidates count:', candidates.length);
    for (const src of candidates) {
      try {
        const parsed = JSON.parse(src);
        
        // Skip if it looks like a signedTxProtobuf wrapper (not a Transaction)
        if (parsed.signedTxProtobuf) {
          console.log('parseStoredTx: skipping signedTxProtobuf wrapper');
          continue;
        }
        // Skip if it looks like a wallet payload (has rawTx)
        if (parsed.rawTx) {
          console.log('parseStoredTx: skipping wallet payload format');
          continue;
        }
        // Only try to parse if it looks like a Transaction (has spends array)
        if (!parsed.spends || !Array.isArray(parsed.spends)) {
          console.log('parseStoredTx: skipping non-Transaction format (no spends array)');
          continue;
        }
        
        const result = importTx(parseTxJsonLenient(src));
        console.log('parseStoredTx parsed successfully');
        return result;
      } catch (e) {
        console.log('parseStoredTx error for candidate:', e);
        // try next candidate
      }
    }
    return null;
  };

  type WalletSignPayload = {
    rawTx: unknown;
    notes: unknown[];
    spendConditions: unknown[];
  };

  const safeJsonParse = (value: string): unknown | null => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const unwrapJsonString = (value: unknown, maxDepth = 3): unknown => {
    let cur: unknown = value;
    for (let i = 0; i < maxDepth; i++) {
      if (typeof cur !== "string") break;
      const parsed = safeJsonParse(cur);
      if (parsed === null) break;
      cur = parsed;
    }
    return cur;
  };

  const extractWalletSignPayload = (root: unknown): WalletSignPayload | null => {
    const seen = new Set<unknown>();

    const getKey = (obj: Record<string, unknown>, keys: string[]): unknown => {
      for (const k of keys) {
        if (k in obj) return obj[k];
      }
      return undefined;
    };

    const visit = (value: unknown): WalletSignPayload | null => {
      const v = unwrapJsonString(value);

      if (!v || typeof v !== "object") return null;
      if (seen.has(v)) return null;
      seen.add(v);

      if (Array.isArray(v)) {
        for (const item of v) {
          const found = visit(item);
          if (found) return found;
        }
        return null;
      }

      const obj = v as Record<string, unknown>;
      const rawTx = getKey(obj, ["rawTx", "raw_tx", "rawtx"]);
      const notes = getKey(obj, ["notes", "txNotes", "tx_notes"]);
      const spendConditions = getKey(obj, ["spendConditions", "spend_conditions", "spendconditions"]);

      const normalizedNotes = Array.isArray(notes)
        ? notes
        : notes && typeof notes === "object" && Array.isArray((notes as { notes?: unknown }).notes)
          ? ((notes as { notes: unknown[] }).notes)
          : null;

      const normalizedSpendConditions = Array.isArray(spendConditions)
        ? spendConditions
        : spendConditions && typeof spendConditions === "object" && Array.isArray((spendConditions as { spendConditions?: unknown }).spendConditions)
          ? ((spendConditions as { spendConditions: unknown[] }).spendConditions)
          : null;

      if (rawTx !== undefined && normalizedNotes && normalizedSpendConditions) {
        return {
          rawTx,
          notes: normalizedNotes,
          spendConditions: normalizedSpendConditions,
        };
      }

      for (const child of Object.values(obj)) {
        const found = visit(child);
        if (found) return found;
      }

      return null;
    };

    return visit(root);
  };

  const getWalletSignPayloadFromStoredTx = (tx: StoredTransaction): WalletSignPayload | null => {
    const candidates = [tx.sourceJson, tx.unsignedTxHex, tx.signedTxHex].filter(Boolean) as string[];
    for (const src of candidates) {
      const parsed = safeJsonParse(src);
      if (parsed === null) continue;
      const found = extractWalletSignPayload(parsed);
      if (found) return found;
    }
    return null;
  };

  const safeStringifyForStorage = (value: unknown): string => {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return `n:${v.toString()}`;
      if (v instanceof Uint8Array) return Array.from(v);
      return v;
    });
  };

  const deriveSignersFromTx = (parsed: Transaction) => {
    const pkhs = new Set<string>();
    const signedPkhs = new Set<string>();
    const signedPubkeys = new Set<string>(); // Direct pubkey matches

    for (const spend of parsed.spends) {
      if (spend.seeds.kind !== "%pkh") continue;
      for (const pkh of spend.seeds.pkhs) pkhs.add(pkh.toLowerCase());
      // signatures is Record<string, string> - iterate over its keys
      for (const pubkey of Object.keys(spend.seeds.signatures)) {
        signedPkhs.add(pkhAwareCrypto.hashPubkey(pubkey).toLowerCase());
        signedPubkeys.add(pubkey.toLowerCase()); // Also store direct pubkey
      }
    }

    return Array.from(pkhs)
      .sort()
      .map((pkh) => ({
        pubkey: pkh,
        label: `PKH ${pkh.slice(0, 6)}…${pkh.slice(-4)}`,
        // Check both hashed and direct matches for base58 format compatibility
        signed: signedPkhs.has(pkh) || signedPubkeys.has(pkh),
      }));
  };

  const getTxView = (tx: StoredTransaction) => {
    const parsed = parseStoredTx(tx);
    if (!parsed) {
      return {
        parsed: null as Transaction | null,
        outputs: [] as Array<{ address: string; amount: string }>,
        amount: tx.amount,
        amountDisplay: tx.amount.toString(),
        fee: tx.fee,
        feeDisplay: tx.fee.toString(),
        recipient: tx.recipient,
        requiredSigs: tx.requiredSigs,
        collectedSigs: tx.collectedSigs,
        signers: tx.signers,
        spendsCount: 0,
        unsignedHash: tx.txHash ?? null,
      };
    }

    const outputs = parsed.outputs.map((o) => ({
      address: o.address,
      amount: formatAmount(o.amount),
    }));

    const amountDisplay = formatAmount(parsed.outputs.reduce((acc, o) => acc + o.amount, 0n));
    const feeDisplay = formatAmount(parsed.fee);
    const amountN = Number.parseFloat(amountDisplay);
    const feeN = Number.parseFloat(feeDisplay);

    const pkhSpends = parsed.spends.filter((s) => s.seeds.kind === "%pkh");
    const requiredSigs = pkhSpends.length ? Math.max(...pkhSpends.map((s) => (s.seeds.kind === "%pkh" ? s.seeds.threshold : 1))) : tx.requiredSigs;
    const collectedSigs = pkhSpends.length
      ? Math.min(...pkhSpends.map((s) => (s.seeds.kind === "%pkh" ? countCollectedPkh(s.seeds, pkhAwareCrypto) : 0)))
      : tx.collectedSigs;

    const signers = deriveSignersFromTx(parsed);
    const recipient = outputs[0]?.address ?? tx.recipient;
    
    // Fall back to stored values when parsed values are 0/empty
    const finalFee = (Number.isFinite(feeN) && feeN > 0) ? feeN : tx.fee;
    const finalRecipient = recipient && recipient !== 'unknown' ? recipient : tx.recipient;

    return {
      parsed,
      outputs,
      // Fall back to stored tx.amount if calculated amount is 0 (e.g., empty outputs from JAM import)
      amount: (Number.isFinite(amountN) && amountN > 0) ? amountN : tx.amount,
      amountDisplay: (Number.isFinite(amountN) && amountN > 0) ? amountDisplay : Number(tx.amount).toFixed(2),
      fee: finalFee,
      feeDisplay: finalFee > 0 ? finalFee.toFixed(2) : feeDisplay,
      recipient: finalRecipient,
      requiredSigs,
      collectedSigs,
      signers: signers.length ? signers : tx.signers,
      spendsCount: parsed.spends.length,
      unsignedHash: parsed.unsignedHash,
    };
  };

  const prettyJson = (json: string): string => {
    try {
      const parsed = JSON.parse(json, (_k, v) => {
        if (typeof v === "string" && v.startsWith("n:")) return BigInt(v.slice(2));
        return v;
      });
      return JSON.stringify(
        parsed,
        (_k, v) => (typeof v === "bigint" ? `n:${v.toString()}` : v),
        2
      );
    } catch {
      return json;
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const hasWalletSignedStoredTx = (tx: StoredTransaction): boolean => {
    if (!wallet.address) return false;
    
    const walletAddr = wallet.address;
    
    // First check the stored signers array (updated after signing)
    const walletSigner = tx.signers.find(s => 
      s.pubkey === walletAddr || 
      s.pubkey.toLowerCase() === walletAddr.toLowerCase()
    );
    if (walletSigner?.signed) {
      return true;
    }
    
    // Fall back to checking parsed transaction signatures
    const parsed = parseStoredTx(tx);
    if (!parsed) return false;

    const candidates = new Set<string>();
    candidates.add(walletAddr); // Add raw address for base58 comparison
    candidates.add(normalizeHex(walletAddr));
    candidates.add(pkhAwareCrypto.hashPubkey(walletAddr));
    candidates.add(pkhAwareCrypto.hashPubkey(normalizeHex(walletAddr)));

    for (const spend of parsed.spends) {
      if (spend.seeds.kind !== "%pkh") continue;
      
      // Check if wallet address is in pkhs (for base58 format)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (spend.seeds.pkhs.includes(walletAddr as any)) {
        // Now check if there's a signature from this wallet
        for (const pubkey of Object.keys(spend.seeds.signatures)) {
          if (pubkey === walletAddr || 
              normalizeHex(pkhAwareCrypto.hashPubkey(pubkey)) === normalizeHex(pkhAwareCrypto.hashPubkey(walletAddr))) {
            return true;
          }
        }
      }
      
      // Original logic for hex format
      for (const pubkey of Object.keys(spend.seeds.signatures)) {
        const signedPkh = normalizeHex(pkhAwareCrypto.hashPubkey(pubkey));
        if (Array.from(candidates).some((c) => normalizeHex(c) === signedPkh)) return true;
      }
    }

    return false;
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !wallet.address) return;

    try {
      const isJamFile = file.name.toLowerCase().endsWith('.jam') || file.name.toLowerCase().endsWith('.tx');
      
      let txJson: string | undefined;
      let jamData: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawTx: any;
      let isSigned = false;
      let walletPayloadJson: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let walletPayloadNotes: any[] = []; // Store notes for amount extraction
      
      // FIRST: Try to read as text and check for wallet payload format (has rawTx, notes, spendConditions)
      // This takes priority over all other formats
      const fileText = await file.text();
      try {
        const parsed = JSON.parse(fileText);
        if (parsed && typeof parsed === 'object' && parsed.rawTx !== undefined) {
          console.log('Detected wallet payload format:', {
            hasRawTx: true,
            hasNotes: Array.isArray(parsed.notes),
            hasSpendConditions: Array.isArray(parsed.spendConditions),
          });
          
          // It's a wallet payload - decode the rawTx directly
          walletPayloadJson = fileText; // Save original for sourceJson
          walletPayloadNotes = parsed.notes || []; // Save notes for amount extraction
          
          try {
            rawTx = await decodeSignedTransaction(parsed.rawTx);
            isSigned = true;
            console.log('Wallet payload: decoded as signed transaction');
          } catch (signedErr) {
            console.log('Wallet payload: not signed, trying unsigned:', signedErr);
            try {
              rawTx = await decodeUnsignedTransaction(parsed.rawTx);
              console.log('Wallet payload: decoded as unsigned transaction');
            } catch (unsignedErr) {
              console.error('Wallet payload decode failed:', unsignedErr);
              throw new Error(`Invalid wallet payload: ${String(unsignedErr)}`);
            }
          }
          
          jamData = btoa(fileText);
        }
      } catch (jsonErr) {
        // Not valid JSON, continue with other formats
        console.log('File is not JSON:', jsonErr);
      }
      
      // If not wallet payload, try other formats
      if (!rawTx) {
        if (isJamFile) {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          
          // Check if file is likely text (JSON) or binary
          const isLikelyBinary = bytes.some(b => b === 0) || 
            bytes.slice(0, 100).filter(b => b < 32 && b !== 9 && b !== 10 && b !== 13).length > 10;
          
          if (!isLikelyBinary) {
            const raw = new TextDecoder().decode(bytes);
            
            // Try parsing as internal Transaction JSON first
            let txJsonTemp: string | undefined;
            try {
              txJsonTemp = parseTxJsonLenient(raw);
            } catch {
              txJsonTemp = undefined;
            }
            
            if (txJsonTemp) {
              txJson = txJsonTemp;
              jamData = uint8ToBase64(bytes);
              isSigned = true;
            } else {
              // Try as JAM (base64 first, then JSON protobuf, then binary)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let parsed: any;
              try {
                const jamBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
                parsed = jamBytes;
              } catch {
                try {
                  parsed = JSON.parse(raw);
                } catch {
                  parsed = bytes;
                }
              }
              console.log('Parsed as JAM:', typeof parsed);
              
              try {
                rawTx = await decodeSignedTransaction(parsed);
                isSigned = true;
              } catch (e) {
                try {
                  rawTx = await decodeUnsignedTransaction(parsed);
                } catch (e2) {
                  throw new Error(`Invalid JAM file: ${String(e)} / ${String(e2)}`);
                }
              }
              jamData = uint8ToBase64(bytes);
            }
          } else {
            // Binary JAM file
            console.log('Binary JAM file, length:', bytes.length);
            try {
              rawTx = await decodeSignedTransaction(bytes);
              isSigned = true;
            } catch (e) {
              try {
                rawTx = await decodeUnsignedTransaction(bytes);
              } catch (e2) {
                throw new Error(`Invalid JAM file: ${String(e)} / ${String(e2)}`);
              }
            }
            jamData = uint8ToBase64(bytes);
          }
        } else {
          // Regular JSON import
          try {
            txJson = parseTxJsonLenient(fileText);
          } catch {
            txJson = undefined;
          }
        }
      }

      // Convert rawTx to transaction if needed
      let transaction: Transaction | undefined;
      let extractedSigners: { pubkey: string; label: string; signed: boolean }[] = [];
      
      if (rawTx) {
        const result = await wasmTxToTransaction(rawTx);
        transaction = result.transaction;
        console.log('Converted transaction:', JSON.stringify(transaction, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
        if (!txJson && transaction) {
          txJson = exportTx(transaction);
          console.log('Exported txJson:', txJson);
        }
        
        // If we don't have a wallet payload from the file, try to create one from conversion result
        if (!walletPayloadJson) {
          try {
            const rawTxProtobuf = typeof rawTx.toProtobuf === 'function' ? rawTx.toProtobuf() : rawTx;
            walletPayloadJson = JSON.stringify({
              rawTx: rawTxProtobuf,
              notes: result.notes || [],
              spendConditions: result.spendConditions || [],
            }, (k, v) => typeof v === 'bigint' ? v.toString() : v);
          } catch (e) {
            console.log('Failed to create wallet payload:', e);
          }
        }
        
        // Extract signers from the transaction's spends
        for (const spend of transaction.spends) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const seeds = spend.seeds as any;
          if (seeds?.kind === "%pkh" && seeds.pkhs) {
            for (const pkh of seeds.pkhs) {
              // Check if this PKH has signed - signatures is Record<string, string>
              const signatures = seeds.signatures || {};
              const hasSigned = Object.keys(signatures).includes(pkh);
              if (!extractedSigners.find(s => s.pubkey === pkh)) {
                extractedSigners.push({
                  pubkey: pkh,
                  label: `Signer ${extractedSigners.length + 1}`,
                  signed: hasSigned,
                });
              }
            }
          }
        }
      }

      // Determine required/collected sigs from extracted signers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstSeeds = transaction?.spends[0]?.seeds as any;
      const requiredSigs = extractedSigners.length > 0 
        ? (firstSeeds?.threshold || 1)
        : 1;
      const collectedSigs = extractedSigners.filter(s => s.signed).length;

      // Validate that the connected wallet is a participant in this transaction
      const walletAddr = wallet.address!;
      const isWalletParticipant = extractedSigners.some(s => 
        s.pubkey === walletAddr || 
        s.pubkey.toLowerCase() === walletAddr.toLowerCase()
      );
      
      if (extractedSigners.length > 0 && !isWalletParticipant) {
        toast.error("You cannot import this transaction - your wallet is not a participant");
        return;
      }

      // Detect if current wallet has already signed (for signed tx imports)
      const walletAlreadySigned = extractedSigners.find(s => 
        s.pubkey === walletAddr || 
        s.pubkey.toLowerCase() === walletAddr.toLowerCase()
      )?.signed ?? false;
      
      // Update the signer status if we detected wallet has signed
      if (walletAlreadySigned) {
        extractedSigners = extractedSigners.map(s => {
          if (s.pubkey === walletAddr || s.pubkey.toLowerCase() === walletAddr.toLowerCase()) {
            return { ...s, signed: true };
          }
          return s;
        });
      }

      // Extract amount, fee, and recipient from wallet payload notes
      // Note structure: {note_version: {V1: {assets: {value: '...'}, name: {first: '...', last: '...'}}}}
      // 1 NOCK = 65536 nicks
      let extractedAmount = 0;
      let extractedRecipient = "";
      console.log('walletPayloadNotes:', walletPayloadNotes, 'length:', walletPayloadNotes.length);
      for (const note of walletPayloadNotes) {
        try {
          const noteVersion = note?.note_version?.V1 || note?.V1 || note;
          const assets = noteVersion?.assets;
          const value = assets?.value || assets?.amount || '0';
          extractedAmount += Number(value) / 65536; // Convert from nicks to NOCK
          
          // Extract recipient from note name
          const name = noteVersion?.name;
          if (name?.first && !extractedRecipient) {
            extractedRecipient = name.first;
          }
          console.log('Extracted note amount:', value, 'nicks -> NOCK:', extractedAmount, 'recipient:', extractedRecipient);
        } catch (e) {
          console.log('Failed to extract note amount:', e);
        }
      }
      
      // Extract fee from rawTx protobuf spends
      let extractedFee = 0;
      try {
        const protobuf = rawTx?.toProtobuf?.() || rawTx;
        const spends = protobuf?.spends || [];
        for (const spend of spends) {
          const spendData = spend?.spend?.spend_kind?.Witness;
          const feeValue = spendData?.fee?.value || '0';
          extractedFee += Number(feeValue) / 65536; // Convert from nicks to NOCK
        }
        console.log('Extracted fee:', extractedFee);
      } catch (e) {
        console.log('Failed to extract fee:', e);
      }
      
      // Round amounts to 2 decimal places
      extractedAmount = Math.round(extractedAmount * 100) / 100;
      extractedFee = Math.round(extractedFee * 100) / 100;
      console.log('Final extractedAmount:', extractedAmount, 'extractedFee:', extractedFee);

      const baseTx: StoredTransaction = {
        id: createTransactionId(),
        type: extractedSigners.length > 1 ? "multisig" : "single",
        amount: extractedAmount,
        recipient: extractedRecipient,
        fee: extractedFee,
        unsignedTxHex: isSigned ? undefined : txJson,
        unsignedTxJam: isSigned ? undefined : jamData,
        signedTxHex: isSigned ? txJson : undefined,
        signedTxJam: isSigned ? jamData : undefined,
        sourceJson: walletPayloadJson || (isJamFile ? undefined : await file.text()),
        status: isSigned ? "signed" : "pending",
        requiredSigs,
        collectedSigs,
        signers: extractedSigners.length > 0 
          ? extractedSigners 
          : [{ pubkey: wallet.address, label: "Imported", signed: isSigned }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        memo: `Imported from ${file.name}`,
      };

      const v = getTxView(baseTx);
      const storedTx: StoredTransaction = {
        ...baseTx,
        type: v.signers.length > 1 || v.requiredSigs > 1 ? "multisig" : "single",
        // Use extracted amount if getTxView returns 0
        amount: (Number.isFinite(v.amount) && v.amount > 0) ? Number(v.amount.toFixed(2)) : extractedAmount,
        recipient: v.recipient || extractedRecipient,
        fee: (Number.isFinite(v.fee) && v.fee > 0) ? Number(v.fee.toFixed(2)) : extractedFee,
        requiredSigs: v.requiredSigs,
        collectedSigs: v.collectedSigs,
        signers: v.signers.length ? v.signers : baseTx.signers,
      };

      saveTransaction(wallet.address, storedTx);

      // Refresh the transaction list
      const pending = getPendingTransactions(wallet.address);
      const completed = getCompletedTransactions(wallet.address);
      setPendingTransactions(pending);
      setCompletedTransactions(completed);

      toast.success("Transaction imported successfully");
      setActiveTab("pending");
    } catch (error) {
      console.error("Failed to import transaction:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to import transaction: ${errorMsg}`);
    }

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Load transactions from local storage when wallet connects
  useEffect(() => {
    setSigningTxId(null);
    if (wallet.connected && wallet.address) {
      setIsLoading(true);
      try {
        const pending = getPendingTransactions(wallet.address);
        const completed = getCompletedTransactions(wallet.address);
        setPendingTransactions(pending);
        setCompletedTransactions(completed);
      } catch (error) {
        console.error("Error loading transactions:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setPendingTransactions([]);
      setCompletedTransactions([]);
      setIsLoading(false);
    }
  }, [wallet.connected, wallet.address]);

  const handleRefresh = () => {
    if (!wallet.address) return;
    setSigningTxId(null);
    setIsLoading(true);
    try {
      const pending = getPendingTransactions(wallet.address);
      const completed = getCompletedTransactions(wallet.address);
      setPendingTransactions(pending);
      setCompletedTransactions(completed);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadTextFile = (args: { content: string; filename: string; contentType: string }) => {
    const blob = new Blob([args.content], { type: args.contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = args.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleDetails = (tx: StoredTransaction) => {
    setDetailsTab("overview");
    setExpandedTxId((prev) => (prev === tx.id ? null : tx.id));
  };

  const handleDownloadUnsigned = (tx: StoredTransaction) => {
    const content = tx.unsignedTxHex ?? tx.sourceJson;
    if (!content) {
      toast.error("No unsigned transaction available");
      return;
    }
    downloadTextFile({
      content,
      filename: `nockbox-unsigned-${tx.id}.jam`,
      contentType: "application/json",
    });
  };

  const handleDownloadSigned = (tx: StoredTransaction) => {
    if (!tx.signedTxHex) {
      toast.error("No signed transaction available");
      return;
    }
    downloadTextFile({
      content: tx.signedTxHex,
      filename: `nockbox-signed-${tx.id}.tx`,
      contentType: "application/json",
    });
  };

  const handleBroadcast = async (tx: StoredTransaction) => {
    if (!wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }
    
    setBroadcastingTxId(tx.id);
    try {
      // Get the signed transaction data from signedTxJam (protobuf) or signedTxHex
      const walletPayload = getWalletSignPayloadFromStoredTx(tx);
      if (!walletPayload) {
        throw new Error("No signed transaction data available");
      }
      
      // Check if we have signed protobuf data
      let signedTxData: unknown = null;
      if (tx.signedTxJam) {
        try {
          const parsed = JSON.parse(tx.signedTxJam);
          signedTxData = parsed.signedTxProtobuf;
        } catch {
          // signedTxJam might be raw data
          signedTxData = tx.signedTxJam;
        }
      }
      
      if (!signedTxData) {
        throw new Error("No signed transaction protobuf available. Please sign the transaction first.");
      }

      console.log("Broadcasting signed transaction via gRPC...");
      const hash = await broadcastTransaction(signedTxData);
      
      // Update transaction status to completed
      updateTransaction(wallet.address!, tx.id, {
        status: "completed",
      });
      
      handleRefresh();
      toast.success(`Transaction broadcast successfully! Hash: ${hash.slice(0, 16)}...`);
    } catch (err) {
      console.error("Broadcast error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to broadcast transaction";
      if (errorMessage.includes("unlock") || errorMessage.includes("LOCKED")) {
        toast.error("Please unlock your Iris wallet and try again");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setBroadcastingTxId(null);
    }
  };

  const handleSignStoredTx = async (tx: StoredTransaction) => {
    console.log("handleSignStoredTx: clicked", wallet.address);
    if (!wallet.address) {
      toast.error("Wallet address not available");
      return;
    }
    if (!tx.id) {
      toast.error("Transaction ID is missing");
      return;
    }
    console.log("handleSignStoredTx: clicked", {
      txId: tx.id,
      walletAddress: wallet.address,
      hasUnsigned: !!tx.unsignedTxHex,
      hasSigned: !!tx.signedTxHex,
      hasSource: !!tx.sourceJson,
    });
    setSigningTxId(tx.id);
    try {
      const walletPayload = getWalletSignPayloadFromStoredTx(tx);
      if (walletPayload) {
        const signedTxProtobuf = await signRawTx({
          rawTx: walletPayload.rawTx,
          notes: walletPayload.notes,
          spendConditions: walletPayload.spendConditions,
        });

        // Store signed protobuf separately, preserve original unsignedTxHex for parsing
        const signedProtobufJson = safeStringifyForStorage({
          signedTxProtobuf,
        });

        // Update signers to mark wallet as signed (case-insensitive match)
        const walletAddr = wallet.address;
        let wasAlreadySigned = false;
        const updatedSigners = tx.signers.map(s => {
          const isMatch = s.pubkey === walletAddr || s.pubkey.toLowerCase() === walletAddr.toLowerCase();
          if (isMatch) {
            wasAlreadySigned = s.signed;
            return { ...s, signed: true };
          }
          return s;
        });

        updateTransaction(wallet.address, tx.id, {
          signedTxHex: tx.unsignedTxHex, // Keep original for parsing
          signedTxJam: signedProtobufJson, // Store signed protobuf here
          status: "signed",
          // Only increment if not already signed
          collectedSigs: wasAlreadySigned ? tx.collectedSigs : tx.collectedSigs + 1,
          signers: updatedSigners,
        });
        handleRefresh();
        toast.success("Transaction signed");
        return;
      }

      const parsed = parseStoredTx(tx);
      if (!parsed) {
        toast.error("No wallet-signable payload found");
        return;
      }

      // Try signing with Iris wallet using message signing (helpers2)
      try {
        const irisCrypto: CryptoProvider = { ...pkhAwareCrypto, verify: () => true };
        const { tx: irisSignedTx } = await signTxWithIris({ tx: parsed, crypto: irisCrypto });
        const signedTxHex = exportTx(irisSignedTx);

        const nextStored: StoredTransaction = { ...tx, signedTxHex };
        const v = getTxView(nextStored);

        updateTransaction(wallet.address, tx.id, {
          signedTxHex,
          status: "signed",
          amount: Number.isFinite(v.amount) ? Number(v.amount.toFixed(8)) : tx.amount,
          recipient: v.recipient || tx.recipient,
          fee: Number.isFinite(v.fee) ? Number(v.fee.toFixed(8)) : tx.fee,
          requiredSigs: v.requiredSigs,
          collectedSigs: v.collectedSigs,
          signers: v.signers,
        });

        handleRefresh();
        toast.success("Transaction signed with Iris wallet");
        return;
      } catch (e) {
        console.log("Iris message signing failed, falling back to local mock signer:", e);
      }

      const signer = createMockSigner(wallet.address);

      let next = parsed;
      let didSign = false;
      for (const spend of parsed.spends) {
        try {
          next = await signSpend({
            tx: next,
            noteId: spend.noteId,
            signer,
            crypto: pkhAwareCrypto,
          });
          didSign = true;
        } catch {
          // not allowed / already signed / unsupported: ignore and continue
        }
      }

      if (!didSign) {
        toast.info("This transaction has no spends that your wallet can sign.");
        return;
      }

      const signedTxHex = exportTx(next);
      const nextStored: StoredTransaction = { ...tx, signedTxHex };
      const v = getTxView(nextStored);

      updateTransaction(wallet.address, tx.id, {
        signedTxHex,
        status: "signed",
        amount: Number.isFinite(v.amount) ? Number(v.amount.toFixed(8)) : tx.amount,
        recipient: v.recipient || tx.recipient,
        fee: Number.isFinite(v.fee) ? Number(v.fee.toFixed(8)) : tx.fee,
        requiredSigs: v.requiredSigs,
        collectedSigs: v.collectedSigs,
        signers: v.signers,
      });

      handleRefresh();
      toast.success("Transaction signed");
    } catch (error) {
      console.error("Failed to sign transaction:", error);
      toast.error(error instanceof Error ? error.message : "Failed to sign transaction");
    } finally {
      setSigningTxId(null);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            View and sign pending transactions
          </p>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="p-12 text-center">
            <Wallet className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Connect your Iris wallet to view pending transactions that require your signature
            </p>
            <Button
              onClick={connect}
              disabled={isConnecting}
              size="lg"
              className="bg-[#FFC412] text-black hover:bg-[#FFD54F]"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5 mr-2" />
                  Connect Wallet
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            View and sign pending transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json,.txt,.jam,.tx"
            className="hidden"
          />
          <Button variant="outline" className="gap-2" onClick={handleImportClick}>
            <Upload className="w-4 h-4" />
            Import Transaction
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="w-4 h-4" />
            Pending
            {pendingTransactions.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-[#FFC412]/20 text-[#FFC412]">
                {pendingTransactions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Completed
          </TabsTrigger>
        </TabsList>

        {/* Pending Transactions */}
        <TabsContent value="pending" className="mt-6">
          {isLoading ? (
            <Card className="bg-muted/30">
              <CardContent className="p-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading transactions...</p>
              </CardContent>
            </Card>
          ) : pendingTransactions.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
                <p className="text-muted-foreground">
                  No pending transactions require your signature
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingTransactions.map((tx) => {
                const v = getTxView(tx);
                const pct = v.requiredSigs > 0 ? Math.min(100, Math.round((v.collectedSigs / v.requiredSigs) * 100)) : 0;
                return (
                  <Card key={tx.id} className="hover:border-[#FFC412]/30 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#FFC412]/10 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-[#FFC412]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{v.amountDisplay} NOCK</span>
                                <Badge variant="outline" className="text-xs">
                                  {v.signers.length > 1 || v.requiredSigs > 1 ? "Multisig" : "Single"}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {v.collectedSigs}/{v.requiredSigs}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground font-mono">
                                To: {v.recipient ? truncateMiddle(v.recipient, 10, 8) : "-"}
                              </p>
                            </div>
                          </div>

                          {/* Signature Progress */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="flex -space-x-2">
                                  {v.signers.slice(0, 5).map((signer, i) => (
                                    <div
                                      key={i}
                                      className={`w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-medium ${signer.signed
                                        ? "bg-green-500 text-white"
                                        : "bg-muted text-muted-foreground"
                                        }`}
                                      title={signer.pubkey}
                                    >
                                      {signer.pubkey.slice(0, 2).toUpperCase()}
                                    </div>
                                  ))}
                                </div>
                                <span className="text-sm text-muted-foreground">
                                  {v.collectedSigs}/{v.requiredSigs} signatures
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">{pct}%</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-[#FFC412]" style={{ width: `${pct}%` }} />
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Created {new Date(tx.createdAt).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          {v.collectedSigs >= v.requiredSigs ? (
                            <Button
                              type="button"
                              className="relative z-10 cursor-pointer bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => handleBroadcast(tx)}
                              disabled={broadcastingTxId === tx.id}
                            >
                              {broadcastingTxId === tx.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Broadcasting...
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4 mr-2" />
                                  Broadcast
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              className="relative z-10 cursor-pointer bg-[#FFC412] text-black hover:bg-[#FFD54F] disabled:opacity-50 disabled:cursor-not-allowed"
                              onClick={() => handleSignStoredTx(tx)}
                              disabled={hasWalletSignedStoredTx(tx) || signingTxId === tx.id}
                            >
                              <Pen className="w-4 h-4 mr-2" />
                              {hasWalletSignedStoredTx(tx) ? "Signed" : "Sign"}
                            </Button>
                          )}
                          {signingTxId === tx.id ? (
                            <div className="text-xs text-muted-foreground">Signing…</div>
                          ) : hasWalletSignedStoredTx(tx) && v.collectedSigs < v.requiredSigs ? (
                            <div className="text-xs text-green-600">✓ Already signed by this wallet</div>
                          ) : v.collectedSigs >= v.requiredSigs ? (
                            <div className="text-xs text-green-600">✓ Ready to broadcast ({v.collectedSigs}/{v.requiredSigs} signatures)</div>
                          ) : null}
                          <Button variant="outline" size="sm" onClick={() => toggleDetails(tx)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Details
                          </Button>
                        </div>
                      </div>

                      {expandedTxId === tx.id ? (
                        <div className="mt-6 space-y-4">
                          <div className="rounded-lg border bg-muted/30 p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-sm text-muted-foreground">Amount</div>
                                <div className="text-xl font-semibold">{v.amountDisplay} NOCK</div>
                                <div className="mt-1 text-xs text-muted-foreground font-mono">
                                  {v.unsignedHash ? `hash: ${truncateMiddle(v.unsignedHash, 12, 10)}` : ""}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground">Signatures</div>
                                <div className="text-sm font-medium">{v.collectedSigs}/{v.requiredSigs}</div>
                                <div className="mt-2 h-2 w-40 rounded-full bg-muted overflow-hidden inline-block">
                                  <div className="h-full bg-[#FFC412]" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div>
                                <div className="text-muted-foreground">To</div>
                                <div className="font-mono break-all">{v.recipient || "-"}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Fee</div>
                                <div>{v.feeDisplay} NOCK</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Outputs</div>
                                <div>{v.outputs.length}</div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">Spends</div>
                                <div>{v.spendsCount}</div>
                              </div>
                            </div>
                          </div>

                          <Tabs value={detailsTab} onValueChange={setDetailsTab}>
                            <TabsList className="bg-muted/50">
                              <TabsTrigger value="overview">Overview</TabsTrigger>
                              <TabsTrigger value="unsigned">Unsigned</TabsTrigger>
                              <TabsTrigger value="signed" disabled={!tx.signedTxHex}>Signed</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="mt-4 space-y-4">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-lg border p-4">
                                  <div className="text-sm font-medium mb-3">Outputs</div>
                                  <div className="space-y-2">
                                    {v.outputs.map((o, i) => (
                                      <div key={i} className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-xs text-muted-foreground">Address</div>
                                          <div className="font-mono text-xs break-all">{o.address}</div>
                                        </div>
                                        <div className="text-sm font-medium whitespace-nowrap">{o.amount} NOCK</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-lg border p-4">
                                  <div className="text-sm font-medium mb-3">Participants</div>
                                  <div className="space-y-2">
                                    {v.signers.length ? v.signers.map((s, i) => (
                                      <div key={`${s.pubkey}-${i}`} className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-xs text-muted-foreground">PKH</div>
                                          <div className="font-mono text-xs break-all">{s.pubkey}</div>
                                        </div>
                                        <Badge variant={s.signed ? "default" : "secondary"}>{s.signed ? "Signed" : "Pending"}</Badge>
                                      </div>
                                    )) : (
                                      <div className="text-sm text-muted-foreground">No signer data</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TabsContent>

                            <TabsContent value="unsigned" className="mt-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-medium">Unsigned Transaction JSON</div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => (tx.unsignedTxHex ?? tx.sourceJson ? copyToClipboard(tx.unsignedTxHex ?? tx.sourceJson ?? "") : null)}
                                    disabled={!(tx.unsignedTxHex ?? tx.sourceJson)}
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleDownloadUnsigned(tx)} disabled={!(tx.unsignedTxHex ?? tx.sourceJson)}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                              <div className="rounded-lg border bg-muted/30">
                                <ScrollArea className="h-64">
                                  <pre className="p-3 text-xs font-mono whitespace-pre">{tx.unsignedTxHex ? prettyJson(tx.unsignedTxHex) : tx.sourceJson ? prettyJson(tx.sourceJson) : ""}</pre>
                                </ScrollArea>
                              </div>
                            </TabsContent>

                            <TabsContent value="signed" className="mt-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm font-medium">Signed Transaction JSON</div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => (tx.signedTxHex ? copyToClipboard(tx.signedTxHex) : null)}
                                    disabled={!tx.signedTxHex}
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => handleDownloadSigned(tx)} disabled={!tx.signedTxHex}>
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                              <div className="rounded-lg border bg-muted/30">
                                <ScrollArea className="h-64">
                                  <pre className="p-3 text-xs font-mono whitespace-pre">{tx.signedTxHex ? prettyJson(tx.signedTxHex) : ""}</pre>
                                </ScrollArea>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Completed Transactions */}
        <TabsContent value="completed" className="mt-6">
          {completedTransactions.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Completed Transactions</h3>
                <p className="text-muted-foreground">
                  Your completed transactions will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {completedTransactions.map((tx) => {
                const v = getTxView(tx);
                return (
                  <Card key={tx.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{v.amountDisplay} NOCK</span>
                              <Badge variant="outline" className="text-xs border-green-500/50 text-green-500">
                                Completed
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground font-mono">
                              To: {v.recipient ? truncateMiddle(v.recipient, 10, 8) : "-"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {v.unsignedHash && (
                            <p className="text-sm font-mono text-muted-foreground">
                              {truncateMiddle(v.unsignedHash, 12, 10)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.updatedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}
