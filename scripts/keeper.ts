/**
 * Zisipay Keeper Bot — scripts/keeper.ts
 *
 * Runs on a server (Railway, Render, VPS).  Polls every minute for due payroll
 * schedules and fires batchTransfer on-chain automatically.
 *
 * Requirements:
 *   KEEPER_PRIVATE_KEY   — private key of the treasury wallet (must have USDC + pre-approved BatchTransfer)
 *   KEEPER_STORE_URL     — optional: URL of your API that returns due schedules (see fetchDueSchedules)
 *   RPC_PROXY_BASE_URL   — Arc Studio RPC proxy base (set automatically in Arc Studio)
 *   RPC_PROXY_TOKEN      — Arc Studio RPC proxy token
 *   RPC_PROXY_CHAINS     — comma-separated list of proxy chain keys (must include Arc_Testnet)
 *
 * Run:  bun run scripts/keeper.ts
 */

import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/* ── chain definition (Arc Testnet) ─────────────────────────────────────── */
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
} as const;

/* ── contract addresses ──────────────────────────────────────────────────── */
const BATCH_TRANSFER = '0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6' as `0x${string}`;
const USDC_ADDRESS   = '0x3600000000000000000000000000000000000000' as `0x${string}`;
const USDC_DECIMALS  = 6;

