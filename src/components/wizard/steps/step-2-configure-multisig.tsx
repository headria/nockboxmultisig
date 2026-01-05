"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTransaction } from "@/context/transaction-context";
import { useWallet } from "@/context/wallet-context";
import { Pubkey, DestinationLock } from "@/types";
import { ArrowLeft, ArrowRight, Key, Shield, User, Plus, X, Users, Lock } from "lucide-react";
import { toast } from "sonner";

export function Step2ConfigureMultisig() {
  const { transactionData, updateMultisigConfig, updateDestinationLock, setCurrentStep, currentStep } = useTransaction();
  const { wallet } = useWallet();
  
  // Derive multisig config from selected notes (for INPUT signing requirements)
  const derivedConfig = useMemo(() => {
    const multisigNotes = transactionData.selectedNotes.filter(n => n.isMultisig && n.multisigConfig);
    
    if (multisigNotes.length === 0) {
      return { m: 1, n: 1, pubkeys: [], isSingleSigner: true };
    }
    
    const pubkeyMap = new Map<string, Pubkey>();
    let maxM = 1;
    
    for (const note of multisigNotes) {
      if (note.multisigConfig) {
        maxM = Math.max(maxM, note.multisigConfig.m);
        for (const pk of note.multisigConfig.pubkeys) {
          if (!pubkeyMap.has(pk.pubkey)) {
            pubkeyMap.set(pk.pubkey, pk);
          }
        }
      }
    }
    
    const allPubkeys = Array.from(pubkeyMap.values());
    return { 
      m: maxM, 
      n: allPubkeys.length, 
      pubkeys: allPubkeys,
      isSingleSigner: false
    };
  }, [transactionData.selectedNotes]);

  const [m, setM] = useState(derivedConfig.m);
  const [n, setN] = useState(derivedConfig.n);
  const [pubkeys, setPubkeys] = useState<Pubkey[]>(derivedConfig.pubkeys);

  // Destination lock state (for OUTPUT multisig)
  const [enableMultisigOutput, setEnableMultisigOutput] = useState(
    transactionData.destinationLock?.type === "multisig"
  );
  const [destThreshold, setDestThreshold] = useState(
    transactionData.destinationLock?.threshold || 2
  );
  const [destSigners, setDestSigners] = useState<Pubkey[]>(
    transactionData.destinationLock?.signers || []
  );
  const [newSignerAddress, setNewSignerAddress] = useState("");
  const [newSignerLabel, setNewSignerLabel] = useState("");

  // Update local state when derived config changes
  useEffect(() => {
    setM(derivedConfig.m);
    setN(derivedConfig.n);
    setPubkeys(derivedConfig.pubkeys);
  }, [derivedConfig]);

  // Restore destination lock state from context
  useEffect(() => {
    if (transactionData.destinationLock) {
      setEnableMultisigOutput(transactionData.destinationLock.type === "multisig");
      setDestThreshold(transactionData.destinationLock.threshold);
      setDestSigners(transactionData.destinationLock.signers);
    }
  }, [transactionData.destinationLock]);

  const handleAddSigner = () => {
    const address = newSignerAddress.trim();
    if (!address) {
      toast.error("Please enter a signer address");
      return;
    }
    
    // Check for duplicates
    if (destSigners.some(s => s.pubkey.toLowerCase() === address.toLowerCase())) {
      toast.error("This signer is already added");
      return;
    }
    
    const newSigner: Pubkey = {
      id: `signer-${Date.now()}`,
      pubkey: address,
      label: newSignerLabel.trim() || `Signer ${destSigners.length + 1}`,
    };
    
    setDestSigners([...destSigners, newSigner]);
    setNewSignerAddress("");
    setNewSignerLabel("");
  };

  const handleRemoveSigner = (id: string) => {
    setDestSigners(destSigners.filter(s => s.id !== id));
  };

  const handleAddCurrentWallet = () => {
    if (!wallet.address) {
      toast.error("Wallet not connected");
      return;
    }
    
    if (destSigners.some(s => s.pubkey.toLowerCase() === wallet.address!.toLowerCase())) {
      toast.error("Your wallet is already added");
      return;
    }
    
    const newSigner: Pubkey = {
      id: `signer-wallet-${Date.now()}`,
      pubkey: wallet.address,
      label: "My Wallet",
    };
    
    setDestSigners([...destSigners, newSigner]);
  };

  const handleBack = () => {
    const cc = parseInt(currentStep.toString()) - 1;
    if (cc < 1) {
      setCurrentStep(1);
    } else {
      setCurrentStep(cc);
    }
  };

  const handleNext = () => {
    // Update input multisig config
    updateMultisigConfig({ m, n, pubkeys });
    
    // Update destination lock config
    if (enableMultisigOutput && destSigners.length >= 2) {
      const destinationLock: DestinationLock = {
        id: `dest-lock-${Date.now()}`,
        name: `Multisig ${destThreshold}-of-${destSigners.length}`,
        type: "multisig",
        threshold: Math.min(destThreshold, destSigners.length),
        signers: destSigners,
      };
      updateDestinationLock(destinationLock);
    } else {
      updateDestinationLock(undefined);
    }
    
    setCurrentStep(3);
  };

  // Validation
  const isInputValid = derivedConfig.isSingleSigner || pubkeys.length > 0;
  const isDestValid = !enableMultisigOutput || (destSigners.length >= 2 && destThreshold >= 1 && destThreshold <= destSigners.length);
  const isValid = isInputValid && isDestValid;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h2 className="text-3xl font-bold">Transaction Configuration</h2>
        <p className="text-muted-foreground">
          Configure signing requirements and destination lock
        </p>
      </motion.div>

      {/* Input Signing Requirements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-gradient-to-r from-[#FFC412]/10 to-transparent border-[#FFC412]/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-[#FFC412]" />
              Input Signing Requirements
            </CardTitle>
            <CardDescription>
              Signatures needed to spend your selected notes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#FFC412]/20 flex items-center justify-center">
                {derivedConfig.isSingleSigner ? (
                  <User className="w-6 h-6 text-[#FFC412]" />
                ) : (
                  <Shield className="w-6 h-6 text-[#FFC412]" />
                )}
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#FFC412]">
                  {derivedConfig.isSingleSigner ? "1 of 1" : `${m} of ${n}`}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {derivedConfig.isSingleSigner 
                    ? "Only your signature is needed"
                    : `${m} signature${m !== 1 ? "s" : ""} required`
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Destination Lock Configuration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5 text-accent" />
                  Send to Multisig
                </CardTitle>
                <CardDescription>
                  Create a multisig-protected output
                </CardDescription>
              </div>
              <Switch
                checked={enableMultisigOutput}
                onCheckedChange={setEnableMultisigOutput}
              />
            </div>
          </CardHeader>
          
          {enableMultisigOutput && (
            <CardContent className="space-y-4">
              {/* Threshold Selector */}
              <div className="space-y-2">
                <Label>Required Signatures (Threshold)</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDestThreshold(Math.max(1, destThreshold - 1))}
                    disabled={destThreshold <= 1}
                  >
                    -
                  </Button>
                  <div className="px-4 py-2 bg-secondary rounded-md font-medium min-w-[80px] text-center">
                    {destThreshold} of {destSigners.length}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDestThreshold(Math.min(destSigners.length || 1, destThreshold + 1))}
                    disabled={destThreshold >= destSigners.length}
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Add Signer */}
              <div className="space-y-2">
                <Label>Add Signer</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Signer address (PKH)"
                    value={newSignerAddress}
                    onChange={(e) => setNewSignerAddress(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Label (optional)"
                    value={newSignerLabel}
                    onChange={(e) => setNewSignerLabel(e.target.value)}
                    className="w-32"
                  />
                  <Button onClick={handleAddSigner} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddCurrentWallet}
                  className="mt-2"
                >
                  <User className="h-4 w-4 mr-2" />
                  Add My Wallet
                </Button>
              </div>

              {/* Signers List */}
              <div className="space-y-2">
                <Label>Signers ({destSigners.length})</Label>
                {destSigners.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-lg">
                    No signers added. Add at least 2 signers for multisig.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {destSigners.map((signer, index) => (
                      <div
                        key={signer.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border"
                      >
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium text-sm">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{signer.label}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {signer.pubkey}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSigner(signer.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {destSigners.length >= 2 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">
                      Output will require {destThreshold} of {destSigners.length} signatures to spend
                    </span>
                  </div>
                )}
                {enableMultisigOutput && destSigners.length < 2 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-600">
                    <Shield className="h-4 w-4" />
                    <span className="text-sm">
                      Add at least 2 signers for multisig
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-between pt-2"
      >
        <Button variant="ghost" onClick={handleBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isValid}
          size="lg"
          className="bg-[#FFC412] text-black hover:bg-[#FFD54F] font-semibold px-8 rounded-xl shadow-lg shadow-[#FFC412]/20 disabled:opacity-50 disabled:shadow-none"
        >
          Continue to Send
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
