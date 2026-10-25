/**
 * PayrollPreview — BatchTransfer-based payroll
 *
 * Flow:
 *   1. Admin approves USDC to BatchTransfer contract once (large allowance).
 *   2. Admin saves a schedule (date + time + frequency). Stored in AppStore.
 *   3. When countdown hits 0, a "Payroll Due" banner appears.
 *   4. Admin clicks "Release Payroll" (one wallet popup) → batchTransfer fires.
 *   5. All employees receive USDC atomically in one tx. Schedule advances.
 *
 * BatchTransfer: 0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6 (Arc Testnet)
 * Keeper bot:    scripts/keeper.ts
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, AlertCircle, Zap, TrendingUp, Users, DollarSign,
  ChevronDown, ChevronUp, Calendar, Clock, ExternalLink, Play,
  Shield, RefreshCw, Bell,
} from 'lucide-react';
import { SectionCard, NetworkFeeBadge } from './AppShell';
import { useAppStore, computePayroll } from '../store/AppStore';
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useSwitchChain, useReadContract,
} from 'wagmi';
import { erc20Abi, parseAbi, maxUint256 } from 'viem';
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts';
import { parseAmount, formatUsdc } from '@/onchain-money';

/* ── constants ─────────────────────────────────────────────────────────── */
const ARC_TESTNET       = 5042002;
const USDC              = getUsdc(ARC_TESTNET)!;
const BATCH_TRANSFER    = '0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6' as const;

const BATCH_ABI = parseAbi([
  'function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external',
  'event BatchExecuted(address indexed payer, uint256 total, uint256 count)',
]);

/* ── types ─────────────────────────────────────────────────────────────── */
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

const FREQ_LABELS: Record<Frequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

function advanceByFrequency(iso: string, freq: Frequency): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (freq === 'daily')   d.setDate(d.getDate() + 1);
  if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  if (freq === 'yearly')  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, '0');