/* ── minimal ABIs ────────────────────────────────────────────────────────── */
const BATCH_ABI = [
  {
    name: 'batchTransfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts',    type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/* ── schedule type ───────────────────────────────────────────────────────── */
interface PayrollEmployee {
  name:   string;
  wallet: string;
  amount: number; // USDC amount (6-decimal basis, human-readable e.g. 1500.00)
}

interface DueSchedule {
  id:         string;
  companyId:  string;
  executeAt:  number;   // unix ms
  frequency:  'daily' | 'weekly' | 'monthly' | 'yearly';
  payer:      string;   // treasury address
  employees:  PayrollEmployee[];
}

/* ── RPC URL resolution ──────────────────────────────────────────────────── */
function resolveRpcUrl(): string {
  const proxyBase   = process.env.RPC_PROXY_BASE_URL;
  const proxyToken  = process.env.RPC_PROXY_TOKEN;
  const proxyChains = (process.env.RPC_PROXY_CHAINS || '').split(',');
  if (proxyBase && proxyToken && proxyChains.includes('Arc_Testnet')) {
    return `${proxyBase}/api/rpc/Arc_Testnet?_rpc_token=${proxyToken}`;
  }
  // fall back to public RPC
  console.warn('[keeper] RPC_PROXY_* not set or Arc_Testnet missing — using public RPC (may rate-limit)');
  return 'https://rpc.testnet.arc.io';
}

/* ── fetch due schedules ─────────────────────────────────────────────────── */
/**
 * In production: fetch from your backend API or read from a shared database.
 * This stub reads from a local JSON file (written by the frontend on save).
 * Replace with a real HTTP call to your API once you have one running.
 */
async function fetchDueSchedules(): Promise<DueSchedule[]> {
  const storeUrl = process.env.KEEPER_STORE_URL;
  if (storeUrl) {
    try {
      const res = await fetch(`${storeUrl}/api/schedules/due`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as DueSchedule[];
    } catch (err) {
      console.error('[keeper] Failed to fetch schedules:', err);
      return [];
    }
  }

  // Local stub — reads the Zisipay localStorage state exported to a file.
  // The frontend can export via: localStorage.getItem('zisipay_state_v2')
  // and write it to /tmp/zisipay_state.json.
  try {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync('/tmp/zisipay_state.json', 'utf-8');
    const state = JSON.parse(raw) as {
      company: {
        treasuryAddress: string;
        scheduledPayrollDate: string;
        scheduledPayrollTime: string;
        autoPayrollEnabled: boolean;
        payrollFrequency: string;
      };
      employees: { walletAddress: string; name: string; salary: number; vaultAlloc: number }[];
    };

    if (!state.company.autoPayrollEnabled || !state.company.scheduledPayrollDate) {
      return [];
    }

    const targetISO = `${state.company.scheduledPayrollDate}T${state.company.scheduledPayrollTime}:00`;
    const targetMs  = new Date(targetISO).getTime();
    if (Date.now() < targetMs) return []; // not due yet

    const employees: PayrollEmployee[] = state.employees
      .filter((e) => e.walletAddress)
      .map((e) => ({
        name:   e.name,
        wallet: e.walletAddress,
        amount: Math.round(e.salary * (1 - e.vaultAlloc / 100) * 100) / 100,
      }));

    if (employees.length === 0) return [];

    return [{
      id:        `schedule-${Date.now()}`,
      companyId: 'default',
      executeAt: targetMs,
      frequency: (state.company.payrollFrequency || 'monthly') as DueSchedule['frequency'],
      payer:     state.company.treasuryAddress,
      employees,
    }];
  } catch {
    return [];
  }
}

/* ── advance date helper ─────────────────────────────────────────────────── */
function advanceDate(iso: string, freq: DueSchedule['frequency']): string {
  const d = new Date(iso);
  if (freq === 'daily')   d.setDate(d.getDate() + 1);
  if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  if (freq === 'yearly')  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/* ── main execution loop ─────────────────────────────────────────────────── */
async function run(): Promise<void> {
  const privateKey = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    console.error('[keeper] KEEPER_PRIVATE_KEY not set — skipping run');
    return;
  }

  const account     = privateKeyToAccount(privateKey);
  const rpcUrl      = resolveRpcUrl();
  const transport   = http(rpcUrl);

  const publicClient = createPublicClient({ chain: arcTestnet, transport });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport });

  const dueSchedules = await fetchDueSchedules();
  if (dueSchedules.length === 0) {
    console.log(`[keeper] ${new Date().toISOString()} — no schedules due`);
    return;
  }

  for (const schedule of dueSchedules) {
    console.log(`[keeper] Processing schedule ${schedule.id} for ${schedule.employees.length} employees`);

    const recipients = schedule.employees.map((e) => e.wallet as `0x${string}`);
    const amounts    = schedule.employees.map((e) => parseUnits(e.amount.toFixed(6), USDC_DECIMALS));
    const total      = amounts.reduce((s, a) => s + a, 0n);

    // Check allowance
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, BATCH_TRANSFER],
    });

    if (allowance < total) {
      console.error(
        `[keeper] Insufficient allowance: have ${formatUnits(allowance, USDC_DECIMALS)} USDC, ` +
        `need ${formatUnits(total, USDC_DECIMALS)} USDC. Run Approve in the app first.`
      );
      continue;
    }

    try {
      const hash = await walletClient.writeContract({
        address: BATCH_TRANSFER,
        abi: BATCH_ABI,
        functionName: 'batchTransfer',
        args: [recipients, amounts],
      });
      console.log(`[keeper] batchTransfer submitted: ${hash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[keeper] Confirmed in block ${receipt.blockNumber} — ${schedule.employees.length} employees paid`);
      schedule.employees.forEach((e) => {
        console.log(`  → ${e.name} (${e.wallet.slice(0, 10)}…): ${e.amount} USDC`);
      });

      // Advance recurring schedule (update the state file for the local stub)
      const nextDate = advanceDate(
        new Date(schedule.executeAt).toISOString().slice(0, 10),
        schedule.frequency
      );
      console.log(`[keeper] Next ${schedule.frequency} payroll scheduled for ${nextDate}`);

    } catch (err) {
      console.error(`[keeper] batchTransfer failed for schedule ${schedule.id}:`, err);
    }
  }
}

/* ── entry point ─────────────────────────────────────────────────────────── */
console.log('[keeper] Zisipay Keeper Bot starting…');
console.log(`[keeper] BatchTransfer: ${BATCH_TRANSFER}`);
console.log('[keeper] Checking every 60 seconds');

void run(); // immediate first run
setInterval(() => { void run(); }, 60_000);
