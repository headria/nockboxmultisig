# NockBox - Nockchain Transaction Builder

A web-based transaction builder for Nockchain that integrates with the Iris Wallet browser extension. Build, sign, and broadcast transactions directly from your browser.

## Prerequisites

- **Node.js** 18+ 
- **Iris Wallet** browser extension installed and configured
- Access to a Nockchain gRPC endpoint (provided by Iris Wallet)

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Iris Wallet    │────▶│   NockBox App    │────▶│  Nockchain Node │
│  (Browser Ext)  │     │   (Next.js)      │     │  (via gRPC)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
       │                        │
       │  PKH, signing         │  Notes, balance
       └────────────────────────┘
```

- **Iris Wallet** handles key management and transaction signing
- **NockBox** builds transactions and provides the UI
- **gRPC Client** fetches notes and broadcasts signed transactions

### Transaction Flow

1. **Connect Wallet** → Iris Wallet provides your PKH (public key hash) and gRPC endpoint
2. **Fetch Notes** → gRPC client fetches spendable notes for your PKH
3. **Build Transaction** → Select notes, set recipient, amount, and fee
4. **Sign Transaction** → Iris Wallet signs using `provider.signRawTx()`
5. **Broadcast** → Signed transaction sent to network via `grpcClient.sendTransaction()`

## Usage Guide

### Step 1: Select Notes

1. Click **Connect Iris Wallet** to connect your wallet
2. Your spendable notes are automatically fetched and displayed
3. Select which notes to spend (single PKH notes are auto-selected)
4. Click **Next** to proceed

### Step 2: Configure Multisig (Optional)

- If your selected notes include multisig notes, configure the M-of-N threshold
- For single-signer transactions, this step is automatically skipped

### Step 3: Set Recipients & Fee

1. Enter the **recipient address** (Base58 format)
2. Enter the **amount** to send
3. Add multiple recipients if needed
4. Fee is automatically calculated based on transaction size
5. Review the remaining balance (change returns to your wallet)
6. Click **Build Transaction**

### Step 4: Sign & Broadcast

1. Click **Sign with Wallet** to sign the transaction via Iris Wallet
2. Approve the signing request in your Iris Wallet popup
3. Once signed, click **Broadcast Transaction** to send to the network
4. View your transaction hash on success

### Export Options

- **Export Unsigned** (JSON) - For importing into the Transactions page later
- **Export Signed** (.tx file) - JAM-encoded signed transaction for manual broadcast

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/dashboard` | Overview with wallet balance and quick actions |
| `/dashboard/send` | Transaction builder wizard |
| `/dashboard/transactions` | View pending/completed transactions, import transactions |

## Key Files

```
src/
├── context/
│   ├── wallet-context.tsx    # Wallet connection, signing, broadcasting
│   └── transaction-context.tsx # Transaction state management
├── components/wizard/steps/
│   ├── step-1-outputs-seeds.tsx  # Note selection
│   ├── step-2-configure-multisig.tsx
│   ├── step-3-fees-review.tsx    # Recipients, fees, build tx
│   └── step-4-sign-broadcast.tsx # Sign & broadcast
├── txBuilder/                 # Transaction building utilities
├── lib/
│   ├── broadcast.ts           # gRPC broadcast helper
│   └── transaction-storage.ts # LocalStorage for transactions
└── types/index.ts             # TypeScript interfaces
```

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **@nockbox/iris-sdk** - Iris Wallet integration
- **@nockbox/iris-wasm** - WASM transaction building (TxBuilder, Note, RawTx)
- **Framer Motion** - Animations
- **Sonner** - Toast notifications

## Troubleshooting

### "Iris wallet not installed"
Install the Iris Wallet browser extension from the official source.

### "LOCKED" error during signing
Unlock your Iris Wallet and try again.

### "No notes found"
Your wallet may have no spendable notes. Ensure you have received NOCK to your address.

### "Selected notes are missing protobuf data"
Click **Refresh** on the notes list to re-fetch notes from the network.

## License

MIT
