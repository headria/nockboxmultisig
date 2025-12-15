"use client";

import { useState } from "react";
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


export function Step4SignBroadcast() {
  const { transactionData, signatureRequests, updateSignatureRequest, setCurrentStep, resetTransaction, exportTx, isSigning: isContextSigning } = useTransaction();
  const { wallet, signTransaction, broadcastTransaction } = useWallet();
  const [isSigning, setIsSigning] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [selectedSigner, setSelectedSigner] = useState<string | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [singleSignerSigned, setSingleSignerSigned] = useState(false);
  const [signedTx, setSignedTx] = useState<unknown | null>(null);

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
      const firstOutput = transactionData.outputs[0];
      if (!firstOutput) throw new Error("No recipient output");

      const signed = await signTransaction({
        notes: transactionData.selectedNotes,
        recipient: firstOutput.address,
        amountNock: firstOutput.amount,
        feeNock: transactionData.fee,
      });
      setSignedTx(signed);
      
      // Update UI state
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
      const firstOutput = transactionData.outputs[0];
      if (!firstOutput) throw new Error("No recipient output");

      const signed = await signTransaction({
        notes: transactionData.selectedNotes,
        recipient: firstOutput.address,
        amountNock: firstOutput.amount,
        feeNock: transactionData.fee,
      });
      setSignedTx(signed);
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

  const getUnsignedTxString = (): string => {
    const tx = exportTx();
    if (!tx) {
      throw new Error("No transaction to export");
    }
    return tx;
  };

  const getSignedJam = (): Uint8Array => {
    if (signedTx && typeof signedTx === 'object' && signedTx !== null && 'toJam' in signedTx) {
      return (signedTx as { toJam: () => Uint8Array }).toJam();
    }
    throw new Error("No signed transaction available. Please sign first.");
  };

  const handleExportUnsignedTransaction = () => {
    try {
      const txString = getUnsignedTxString();
      const blob = new Blob([txString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nockbox-unsigned-${Date.now()}.json`;
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
      const txString = getUnsignedTxString();
      navigator.clipboard.writeText(txString);
      toast.success("Unsigned transaction copied to clipboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy transaction");
    }
  };

  const handleExportSignedTransaction = () => {
    try {
      const jam = getSignedJam();
      const blob = new Blob([new Uint8Array(jam)], { type: 'application/jam' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nockbox-signed-${Date.now()}.tx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Signed transaction exported successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export signed transaction");
    }
  };

  const handleCopySignedTransaction = () => {
    try {
      const jam = getSignedJam();
      const base64 = uint8ToBase64(jam);
      navigator.clipboard.writeText(base64);
      toast.success("Signed transaction (base64 jam) copied to clipboard");
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
                Export unsigned JSON for import, and signed .tx for manual broadcast
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
