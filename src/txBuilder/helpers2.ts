import {
  type Transaction,
  type CryptoProvider,
  type PubKey,
  type Signature,
  encodeUnsignedPayload,
  attachSignatureToSpend,
} from "./tx-core";

type AsyncCallable<T = unknown> = () => Promise<T> | T;

type OptionalAsyncCallable<T = unknown> = () => Promise<T | undefined> | T | undefined;

interface IrisLike {
  connect?: AsyncCallable;
  enable?: AsyncCallable;
  wallet?: IrisLike;
  getAccount?: AsyncCallable;
  getActiveAccount?: AsyncCallable;
  account?: AsyncCallable;
  getPubkey?: AsyncCallable;
  getPublicKey?: AsyncCallable;
  signMessage?: (payload: Uint8Array | string) => Promise<unknown> | unknown;
  signBytes?: (payload: Uint8Array | string) => Promise<unknown> | unknown;
  [key: string]: unknown;
}

export type IrisWalletSession = {
  iris: IrisLike;
  pubkey?: PubKey;
};

/** Utility: try calling a list of async functions until one works. */
async function callFirst<T>(calls: Array<OptionalAsyncCallable<T>>): Promise<T | undefined> {
  for (const fn of calls) {
    try {
      const v = await fn();
      if (v !== undefined && v !== null) return v;
    } catch {}
  }
  return undefined;
}

/** Convert Uint8Array to base64 (browser-safe) */
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Connect to Iris Wallet and return the active pubkey.
 * This is intentionally defensive: iris-sdk method names may differ by version.
 */
export async function connectIrisWallet(): Promise<IrisWalletSession> {
  const sdk = (await import("@nockbox/iris-sdk")) as Record<string, unknown>;

  const IrisCtor = (sdk.Iris ?? sdk.Client ?? sdk.default ?? sdk.NockchainProvider) as
    | (new () => unknown)
    | IrisLike
    | undefined;
  if (!IrisCtor) {
    throw new Error(`iris-sdk: cannot find Iris client export. exports=${Object.keys(sdk).join(",")}`);
  }

  const iris: IrisLike =
    typeof IrisCtor === "function" ? ((new IrisCtor()) as IrisLike) : (IrisCtor as IrisLike);

  // Connect/enable if present
  const connectionInfo =
    (await callFirst<unknown>([
      () => iris.connect?.() ?? Promise.resolve(undefined),
      () => iris.enable?.() ?? Promise.resolve(undefined),
      () => iris.wallet?.connect?.() ?? Promise.resolve(undefined),
      () => iris.wallet?.enable?.() ?? Promise.resolve(undefined),
    ])) ?? undefined;

  // Try to fetch pubkey / account
  const acct =
    connectionInfo ??
    (await callFirst<unknown>([
      () => iris.getAccount?.() ?? Promise.resolve(undefined),
      () => iris.getActiveAccount?.() ?? Promise.resolve(undefined),
      () => iris.wallet?.getAccount?.() ?? Promise.resolve(undefined),
      () => iris.wallet?.getActiveAccount?.() ?? Promise.resolve(undefined),
      () => iris.account?.() ?? Promise.resolve(undefined),
    ])) ??
    undefined;

  // Common pubkey field guesses
  const pubkeyCandidate =
    (typeof acct === "object" && acct !== null
      ? (acct as Record<string, unknown>).pubkey ??
        (acct as Record<string, unknown>).publicKey ??
        (acct as Record<string, unknown>).publicKeyHex ??
        (acct as Record<string, unknown>).pk ??
        (acct as Record<string, unknown>).key
      : undefined) ??
    (typeof acct === "string" ? acct : undefined) ??
    (await callFirst<unknown>([
      () => iris.getPubkey?.() ?? Promise.resolve(undefined),
      () => iris.getPublicKey?.() ?? Promise.resolve(undefined),
      () => iris.wallet?.getPubkey?.() ?? Promise.resolve(undefined),
      () => iris.wallet?.getPublicKey?.() ?? Promise.resolve(undefined),
    ]));

  return { iris, pubkey: typeof pubkeyCandidate === "string" ? pubkeyCandidate : undefined };
}

/**
 * Ask Iris Wallet to sign bytes.
 * Some wallets expect bytes, some expect base64/hex. We try both.
 */
