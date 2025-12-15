"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { WalletState, Note } from "@/types";
import { broadcastSignedTransaction, type SignedTxLike } from "@/lib/broadcast";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NockchainProviderType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GrpcClientType = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmType = any;

// Convert nicks (internal unit) to NOCK
function nicksToNock(nicks: bigint): number {
  return Number(nicks) / 65536;
}

 function bytesToHex(bytes: Uint8Array): string {
   let out = '';
   for (let i = 0; i < bytes.length; i++) {
     out += bytes[i]!.toString(16).padStart(2, '0');
   }
   return out;
 }

 function normalizeTxId(txId: unknown): string | undefined {
   if (txId === null || txId === undefined) return undefined;
   if (typeof txId === 'string') return txId;
   if (typeof txId === 'number' || typeof txId === 'bigint' || typeof txId === 'boolean') return String(txId);

   if (txId instanceof Uint8Array) return bytesToHex(txId);

   if (typeof txId === 'object') {
     const o = txId as Record<string, unknown>;
     if (typeof o.value === 'string') return o.value;
     if (o.bytes instanceof Uint8Array) return bytesToHex(o.bytes);
     if (typeof (txId as { toString?: unknown }).toString === 'function') {
       const s = String(txId);
       if (s && s !== '[object Object]') return s;
     }
   }

   return undefined;
 }

interface WalletContextType {
  wallet: WalletState;
  isConnecting: boolean;
  isInstalled: boolean;
  isLocked: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  refreshNotes: () => Promise<void>;
  selectNotesForAmount: (amount: number) => Note[];
  signTransaction: (args: { notes: Note[]; recipient: string; amountNock: number; feeNock: number }) => Promise<unknown>;
  broadcastTransaction: (signedTx: unknown) => Promise<string>;
  grpcEndpoint: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    address: null,
    balance: 0,
    notes: [],
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [grpcEndpoint, setGrpcEndpoint] = useState<string | null>(null);
  const providerRef = useRef<NockchainProviderType | null>(null);
  const grpcClientRef = useRef<GrpcClientType | null>(null);
  const wasmRef = useRef<WasmType | null>(null);
  const lockNotificationShownRef = useRef(false);

