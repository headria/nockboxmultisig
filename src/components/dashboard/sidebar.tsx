"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/wallet-context";
import { 
  LayoutDashboard, 
  Send, 
  FileText, 
  Wallet,
  LogOut,
  Loader2,
  ChevronRight
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/send", label: "Send", icon: Send },
  { href: "/dashboard/transactions", label: "Transactions", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const { wallet, isConnecting, connect, disconnect } = useWallet();

  return (
    <aside className="w-64 h-screen bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Image
            src="/iris-logo.svg"
            alt="NockBox Logo"
            width={32}
            height={32}
            priority
          />
          <div className="text-xl font-medium tracking-[-0.02em]">
            <span className="text-foreground">Nock</span>
            <span className="text-[#FFC412]">Box</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-[#FFC412]/15 text-[#FFC412] border border-[#FFC412]/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* Wallet Section */}
      <div className="p-4 border-t border-border">
        {wallet.connected ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Connected</span>
              </div>
              <p className="font-mono text-xs truncate">{wallet.address}</p>
              <p className="text-sm font-semibold mt-1">
                {wallet.balance.toFixed(4)} NOCK
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={disconnect}
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            onClick={connect}
            disabled={isConnecting}
            className="w-full bg-[#FFC412] text-black hover:bg-[#FFD54F]"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4 mr-2" />
                Connect Wallet
              </>
            )}
          </Button>
        )}
      </div>
    </aside>
  );
}
