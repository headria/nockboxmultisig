"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/context/wallet-context";
import { 
  StoredTransaction,
  getPendingTransactions,
  getCompletedTransactions,
  saveTransaction,
  createTransactionId,
} from "@/lib/transaction-storage";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  Pen, 
  Eye,
  Wallet,
  Loader2,
  RefreshCw,
  Upload
} from "lucide-react";
import { toast } from "sonner";

export default function TransactionsPage() {
  const { wallet, connect, isConnecting } = useWallet();
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingTransactions, setPendingTransactions] = useState<StoredTransaction[]>([]);
  const [completedTransactions, setCompletedTransactions] = useState<StoredTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !wallet.address) return;

    try {
      const text = await file.text();
      const txData = JSON.parse(text);
      
      // Create a stored transaction from the imported data
      const storedTx: StoredTransaction = {
        id: createTransactionId(),
        type: "single",
        amount: 0,
        recipient: "",
        fee: 0,
        unsignedTxHex: typeof txData === 'string' ? txData : JSON.stringify(txData),
        status: "pending",
        requiredSigs: 1,
        collectedSigs: 0,
        signers: [{ pubkey: wallet.address, label: "Imported", signed: false }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        memo: `Imported from ${file.name}`,
      };
      
      saveTransaction(wallet.address, storedTx);
      
      // Refresh the transaction list
      const pending = getPendingTransactions(wallet.address);
      const completed = getCompletedTransactions(wallet.address);
      setPendingTransactions(pending);
      setCompletedTransactions(completed);
      
      toast.success("Transaction imported successfully");
      setActiveTab("pending");
    } catch (error) {
      console.error("Failed to import transaction:", error);
      toast.error("Failed to import transaction. Invalid file format.");
    }
    
    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Load transactions from local storage when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.address) {
      setIsLoading(true);
      try {
        const pending = getPendingTransactions(wallet.address);
        const completed = getCompletedTransactions(wallet.address);
        setPendingTransactions(pending);
        setCompletedTransactions(completed);
      } catch (error) {
        console.error("Error loading transactions:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setPendingTransactions([]);
      setCompletedTransactions([]);
      setIsLoading(false);
    }
  }, [wallet.connected, wallet.address]);

  const handleRefresh = () => {
    if (!wallet.address) return;
    setIsLoading(true);
    try {
      const pending = getPendingTransactions(wallet.address);
      const completed = getCompletedTransactions(wallet.address);
      setPendingTransactions(pending);
      setCompletedTransactions(completed);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            View and sign pending transactions
          </p>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="p-12 text-center">
            <Wallet className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Connect your Iris wallet to view pending transactions that require your signature
            </p>
            <Button
              onClick={connect}
              disabled={isConnecting}
              size="lg"
              className="bg-[#FFC412] text-black hover:bg-[#FFD54F]"
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground mt-1">
            View and sign pending transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json,.txt"
            className="hidden"
          />
          <Button variant="outline" className="gap-2" onClick={handleImportClick}>
            <Upload className="w-4 h-4" />
            Import Transaction
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="w-4 h-4" />
            Pending
            {pendingTransactions.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-[#FFC412]/20 text-[#FFC412]">
                {pendingTransactions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Completed
          </TabsTrigger>
        </TabsList>

        {/* Pending Transactions */}
        <TabsContent value="pending" className="mt-6">
          {isLoading ? (
            <Card className="bg-muted/30">
              <CardContent className="p-12 text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading transactions...</p>
              </CardContent>
            </Card>
          ) : pendingTransactions.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-12 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
                <p className="text-muted-foreground">
                  No pending transactions require your signature
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingTransactions.map((tx) => (
                <Card key={tx.id} className="hover:border-[#FFC412]/30 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#FFC412]/10 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-[#FFC412]" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{tx.amount} NOCK</span>
                              <Badge variant="outline" className="text-xs">
                                {tx.type === "multisig" ? "Multisig" : "Single"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground font-mono">
                              To: {tx.recipient.slice(0, 8)}...{tx.recipient.slice(-6)}
                            </p>
                          </div>
                        </div>

                        {/* Signature Progress */}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-2">
                              {tx.signers.map((signer, i) => (
                                <div
                                  key={i}
                                  className={`w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium ${
                                    signer.signed
                                      ? "bg-green-500 text-white"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {signer.label[0]}
                                </div>
                              ))}
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {tx.collectedSigs}/{tx.requiredSigs} signatures
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Created {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button className="bg-[#FFC412] text-black hover:bg-[#FFD54F]">
                          <Pen className="w-4 h-4 mr-2" />
                          Sign
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completed Transactions */}
        <TabsContent value="completed" className="mt-6">
          {completedTransactions.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="p-12 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Completed Transactions</h3>
                <p className="text-muted-foreground">
                  Your completed transactions will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {completedTransactions.map((tx) => (
                <Card key={tx.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{tx.amount} NOCK</span>
                            <Badge variant="outline" className="text-xs border-green-500/50 text-green-500">
                              Completed
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">
                            To: {tx.recipient.slice(0, 8)}...{tx.recipient.slice(-6)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {tx.txHash && (
                          <p className="text-sm font-mono text-muted-foreground">
                            {tx.txHash.slice(0, 12)}...
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
