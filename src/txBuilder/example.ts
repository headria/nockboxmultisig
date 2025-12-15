


import type { Note, Transaction, Hash } from './tx-core';
import { MockCryptoProvider, createMockSigner } from './crypto';
import {
  createMultisigLock,
  createNote,
  buildSimpleTransaction,
  getTransactionStatus,
  getMultisigParticipants,
  formatAmount,
  truncateHash,
} from './helpers';
import {
  signSpend,
  exportTx,
  importTx,
  mergePartiallySignedTx,
  isTransactionFullySigned,
} from './tx-core';

const crypto = MockCryptoProvider;

/* ------------------------------------------
   Demo: Create a 2-of-3 multisig transaction
------------------------------------------ */

export interface DemoResult {
  // Setup
  pubkeys: string[];
  pkhs: Hash[];
  lock: ReturnType<typeof createMultisigLock>;
  inputNote: Note;
  
  // Transaction
  unsignedTx: Transaction;
  partiallySignedTx1: Transaction;
  partiallySignedTx2: Transaction;
  mergedTx: Transaction;
  
  // Status
  isComplete: boolean;
  status: ReturnType<typeof getTransactionStatus>;
}

/**
 * Run a complete 2-of-3 multisig demo.
 */
export async function runMultisigDemo(): Promise<DemoResult> {
  // 1. Setup participants
  const pubkeys = ['alice-pubkey', 'bob-pubkey', 'carol-pubkey'];
  const pkhs = pubkeys.map((pk) => crypto.hashPubkey(pk));
  
  console.log('=== Multisig Demo ===');
  console.log('Participants:');
  pubkeys.forEach((pk, i) => {
    console.log(`  ${pk} -> PKH: ${truncateHash(pkhs[i])}`);
  });

  // 2. Create a 2-of-3 multisig lock
  const lock = createMultisigLock(2, pkhs);
  console.log(`\nLock: 2-of-3 multisig`);

  // 3. Create an input note (simulating existing UTXO)
  const inputNote = createNote({
    lock,
    amount: 100_000_000n, // 1.0 in 8 decimal places
    sourceDerivation: 'demo-source-001',
    crypto,
  });
  console.log(`\nInput Note:`);
  console.log(`  Amount: ${formatAmount(inputNote.amount)}`);
  console.log(`  Name: ${truncateHash(inputNote.name[0])}.${truncateHash(inputNote.name[1])}`);

  // 4. Build unsigned transaction
  const unsignedTx = buildSimpleTransaction({
    inputs: [inputNote],
    recipients: [
      { address: 'recipient-address-1', amount: 50_000_000n },
      { address: 'recipient-address-2', amount: 40_000_000n },
    ],
    fee: 10_000_000n,
    changeAddress: undefined, // No change needed (50 + 40 + 10 = 100)
    crypto,
  });
  
  console.log(`\nUnsigned Transaction:`);
  console.log(`  Hash: ${truncateHash(unsignedTx.unsignedHash)}`);
  console.log(`  Spends: ${unsignedTx.spends.length}`);
  console.log(`  Outputs: ${unsignedTx.outputs.length}`);
  console.log(`  Fee: ${formatAmount(unsignedTx.fee)}`);

  // 5. First signer (Alice) signs
  const aliceSigner = createMockSigner(pubkeys[0]);
  const noteId = unsignedTx.spends[0].noteId;
  
  const partiallySignedTx1 = await signSpend({
    tx: unsignedTx,
    noteId,
    signer: aliceSigner,
    crypto,
  });
  
  console.log(`\nAlice signed. Signatures: 1/2`);

  // 6. Export for sharing with Bob
  const exportedTx = exportTx(partiallySignedTx1);
  console.log(`\nExported TX length: ${exportedTx.length} chars`);

  // 7. Bob imports and signs
  const importedTx = importTx(exportedTx);
  const bobSigner = createMockSigner(pubkeys[1]);
  
  const partiallySignedTx2 = await signSpend({
    tx: importedTx,
    noteId,
    signer: bobSigner,
    crypto,
  });
  
  console.log(`Bob signed. Signatures: 2/2`);

  // 8. Merge signatures (if signed separately)
  const mergedTx = mergePartiallySignedTx(partiallySignedTx1, partiallySignedTx2);

  // 9. Check completion
  const isComplete = isTransactionFullySigned(mergedTx, crypto);
  const status = getTransactionStatus(mergedTx, crypto);
  
  console.log(`\nTransaction Status:`);
  console.log(`  Fully Signed: ${isComplete}`);
  console.log(`  Spend Status:`);
  status.spends.forEach((s) => {
    console.log(`    ${truncateHash(s.noteId)}: ${s.collected}/${s.threshold} (${s.complete ? 'COMPLETE' : 'pending'})`);
  });

  // 10. Show participants
  if (mergedTx.spends[0].seeds.kind === '%pkh') {
    const participants = getMultisigParticipants(mergedTx.spends[0].seeds, crypto);
    console.log(`\nParticipants:`);
    participants.forEach((p) => {
      console.log(`    ${p.pubkey}: ${p.hasSigned ? '✓ signed' : '○ pending'}`);
    });
  }

  return {
    pubkeys,
    pkhs,
    lock,
    inputNote,
    unsignedTx,
    partiallySignedTx1,
    partiallySignedTx2,
    mergedTx,
    isComplete,
    status,
  };
}

/**
 * Simple example for quick testing.
 */
export function createDemoNote(): Note {
  const pubkeys = ['demo-pubkey-1', 'demo-pubkey-2'];
  const pkhs = pubkeys.map((pk) => crypto.hashPubkey(pk));
  const lock = createMultisigLock(2, pkhs);
  
  return createNote({
    lock,
    amount: 1_000_000_000n,
    sourceDerivation: 'demo-source',
    crypto,
  });
}

/**
 * Create demo data for UI testing.
 */
export function createDemoData() {
  const pubkeys = ['alice', 'bob', 'carol'];
  const pkhs = pubkeys.map((pk) => crypto.hashPubkey(pk));
  
  const lock = createMultisigLock(2, pkhs);
  
  const notes: Note[] = [
    createNote({
      lock,
      amount: 500_000_000n,
      sourceDerivation: 'source-1',
      crypto,
    }),
    createNote({
      lock,
      amount: 300_000_000n,
      sourceDerivation: 'source-2',
      crypto,
    }),
  ];
  
  return {
    crypto,
    pubkeys,
    pkhs,
    lock,
    notes,
    signers: pubkeys.map((pk) => createMockSigner(pk)),
  };
}
