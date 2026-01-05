import type { Transaction, Signature } from "./tx-core";

type WasmModule = typeof import("@nockbox/iris-sdk")["wasm"];

type NockchainTx = ReturnType<WasmModule["NockchainTx"]["fromJam"]>;

type TxNotes = ReturnType<WasmModule["TxBuilder"]["prototype"]["allNotes"]>;

type WasmNote = TxNotes["notes"][number];

type WasmSpendCondition = TxNotes["spendConditions"][number];

type ConversionResult = {
  transaction: Transaction;
  rawTx: WasmModule["RawTx"];
  notes: WasmNote[];
  spendConditions: WasmSpendCondition[];
};

export async function wasmTxToTransaction(tx: any): Promise<ConversionResult> {
  console.log('tx:', tx);
  
  // Get the protobuf representation which is a plain JS object
  let protobuf: any;
  if (typeof tx.toProtobuf === 'function') {
    protobuf = tx.toProtobuf();
  } else {
    // Already a plain object
    protobuf = tx;
  }
  console.log('protobuf:', protobuf);
  
  const outputs = protobuf.outputs || [];
  const spends = protobuf.spends || [];

  // Convert WASM spends to internal Spends
  const transactionSpends = spends.map((spend: any) => {
    console.log('spend structure:', JSON.stringify(spend, null, 2));
    
    // Extract PKH from spend_kind.Witness.witness.lock_merkle_proof.spend_condition.primitives
    const witness = spend.spend?.spend_kind?.Witness;
    const spendCondition = witness?.witness?.lock_merkle_proof?.spend_condition;
    const primitives = spendCondition?.primitives || [];
    
    // Find PKH primitive
    let pkhs: string[] = [];
    let threshold = 1;
    for (const p of primitives) {
      const pkhData = p?.primitive?.Pkh;
      if (pkhData) {
        pkhs = pkhData.hashes || [];
        threshold = pkhData.m || 1;
        break;
      }
    }
    
    // Extract existing signatures from pkh_signature.entries
    const pkhSigEntries = witness?.witness?.pkh_signature?.entries || [];
    const signatures: Record<string, string> = {};
    for (const entry of pkhSigEntries) {
      const pkh = entry.pkh || entry.key;
      const sig = entry.signature || entry.value;
      if (pkh && sig) {
        signatures[pkh] = sig;
      }
    }
    
    return {
      noteId: spend.name?.first || spend.noteId || 'unknown',
      seeds: {
        kind: "%pkh" as const,
        threshold,
        pkhs,
        signatures,
      },
      unlock: undefined,
    };
  });

  // Extract output amounts from the protobuf outputs (notes)
  // The outputs in JAM format are notes with assets.value
  const transactionOutputs = outputs.map((output: any) => {
    console.log('Processing output:', JSON.stringify(output, null, 2));
    
    // Handle different output structures
    const noteVersion = output.note_version?.V1 || output.V1 || output;
    const assets = noteVersion?.assets || output.assets;
    
    let amount = 0n;
    try {
      const rawValue = assets?.value || assets?.amount || '0';
      amount = BigInt(typeof rawValue === 'string' ? rawValue : String(rawValue));
    } catch (e) {
      console.log('Failed to parse output amount:', e);
    }
    
    // Try to get address from the note name or lock
    const name = noteVersion?.name || output.name;
    const address = name?.first || name?.last || 'unknown';
    
    return {
      address,
      amount,
    };
  });

  // Calculate total fee from spends
  let totalFee = 0n;
  for (const spend of spends) {
    try {
      const feeValue = spend.spend?.fee?.value || spend.fee?.value || '0';
      totalFee += BigInt(typeof feeValue === 'string' ? feeValue : String(feeValue));
    } catch (e) {
      console.log('Failed to parse fee:', e);
    }
  }

  // Create a Transaction with proper outputs for display
  const transaction: Transaction = {
    spends: transactionSpends,
    outputs: transactionOutputs,
    fee: totalFee,
    version: Number(protobuf.version?.value || 1),
    unsignedHash: protobuf.id || "dummy" as any,
  };

  // Notes are the output notes, spendConditions are empty for JAM
  const notes: WasmNote[] = outputs;
  const spendConditions: WasmSpendCondition[] = [];

  return { transaction, rawTx: tx, notes, spendConditions };
}

function convertWasmSeeds(seeds: any, witness?: any): any {
  // Try to extract PKH from witness if available
  const pkhSig = witness?.pkh_signature;
  if (pkhSig) {
    // Extract PKH from the pkh_signature structure
    const pkh = pkhSig.pkh?.value || pkhSig.pkh;
    const sig = pkhSig.signature?.value || pkhSig.signature;
    return {
      kind: "%pkh",
      threshold: 1,
      pkhs: pkh ? [pkh] : [],
      signatures: sig ? [{ [pkh]: sig }] : [],
    };
  }
  
  if (!seeds) {
    return { kind: "%pkh", threshold: 1, pkhs: [], signatures: [] };
  }
  
  // Handle array of seeds - extract lock_root as PKH
  if (Array.isArray(seeds)) {
    const pkhs = seeds
      .map((s: any) => s.lock_root)
      .filter((lr: any) => lr);
    return { kind: "%pkh", threshold: 1, pkhs, signatures: [] };
  }
  
  if (seeds.kind === "%pkh") {
    return {
      kind: "%pkh",
      threshold: seeds.threshold,
      pkhs: (seeds.pkhs || []).map((pkh: any) => pkh.value || pkh),
      signatures: (seeds.signatures || []).map((sig: any) => ({ [sig.key]: sig.value })) as Signature[],
    };
  }
  // For other kinds, return dummy
  return { kind: "%pkh", threshold: 1, pkhs: [], signatures: [] };
}
