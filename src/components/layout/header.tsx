"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useWallet } from "@/context/wallet-context";
import { Wallet, LogOut, Loader2 } from "lucide-react";

export function Header() {
  const { wallet, isConnecting, connect, disconnect } = useWallet();

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="sm" />
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {wallet.connected ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm text-muted-foreground">Connected</span>
                <span className="text-xs font-mono text-foreground">
                  {wallet.address?.slice(0, 8)}...{wallet.address?.slice(-6)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                className="border-border/50 hover:bg-secondary"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
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
    </motion.header>
  );
}
