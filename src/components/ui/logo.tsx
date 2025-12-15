"use client";

import { motion } from "framer-motion";
import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  showIcon?: boolean;
}

export function Logo({ size = "md", showTagline = false, showIcon = true }: LogoProps) {
  const sizeClasses = {
    sm: "text-lg tracking-[-0.02em]",
    md: "text-xl tracking-[-0.02em]",
    lg: "text-2xl tracking-[-0.02em]",
  };

  const iconSizes = {
    sm: 28,
    md: 36,
    lg: 48,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center"
    >
      <div className="flex items-center gap-2">
        {showIcon && (
          <Image
            src="/iris-logo.svg"
            alt="Iris Logo"
            width={iconSizes[size]}
            height={iconSizes[size]}
            priority
          />
        )}
        <div className="relative">
          <div className={`font-medium ${sizeClasses[size]}`}>
            <span className="text-foreground">Nock</span>
            <span className="text-[#FFC412]">Box</span>
          </div>
        </div>
      </div>
      {showTagline && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground text-sm mt-1 tracking-[-0.02em]"
        >
          Powered by Nockchain
        </motion.p>
      )}
    </motion.div>
  );
}
