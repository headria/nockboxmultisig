 
export type {
  Hash,
  Hex,
  PubKey,
  Address,
  Signature,
  NoteName,
  Note,
  Lock,
  Output,
  Spend,
  Seeds,
  PkhSeeds,
  HaxSeeds,
  TimSeeds,
  BrnSeeds,
  Transaction,
  Signer,
  CryptoProvider,
} from './tx-core';

export {
  // Note utilities
  noteIdFromName,
  buildNoteName,
  assertNoteNameMatchesLock,
  validateNotes,
  
  // Lock utilities
  encodeLock,
  lockHash,
  assertValidPkhLock,
  seedsFromLock,
  
  // Transaction building
  buildSpends,
  sumInputs,
  sumOutputs,
  buildUnsignedTransaction,
  encodeUnsignedPayload,
  
  // Signing
  attachSignatureToSpend,
  signSpend,
  signImportedTxJson,
  verifySignatureOnTx,
  countCollectedPkh,
  isPkhComplete,
  isTransactionFullySigned,
  
  // Serialization
  exportTx,
  importTx,
  mergePartiallySignedTx,
  
  // Encoding helpers
  canonicalStringify,
  deepCanonicalize,
  utf8ToBytes,
} from './tx-core';

// Crypto providers
export {
  MockCryptoProvider,
  WebCryptoProvider,
  createMockSigner,
  sha256Hash,
  sha256PubkeyHash,
} from './crypto';

// UI helpers
export type {
  SpendStatus,
  TransactionStatus,
  MultisigParticipant,
  SimpleTxParams,
  FeePerWordEstimate,
} from './helpers';

export {
  // Lock builders
  createSingleSigLock,
  createMultisigLock,
  createTimeLock,
  createHashLock,
  createBurnLock,
  
  // Note builders
  createNote,
  
  // Transaction status
  getTransactionStatus,
  getMultisigParticipants,
  canPubkeySign,
  hasPubkeySigned,
  
  // Simple transaction builder
  buildSimpleTransaction,
  
  // Fee calculation
  DEFAULT_FEE_PER_WORD_NICKS,
  feeNicksToNock,
  estimateFeePerWordFromByteLength,
  estimateFeePerWordFromBytes,
  getFeeTiersFromFeeNicks,
  
  // Formatting
  formatAmount,
  parseAmount,
  truncateHash,
  getNoteShortId,
} from './helpers';
