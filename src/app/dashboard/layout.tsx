"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { useWallet } from "@/context/wallet-context";
import { TransactionProvider } from "@/context/transaction-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Loader2 } from "lucide-react";
import { useEffect } from "react";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { wallet, isConnecting, connect, reconnect, isLocked } = useWallet();

  useEffect(() => {
    if (wallet.connected) return;
    if (isConnecting) return;
    if (isLocked) return;
    void reconnect();
  }, [wallet.connected, isConnecting, isLocked, reconnect]);

  if (!wallet.connected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#FFC412]/10 flex items-center justify-center mx-auto mb-6">
              <Wallet className="w-8 h-8 text-[#FFC412]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to NockBox</h1>
            <p className="text-muted-foreground mb-6">
              Connect your Iris wallet to access the dashboard and manage your transactions.
            </p>
            <Button
              onClick={connect}
              disabled={isConnecting}
              size="lg"
              className="w-full bg-[#FFC412] text-black hover:bg-[#FFD54F]"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5 mr-2" />
                  Connect Wallet
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TransactionProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </TransactionProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardContent>{children}</DashboardContent>;
}
