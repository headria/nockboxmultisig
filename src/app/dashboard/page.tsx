"use client";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { useWallet } from "@/context/wallet-context";
import { Wallet, Send, FileText, TrendingUp, ArrowUpRight, Clock } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { wallet } = useWallet();

  const quickActions = [
    { href: "/dashboard/send", label: "Send NOCK", icon: Send, description: "Create a new transaction" },
    { href: "/dashboard/transactions", label: "Transactions", icon: FileText, description: "View pending signatures" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome to NockBox - your multisig transaction manager
        </p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-[#FFC412]/10 to-transparent border-[#FFC412]/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Total Balance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {wallet.connected ? wallet.balance.toFixed(4) : "---"} 
              <span className="text-lg font-normal text-muted-foreground ml-1">NOCK</span>
            </div>
            {wallet.connected && (
              <p className="text-sm text-muted-foreground mt-1">
                {wallet.notes.length} notes available
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Pending Signatures
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              0
              <span className="text-lg font-normal text-muted-foreground ml-1">transactions</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Awaiting your signature
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Recent Activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              0
              <span className="text-lg font-normal text-muted-foreground ml-1">this week</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Completed transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="hover:border-[#FFC412]/50 transition-colors cursor-pointer group">
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#FFC412]/10 flex items-center justify-center group-hover:bg-[#FFC412]/20 transition-colors">
                    <action.icon className="w-6 h-6 text-[#FFC412]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold group-hover:text-[#FFC412] transition-colors">
                      {action.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-[#FFC412] transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Connect Wallet CTA */}
      {!wallet.connected && (
        <Card className="bg-muted/30">
          <CardContent className="p-8 text-center">
            <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
            <p className="text-muted-foreground mb-4">
              Connect your Iris wallet to view your balance and manage transactions
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
