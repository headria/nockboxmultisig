export interface Note {
  id: string;
  amount: number;
  asset: string;
  txHash: string;
  index: number;
  confirmed: boolean;
  protobufNote?: unknown;
  isMultisig?: boolean;
  isSpendable?: boolean;
  // Multisig configuration for this note (if isMultisig is true)
  multisigConfig?: {
    m: number;
    n: number;
    pubkeys: Pubkey[];
  };
}

export interface Pubkey {
  id: string;
  label: string;
  pubkey: string;
}

export interface MultisigConfig {
  m: number;
  n: number;
  pubkeys: Pubkey[];
}

export interface Output {
  id: string;
  address: string;
  amount: number;
  asset: string;
}

export interface Seed {
  id: string;
  amount: number;
  asset: string;
}

export interface TransactionData {
  selectedNotes: Note[];
  multisigConfig: MultisigConfig;
  outputs: Output[];
  seeds: Seed[];
  fee: number;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
  notes: Note[];
}

export type WizardStep = 1 | 2 | 3 | 4;

export interface SignatureRequest {
  id: string;
  pubkey: string;
  label: string;
  signed: boolean;
  signature?: string;
}
