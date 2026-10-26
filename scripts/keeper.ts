/**
 * Zisipay Keeper — automatic BatchTransfer execution
 *
 * Reads pending schedules from keeper-batches.json, checks if they are due,
 * and calls batchTransfer on the BatchTransfer contract.
 *
 * Run: KEEPER_PRIVATE_KEY=0x... bun run scripts/keeper.ts
 * Deploy to Railway / Render / any VPS with the env vars below.
 *
 * Required env vars:
 *   KEEPER_PRIVATE_KEY   — private key of the keeper wallet (must have tiny USDC for gas)
 *   RPC_URL              — Arc Testnet RPC (defaults to https://rpc.testnet.arc.io)
 */
import { createWalletClient, createPublicClient, http, parseAbi, parseUnits, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as fs from 'fs';
import * as path from 'path';

/* ── Chain ────────────────────────────────────────────────────────────────── */
const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? 'https://rpc.testnet.arc.io'] } },
});

/* ── Contracts ────────────────────────────────────────────────────────────── */
const BATCH_CONTRACT = '0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6' as const;

const BATCH_ABI = parseAbi([
  'function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external',
  'event BatchExecuted(address indexed payer, uint256 total, uint256 count)',
]);

/* ── Batches file ─────────────────────────────────────────────────────────── */
const BATCHES_FILE = path.resolve(process.cwd(), 'keeper-batches.json');

interface KeeperBatch {
  id: string;
  executeAt: number;   // Unix timestamp (seconds)
  executed: boolean;
  cancelled: boolean;
  recipients: string[];
  amounts: string[];   // USDC amounts as decimal strings, e.g. "1500.00"
  frequency?: string;
  nextDate?: string;
}

function loadBatches(): KeeperBatch[] {
  if (!fs.existsSync(BATCHES_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(BATCHES_FILE, 'utf8')) as KeeperBatch[]; }
  catch { return []; }
}

function saveBatches(batches: KeeperBatch[]): void {
  fs.writeFileSync(BATCHES_FILE, JSON.stringify(batches, null, 2));
}

/* ── Clients ─────────────────────────────────────────────────────────────── */
function makeClients() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) throw new Error('KEEPER_PRIVATE_KEY not set');
  const account = privateKeyToAccount(pk as `0x${string}`);
  const transport = http();
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  return { walletClient, publicClient, account };
}

/* ── Main loop ───────────────────────────────────────────────────────────── */
async function checkAndExecute(): Promise<void> {
  const batches = loadBatches();
  const now = Math.floor(Date.now() / 1000);
  const due = batches.filter((b) => !b.executed && !b.cancelled && b.executeAt <= now);

  if (due.length === 0) {
    console.log(`[${new Date().toISOString()}] No batches due.`);
    return;
  }

  let { walletClient } = makeClients();

  for (const batch of due) {
    console.log(`[${new Date().toISOString()}] Executing batch ${batch.id} (${batch.recipients.length} recipients)…`);
    try {
      const recipients = batch.recipients as `0x${string}`[];
      const amounts    = batch.amounts.map((a) => parseUnits(a, 6));

      const hash = await walletClient.writeContract({
        address: BATCH_CONTRACT,
        abi: BATCH_ABI,
        functionName: 'batchTransfer',
        args: [recipients, amounts],
      });

      console.log(`[${new Date().toISOString()}] Executed batch ${batch.id}: ${hash}`);
      console.log(`  Arc Explorer: https://explorer.testnet.arc.io/tx/${hash}`);

      // Mark as executed and schedule next if recurring
      batch.executed = true;
      if (batch.frequency && batch.nextDate) {
        const next: KeeperBatch = {
          ...batch,
          id: `${batch.id}-next-${Date.now()}`,
          executeAt: Math.floor(new Date(`${batch.nextDate}T09:00:00`).getTime() / 1000),
          executed: false,
          cancelled: false,
        };
        batches.push(next);
        console.log(`  Scheduled next run for ${batch.nextDate}`);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Failed to execute batch ${batch.id}:`, err);
    }
  }

  saveBatches(batches);
}

/* ── Entry ───────────────────────────────────────────────────────────────── */
console.log('[Zisipay Keeper] Starting — polling every 60s');
void checkAndExecute();
setInterval(() => { void checkAndExecute(); }, 60_000);
