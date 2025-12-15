// Minimal interfaces to match tx-builder pattern
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProtobufRawTx {}

export interface SignedTxLike {
  toRawTx(): {
    toProtobuf(): ProtobufRawTx;
  };
}

export interface NockchainGrpcClientLike {
  sendTransaction(tx: ProtobufRawTx): Promise<{
    txid?: string;
    hash?: string;
    ok?: boolean;
    [k: string]: unknown;
  }>;
}

/**
 * Broadcast a fully signed transaction to the network via gRPC.
 * - signedTx MUST already include all required signatures.
 * - The node will validate and either accept to mempool or reject.
 */
export async function broadcastSignedTransaction(args: {
  signedTx: SignedTxLike;
  grpcClient: NockchainGrpcClientLike;
}): Promise<{ txid?: string; hash?: string; ok?: boolean; result: unknown }> {
  const txProtobuf = args.signedTx.toRawTx().toProtobuf();
  const result = await args.grpcClient.sendTransaction(txProtobuf);

  console.log('gRPC sendTransaction result:', result);
  console.log('gRPC sendTransaction result keys:', result && typeof result === 'object' ? Object.keys(result as Record<string, unknown>) : 'n/a');

  // Try to extract txid/hash from various possible response formats
  const r = result as Record<string, unknown>;
  
  // Check common field names for transaction ID
  const txid = r.txid ?? r.txId ?? r.tx_id ?? r.id ?? r.transactionId ?? r.transaction_id;
  const hash = r.hash ?? r.txHash ?? r.tx_hash ?? r.transactionHash ?? r.transaction_hash;
  
  // If result is a string, it might be the txid directly
  const directId = typeof result === 'string' ? result : undefined;

  return {
    txid: (txid as string) ?? directId,
    hash: hash as string,
    ok: r.ok as boolean,
    result,
  };
}
