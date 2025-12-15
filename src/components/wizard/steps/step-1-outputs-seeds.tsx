"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useTransaction } from "@/context/transaction-context";
import { useWallet } from "@/context/wallet-context";
import { ArrowRight, Wallet, User, UsersRound, Lock, Check, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

export function Step1OutputsSeeds() {
  const { transactionData, updateSelectedNotes, setCurrentStep } = useTransaction();
  const { wallet, isConnecting, isInstalled, connect, refreshNotes } = useWallet();
  
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(
    new Set(transactionData.selectedNotes.map(n => n.id))
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-select all single PKH (non-multisig) spendable notes by default on first load
  useEffect(() => {
    if (wallet.connected && wallet.notes.length > 0 && selectedNoteIds.size === 0 && !hasAutoSelected) {
      const singlePkhNotes = wallet.notes.filter(n => 
        n.isSpendable !== false && 
        n.confirmed && 
        n.isMultisig !== true
      );
      if (singlePkhNotes.length > 0) {
        setSelectedNoteIds(new Set(singlePkhNotes.map(n => n.id)));
      }
      setHasAutoSelected(true);
    }
  }, [wallet.connected, wallet.notes, selectedNoteIds.size, hasAutoSelected]);

  // Sync local state with context when navigating back (only if context has data)
  useEffect(() => {
    if (transactionData.selectedNotes.length > 0 && !hasAutoSelected) {
      setSelectedNoteIds(new Set(transactionData.selectedNotes.map(n => n.id)));
      setHasAutoSelected(true);
    }
  }, [transactionData.selectedNotes, hasAutoSelected]);

  const toggleNote = (noteId: string) => {
    const newSelected = new Set(selectedNoteIds);
    if (newSelected.has(noteId)) {
      newSelected.delete(noteId);
    } else {
      newSelected.add(noteId);
    }
    setSelectedNoteIds(newSelected);
  };

  const selectAll = () => {
    const spendableNotes = wallet.notes.filter(n => n.isSpendable !== false && n.confirmed);
    setSelectedNoteIds(new Set(spendableNotes.map(n => n.id)));
  };

  const deselectAll = () => {
    setSelectedNoteIds(new Set());
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshNotes();
      toast.success("Notes refreshed");
    } catch {
      toast.error("Failed to refresh notes");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConnect = async () => {
    try {
      await connect();
      toast.success("Wallet connected!");
    } catch {
      toast.error("Failed to connect wallet. Make sure Iris is installed.");
    }
  };

  const handleNext = () => {
    if (selectedNoteIds.size === 0) {
      toast.error("Please select at least one note to spend");
      return;
    }
    const selectedNotes = wallet.notes.filter(n => selectedNoteIds.has(n.id));
    updateSelectedNotes(selectedNotes);
    setCurrentStep(2);
  };

  const selectedNotes = wallet.notes.filter(n => selectedNoteIds.has(n.id));
  const selectedTotal = selectedNotes.reduce((sum, n) => sum + n.amount, 0);
  const spendableNotes = wallet.notes.filter(n => n.isSpendable !== false && n.confirmed);
  const totalSpendable = spendableNotes.reduce((sum, n) => sum + n.amount, 0);

  // Show wallet connection prompt if not connected
  if (!wallet.connected) {
    return (
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8"
        >
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Welcome</h2>
            <p className="text-muted-foreground">
              Connect your wallet to get started
            </p>
          </div>

          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FFC412]/20 to-[#FFC412]/5 flex items-center justify-center mx-auto border border-[#FFC412]/30">
            <Wallet className="w-10 h-10 text-[#FFC412]" />
          </div>
          
          <Button
            size="lg"
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-[#FFC412] text-black hover:bg-[#FFD54F] px-10 py-6 text-lg font-semibold rounded-xl shadow-lg shadow-[#FFC412]/20"
          >
            {isConnecting ? "Connecting..." : "Connect Iris Wallet"}
          </Button>
          
          {!isInstalled && (
            <p className="text-sm text-muted-foreground">
              Wallet not detected • Demo mode available
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h2 className="text-3xl font-bold">Select Notes</h2>
        <p className="text-muted-foreground">
          Choose which notes to spend in this transaction
        </p>
      </motion.div>

      {/* Balance Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-gradient-to-r from-[#FFC412]/10 to-transparent border-[#FFC412]/20">
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFC412]/20 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-[#FFC412]" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Spendable</p>
                  <p className="text-2xl font-bold">{totalSpendable.toFixed(4)} <span className="text-base font-normal text-muted-foreground">NOCK</span></p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Selected</p>
                <p className="text-xl font-bold text-[#FFC412]">
                  {selectedTotal.toFixed(4)} <span className="text-sm font-normal text-muted-foreground">NOCK</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notes List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card>
          <CardContent className="p-4">
            {/* Collapsible Header */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between p-2 -m-2 mb-2 rounded-lg hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {selectedNoteIds.size} of {wallet.notes.length} notes selected
                </span>
                <Badge variant="outline" className="text-xs">
                  {selectedTotal.toFixed(4)} NOCK
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">{isExpanded ? "Collapse" : "Expand to edit"}</span>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {/* Expandable Content */}
            {isExpanded && (
              <>
                {/* Actions Row */}
                <div className="flex items-center justify-between mb-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll} className="text-xs h-7">
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAll} className="text-xs h-7">
                      Deselect All
                    </Button>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="text-xs h-7"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                {/* Notes */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
              {wallet.notes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No notes found in wallet
                </div>
              ) : (
                wallet.notes.map((note) => {
                  const isSelected = selectedNoteIds.has(note.id);
                  const isSpendable = note.isSpendable !== false && note.confirmed;
                  const isMultisig = note.isMultisig === true;

                  return (
                    <div
                      key={note.id}
                      onClick={() => isSpendable && toggleNote(note.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                        !isSpendable 
                          ? "opacity-50 cursor-not-allowed bg-muted/20 border-border/30"
                          : isSelected
                            ? "bg-[#FFC412]/10 border-[#FFC412]/40 hover:bg-[#FFC412]/15"
                            : "bg-card/50 border-border/50 hover:border-border"
                      }`}
                    >
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          disabled={!isSpendable}
                          onCheckedChange={() => isSpendable && toggleNote(note.id)}
                          className="data-[state=checked]:bg-[#FFC412] data-[state=checked]:border-[#FFC412]"
                        />
                      </div>
                      
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        isMultisig ? "bg-purple-500/20" : "bg-green-500/20"
                      }`}>
                        {isMultisig ? (
                          <UsersRound className="w-4 h-4 text-purple-500" />
                        ) : (
                          <User className="w-4 h-4 text-green-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm truncate">
                            {note.txHash.slice(0, 8)}...{note.txHash.slice(-6)}:{note.index}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] px-1.5 py-0 shrink-0 ${
                              isMultisig 
                                ? "border-purple-500/50 text-purple-400" 
                                : "border-green-500/50 text-green-400"
                            }`}
                          >
                            {isMultisig ? "Multisig" : "Single"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isSpendable ? (
                            <span className="text-xs text-green-500 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Spendable
                            </span>
                          ) : (
                            <span className="text-xs text-orange-400 flex items-center gap-1">
                              <Lock className="w-3 h-3" /> {note.confirmed ? "Locked" : "Unconfirmed"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-semibold">{note.amount.toFixed(4)}</div>
                        <div className="text-xs text-muted-foreground">NOCK</div>
                      </div>
                    </div>
                  );
                })
              )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Continue Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="pt-2"
      >
        <Button
          onClick={handleNext}
          disabled={selectedNoteIds.size === 0}
          size="lg"
          className="w-full bg-[#FFC412] text-black hover:bg-[#FFD54F] font-semibold h-14 text-base rounded-xl shadow-lg shadow-[#FFC412]/20 disabled:opacity-50 disabled:shadow-none"
        >
          Continue to Multisig Setup
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </motion.div>
    </div>
  );
}