  // Check if Iris wallet is installed (check window.iris or window.nockchain)
  useEffect(() => {
    const checkInstalled = () => {
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const installed = !!(w.iris || w.nockchain?.provider === 'iris');
        setIsInstalled(installed);
      }
    };
    
    // Check after a short delay to allow extension to inject
    const timeout = setTimeout(checkInstalled, 100);
    checkInstalled();
    
    return () => clearTimeout(timeout);
  }, []);

  const disconnect = useCallback(() => {
    if (providerRef.current?.dispose) {
      providerRef.current.dispose();
      providerRef.current = null;
    }
    setGrpcEndpoint(null);
    setWallet({
      connected: false,
      address: null,
      balance: 0,
      notes: [],
    });
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    
    try {
      if (!isInstalled) {
        throw new Error('Iris wallet not installed. Please install the Iris browser extension.');
      }
        // Connect using iris-sdk
        const { NockchainProvider, wasm } = await import('@nockbox/iris-sdk');
        
        // Initialize WASM
        await wasm.default();
        wasmRef.current = wasm;
        console.log('WASM initialized');
        
        const provider = new NockchainProvider();
        providerRef.current = provider;
        
        const { pkh, grpcEndpoint: endpoint } = await provider.connect();
        setGrpcEndpoint(endpoint);
        
        console.log('Connected to wallet with PKH:', pkh);
        console.log('Connected to wallet with endpoint:', endpoint);

 
        // Create gRPC client
        const grpcClient = new wasm.GrpcClient(endpoint);
        grpcClientRef.current = grpcClient;
        console.log('gRPC client created');
        
        // Create PKH lock and SpendCondition to get firstName for fetching notes
        let notes: Note[] = [];
        try {
          const pkhLock = wasm.Pkh.single(pkh);
          const spendCondition = wasm.SpendCondition.newPkh(pkhLock);
          const firstName = spendCondition.firstName();
          console.log('Fetching notes for firstName:', firstName.value.substring(0, 20) + '...');
          
          // Fetch balance/notes from gRPC
          const balance = await grpcClient.getBalanceByFirstName(firstName.value);
          console.log('Balance response:', balance);
          
          if (balance && balance.notes && balance.notes.length > 0) {
            notes = balance.notes.map((n: { note: unknown; firstName?: string; lastName?: string }, index: number) => {
              const note = wasm.Note.fromProtobuf(n.note);
              const noteFirstName = n.firstName || '';
              const noteLastName = n.lastName || '';
              // Ensure unique noteId - use firstName.lastName if available, otherwise generate unique id
              const combinedName = `${noteFirstName}.${noteLastName}`;
              const noteId = (combinedName && combinedName !== '.') ? combinedName.substring(0, 20) : `note-${index}-${Date.now()}`;
              
              return {
                id: noteId,
                amount: nicksToNock(note.assets),
                asset: 'NOCK',
                txHash: noteLastName || `tx-${index}`,
                index: index,
                confirmed: true,
                protobufNote: n.note,
              };
            });
            console.log('Fetched real notes from gRPC:', notes);
          } else {
            console.log('No notes found for this wallet');
          }
          
          spendCondition.free();
        } catch (noteErr) {
          console.error('Failed to fetch notes:', noteErr);
        }
        
        const totalBalance = notes
          .filter((n) => n.confirmed)
          .reduce((sum, n) => sum + n.amount, 0);

        setWallet({
          connected: true,
          address: pkh,
          balance: totalBalance,
          notes,
        });
        
        // Listen for account changes
        provider.on('accountsChanged', (accounts: string[]) => {
          if (accounts.length === 0) {
            disconnect();
          } else {
            setWallet((prev) => ({ ...prev, address: accounts[0] }));
          }
        });

        provider.on('disconnect', () => {
          disconnect();
        });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [disconnect, isInstalled]);

  // Reconnect without resetting transaction state - just re-establish provider connection
  const reconnect = useCallback(async () => {
    if (!isInstalled) {
      toast.error('Iris wallet not installed');
      return;
    }
    
    try {
      setIsConnecting(true);
      
      // If we already have a provider, try to request accounts to unlock
      if (providerRef.current) {
        await providerRef.current.request({ method: 'requestAccounts' });
        setIsLocked(false);
        lockNotificationShownRef.current = false;
        toast.success('Wallet reconnected');
        return;
      }
      
      // Otherwise do a full connect
      await connect();
      setIsLocked(false);
      lockNotificationShownRef.current = false;
    } catch (error) {
      console.error('Failed to reconnect wallet:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('LOCKED') || errorMessage.includes('locked')) {
        setIsLocked(true);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isInstalled, connect]);

  // Poll wallet connection status every 10 seconds
  useEffect(() => {
    if (!wallet.connected || !providerRef.current) return;

    const checkWalletStatus = async () => {
      try {
        // Try to get accounts to check if wallet is still connected/unlocked
        const accounts = await providerRef.current.request({ method: 'requestAccounts' });
        if (accounts && accounts.length > 0) {
          setIsLocked(false);
          lockNotificationShownRef.current = false;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('LOCKED') || errorMessage.includes('locked')) {
          setIsLocked(true);
          // Show notification only once
          if (!lockNotificationShownRef.current) {
            lockNotificationShownRef.current = true;
            toast.warning('Wallet is locked. Please unlock your Iris wallet to continue.', {
              duration: 10000,
              action: {
                label: 'Reconnect',
                onClick: () => reconnect(),
              },
            });
          }
        }
      }
    };

    // Check immediately and then every 10 seconds
    const intervalId = setInterval(checkWalletStatus, 10000);

    return () => clearInterval(intervalId);
  }, [wallet.connected, reconnect]);

  const refreshNotes = useCallback(async () => {
    if (!wallet.connected || !grpcClientRef.current || !wasmRef.current || !wallet.address) return;
    
    try {
      const wasm = wasmRef.current;
      const grpcClient = grpcClientRef.current;

      
      // Create PKH lock and SpendCondition to get firstName
      const pkhLock = wasm.Pkh.single(wallet.address);
      const spendCondition = wasm.SpendCondition.newPkh(pkhLock);
      const firstName = spendCondition.firstName();
      
      // Fetch balance/notes from gRPC
      const balance = await grpcClient.getBalanceByFirstName(firstName.value);
      
      let notes: Note[] = [];
      if (balance && balance.notes && balance.notes.length > 0) {
        notes = balance.notes.map((n: { note: unknown; firstName?: string; lastName?: string }, index: number) => {
          const note = wasm.Note.fromProtobuf(n.note);
          const noteFirstName = n.firstName || '';
          const noteLastName = n.lastName || '';
          // Ensure unique noteId - use firstName.lastName if available, otherwise generate unique id
          const combinedName = `${noteFirstName}.${noteLastName}`;
          const noteId = (combinedName && combinedName !== '.') ? combinedName.substring(0, 20) : `note-${index}-${Date.now()}`;
          
          return {
            id: noteId,
            amount: nicksToNock(note.assets),
            asset: 'NOCK',
            txHash: noteLastName || `tx-${index}`,
            index: index,
            confirmed: true,
            protobufNote: n.note,
          };
        });
      }
      
      spendCondition.free();
      
      const totalBalance = notes
        .filter((n) => n.confirmed)
        .reduce((sum, n) => sum + n.amount, 0);
      
      setWallet((prev) => ({
        ...prev,
        notes,
        balance: totalBalance,
      }));
      
      console.log('Refreshed notes:', notes);
    } catch (error) {
      console.error('Failed to refresh notes:', error);
    }
  }, [wallet.connected, wallet.address]);

  // Select notes to cover a target amount using a greedy algorithm
  const selectNotesForAmount = useCallback((targetAmount: number): Note[] => {
    const confirmedNotes = wallet.notes
      .filter((n) => n.confirmed)
      .sort((a, b) => b.amount - a.amount); // Sort by amount descending
    
    const selected: Note[] = [];
    let total = 0;
    
    for (const note of confirmedNotes) {
      if (total >= targetAmount) break;
      selected.push(note);
      total += note.amount;
    }
    
    return selected;
  }, [wallet.notes]);

  // Build and sign a transaction using iris-wasm TxBuilder + Iris provider.signRawTx
  const signTransaction = useCallback(async (args: { notes: Note[]; recipient: string; amountNock: number; feeNock: number }): Promise<unknown> => {
    if (!providerRef.current) {
      throw new Error('Wallet not connected');
    }
    if (!wasmRef.current) {
      throw new Error('WASM not initialized. Please reconnect your wallet.');
    }
    if (!wallet.address) {
      throw new Error('Wallet address not available. Please reconnect your wallet.');
    }

    const wasm = wasmRef.current;

    try {
      const spendableNotes = args.notes.filter((n) => !!n.protobufNote);
      if (spendableNotes.length === 0) {
        throw new Error('Selected notes are missing protobuf data. Please refresh notes and try again.');
      }

      const wasmNotes = spendableNotes.map((n) => wasm.Note.fromProtobuf(n.protobufNote));
      const spendConditions = wasmNotes.map(() => wasm.SpendCondition.newPkh(wasm.Pkh.single(wallet.address as string)));

      const feePerWord = BigInt(32768);
      const builder = new wasm.TxBuilder(feePerWord);

      const recipientDigest = new wasm.Digest(args.recipient);
      const refundDigest = new wasm.Digest(wallet.address);
      const gift = BigInt(Math.floor(args.amountNock * 65536));
      const feeOverride = BigInt(Math.floor(args.feeNock * 65536));

      builder.simpleSpend(
        wasmNotes,
        spendConditions,
        recipientDigest,
        gift,
        feeOverride,
        refundDigest,
        false,
      );

      const unsignedTx = builder.build();
      const txNotes = builder.allNotes();
      try {
        const unsignedId = typeof unsignedTx.id === 'function' ? normalizeTxId(unsignedTx.id()) : undefined;
        console.log('Transaction unsigned id:', unsignedId);
      } catch (e) {
        console.log('Failed to read unsigned tx id:', e);
      }
      try {
        console.log('Transaction notes count:', {
          notes: Array.isArray(txNotes?.notes) ? txNotes.notes.length : undefined,
          spendConditions: Array.isArray(txNotes?.spendConditions) ? txNotes.spendConditions.length : undefined,
        });
      } catch (e) {
        console.log('Failed to log txNotes:', e);
      }
      
      const signedTxProtobuf = await providerRef.current.signRawTx({
        rawTx: unsignedTx.toRawTx(),
        notes: txNotes.notes,
        spendConditions: txNotes.spendConditions,
      });

      const signedRawTx = wasm.RawTx.fromProtobuf(signedTxProtobuf);
      const signedTx = signedRawTx.toNockchainTx();

      console.log('Transaction signed successfully');
      try {
        const signedId = typeof signedTx.id === 'function' ? normalizeTxId(signedTx.id()) : undefined;
        console.log('Transaction signed id:', signedId);
      } catch (e) {
        console.log('Failed to read signed tx id:', e);
      }
      return signedTx;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage === 'LOCKED' || errorMessage.includes('LOCKED')) {
        console.log('Wallet is locked, attempting to unlock...');
        try {
          await providerRef.current.request({ method: 'requestAccounts' });
        } catch (unlockError) {
          console.error('Failed to unlock wallet:', unlockError);
          throw new Error('Please unlock your Iris wallet and try again');
        }
      }

      console.error('Failed to sign transaction:', error);
      throw error;
    }
  }, [wallet.address]);

  // Broadcast a signed transaction to the network using gRPC client
  const broadcastTransaction = useCallback(async (signedTx: unknown): Promise<string> => {
    if (!grpcClientRef.current) {
      throw new Error('gRPC client not initialized. Please reconnect your wallet.');
    }
    
    try {
      console.log('Broadcasting transaction via gRPC client...');
      console.log('SignedTx type:', typeof signedTx);
      
      // Check if signedTx has the required toRawTx method (SignedTxLike interface)
      if (!signedTx || typeof signedTx !== 'object' || !('toRawTx' in signedTx)) {
        throw new Error('Invalid transaction format. Expected signed transaction with toRawTx method.');
      }

      // Get transaction hash from the signed transaction
      // signedTx is already a NockchainTx object, so we can call id() directly
      let localTxId: string | undefined;
      const tx = signedTx as Record<string, unknown>;
      
      // Try direct id() method on NockchainTx
      if (typeof tx.id === 'function') {
        try {
          const txId = (tx.id as () => unknown)();
          localTxId = normalizeTxId(txId) ?? String(txId);
          console.log('Got txid from signedTx.id():', localTxId);
        } catch (e) {
          console.log('Failed to get txid from signedTx.id():', e);
        }
      }
      
      const { txid, hash } = await broadcastSignedTransaction({
        signedTx: signedTx as unknown as SignedTxLike,
        grpcClient: grpcClientRef.current,
      });

      console.log('Broadcast result - txid:', txid, 'hash:', hash, 'localTxId:', localTxId);
      const txHash = localTxId ?? txid ?? hash ?? `tx_${Date.now()}`;
      console.log('Transaction broadcast successfully, final hash:', txHash);
      return String(txHash);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to broadcast transaction:', error);
      
      if (errorMessage.includes('LOCKED') || errorMessage.includes('locked')) {
        throw new Error('Please unlock your Iris wallet and try again');
      }
      
      throw new Error(`Broadcast failed: ${errorMessage}`);
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{ wallet, isConnecting, isInstalled, isLocked, connect, disconnect, reconnect, refreshNotes, selectNotesForAmount, signTransaction, broadcastTransaction, grpcEndpoint }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