export async function irisSignBytes(
  iris: IrisLike,
  bytes: Uint8Array,
): Promise<{ signature: Signature; pubkey?: PubKey }> {
  const b64 = toBase64(bytes);

  const sig =
    (await callFirst<unknown>([
      () => iris.signMessage?.(bytes) ?? Promise.resolve(undefined),
      () => iris.signMessage?.(b64) ?? Promise.resolve(undefined),
      () => iris.signBytes?.(bytes) ?? Promise.resolve(undefined),
      () => iris.signBytes?.(b64) ?? Promise.resolve(undefined),
      () => iris.wallet?.signMessage?.(bytes) ?? Promise.resolve(undefined),
      () => iris.wallet?.signMessage?.(b64) ?? Promise.resolve(undefined),
      () => iris.wallet?.signBytes?.(bytes) ?? Promise.resolve(undefined),
      () => iris.wallet?.signBytes?.(b64) ?? Promise.resolve(undefined),
    ]));

  if (!sig) {
    const keys = Object.keys(iris);
    const wkeys = Object.keys(iris.wallet ?? {});
    throw new Error(`iris-sdk: no sign method found. irisKeys=${keys.join(",")} walletKeys=${wkeys.join(",")}`);
  }

  if (typeof sig === "string") {
    return { signature: sig };
  }

  const sigRecord = sig as Record<string, unknown>;
  const signature = (sigRecord.signature ?? sigRecord.sig ?? sig) as Signature;
  const pubkey: PubKey | undefined =
    (sigRecord.pubkey as PubKey | undefined) ??
    (sigRecord.publicKey as PubKey | undefined) ??
    (sigRecord.publicKeyHex as PubKey | undefined) ??
    (sigRecord.pk as PubKey | undefined) ??
    (sigRecord.key as PubKey | undefined) ??
    (Array.isArray(sig) && typeof sig[0] === "string" ? (sig[0] as PubKey) : undefined);

  return { signature, pubkey };
}

/**
 * Prepare the tx for signing:
 * - builds canonical unsigned bytes
 * - returns unsignedHash-compatible bytes (same bytes you hash in tx-core)
 */
export function buildSigningBytes(tx: Transaction): Uint8Array {
  return encodeUnsignedPayload({
    spends: tx.spends,
    outputs: tx.outputs,
    fee: tx.fee,
    version: tx.version,
  });
}

/**
 * Sign a tx with Iris Wallet and attach the signature to all eligible %pkh spends.
 *
 * What it does:
 * - connect wallet -> get pubkey
 * - compute unsigned bytes (deterministic)
 * - sign once
 * - verify signature
 * - attach signature to each spend where hashPubkey(pubkey) ∈ spend.seeds.pkhs
 */
export async function signTxWithIris(args: {
  tx: Transaction;
  crypto: CryptoProvider;
}): Promise<{ tx: Transaction; pubkey: PubKey; signature: Signature; signedNoteIds: string[] }> {
  const { tx, crypto } = args;

  const { iris, pubkey: sessionPubkey } = await connectIrisWallet();

  const bytes = buildSigningBytes(tx);
  const { signature, pubkey: sigPubkey } = await irisSignBytes(iris, bytes);
  const pubkey = sessionPubkey ?? sigPubkey;
  if (!pubkey) {
    throw new Error("Iris wallet did not provide a public key with the signature.");
  }

  // Verify cryptographically before mutating tx
  if (!crypto.verify(pubkey, bytes, signature)) {
    throw new Error("Wallet returned an invalid signature for the unsigned payload.");
  }

  let out = tx;
  const signedNoteIds: string[] = [];

  for (const s of tx.spends) {
    // Only %pkh spends accept signatures in this flow
    if (s.seeds.kind !== "%pkh") continue;

    const pkh = crypto.hashPubkey(pubkey);
    if (!s.seeds.pkhs.includes(pkh)) continue;

    out = attachSignatureToSpend({
      tx: out,
      noteId: s.noteId,
      pubkey,
      signature,
      crypto,
    });
    signedNoteIds.push(s.noteId);
  }

  if (signedNoteIds.length === 0) {
    throw new Error("This wallet is not authorized to sign any of the selected inputs.");
  }

  return { tx: out, pubkey, signature, signedNoteIds };
}
