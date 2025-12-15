"use client";

import { motion } from "framer-motion";
import { useTransaction } from "@/context/transaction-context";
import { WizardStep } from "@/types";
import { Check, Wallet, Shield, Send, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const steps: { step: WizardStep; label: string; shortLabel: string; icon: typeof Send }[] = [
  { step: 1, label: "Select Notes", shortLabel: "Notes", icon: Wallet },
  { step: 2, label: "Signers", shortLabel: "Signers", icon: Shield },
  { step: 3, label: "Send To", shortLabel: "Send", icon: Send },
  { step: 4, label: "Sign & Broadcast", shortLabel: "Sign", icon: Radio },
];

export function ProgressBar() {
  const { currentStep, setCurrentStep } = useTransaction();

  const getStepStatus = (step: WizardStep) => {
    if (step < currentStep) return "completed";
    if (step === currentStep) return "current";
    return "upcoming";
  };

  const handleStepClick = (step: WizardStep) => {
    if (step < currentStep) {
      setCurrentStep(step);
    }
  };

  return (
    <div className="w-full py-6 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Compact horizontal stepper */}
        <div className="flex items-center justify-between gap-2">
          {steps.map(({ step, label, icon: Icon }, index) => {
            const status = getStepStatus(step);
            const isClickable = step < currentStep;
            const isLast = index === steps.length - 1;

            return (
              <div key={step} className="flex items-center flex-1">
                <motion.button
                  onClick={() => handleStepClick(step)}
                  disabled={!isClickable}
                  className={cn(
                    "relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all border",
                    isClickable && "cursor-pointer hover:bg-[#FFC412]/5 hover:border-[#FFC412]/30",
                    status === "current" && "bg-[#FFC412]/15 border-[#FFC412] shadow-lg shadow-[#FFC412]/20",
                    status === "completed" && "bg-[#FFC412]/5 border-[#FFC412]/40",
                    status === "upcoming" && "bg-muted/30 border-border/50 opacity-60"
                  )}
                  whileHover={isClickable ? { scale: 1.02 } : {}}
                  whileTap={isClickable ? { scale: 0.98 } : {}}
                >
                  {/* Step indicator */}
                  <motion.div
                    className={cn(
                      "relative w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                      status === "completed" && "bg-[#FFC412] text-black",
                      status === "current" && "bg-[#FFC412] text-black shadow-md shadow-[#FFC412]/40",
                      status === "upcoming" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {status === "completed" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                    
                    {/* Pulse animation for current step */}
                    {status === "current" && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-[#FFC412]"
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.5, opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                      />
                    )}
                  </motion.div>

                  {/* Step label */}
                  <div className="hidden sm:flex flex-col items-start">
                    <span
                      className={cn(
                        "text-sm font-semibold transition-colors whitespace-nowrap",
                        status === "completed" && "text-[#FFC412]",
                        status === "current" && "text-foreground",
                        status === "upcoming" && "text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                    <span className={cn(
                      "text-[10px]",
                      status === "current" ? "text-[#FFC412]" : "text-muted-foreground/70"
                    )}>
                      Step {step}
                    </span>
                  </div>
                </motion.button>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex-1 h-[3px] mx-2 sm:mx-3 relative min-w-[20px]">
                    <div className="absolute inset-0 bg-border/50 rounded-full" />
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#FFC412] to-[#FFD54F] rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ 
                        width: status === "completed" ? "100%" : "0%" 
                      }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
