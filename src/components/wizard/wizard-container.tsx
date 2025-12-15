"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTransaction } from "@/context/transaction-context";
import { ProgressBar } from "./progress-bar";
import { Step1OutputsSeeds } from "./steps/step-1-outputs-seeds";
import { Step2ConfigureMultisig } from "./steps/step-2-configure-multisig";
import { Step3FeesReview } from "./steps/step-3-fees-review";
import { Step4SignBroadcast } from "./steps/step-4-sign-broadcast";

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 50 : -50,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 50 : -50,
    opacity: 0,
    scale: 0.98,
  }),
};

export function WizardContainer() {
  const { currentStep } = useTransaction();
  const [direction, setDirection] = useState(1);
  const [prevStep, setPrevStep] = useState(currentStep);

  useEffect(() => {
    const curr = Number(currentStep);
    const prev = Number(prevStep);
    console.log("Current step2:", curr, prev);
    if (curr !== prev) {
      setDirection(curr > prev ? 1 : -1);
      setPrevStep(curr);
    }
  }, [currentStep, prevStep]);

  const stepNum = Number(currentStep);
  
  const renderStep = () => {
    console.log("Rendering step:", stepNum);
    switch (stepNum) {
      case 1:
        return <Step1OutputsSeeds />;
      case 2:
        return <Step2ConfigureMultisig />;
      case 3:
        return <Step3FeesReview />;
      case 4:
        return <Step4SignBroadcast />;
      default:
        return <Step1OutputsSeeds />;
    }
  };

  return (
    <div className="min-h-screen pt-16">
      <ProgressBar />
      <div className="container mx-auto px-4 pb-12">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={stepNum}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ 
              duration: 0.4, 
              ease: [0.4, 0, 0.2, 1],
              opacity: { duration: 0.3 }
            }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
