"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTransaction } from "@/context/transaction-context";
import { Pubkey } from "@/types";
import { ArrowLeft, ArrowRight, Key, Shield, User } from "lucide-react";

export function Step2ConfigureMultisig() {
  const { transactionData, updateMultisigConfig, setCurrentStep, currentStep } = useTransaction();
  
  // Derive multisig config from selected notes
  const derivedConfig = useMemo(() => {
    // Find multisig notes among selected notes
    const multisigNotes = transactionData.selectedNotes.filter(n => n.isMultisig && n.multisigConfig);
    
    if (multisigNotes.length === 0) {
      // No multisig notes - single signer mode (1 of 1)
      return { m: 1, n: 1, pubkeys: [], isSingleSigner: true };
    }
    
    // Collect all unique pubkeys from multisig notes
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

  // Update local state when derived config changes (selected notes change)
  useEffect(() => {
    setM(derivedConfig.m);
    setN(derivedConfig.n);
    setPubkeys(derivedConfig.pubkeys);
  }, [derivedConfig]);

  const handleBack = () => {
    const cc = parseInt(currentStep.toString()) - 1;
    if (cc < 1) {
      setCurrentStep(1);
    } else {
      setCurrentStep(cc);
    }
  };

  const handleNext = () => {
    updateMultisigConfig({ m, n, pubkeys });
    setCurrentStep(3);
  };

  // Valid if single signer or has pubkeys for multisig
  const isValid = derivedConfig.isSingleSigner || pubkeys.length > 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h2 className="text-3xl font-bold">
          {derivedConfig.isSingleSigner ? "Single Signer" : "Multisig Configuration"}
        </h2>
        <p className="text-muted-foreground">
          {derivedConfig.isSingleSigner 
            ? "Your selected notes only require your signature"
            : "Review your signing requirements"
          }
        </p>
      </motion.div>

      {/* Threshold Display */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-gradient-to-r from-[#FFC412]/10 to-transparent border-[#FFC412]/20">
          <CardContent className="py-6">
            <div className="flex items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#FFC412]/20 flex items-center justify-center">
                {derivedConfig.isSingleSigner ? (
                  <User className="w-6 h-6 text-[#FFC412]" />
                ) : (
                  <Shield className="w-6 h-6 text-[#FFC412]" />
                )}
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-[#FFC412]">
                  {derivedConfig.isSingleSigner ? "1 of 1" : `${m} of ${n}`}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {derivedConfig.isSingleSigner 
                    ? "Only your signature is needed"
                    : `${m} signature${m !== 1 ? "s" : ""} required to authorize transaction`
                  }
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Signers List - only show for multisig */}
      {!derivedConfig.isSingleSigner && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="h-5 w-5 text-accent" />
                Authorized Signers
              </CardTitle>
              <CardDescription>
                Wallets that can sign this transaction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pubkeys.map((pk, index) => (
                  <motion.div
                    key={pk.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{pk.label}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {pk.pubkey}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      Signer
                    </Badge>
                  </motion.div>
                ))}
                {pubkeys.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No signers configured
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