/* ── PayrollPreview ─────────────────────────────────────────────────────── */
export function PayrollPreview() {
  const { employees, earningsDeductions, company, addPayrollRun, recordTx, saveCompany } = useAppStore();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const onWrongChain = !!chainId && chainId !== ARC_TESTNET;

  /* schedule form */
  const [schedDate, setSchedDate]     = useState(company.scheduledPayrollDate);
  const [schedTime, setSchedTime]     = useState(company.scheduledPayrollTime || '09:00');
  const [autoEnabled, setAutoEnabled] = useState(company.autoPayrollEnabled);
  const [schedFreq, setSchedFreq]     = useState<Frequency>((company.payrollFrequency) || 'monthly');
  const [schedSaved, setSchedSaved]   = useState(false);

  /* execution */
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [error, setError]             = useState('');
  const [payrollDue, setPayrollDue]   = useState(false);

  /* per-employee execution state */
  type EmpStatus = 'idle' | 'pending-wallet' | 'confirming' | 'done' | 'failed';
  interface EmpState {
    id: string; name: string; wallet: string; amount: number;
    status: EmpStatus; txHash?: `0x${string}`; error?: string;
  }
  const [showExec, setShowExec]       = useState(false);
  const [payStates, setPayStates]     = useState<EmpState[]>([]);
  const [allDone, setAllDone]         = useState(false);
  const [batchTxHash, setBatchTxHash] = useState<`0x${string}` | undefined>();
  const [batchStartedAt, setBatchStartedAt] = useState('');

  /* countdown */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const targetISO = company.scheduledPayrollDate && company.scheduledPayrollTime
    ? `${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00` : '';
  const targetMs  = targetISO ? new Date(targetISO).getTime() : 0;
  const diff      = targetMs > 0 ? Math.max(0, targetMs - now) : 0;
  const isPast    = targetMs > 0 && targetMs < now;
  const countdown = {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1_000),
  };

  /* payroll due flag */
  const dueRef = useRef(false);
  useEffect(() => {
    if (diff === 0 && targetMs > 0 && ready.length > 0) {
      if (!dueRef.current) { dueRef.current = true; setPayrollDue(true); }
    }
    if (diff > 0) { dueRef.current = false; setPayrollDue(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, targetMs]);

  /* payroll lines */
  const currentMonth = useMemo(
    () => new Date().toLocaleString('default', { month: 'long', year: 'numeric' }), [],
  );
  const lines   = computePayroll(employees, earningsDeductions);
  const ready   = lines.filter((l) => l.canPay);
  const blocked = lines.filter((l) => !l.canPay);
  const totalGross  = ready.reduce((s, r) => s + r.gross,    0);
  const totalNet    = ready.reduce((s, r) => s + r.net,      0);
  const totalVault  = ready.reduce((s, r) => s + r.vault,    0);
  const totalWallet = ready.reduce((s, r) => s + r.toWallet, 0);

  /* USDC balance */
  const { data: rawBal } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const usdcBalance = rawBal !== undefined ? Number(formatUsdc(rawBal)) : 0;

  /* USDC allowance for BatchTransfer */
  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, BATCH_TRANSFER] : undefined,
    query: { enabled: !!address },
  });
  const allowance = rawAllowance !== undefined ? Number(formatUsdc(rawAllowance)) : 0;
  const hasAllowance = allowance >= totalWallet;

  /* wagmi hooks — approve */
  const {
    writeContractAsync: approveAsync,
    data: approveTxHash,
    isPending: approveIsPending,
    reset: resetApprove,
  } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  /* wagmi hooks — batchTransfer */
  const {
    writeContractAsync: batchAsync,
    data: batchHash,
    isPending: batchIsPending,
    reset: resetBatch,
  } = useWriteContract();
  const { isSuccess: batchConfirmed } = useWaitForTransactionReceipt({ hash: batchHash });

  /* after approval confirmed → refetch allowance */
  useEffect(() => {
    if (!approveConfirmed) return;
    void refetchAllowance();
    resetApprove();
  }, [approveConfirmed, refetchAllowance, resetApprove]);

  /* after batch confirmed → mark done + record */
  useEffect(() => {
    if (!batchConfirmed || !batchHash) return;
    setBatchTxHash(batchHash);
    setPayStates((prev) => prev.map((s) => ({ ...s, status: 'done', txHash: batchHash })));
    setAllDone(true);
    const runNow = new Date();
    addPayrollRun({
      month: runNow.toLocaleString('default', { month: 'long', year: 'numeric' }),
      executedAt: runNow.toISOString(), txHash: batchHash,
      totalGross, totalNet, totalVault, employeeCount: ready.length,
    });
    ready.forEach((r) => {
      recordTx({
        type: 'payroll', label: `${currentMonth} salary — ${r.name}`,
        from: address ?? 'treasury', to: r.walletAddress,
        amount: r.toWallet, direction: 'in', txHash: batchHash, status: 'confirmed',
      });
    });
    /* advance recurring schedule */
    if (company.scheduledPayrollDate) {
      const freq = (company.payrollFrequency) || 'monthly';
      const nextDate = advanceByFrequency(company.scheduledPayrollDate, freq);
      saveCompany({ scheduledPayrollDate: nextDate, autoPayrollEnabled: company.autoPayrollEnabled });
      setSchedDate(nextDate);
    }
    setPayrollDue(false);
    dueRef.current = false;
    resetBatch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchConfirmed, batchHash]);

  /* ── handlers ─────────────────────────────────────────────────────────── */
  const handleApprove = useCallback(async () => {
    if (!address || onWrongChain) return;
    setError('');
    try {
      await approveAsync({
        address: USDC.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [BATCH_TRANSFER, maxUint256],
        chainId: ARC_TESTNET,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 120) : 'Approval rejected');
    }
  }, [address, onWrongChain, approveAsync]);

  const handleRunPayroll = useCallback(async () => {
    if (!address || onWrongChain || ready.length === 0) return;
    setError('');
    const recipients = ready.map((r) => r.walletAddress as `0x${string}`);
    const amounts    = ready.map((r) => parseAmount(ARC_TESTNET, r.toWallet.toFixed(6)).raw);
    const states: EmpState[] = ready.map((r) => ({
      id: r.employeeId, name: r.name, wallet: r.walletAddress,
      amount: r.toWallet, status: 'pending-wallet' as EmpStatus,
    }));
    setPayStates(states);
    setAllDone(false);
    setBatchTxHash(undefined);
    setBatchStartedAt(new Date().toLocaleString());
    setShowExec(true);
    try {
      await batchAsync({
        address: BATCH_TRANSFER,
        abi: BATCH_ABI,
        functionName: 'batchTransfer',
        args: [recipients, amounts],
        chainId: ARC_TESTNET,
      });
      setPayStates((prev) => prev.map((s) => ({ ...s, status: 'confirming' })));
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 120) : 'Transaction rejected';
      setError(msg);
      setPayStates((prev) => prev.map((s) => ({ ...s, status: 'failed', error: msg })));
    }
  }, [address, onWrongChain, ready, batchAsync]);

  function saveSchedule() {
    saveCompany({
      scheduledPayrollDate: schedDate,
      scheduledPayrollTime: schedTime,
      autoPayrollEnabled: autoEnabled,
      payrollFrequency: schedFreq,
    });
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 2500);
  }

  const doneCount = payStates.filter((s) => s.status === 'done').length;

  /* ── EXECUTION SCREEN ──────────────────────────────────────────────────── */
  if (showExec) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-2xl">
        <SectionCard>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: allDone ? 'var(--success-bg)' : 'rgba(6,182,212,0.12)' }}>
              {allDone
                ? <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                : <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'transparent', borderTopColor: 'var(--cyan)' }} />}
            </div>
            <div>
              <h2 className="font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {allDone ? 'Payroll Complete' : batchIsPending ? 'Confirm in wallet…' : 'Confirming on Arc…'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {allDone
                  ? `${doneCount} employees paid — one transaction`
                  : 'Single batch transaction covers all employees'}
              </p>
            </div>
          </div>

          <div className="h-2.5 rounded-full overflow-hidden mb-1" style={{ background: 'var(--surface-muted)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${allDone ? 100 : batchIsPending ? 30 : 70}%`, background: 'linear-gradient(90deg, var(--cyan-dark), var(--blue))' }} />
          </div>

          {allDone && batchTxHash && (
            <>
              <div className="grid grid-cols-3 gap-3 mt-4 mb-3">
                {[
                  { label: 'Employees paid', val: doneCount.toString(),              color: 'var(--success)' },
                  { label: 'Total sent',     val: `$${totalWallet.toLocaleString()}`, color: 'var(--cyan-dark)' },
                  { label: 'Vault routed',   val: `$${totalVault.toLocaleString()}`,  color: '#fb923c' },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                    <div className="font-bold tabular-nums text-base" style={{ color: s.color }}>{s.val}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <a href={buildTxExplorerUrl(ARC_TESTNET, batchTxHash)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold mb-3"
                style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <ExternalLink size={14} /> View batch transaction on Arc Explorer
              </a>
              {company.scheduledPayrollDate && (
                <div className="p-3 rounded-xl flex items-center gap-2 text-xs"
                  style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-dark)' }}>
                  <RefreshCw size={11} />
                  Next {FREQ_LABELS[(company.payrollFrequency) || 'monthly'].toLowerCase()} payroll:&nbsp;
                  <strong>{new Date(`${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00`)
                    .toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                </div>
              )}
            </>
          )}

          <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
            Started: {batchStartedAt} · Arc Testnet (chain 5042002)
          </p>
        </SectionCard>

        <SectionCard title="Employee Payments">
          <div className="space-y-2">
            {payStates.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: emp.status === 'done' ? 'var(--success-bg)' : 'rgba(6,182,212,0.1)' }}>
                  {emp.status === 'done'
                    ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
                    : <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: 'transparent', borderTopColor: 'var(--cyan)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{emp.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {emp.status === 'done'
                      ? `$${emp.amount.toFixed(2)} USDC · confirmed`
                      : emp.status === 'pending-wallet' ? 'Waiting for wallet…'
                      : emp.status === 'confirming'     ? 'Confirming on Arc…'
                      : `$${emp.amount.toFixed(2)} USDC`}
                  </div>
                </div>
                {emp.status === 'done' && emp.txHash && (
                  <a href={buildTxExplorerUrl(ARC_TESTNET, emp.txHash)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.2)' }}>
                    <ExternalLink size={11} /> Tx
                  </a>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>
            All employees are paid in a single on-chain transaction via BatchTransfer.
          </p>
        </SectionCard>

        {allDone && (
          <button onClick={() => { setShowExec(false); setAllDone(false); setPayStates([]); }}
            className="w-full cta-btn">
            Back to Payroll Preview
          </button>
        )}
      </motion.div>
    );
  }

  /* ── EMPTY STATE ─────────────────────────────────────────────────────── */
  if (employees.length === 0) {
    return (
      <SectionCard>
        <div className="flex flex-col items-center py-12 text-center">
          <Users size={28} style={{ color: 'var(--muted)' }} className="mb-3" />
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>No employees enrolled yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Go to Employees and add staff first.</p>
        </div>
      </SectionCard>
    );
  }

  /* ── MAIN VIEW ─────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">

      {/* ── PAYROLL DUE BANNER ── */}
      {payrollDue && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(26,58,107,0.2))', border: '2px solid var(--cyan-dark)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse"
              style={{ background: 'var(--cyan-dark)' }}>
              <Bell size={18} color="#fff" />
            </div>
            <div>
              <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>Payroll is due now!</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {ready.length} employees · ${totalWallet.toLocaleString()} USDC · single transaction
              </p>
            </div>
          </div>
          {!hasAllowance && (
            <p className="text-xs mb-2 p-2 rounded-lg" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
              Approve USDC spend first before releasing payroll.
            </p>
          )}
          <button
            onClick={() => { void handleRunPayroll(); }}
            disabled={!address || onWrongChain || !hasAllowance || batchIsPending}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, var(--cyan-dark), var(--blue))', boxShadow: '0 4px 24px rgba(6,182,212,0.4)' }}>
            <Zap size={16} />
            Release Payroll — ${totalWallet.toLocaleString()} USDC to {ready.length} employees
          </button>
        </motion.div>
      )}

      {/* ── SCHEDULE CARD ── */}
      <SectionCard title="Payroll Schedule">
        <div className="space-y-4">

          {/* Date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Payroll Date
              </label>
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input type="date" value={schedDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { setSchedDate(e.target.value); setSchedSaved(false); }}
                  className="form-input" style={{ paddingLeft: '2rem' }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Time (24h)
              </label>
              <div className="relative">
                <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input type="time" value={schedTime}
                  onChange={(e) => { setSchedTime(e.target.value); setSchedSaved(false); }}
                  className="form-input" style={{ paddingLeft: '2rem' }} />
              </div>
            </div>
          </div>

          {/* Auto + frequency */}
          <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div onClick={() => setAutoEnabled((v) => !v)}
              className="w-10 h-5 rounded-full relative transition-colors flex-shrink-0 mt-0.5"
              style={{ background: autoEnabled ? 'var(--cyan-dark)' : 'var(--border-strong)', cursor: 'pointer' }}>
              <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform"
                style={{ transform: autoEnabled ? 'translateX(1.25rem)' : 'translateX(0.125rem)' }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Auto-execute &amp; recurring</div>
              <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                Shows a "Release" prompt at countdown zero and re-schedules automatically. Keeper bot handles fully automatic execution.
              </div>
              {autoEnabled && (
                <div className="flex gap-1.5 flex-wrap">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as Frequency[]).map((f) => (
                    <button key={f} type="button"
                      onClick={(e) => { e.stopPropagation(); setSchedFreq(f); setSchedSaved(false); }}
                      className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: schedFreq === f ? 'var(--cyan-dark)' : 'var(--surface)',
                        color:      schedFreq === f ? '#fff'             : 'var(--ink-2)',
                        border:     `1px solid ${schedFreq === f ? 'var(--cyan-dark)' : 'var(--border)'}`,
                      }}>
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>

          {/* Countdown */}
          {company.scheduledPayrollDate && !isPast && diff > 0 && (
            <div className="p-4 rounded-xl text-center"
              style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--cyan-dark)' }}>
                {company.autoPayrollEnabled ? 'Auto-payroll fires in' : 'Next scheduled payroll in'}
              </p>
              <div className="flex justify-center gap-4">
                {(['Days', 'Hours', 'Mins', 'Secs'] as const).map((lbl, i) => {
                  const vals = [countdown.d, countdown.h, countdown.m, countdown.s];
                  return (
                    <div key={lbl} className="text-center">
                      <div className="font-bold tabular-nums text-2xl" style={{ color: 'var(--ink)' }}>{pad(vals[i])}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{lbl}</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
                {new Date(`${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00`)
                  .toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                {company.autoPayrollEnabled && (
                  <span style={{ color: 'var(--cyan-dark)' }}>
                    {' '}· Auto ON · {FREQ_LABELS[(company.payrollFrequency) || 'monthly']}
                  </span>
                )}
              </p>
            </div>
          )}

          {isPast && company.scheduledPayrollDate && (
            <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
              style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(217,119,6,0.2)' }}>
              <AlertCircle size={14} /> Scheduled date is in the past — run now or pick a new date.
            </div>
          )}

          {/* Active schedule badge */}
          {company.scheduledPayrollDate && !isPast && (
            <div className="p-3 rounded-xl flex items-center gap-2 text-xs"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-dark)' }}>
              <Shield size={12} />
              Schedule saved:&nbsp;
              <strong>{new Date(`${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00`)
                .toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
              &nbsp;·&nbsp;Auto: <strong>
                {company.autoPayrollEnabled
                  ? `ON (${FREQ_LABELS[(company.payrollFrequency) || 'monthly']})`
                  : 'OFF'}
              </strong>
            </div>
          )}

          {/* Action row */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={saveSchedule} disabled={!schedDate}
              className="cta-btn flex-1 min-w-[120px]">
              {schedSaved ? <><CheckCircle2 size={13} /> Saved</> : <><Calendar size={13} /> Save Schedule</>}
            </button>
            <button onClick={() => { void handleRunPayroll(); }}
              disabled={!address || onWrongChain || ready.length === 0 || !hasAllowance || batchIsPending}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--cyan-dark), var(--blue))', color: '#fff' }}>
              <Play size={13} /> Run Now
            </button>
          </div>

          {/* Network / wallet guards */}
          {!address && (
            <p className="text-xs" style={{ color: 'var(--warning)' }}>Connect your treasury wallet to execute payroll.</p>
          )}
          {address && onWrongChain && (
            <div className="flex items-center gap-2">
              <p className="text-xs" style={{ color: 'var(--warning)' }}>Wrong network.</p>
              <button onClick={() => switchChain({ chainId: ARC_TESTNET })}
                className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--warning)', color: '#fff' }}>
                Switch to Arc Testnet
              </button>
            </div>
          )}
          {error && (
            <p className="text-xs p-2.5 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</p>
          )}
        </div>
      </SectionCard>

      {/* ── APPROVE CARD ── */}
      <SectionCard title="USDC Approval">
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Approve the BatchTransfer contract to spend USDC from your treasury wallet once.
            After this, each payroll run is a single transaction with no further approvals needed.
          </p>
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Current allowance</p>
              <p className="font-bold tabular-nums" style={{ color: hasAllowance ? 'var(--success)' : 'var(--warning)' }}>
                {allowance.toLocaleString()} USDC
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Required</p>
              <p className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{totalWallet.toLocaleString()} USDC</p>
            </div>
          </div>
          {approveTxHash && (
            <a href={buildTxExplorerUrl(ARC_TESTNET, approveTxHash)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--cyan-dark)' }}>
              <ExternalLink size={11} /> Approval tx on Arc Explorer
            </a>
          )}
          <button
            onClick={() => { void handleApprove(); }}
            disabled={!address || onWrongChain || approveIsPending || approveConfirmed}
            className="w-full cta-btn disabled:opacity-40">
            {approveIsPending
              ? 'Confirm in wallet…'
              : approveConfirmed
              ? <><CheckCircle2 size={13} /> Approved — ready to pay</>
              : 'Approve USDC (one-time)'}
          </button>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Contract: {BATCH_TRANSFER} · <a href={`https://explorer.testnet.arc.io/address/${BATCH_TRANSFER}`}
              target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan-dark)' }}>view on Arc Explorer</a>
          </p>
        </div>
      </SectionCard>

      {/* ── SUMMARY BAR ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: 'Employees',   value: `${ready.length}`,                icon: Users,      color: 'var(--cyan)',    sub: `${blocked.length} skipped` },
          { label: 'Total Gross', value: `$${totalGross.toLocaleString()}`, icon: DollarSign, color: '#818cf8',        sub: 'Before deductions' },
          { label: 'Total Net',   value: `$${totalNet.toLocaleString()}`,   icon: Zap,        color: 'var(--success)', sub: 'After deductions' },
          { label: 'To Vault',    value: `$${totalVault.toLocaleString()}`, icon: TrendingUp, color: '#fb923c',        sub: 'Vault routing' },
        ] as const).map((s) => {
          const Icon = s.icon;
          return (
            <SectionCard key={s.label}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${s.color}18` }}>
                  <Icon size={14} style={{ color: s.color }} />
                </div>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</span>
              </div>
              <div className="font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>{s.value}</div>
              <div className="text-xs" style={{ color: 'var(--subtle)' }}>{s.sub}</div>
            </SectionCard>
          );
        })}
      </div>

      {/* blocked employees */}
      {blocked.length > 0 && (
        <div className="p-3.5 rounded-xl flex items-center gap-2.5"
          style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.25)' }}>
          <AlertCircle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--warning)' }}>
            {blocked.map((b) => b.name).join(', ')} will be skipped — wallet not linked or inactive.
          </p>
        </div>
      )}

      {/* ── BREAKDOWN TABLE ── */}
      <SectionCard title={`Payroll Breakdown — ${currentMonth}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Employee', 'Gross', 'Deductions', 'Net Pay', 'Vault', 'To Wallet', 'Status', ''].map((h) => (
                  <th key={h} className="text-left pb-3 pr-3 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((row) => {
                const expanded  = expandedId === row.employeeId;
                const totalDed  = row.deductionsBreakdown.reduce((s, d) => s + d.amount, 0);
                return (
                  <>
                    <tr key={row.employeeId} className="cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)', opacity: row.canPay ? 1 : 0.5 }}
                      onClick={() => setExpandedId(expanded ? null : row.employeeId)}>
                      <td className="py-3 pr-3">
                        <div className="font-medium" style={{ color: 'var(--ink)' }}>{row.name}</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>{row.department}</div>
                      </td>
                      <td className="py-3 pr-3 tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>${row.gross.toLocaleString()}</td>
                      <td className="py-3 pr-3 tabular-nums" style={{ color: 'var(--danger)' }}>-${totalDed.toLocaleString()}</td>
                      <td className="py-3 pr-3 tabular-nums font-bold" style={{ color: 'var(--ink)' }}>${row.net.toLocaleString()}</td>
                      <td className="py-3 pr-3 tabular-nums" style={{ color: 'var(--success)' }}>${row.vault.toLocaleString()}</td>
                      <td className="py-3 pr-3 tabular-nums font-semibold" style={{ color: 'var(--cyan-dark)' }}>${row.toWallet.toLocaleString()}</td>
                      <td className="py-3 pr-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: row.canPay ? 'var(--success-bg)' : 'var(--warning-bg)', color: row.canPay ? 'var(--success)' : 'var(--warning)' }}>
                          {row.canPay ? 'Ready' : 'Blocked'}
                        </span>
                      </td>
                      <td className="py-3">
                        {expanded ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`exp-${row.employeeId}`}>
                        <td colSpan={8} className="pb-3">
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="p-4 rounded-xl"
                            style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.15)' }}>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Earnings</p>
                                {row.earningsBreakdown.map((e) => (
                                  <div key={e.label} className="flex justify-between py-1">
                                    <span style={{ color: 'var(--ink-2)' }}>{e.label}</span>
                                    <span className="tabular-nums font-medium" style={{ color: 'var(--success)' }}>+${e.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <p className="font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Deductions</p>
                                {row.deductionsBreakdown.map((d) => (
                                  <div key={d.label} className="flex justify-between py-1">
                                    <span style={{ color: 'var(--ink-2)' }}>{d.label}</span>
                                    <span className="tabular-nums font-medium" style={{ color: 'var(--danger)' }}>-${d.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 p-4 rounded-xl flex items-center justify-between flex-wrap gap-4"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="flex gap-6 flex-wrap">
            {[
              { label: 'Total gross', val: `$${totalGross.toLocaleString()}`,  color: 'var(--ink)' },
              { label: 'Total net',   val: `$${totalNet.toLocaleString()}`,    color: 'var(--ink)' },
              { label: 'To Vault',    val: `$${totalVault.toLocaleString()}`,  color: 'var(--success)' },
              { label: 'To wallets',  val: `$${totalWallet.toLocaleString()}`, color: 'var(--cyan-dark)' },
            ].map((t) => (
              <div key={t.label}>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{t.label}</div>
                <div className="font-bold tabular-nums" style={{ color: t.color }}>{t.val}</div>
              </div>
            ))}
          </div>
          <NetworkFeeBadge />
        </div>
      </SectionCard>

      {/* ── TREASURY BALANCE ── */}
      {address && (
        <div className="p-3 rounded-xl flex items-center justify-between text-sm"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--muted)' }}>Treasury balance</span>
          <span className="font-bold tabular-nums" style={{ color: usdcBalance >= totalWallet ? 'var(--success)' : 'var(--danger)' }}>
            {usdcBalance.toLocaleString()} USDC
            {usdcBalance < totalWallet && <span style={{ color: 'var(--danger)' }}> — insufficient (need {totalWallet.toLocaleString()})</span>}
          </span>
        </div>
      )}
    </div>
  );
}
