import { WalletProvider } from "@/context/wallet-context";
import { Hero } from "@/components/landing/hero";

export default function Home() {
  return (
    <WalletProvider>
      <Hero />
    </WalletProvider>
  );
}
