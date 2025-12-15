// Transaction storage using localStorage
// Stores transactions per wallet address

export interface StoredTransaction {
  id: string;
  type: "single" | "multisig";
  amount: number;
  recipient: string;
  fee: number;
  unsignedTxHex?: string;
  signedTxHex?: string;
  txHash?: string;
  status: "pending" | "signed" | "broadcast" | "completed";
  requiredSigs: number;
  collectedSigs: number;
  signers: Array<{ pubkey: string; label: string; signed: boolean }>;
  createdAt: number;
  updatedAt: number;
  memo?: string;
}

const STORAGE_KEY = "nockbox_transactions";

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_KEY}_${walletAddress}`;
}

export function getTransactions(walletAddress: string): StoredTransaction[] {
  if (typeof window === "undefined") return [];
  
  try {
    const data = localStorage.getItem(getStorageKey(walletAddress));
    if (!data) return [];
    return JSON.parse(data) as StoredTransaction[];
  } catch (error) {
    console.error("Error reading transactions from storage:", error);
    return [];
  }
}

export function saveTransaction(
  walletAddress: string,
  transaction: StoredTransaction
): void {
  if (typeof window === "undefined") return;
  
  try {
    const transactions = getTransactions(walletAddress);
    const existingIndex = transactions.findIndex((t) => t.id === transaction.id);
    
    if (existingIndex >= 0) {
      transactions[existingIndex] = { ...transaction, updatedAt: Date.now() };
    } else {
      transactions.unshift(transaction);
    }
    
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(transactions));
  } catch (error) {
    console.error("Error saving transaction to storage:", error);
  }
}

export function updateTransaction(
  walletAddress: string,
  transactionId: string,
  updates: Partial<StoredTransaction>
): void {
  if (typeof window === "undefined") return;
  
  try {
    const transactions = getTransactions(walletAddress);
    const index = transactions.findIndex((t) => t.id === transactionId);
    
    if (index >= 0) {
      transactions[index] = {
        ...transactions[index],
        ...updates,
        updatedAt: Date.now(),
      };
      localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(transactions));
    }
  } catch (error) {
    console.error("Error updating transaction in storage:", error);
  }
}

export function deleteTransaction(
  walletAddress: string,
  transactionId: string
): void {
  if (typeof window === "undefined") return;
  
  try {
    const transactions = getTransactions(walletAddress);
    const filtered = transactions.filter((t) => t.id !== transactionId);
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(filtered));
  } catch (error) {
    console.error("Error deleting transaction from storage:", error);
  }
}

export function getPendingTransactions(walletAddress: string): StoredTransaction[] {
  return getTransactions(walletAddress).filter(
    (t) => t.status === "pending" || t.status === "signed"
  );
}

export function getCompletedTransactions(walletAddress: string): StoredTransaction[] {
  return getTransactions(walletAddress).filter(
    (t) => t.status === "broadcast" || t.status === "completed"
  );
}

export function createTransactionId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
