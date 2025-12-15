"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWallet } from "@/context/wallet-context";
import { Wallet, ArrowRight, Shield, Zap, Lock, Loader2 } from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: Shield,
    title: "Secure Multisig",
    description: "M-of-N signature schemes for maximum security",
  },
  {
    icon: Zap,
    title: "Fast & Simple",
    description: "Intuitive wizard-based transaction building",
  },
  {
    icon: Lock,
    title: "Self-Custody",
    description: "Your keys, your coins. Always.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0, 0, 0.2, 1] as const },
  },
};

export function Hero() {
  const { wallet, isConnecting, connect } = useWallet();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/50 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {wallet.connected ? (
              <Link href="/dashboard">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Open Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            ) : (
              <Button
                onClick={connect}
                disabled={isConnecting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4 mr-2" />
                    Connect Iris
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center pt-16">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="container mx-auto px-4 py-20 text-center"
        >
          <motion.div variants={itemVariants} className="mb-6">
            <AnimatedLogo size="lg" />
          </motion.div>

          <motion.div variants={itemVariants} className="mb-4">
            <div className="text-3xl sm:text-4xl font-medium tracking-[-0.02em]">
              <span className="text-foreground">Nock</span>
              <span className="text-[#FFC412]">Box</span>
            </div>
            <p className="text-muted-foreground text-sm mt-1 tracking-[-0.02em]">Powered by Nockchain</p>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-[-0.02em] mb-6"
          >
            Multisig Transaction
            <br />
            <span className="text-[#FFC412]">Builder</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Build, sign, and broadcast secure multisig transactions on Nockchain.
            Simple, intuitive, and designed for teams.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
            {wallet.connected ? (
              <Link href="/dashboard">
                <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 text-lg h-14">
                  Go to Dashboard
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
            ) : (
              <Button
                size="lg"
                onClick={connect}
                disabled={isConnecting}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 text-lg h-14"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wallet className="h-5 w-5 mr-2" />
                    Connect Iris Wallet
                  </>
                )}
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="border-border hover:bg-secondary px-8 text-lg h-14"
              onClick={() => window.open("https://iriswallet.io", "_blank")}
            >
              Learn More
            </Button>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto"
          >
            {features.map((feature) => (
              <motion.div
                key={feature.title}
                variants={itemVariants}
                className="p-6 rounded-xl bg-card border border-border hover:border-accent/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4 mx-auto">
                  <feature.icon className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </main>

      <footer className="border-t border-border/30 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Powered by Nockchain • Built with Iris Wallet</p>
        </div>
      </footer>
    </div>
  );
}
