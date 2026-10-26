import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2, AlertCircle, Zap, TrendingUp, Users, DollarSign,
  ChevronDown, ChevronUp, Calendar, Clock, ExternalLink, Play,
  Shield, RefreshCw, XCircle,
} from 'lucide-react';
import { SectionCard, NetworkFeeBadge } from './AppShell';
import { useAppStore, computePayroll } from '../store/AppStore';
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useSwitchChain, useReadContract, usePublicClient,
} from 'wagmi';
import { erc20Abi, parseAbi, maxUint256 } from 'viem';
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts';
import { parseAmount, formatUsdc } from '@/onchain-money';

const ARC_TESTNET    = 5042002;
const USDC           = getUsdc(ARC_TESTNET)!;
const BATCH_CONTRACT = '0x64a4a431dbe0a8d4eccf2e03992f586f50b1e7a6' as const;

const BATCH_ABI = parseAbi([
  'function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external',
  'event BatchExecuted(address indexed payer, uint256 total, uint256 count)',
]);

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
type Step = 'idle' | 'approving' | 'scheduled' | 'executing' | 'done';

export function PayrollPreview() {
  const { employees, earningsDeductions, company, addPayrollRun, recordTx, saveCompany } = useAppStore();
  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const onWrongChain = !!chainId && chainId !== ARC_TESTNET;

  const [schedDate, setSchedDate]         = useState(company.scheduledPayrollDate || '');
  const [schedTime, setSchedTime]         = useState(company.scheduledPayrollTime || '09:00');
  const [schedFreq, setSchedFreq]         = useState<Frequency>((company.payrollFrequency) || 'monthly');
  const [step, setStep]                   = useState<Step>((company.scheduledPayrollDate && company.autoPayrollEnabled ? 'scheduled' : 'idle') as Step);
  const [error, setError]                 = useState('');
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const [executeTxHash, setExecuteTxHash] = useState<`0x${string}` | undefined>();
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  const currentMonth = useMemo(() => new Date().toLocaleString('default', { month: 'long', year: 'numeric' }), []);
  const lines      = computePayroll(employees, earningsDeductions);
  const ready      = lines.filter((l) => l.canPay);
  const blocked    = lines.filter((l) => !l.canPay);
  const totalGross  = ready.reduce((s, r) => s + r.gross,    0);
  const totalNet    = ready.reduce((s, r) => s + r.net,      0);
  const totalVault  = ready.reduce((s, r) => s + r.vault,    0);
  const totalWallet = ready.reduce((s, r) => s + r.toWallet, 0);

  const { data: rawBal } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const usdcBalance = rawBal !== undefined ? Number(formatUsdc(rawBal)) : 0;

  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`,
    abi: erc20Abi, functionName: 'allowance',
    args: address ? [address, BATCH_CONTRACT] : undefined,
    query: { enabled: !!address },
  });
  const allowance    = rawAllowance !== undefined ? Number(formatUsdc(rawAllowance)) : 0;
  const hasAllowance = allowance >= totalWallet;

  const { writeContractAsync, isPending, reset: resetWrite } = useWriteContract();
  const { isSuccess: execConfirmed } = useWaitForTransactionReceipt({ hash: executeTxHash });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const targetISO = company.scheduledPayrollDate && company.scheduledPayrollTime
    ? `${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00` : '';
  const targetMs = targetISO ? new Date(targetISO).getTime() : 0;
  const diff     = targetMs > 0 ? Math.max(0, targetMs - now) : 0;
  const isPast   = targetMs > 0 && targetMs < now;
  const countdown = {
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1_000),
  };

  const autoFired = useRef(false);
  useEffect(() => {
    if (diff === 0 && targetMs > 0 && step === 'scheduled' && ready.length > 0 && address && !onWrongChain && hasAllowance) {
      if (!autoFired.current) { autoFired.current = true; void handleRunNow(); }
    }
    if (diff > 0) autoFired.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, targetMs, step]);

  useEffect(() => {
    if (!execConfirmed || !executeTxHash) return;
    setStep('done');
    const runNow = new Date();
    addPayrollRun({ month: runNow.toLocaleString('default', { month: 'long', year: 'numeric' }), executedAt: runNow.toISOString(), txHash: executeTxHash, totalGross, totalNet, totalVault, employeeCount: ready.length });
    ready.forEach((r) => recordTx({ type: 'payroll', label: `${currentMonth} salary — ${r.name}`, from: address ?? 'treasury', to: r.walletAddress, amount: r.toWallet, direction: 'in', txHash: executeTxHash, status: 'confirmed' }));
    if (company.scheduledPayrollDate && company.autoPayrollEnabled) {
      const freq = (company.payrollFrequency) || 'monthly';
      const nextDate = advanceByFrequency(company.scheduledPayrollDate, freq);
      saveCompany({ scheduledPayrollDate: nextDate, autoPayrollEnabled: true });
      setSchedDate(nextDate);
      setTimeout(() => setStep('scheduled'), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execConfirmed, executeTxHash]);

  const handleApprove = useCallback(async () => {
    if (!address || onWrongChain) return;
    setError('');
    try {
      setStep('approving');
      const hash = await writeContractAsync({ address: USDC.address as `0x${string}`, abi: erc20Abi, functionName: 'approve', args: [BATCH_CONTRACT, maxUint256], chainId: ARC_TESTNET });
      setApproveTxHash(hash);
      await publicClient!.waitForTransactionReceipt({ hash });
      void refetchAllowance(); resetWrite(); setStep('idle');
    } catch (e) { setError(e instanceof Error ? e.message.slice(0, 120) : 'Approval failed'); setStep('idle'); resetWrite(); }
  }, [address, onWrongChain, writeContractAsync, resetWrite, publicClient, refetchAllowance]);

  const handleRunNow = useCallback(async () => {
    if (!address || onWrongChain || ready.length === 0) return;
    setError('');
    try {
      const recipients = ready.map((r) => r.walletAddress as `0x${string}`);
      const amounts    = ready.map((r) => parseAmount(ARC_TESTNET, r.toWallet.toFixed(6)).raw);
      setStep('executing');
      const hash = await writeContractAsync({ address: BATCH_CONTRACT, abi: BATCH_ABI, functionName: 'batchTransfer', args: [recipients, amounts], chainId: ARC_TESTNET });
      setExecuteTxHash(hash);
    } catch (e) { setError(e instanceof Error ? e.message.slice(0, 120) : 'Batch failed'); setStep((step === 'scheduled' ? 'scheduled' : 'idle')); resetWrite(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, onWrongChain, ready, writeContractAsync, resetWrite, step]);

  function handleSchedule() {
    if (!schedDate) return;
    saveCompany({ scheduledPayrollDate: schedDate, scheduledPayrollTime: schedTime, autoPayrollEnabled: true, payrollFrequency: schedFreq });
    setStep('scheduled'); autoFired.current = false;
  }

  function handleCancel() {
    saveCompany({ scheduledPayrollDate: '', scheduledPayrollTime: '09:00', autoPayrollEnabled: false });
    setStep('idle'); setCancelConfirm(false); autoFired.current = false;
  }

  if (employees.length === 0) {
    return (
      <SectionCard><div className="flex flex-col items-center py-12 text-center">
        <Users size={28} style={{ color: 'var(--muted)' }} className="mb-3" />
        <p className="font-semibold" style={{ color: 'var(--ink)' }}>No employees enrolled yet</p>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Go to Employees and add staff first.</p>
      </div></SectionCard>
    );
  }

  if (step === 'done' && executeTxHash) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-2xl">
        <SectionCard>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--success-bg)' }}>
              <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
            </div>
            <div>
              <h2 className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Payroll Complete</h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{ready.length} employees paid in one transaction</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Employees paid', val: String(ready.length), color: 'var(--success)' },
              { label: 'Total sent', val: `$${totalWallet.toLocaleString()}`, color: 'var(--cyan-dark)' },
              { label: 'Vault routed', val: `$${totalVault.toLocaleString()}`, color: '#fb923c' },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div className="font-bold text-base" style={{ color: s.color }}>{s.val}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <a href={buildTxExplorerUrl(ARC_TESTNET, executeTxHash)} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold mb-3"
            style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.2)' }}>
            <ExternalLink size={14} /> View batch transaction on Arc Explorer
          </a>
          {company.autoPayrollEnabled && company.scheduledPayrollDate && (
            <div className="p-3 rounded-xl flex items-center gap-2 text-xs" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-dark)' }}>
              <RefreshCw size={11} />
              Next {FREQ_LABELS[(company.payrollFrequency) || 'monthly'].toLowerCase()} payroll:&nbsp;
              <strong>{new Date(`${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00`).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
            </div>
          )}
          <button onClick={() => { setStep((company.autoPayrollEnabled ? 'scheduled' : 'idle')); setExecuteTxHash(undefined); }} className="w-full cta-btn mt-3">
            Back to Payroll
          </button>
        </SectionCard>
      </motion.div>
    );
  }

  if (step === 'executing') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 max-w-2xl">
        <SectionCard>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.12)' }}>
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'transparent', borderTopColor: 'var(--cyan)' }} />
            </div>
            <div>
              <h2 className="font-bold text-lg" style={{ color: 'var(--ink)' }}>
                {executeTxHash ? 'Confirming on Arc…' : 'Confirm in wallet…'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {executeTxHash ? 'Transaction submitted — Arc confirms in under 1 second' : 'Approve the batch transaction in your wallet'}
              </p>
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden mb-4" style={{ background: 'var(--surface-muted)' }}>
            <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, var(--cyan-dark), var(--blue))' }}
              animate={{ width: executeTxHash ? '80%' : '40%' }} transition={{ duration: 0.5 }} />
          </div>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Distributing ${totalWallet.toLocaleString()} USDC to {ready.length} employees in one atomic transaction.
          </p>
          {executeTxHash && (
            <a href={buildTxExplorerUrl(ARC_TESTNET, executeTxHash)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold mt-2" style={{ color: 'var(--cyan-dark)' }}>
              <ExternalLink size={11} /> Track on Arc Explorer
            </a>
          )}
        </SectionCard>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">

      <SectionCard title="Step 1 — Approve USDC (once)">
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Approve the BatchTransfer contract once. After this, every payroll run needs no further approval.
          </p>
          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Current allowance</p>
              <p className="font-bold tabular-nums" style={{ color: hasAllowance ? 'var(--success)' : 'var(--warning)' }}>
                {allowance >= 999_999 ? 'Unlimited' : `${allowance.toLocaleString()} USDC`}
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
          <button onClick={() => { void handleApprove(); }}
            disabled={!address || onWrongChain || step === 'approving' || hasAllowance}
            className="w-full cta-btn disabled:opacity-40">
            {step === 'approving'
              ? <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'transparent', borderTopColor: '#fff' }} /> Confirm in wallet…</span>
              : hasAllowance ? <><CheckCircle2 size={13} /> Approved — unlimited spend</> : 'Approve USDC (one-time)'}
          </button>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Contract: <a href={`https://explorer.testnet.arc.io/address/${BATCH_CONTRACT}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cyan-dark)' }}>{BATCH_CONTRACT.slice(0,10)}…{BATCH_CONTRACT.slice(-8)}</a>
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Step 2 — Schedule Payroll">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Payroll Date</label>
              <div className="relative">
                <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input type="date" value={schedDate} min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSchedDate(e.target.value)} className="form-input" style={{ paddingLeft: '2rem' }} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Time (24h)</label>
              <div className="relative">
                <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
                <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)}
                  className="form-input" style={{ paddingLeft: '2rem' }} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Frequency</label>
            <div className="flex gap-2 flex-wrap">
              {(['daily', 'weekly', 'monthly', 'yearly'] as Frequency[]).map((f) => (
                <button key={f} type="button" onClick={() => setSchedFreq(f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: schedFreq === f ? 'var(--cyan-dark)' : 'var(--surface)', color: schedFreq === f ? '#fff' : 'var(--ink-2)', border: `1px solid ${schedFreq === f ? 'var(--cyan-dark)' : 'var(--border)'}` }}>
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {step === 'scheduled' && company.scheduledPayrollDate && !isPast && diff > 0 && (
            <div className="p-4 rounded-xl text-center" style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--cyan-dark)' }}>Auto-payroll fires in</p>
              <div className="flex justify-center gap-4 mb-2">
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
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                {new Date(`${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00`).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                &nbsp;·&nbsp;<span style={{ color: 'var(--cyan-dark)' }}>Auto ON · {FREQ_LABELS[(company.payrollFrequency) || 'monthly']}</span>
              </p>
            </div>
          )}

          {isPast && step === 'scheduled' && (
            <div className="p-3 rounded-xl" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.2)' }}>
              <p className="text-sm" style={{ color: 'var(--warning)' }}>Scheduled time has passed — running payroll now…</p>
            </div>
          )}

          {step === 'scheduled' && company.scheduledPayrollDate && !isPast && (
            <div className="p-3 rounded-xl flex items-center gap-2 text-xs" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-dark)' }}>
              <Shield size={12} />
              Scheduled: <strong>{new Date(`${company.scheduledPayrollDate}T${company.scheduledPayrollTime}:00`).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</strong>
              &nbsp;·&nbsp;{FREQ_LABELS[(company.payrollFrequency) || 'monthly']}
            </div>
          )}

          {cancelConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl space-y-3"
              style={{ background: 'var(--danger-bg)', border: '1px solid rgba(220,38,38,0.25)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Cancel scheduled payroll?</p>
              <p className="text-xs" style={{ color: 'var(--danger)' }}>This removes the schedule. No funds will be sent.</p>
              <div className="flex gap-2">
                <button onClick={() => setCancelConfirm(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}>Keep scheduled</button>
                <button onClick={handleCancel} className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--danger)', color: '#fff' }}>Yes, cancel</button>
              </div>
            </motion.div>
          )}

          <div className="flex gap-2 flex-wrap">
            {step !== 'scheduled' ? (
              <button onClick={handleSchedule} disabled={!schedDate || !hasAllowance} className="cta-btn flex-1">
                <Calendar size={13} /> Schedule Payroll
              </button>
            ) : (
              <button onClick={() => setCancelConfirm(true)} disabled={cancelConfirm}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.3)' }}>
                <XCircle size={13} /> Cancel Schedule
              </button>
            )}
            <button onClick={() => { void handleRunNow(); }}
              disabled={!address || onWrongChain || ready.length === 0 || !hasAllowance || isPending}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, var(--cyan-dark), var(--blue))', color: '#fff' }}>
              <Play size={13} /> Run Now
            </button>
          </div>

          {!hasAllowance && <p className="text-xs" style={{ color: 'var(--warning)' }}>Complete Step 1 before scheduling.</p>}
          {!address && <p className="text-xs" style={{ color: 'var(--warning)' }}>Connect your treasury wallet to continue.</p>}
          {address && onWrongChain && (
            <div className="flex items-center gap-2">
              <p className="text-xs" style={{ color: 'var(--warning)' }}>Wrong network.</p>
              <button onClick={() => switchChain({ chainId: ARC_TESTNET })} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--warning)', color: '#fff' }}>Switch to Arc Testnet</button>
            </div>
          )}
          {error && <p className="text-xs p-2.5 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</p>}
        </div>
      </SectionCard>

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

      {blocked.length > 0 && (
        <div className="p-3.5 rounded-xl flex items-center gap-2.5" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.25)' }}>
          <AlertCircle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--warning)' }}>{blocked.map((b) => b.name).join(', ')} skipped — wallet not linked or inactive.</p>
        </div>
      )}

      <SectionCard title={`Payroll Breakdown — ${currentMonth}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Employee', 'Gross', 'Deductions', 'Net Pay', 'Vault', 'To Wallet', 'Status', ''].map((h) => (
                  <th key={h} className="text-left pb-3 pr-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((row) => {
                const expanded = expandedId === row.employeeId;
                const totalDed = row.deductionsBreakdown.reduce((s, d) => s + d.amount, 0);
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
                      <td className="py-3">{expanded ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}</td>
                    </tr>
                    {expanded && (
                      <tr key={`exp-${row.employeeId}`}>
                        <td colSpan={8} className="pb-3">
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-xl"
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
        <div className="mt-4 p-4 rounded-xl flex items-center justify-between flex-wrap gap-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
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

      {address && (
        <div className="p-3 rounded-xl flex items-center justify-between text-sm" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
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
