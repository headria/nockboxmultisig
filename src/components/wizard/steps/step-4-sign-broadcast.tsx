"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTransaction } from "@/context/transaction-context";
import { useWallet } from "@/context/wallet-context";
import { ArrowLeft, Check, Loader2, QrCode, Send, Pen, Copy, ExternalLink, PartyPopper, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ensureIrisWasm } from "@/lib/iris-wasm";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
  } catch {
    return String(value);
  }
}

function describeUnlock(unlock: unknown): string {
  if (!unlock) return "Unlock requirement";
  if (typeof unlock === "string") return unlock;
  if (typeof unlock === "object") {
    const obj = unlock as Record<string, unknown>;
    if (typeof obj.type === "string") return `${obj.type} unlock`;
    if (typeof obj.kind === "string") return `${obj.kind} unlock`;
    if (Array.isArray(obj.pkhs)) return "Signature required";
    if ("hash" in obj) return "Preimage required";
  }
  return "Unlock requirement";
}
 
export function Step4SignBroadcast() {
  const {
    transactionData,
    signatureRequests,
    updateSignatureRequest,
    setCurrentStep,
    resetTransaction,
    isSigning: isContextSigning,
    missingUnlocks,
    nockchainTx,
    downloadUnsignedTx,
    getUnsignedTxArtifacts,
    getSigningPayload,
    signedTx,
    setSignedTx,
  } = useTransaction();
  const { wallet, signRawTx, broadcastTransaction } = useWallet();
  const [isSigning, setIsSigning] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [selectedSigner, setSelectedSigner] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [singleSignerSigned, setSingleSignerSigned] = useState(false);

  const signWithWallet = useCallback(async () => {
    const payload = getSigningPayload?.();
    if (!payload) {
      throw new Error("Please build the transaction before signing.");
    }

    try {
      const signedTxProtobuf = await signRawTx({
        rawTx: payload.rawTx,
        notes: payload.notes,
        spendConditions: payload.spendConditions,
      });

      const wasm = await ensureIrisWasm();
      const rawTx =
        signedTxProtobuf &&
        typeof signedTxProtobuf === "object" &&
        signedTxProtobuf !== null &&
        "toNockchainTx" in signedTxProtobuf
          ? (signedTxProtobuf as unknown)
          : wasm.RawTx.fromProtobuf(signedTxProtobuf);
      const signedNockchainTx =
        rawTx && typeof rawTx === "object" && rawTx !== null && "toNockchainTx" in rawTx
          ? (rawTx as { toNockchainTx: () => unknown }).toNockchainTx()
          : wasm.RawTx.fromProtobuf(rawTx as unknown).toNockchainTx();

      setSignedTx(signedNockchainTx);
    } finally {
      payload.release();
    }
  }, [getSigningPayload, setSignedTx, signRawTx]);

  // Check if this is single-signer mode (no multisig pubkeys)
  const isSingleSignerMode = transactionData.multisigConfig.pubkeys.length === 0;
  
  const signedCount = isSingleSignerMode 
    ? (singleSignerSigned ? 1 : 0)
    : signatureRequests.filter((r) => r.signed).length;
  const requiredCount = isSingleSignerMode ? 1 : transactionData.multisigConfig.m;
  const canBroadcast = signedCount >= requiredCount;

  // Sign transaction using connected Iris wallet
  const handleSign = async (id: string, pubkey: string) => {
    if (!wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }
    
    // Check if connected wallet matches the signer
    if (wallet.address !== pubkey) {
      toast.error("Connected wallet does not match this signer. Please connect the correct wallet.");
      return;
    }
    
    setIsSigning(id);
    try {
      await signWithWallet();
      updateSignatureRequest(id, `sig_${pubkey.slice(0, 8)}`);
      toast.success("Signature collected from your wallet");
    } catch (err) {
      console.error("Signing error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to sign transaction";
      if (errorMessage.includes("unlock") || errorMessage.includes("LOCKED")) {
        toast.error("Please unlock your Iris wallet and try again");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSigning(null);
    }
  };

  // Sign transaction for single-signer mode
  const handleSingleSign = async () => {
    if (!wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }
    
    setIsSigning("single");
    try {
      await signWithWallet();
      setSingleSignerSigned(true);
      toast.success("Transaction signed by your wallet");
    } catch (err) {
      console.error("Signing error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to sign transaction";
      if (errorMessage.includes("unlock") || errorMessage.includes("LOCKED")) {
        toast.error("Please unlock your Iris wallet and try again");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSigning(null);
    }
  };

  const handleShowQR = (id: string) => {
    setSelectedSigner(id);
    setShowQR(true);
  };

  const handleBroadcast = async () => {
    if (!wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }
    
    setIsBroadcasting(true);
    try {
      if (!signedTx) {
        throw new Error("No signed transaction available. Please sign first.");
      }

      console.log("Broadcasting signed transaction via gRPC...");
      const hash = await broadcastTransaction(signedTx);
      
      setTxHash(hash);
      toast.success("Transaction broadcast successfully!");
    } catch (err) {
      console.error("Broadcast error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to broadcast transaction";
      if (errorMessage.includes("unlock") || errorMessage.includes("LOCKED")) {
        toast.error("Please unlock your Iris wallet and try again");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleBack = () => {
    setCurrentStep(3);
  };

  const handleNewTransaction = () => {
    setTxHash(null);
    setIsSigning(null);
    setShowQR(false);
    setSelectedSigner(null);
    setIsBroadcasting(false);
    resetTransaction();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const uint8ToBase64 = (bytes: Uint8Array): string => {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...Array.from(chunk));
    }
    return btoa(binary);
  };

  const getSignedProtobufJson = (): string => {
    if (signedTx && typeof signedTx === 'object' && signedTx !== null && 'toRawTx' in signedTx) {
      const rawTx = (signedTx as { toRawTx: () => { toProtobuf: () => unknown } }).toRawTx();
      const protobuf = rawTx.toProtobuf();
      return JSON.stringify(protobuf);
    }
    throw new Error("No signed transaction available. Please sign first.");
  };

  // Get full wallet payload with notes and spendConditions for proper wallet signing
  const getFullWalletPayload = (rawTxProtobuf: unknown): string => {
    const payload = getSigningPayload?.();
    if (!payload) {
      // Fallback to just rawTx if no payload available
      return JSON.stringify({ rawTx: rawTxProtobuf });
    }
    
    // Convert notes and spendConditions to protobuf format
    const notesProtobuf = payload.notes.map((note: any) => {
      if (typeof note.toProtobuf === 'function') {
        return note.toProtobuf();
      }
      return note;
    });
    
    const spendConditionsProtobuf = payload.spendConditions.map((sc: any) => {
      if (typeof sc.toProtobuf === 'function') {
        return sc.toProtobuf();
      }
      return sc;
    });
    
    const fullPayload = {
      rawTx: rawTxProtobuf,
      notes: notesProtobuf,
      spendConditions: spendConditionsProtobuf,
    };
    
    // Don't release here as we may need it again
    return JSON.stringify(fullPayload, (_, v) => typeof v === 'bigint' ? v.toString() : v);
  };

  const handleExportUnsignedTransaction = () => {
    try {
      if (!nockchainTx) {
        throw new Error("Please build the transaction first.");
      }
      
      // Export full payload with notes and spendConditions
      const rawTx = nockchainTx.toRawTx();
      const rawTxProtobuf = rawTx.toProtobuf();
      const jsonStr = getFullWalletPayload(rawTxProtobuf);
      
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nockbox-unsigned-${Date.now()}.jam`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Unsigned transaction exported successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export transaction");
    }
  };

  const handleCopyUnsignedTransaction = () => {
    try {
      if (!nockchainTx) {
        throw new Error("Please build the transaction first.");
      }
      
      // Copy full payload with notes and spendConditions
      const rawTx = nockchainTx.toRawTx();
      const rawTxProtobuf = rawTx.toProtobuf();
      const jsonStr = getFullWalletPayload(rawTxProtobuf);
      const base64 = btoa(jsonStr);
      navigator.clipboard.writeText(base64);
      toast.success("Unsigned transaction copied as base64");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy transaction");
    }
  };

  const handleExportSignedTransaction = () => {
    try {
      if (signedTx && typeof signedTx === 'object' && signedTx !== null && 'toRawTx' in signedTx) {
        const rawTx = (signedTx as { toRawTx: () => { toProtobuf: () => unknown } }).toRawTx();
        const protobuf = rawTx.toProtobuf();
        const jsonStr = getFullWalletPayload(protobuf);
        
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nockbox-signed-${Date.now()}.tx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Signed transaction exported successfully");
      } else {
        throw new Error("No signed transaction available. Please sign first.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export signed transaction");
    }
  };

  const handleCopySignedTransaction = () => {
    try {
      if (signedTx && typeof signedTx === 'object' && signedTx !== null && 'toRawTx' in signedTx) {
        const rawTx = (signedTx as { toRawTx: () => { toProtobuf: () => unknown } }).toRawTx();
        const protobuf = rawTx.toProtobuf();
        const jsonStr = getFullWalletPayload(protobuf);
        const base64 = btoa(jsonStr);
        navigator.clipboard.writeText(base64);
        toast.success("Signed transaction (base64 JSON) copied to clipboard");
      } else {
        throw new Error("No signed transaction available. Please sign first.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy signed transaction");
    }
  };


  if (txHash) {
    return (
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto">
            <PartyPopper className="w-10 h-10 text-success" />
          </div>
          
          <div>
            <h2 className="text-2xl font-bold">Transaction Broadcast!</h2>
            <p className="text-muted-foreground mt-2">
              Your multisig transaction has been successfully submitted to the network.
            </p>
          </div>

          <Card className="bg-card border-border text-left">
            <CardContent className="py-4 space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Transaction Hash</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-secondary p-2 rounded break-all">
                    {txHash}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(txHash)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <Separator className="bg-border" />
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Signatures</div>
                  <div className="font-medium">{signedCount} of {transactionData.multisigConfig.n}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Sent</div>
                  <div className="font-medium">
                    {transactionData.outputs.reduce((sum, o) => sum + o.amount, 0).toFixed(4)} NOCK
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => window.open(`https://explorer.nockchain.io/tx/${txHash}`, "_blank")}
              className="border-border"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Explorer
            </Button>
            <Button
              onClick={handleNewTransaction}
              className="bg-[#FFC412] text-black hover:bg-[#FFD54F] font-medium"
            >
              New Transaction
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Sign & Broadcast</h2>
        <p className="text-muted-foreground">
          Collect signatures and broadcast the transaction
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Signature Progress</CardTitle>
              <CardDescription>
                {signedCount} of {requiredCount} required signatures collected
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                canBroadcast
                  ? "border-success text-success"
                  : "border-accent text-accent"
              )}
            >
              {signedCount}/{requiredCount}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-secondary rounded-full h-2 mb-6">
            <motion.div
              className="bg-accent h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(signedCount / requiredCount) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="space-y-3">
            {/* Single signer mode */}
            {isSingleSignerMode ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-center justify-between p-4 rounded-lg border transition-colors",
                  singleSignerSigned
                    ? "bg-success/10 border-success/50"
                    : "bg-secondary/50 border-border"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      singleSignerSigned ? "bg-success" : "bg-[#FFC412]"
                    )}
                  >
                    {singleSignerSigned ? (
                      <Check className="h-5 w-5 text-success-foreground" />
                    ) : (
                      <Pen className="h-5 w-5 text-black" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium">Your Wallet</div>
                    <div className="text-xs text-muted-foreground">
                      Single signature required
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {singleSignerSigned ? (
                    <Badge variant="outline" className="border-success text-success">
                      <Check className="h-3 w-3 mr-1" />
                      Signed
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleSingleSign}
                      disabled={isSigning === "single" || isContextSigning}
                      className="bg-[#FFC412] text-black hover:bg-[#FFD54F] font-medium"
                    >
                      {isSigning === "single" ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Signing...
                        </>
                      ) : (
                        <>
                          <Pen className="h-4 w-4 mr-2" />
                          Sign Transaction
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            ) : (
              /* Multisig mode */
              signatureRequests.map((request, index) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border transition-colors",
                    request.signed
                      ? "bg-success/10 border-success/50"
                      : "bg-secondary/50 border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        request.signed ? "bg-success" : "bg-secondary"
                      )}
                    >
                      {request.signed ? (
                        <Check className="h-5 w-5 text-success-foreground" />
                      ) : (
                        <span className="text-muted-foreground font-medium">{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <div className="font-medium">{request.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {request.pubkey.slice(0, 12)}...{request.pubkey.slice(-8)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {request.signed ? (
                      <Badge variant="outline" className="border-success text-success">
                        <Check className="h-3 w-3 mr-1" />
                        Signed
                      </Badge>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShowQR(request.id)}
                          className="border-border"
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSign(request.id, request.pubkey)}
                          disabled={isSigning === request.id || isContextSigning}
                          className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          {isSigning === request.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Signing...
                            </>
                          ) : (
                            <>
                              <Pen className="h-4 w-4 mr-2" />
                              Sign
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Export Transaction Card */}
      <Card className="bg-card border-border">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-lg font-medium">Export Transaction</div>
              <div className="text-sm text-muted-foreground">
                Export unsigned JAM for multisig workflows and signed .tx for manual broadcast
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyUnsignedTransaction}
                  className="border-border"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Unsigned
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportUnsignedTransaction}
                  className="border-border"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Unsigned
                </Button>
              </div>

              {signedTx ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopySignedTransaction}
                    className="border-border"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Signed
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExportSignedTransaction}
                    className="border-border"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Signed
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {missingUnlocks.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Missing Unlocks</CardTitle>
            <CardDescription>
              Provide the required signatures or preimages before the builder can finalize this transaction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {missingUnlocks.map((unlock, idx) => (
              <div key={`unlock-${idx}`} className="rounded-lg border border-border/80 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">{describeUnlock(unlock)}</div>
                  <Badge variant="outline" className="border-destructive text-destructive">
                    Action needed
                  </Badge>
                </div>
                <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {safeStringify(unlock)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Broadcast Card */}
      <Card className="bg-card border-border">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-lg font-medium">Ready to Broadcast</div>
              <div className="text-sm text-muted-foreground">
                {canBroadcast
                  ? "All required signatures collected. You can now broadcast."
                  : `Need ${requiredCount - signedCount} more signature${requiredCount - signedCount !== 1 ? "s" : ""}`}
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleBroadcast}
              disabled={!canBroadcast || isBroadcasting}
              className="bg-[#FFC412] text-black hover:bg-[#FFD54F] font-medium min-w-[180px]"
            >
              {isBroadcasting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Broadcasting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Broadcast Transaction
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} className="border-border">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Scan to Sign</DialogTitle>
            <DialogDescription>
              Scan this QR code with your Iris Wallet to sign the transaction
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG
                value={`iris://sign?tx=${selectedSigner}&data=mock_transaction_data`}
                size={200}
                level="H"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Open Iris Wallet and scan this code to provide your signature
            </p>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedSigner) {
                  const request = signatureRequests.find(r => r.id === selectedSigner);
                  if (request) {
                    handleSign(selectedSigner, request.pubkey);
                  }
                  setShowQR(false);
                }
              }}
              className="border-border"
            >
              Simulate Signature
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
