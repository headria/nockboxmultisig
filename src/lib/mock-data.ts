import { Note, Pubkey } from "@/types";

export const mockNotes: Note[] = [
  {
    id: "note-1",
    amount: 1.5,
    asset: "NOCK",
    txHash: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    index: 0,
    confirmed: true,
    isMultisig: false,
    isSpendable: true,
  },
  {
    id: "note-2",
    amount: 2.25,
    asset: "NOCK",
    txHash: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234",
    index: 1,
    confirmed: true,
    isMultisig: true,
    isSpendable: true,
    multisigConfig: {
      m: 2,
      n: 3,
      pubkeys: [
        { id: "pk-1", label: "Alice (Primary)", pubkey: "0x04a1b2c3d4e5f6789012345678901234567890abcdef" },
        { id: "pk-2", label: "Bob (Backup)", pubkey: "0x04b2c3d4e5f6789012345678901234567890abcdef01" },
        { id: "pk-3", label: "Charlie (Recovery)", pubkey: "0x04c3d4e5f6789012345678901234567890abcdef0123" },
      ],
    },
  },
  {
    id: "note-3",
    amount: 0.75,
    asset: "NOCK",
    txHash: "0x3c4d5e6f7890abcdef1234567890abcdef123456",
    index: 0,
    confirmed: true,
    isMultisig: false,
    isSpendable: true,
  },
  {
    id: "note-4",
    amount: 5.0,
    asset: "NOCK",
    txHash: "0x4d5e6f7890abcdef1234567890abcdef12345678",
    index: 2,
    confirmed: false,
    isMultisig: false,
    isSpendable: false,
  },
  {
    id: "note-5",
    amount: 0.5,
    asset: "NOCK",
    txHash: "0x5e6f7890abcdef1234567890abcdef1234567890",
    index: 0,
    confirmed: true,
    isMultisig: true,
    isSpendable: true,
    multisigConfig: {
      m: 2,
      n: 2,
      pubkeys: [
        { id: "pk-4", label: "Dave (Co-signer)", pubkey: "0x04d4e5f6789012345678901234567890abcdef012345" },
        { id: "pk-5", label: "Eve (Co-signer)", pubkey: "0x04e5f6789012345678901234567890abcdef01234567" },
      ],
    },
  },
];

export const mockPubkeys: Pubkey[] = [
  {
    id: "pk-1",
    label: "Alice (Primary)",
    pubkey: "0x04a1b2c3d4e5f6789012345678901234567890abcdef",
  },
  {
    id: "pk-2",
    label: "Bob (Backup)",
    pubkey: "0x04b2c3d4e5f6789012345678901234567890abcdef01",
  },
  {
    id: "pk-3",
    label: "Charlie (Recovery)",
    pubkey: "0x04c3d4e5f6789012345678901234567890abcdef0123",
  },
];

export const mockWalletAddress = "nock1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

export function simulateDelay(ms: number = 1500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
