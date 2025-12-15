"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTransaction } from "@/context/transaction-context";
import { ArrowLeft, ArrowRight, Fuel, AlertTriangle, Zap, TrendingUp, CheckCircle2, Send, Users, Sparkles, CircleDollarSign, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_FEE_PER_WORD_NICKS, estimateFeePerWordFromBytes, feeNicksToNock, encodeUnsignedPayload } from "@/txBuilder";
import { Output } from "@/types";
import { validateRecipientAddress } from "@/lib/address-utils";

export function Step3FeesReview() {
  const { transactionData, updateFee, updateOutputs, setCurrentStep, buildTx, isBuilding, txError } = useTransaction();
  const [fee, setFee] = useState(transactionData.fee);
  const [useCalculatedFee, setUseCalculatedFee] = useState(true);
  
  // Local outputs state
  const [outputs, setOutputs] = useState<Output[]>(
    transactionData.outputs.length > 0
      ? transactionData.outputs
      : [{ id: "out-1", address: "", amount: 0, asset: "NOCK" }]
  );

  // Sync outputs with context when navigating back
  useEffect(() => {
    if (transactionData.outputs.length > 0) {
      setOutputs(transactionData.outputs);
    }
  }, [transactionData.outputs]);

  const updateOutput = (id: string, field: keyof Output, value: string | number) => {
    setOutputs(
      outputs.map((o) =>
        o.id === id ? { ...o, [field]: field === "amount" ? parseFloat(value as string) || 0 : value } : o
      )
    );
  };

  const addOutput = () => {
    setOutputs([...outputs, { id: `out-${Date.now()}`, address: "", amount: 0, asset: "NOCK" }]);
  };

  const removeOutput = (id: string) => {
    if (outputs.length <= 1) {
      toast.error("At least one recipient is required");
      return;
    }
    setOutputs(outputs.filter((o) => o.id !== id));
  };

  // Calculate totals
  const outputTotal = outputs.reduce((sum, o) => sum + o.amount, 0);
  const inputTotal = transactionData.selectedNotes.reduce((sum, n) => sum + n.amount, 0);

  // Estimate fee using Iris SDK fee-per-word model
  const estimatedPayloadBytes = encodeUnsignedPayload({
    version: 1,
    network: "nock",
    spends: transactionData.selectedNotes.map((n) => ({
      noteId: n.id,
      seeds: { kind: "%pkh", threshold: 1, pkhs: [], signatures: {} },
    })),
    outputs: outputs.map((o) => ({
      address: o.address,
      amount: BigInt(Math.floor((o.amount || 0) * 65536)),
    })),
    fee: 0n,
  });

  const requiredFeeEstimate = estimateFeePerWordFromBytes({
    bytes: estimatedPayloadBytes,
    feePerWordNicks: DEFAULT_FEE_PER_WORD_NICKS,
  });

  const requiredFeeNock = feeNicksToNock(requiredFeeEstimate.feeNicks);

  // Sync fee state with context when navigating back
  useEffect(() => {
    setFee(transactionData.fee);
  }, [transactionData.fee]);

  // Auto-set calculated fee
  useEffect(() => {
    if (useCalculatedFee && requiredFeeNock > 0) {
      setFee(parseFloat((requiredFeeNock * 1.25).toFixed(6)));
    }
  }, [useCalculatedFee, requiredFeeNock]);

  const change = inputTotal - outputTotal - fee;
  const feeIsSufficient = fee >= requiredFeeNock;
  const hasValidOutputs = outputs.some((o) => o.address.trim() && o.amount > 0);
  const isValid = fee > 0 && feeIsSufficient && change >= 0 && transactionData.selectedNotes.length > 0 && hasValidOutputs;

  const handleBack = () => {
    setCurrentStep(2);
  };

  const handleNext = async () => {
    // Validate all addresses first
    for (const output of outputs) {
      if (output.address.trim()) {
        const addressError = validateRecipientAddress(output.address);
        if (addressError) {
          toast.error(`Invalid address: ${addressError}`);
          return;
        }
      }
    }
    
    const validOutputs = outputs.filter((o) => o.address.trim() && o.amount > 0);
    if (validOutputs.length === 0) {
      toast.error("Please enter at least one recipient");
      return;
    }
    if (fee <= 0) {
      toast.error("Please set a valid fee");
      return;
    }
    if (fee < requiredFeeNock) {
      toast.error(`Fee is too low. Minimum required is ${requiredFeeNock.toFixed(6)} NOCK`);
      return;
    }
    if (change < 0) {
      toast.error("Insufficient funds for this transaction");
      return;
    }
    
    // Save outputs and fee to context
    updateOutputs(validOutputs);
    updateFee(fee);
    
    // Build the transaction with outputs passed directly (to avoid async state issue)
    toast.info("Building transaction...");
    const tx = await buildTx({ outputs: validOutputs, fee });
    if (tx) {
      toast.success("Transaction built successfully!");
      console.log("Built transaction:", tx);
      setCurrentStep(4);
    } else {
      toast.error(txError || "Failed to build transaction");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h2 className="text-3xl font-bold">Send To</h2>
        <p className="text-muted-foreground">
          Enter recipient details and confirm your transaction
        </p>
      </motion.div>

      {/* Balance Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card className="bg-gradient-to-r from-[#FFC412]/10 to-transparent border-[#FFC412]/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Selected Notes</p>
                <p className="text-xl font-bold">{inputTotal.toFixed(4)} <span className="text-sm font-normal text-muted-foreground">NOCK</span></p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className={`text-xl font-bold ${change < 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(4)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Send To Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-[#FFC412]" />
                <h3 className="font-semibold">Recipients</h3>
              </div>
              <Button variant="outline" size="sm" onClick={addOutput} className="h-8 text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add Recipient
              </Button>
            </div>

            <div className="space-y-3">
              {outputs.map((output) => {
                const addressError = output.address.trim() ? validateRecipientAddress(output.address) : null;
                const isAddressValid = output.address.trim() && !addressError;
                
                return (
                <div key={output.id} className="p-3 rounded-lg bg-card/50 border border-border/50 space-y-3">
                  <div className="relative">
                    <Input
                      placeholder="Recipient address (Base58)"
                      value={output.address}
                      onChange={(e) => updateOutput(output.id, "address", e.target.value)}
                      className={`bg-background/50 h-11 pr-10 font-mono text-sm placeholder:font-sans ${
                        addressError 
                          ? "border-red-500 focus:border-red-500" 
                          : isAddressValid 
                            ? "border-green-500 focus:border-green-500" 
                            : "border-border"
                      }`}
                    />
                    {outputs.length > 1 && (
                      <button
                        onClick={() => removeOutput(output.id)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {addressError && (
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {addressError}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder="0.00"
                        value={output.amount || ""}
                        onChange={(e) => updateOutput(output.id, "amount", e.target.value)}
                        className="bg-background/50 border-border h-11 pr-16 text-lg font-semibold"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                        NOCK
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateOutput(output.id, "amount", Math.max(0, inputTotal - fee).toString())}
                      className="h-11 px-3 border-border hover:bg-[#FFC412]/10 hover:text-[#FFC412] hover:border-[#FFC412]/50"
                    >
                      MAX
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Fee Selection Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="overflow-hidden border-[#FFC412]/20 bg-gradient-to-br from-[#FFC412]/5 to-transparent">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-[#FFC412]/20 flex items-center justify-center">
                <Fuel className="w-4 h-4 text-[#FFC412]" />
              </div>
              <div>
                <h3 className="font-semibold">Network Fee</h3>
                <p className="text-xs text-muted-foreground">Select transaction speed</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() => { setFee(parseFloat(requiredFeeNock.toFixed(6))); setUseCalculatedFee(false); }}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  Math.abs(fee - requiredFeeNock) < 0.0001
                    ? "border-[#FFC412] bg-[#FFC412]/10"
                    : "border-border hover:border-[#FFC412]/50 bg-card/50"
                }`}
              >
                <Zap className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-xs font-medium">Economy</div>
                <div className="text-sm font-bold text-[#FFC412]">{requiredFeeNock.toFixed(4)}</div>
              </button>

              <button
                onClick={() => { setFee(parseFloat((requiredFeeNock * 1.25).toFixed(6))); setUseCalculatedFee(true); }}
                className={`relative p-3 rounded-lg border-2 transition-all text-center ${
                  Math.abs(fee - requiredFeeNock * 1.25) < 0.0001
                    ? "border-[#FFC412] bg-[#FFC412]/10"
                    : "border-border hover:border-[#FFC412]/50 bg-card/50"
                }`}
              >
                {Math.abs(fee - requiredFeeNock * 1.25) < 0.0001 && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-[#FFC412] text-black text-[9px] font-bold rounded-full">
                    REC
                  </div>
                )}
                <Sparkles className="w-4 h-4 mx-auto mb-1 text-[#FFC412]" />
                <div className="text-xs font-medium">Standard</div>
                <div className="text-sm font-bold text-[#FFC412]">{(requiredFeeNock * 1.25).toFixed(4)}</div>
              </button>

              <button
                onClick={() => { setFee(parseFloat((requiredFeeNock * 2).toFixed(6))); setUseCalculatedFee(false); }}
                className={`p-3 rounded-lg border-2 transition-all text-center ${
                  Math.abs(fee - requiredFeeNock * 2) < 0.0001
                    ? "border-[#FFC412] bg-[#FFC412]/10"
                    : "border-border hover:border-[#FFC412]/50 bg-card/50"
                }`}
              >
                <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-xs font-medium">Priority</div>
                <div className="text-sm font-bold text-[#FFC412]">{(requiredFeeNock * 2).toFixed(4)}</div>
              </button>
            </div>

            <div className="flex items-center gap-2 p-2 rounded bg-background/50 border border-border">
              <span className="text-xs text-muted-foreground">Custom:</span>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={fee}
                onChange={(e) => { setFee(parseFloat(e.target.value) || 0); setUseCalculatedFee(false); }}
                className="bg-transparent border-0 h-7 text-right font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <span className="text-xs font-medium text-muted-foreground">NOCK</span>
            </div>

            <div className={`mt-2 flex items-center gap-1.5 text-xs ${feeIsSufficient ? "text-green-500" : "text-destructive"}`}>
              {feeIsSufficient ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Fee OK (min: {requiredFeeNock.toFixed(4)})</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  <span>Fee too low (min: {requiredFeeNock.toFixed(4)})</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Transaction Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Send className="w-4 h-4 text-accent" />
              <h3 className="font-semibold">Summary</h3>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Input ({transactionData.selectedNotes.length} notes)</span>
                <span className="font-mono">{inputTotal.toFixed(4)} NOCK</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground">Output ({outputs.filter(o => o.amount > 0).length})</span>
                <span className="font-mono text-orange-400">-{outputTotal.toFixed(4)} NOCK</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/50">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Fuel className="w-3 h-3" /> Fee
                </span>
                <span className="font-mono text-orange-400">-{fee.toFixed(4)} NOCK</span>
              </div>
              <div className="flex justify-between py-2 bg-accent/5 -mx-5 px-5 rounded">
                <span className="font-semibold">Change</span>
                <span className={`font-mono font-bold ${change < 0 ? "text-destructive" : "text-green-500"}`}>
                  {change >= 0 ? "+" : ""}{change.toFixed(4)} NOCK
                </span>
              </div>
            </div>

            {change < 0 && (
              <div className="mt-3 flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Insufficient funds</span>
              </div>
            )}

            {/* Multisig Info */}
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Multisig</span>
              </div>
              <div className="flex items-center flex-wrap gap-1.5">
                <Badge className="bg-[#FFC412]/20 text-[#FFC412] border-[#FFC412]/30 text-xs">
                  {transactionData.multisigConfig.m} of {transactionData.multisigConfig.n}
                </Badge>
                {transactionData.multisigConfig.pubkeys.slice(0, 3).map((pk) => (
                  <Badge key={pk.id} variant="secondary" className="bg-secondary/50 text-xs">
                    {pk.label}
                  </Badge>
                ))}
                {transactionData.multisigConfig.pubkeys.length > 3 && (
                  <Badge variant="secondary" className="bg-secondary/50 text-xs">
                    +{transactionData.multisigConfig.pubkeys.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="flex items-center justify-between pt-2"
      >
        <Button variant="ghost" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isValid || isBuilding}
          size="lg"
          className="bg-[#FFC412] text-black hover:bg-[#FFD54F] font-semibold px-8 rounded-xl shadow-lg shadow-[#FFC412]/20 disabled:opacity-50 disabled:shadow-none"
        >
          {isBuilding ? (
            <>
              <div className="w-4 h-4 mr-2 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Building...
            </>
          ) : (
            <>
              Build & Sign
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
