import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Download,
  Send,
  Wallet,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Minus,
  Clock,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { buildTxExplorerUrl } from '@/onchain-facts';
import { useAppStore } from '../store/AppStore';
import { SectionCard, NetworkFeeBadge } from './AppShell';
import { useState } from 'react';

const ARC_TESTNET_ID = 5042002;

function relTime(iso: string) {
  const now  = new Date();
  const diff = now.getTime() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

interface EmployeePortalProps {
  onNavigate?: (id: string) => void;
}

export function EmployeePortal({ onNavigate }: EmployeePortalProps) {
  const { address }                  = useAccount();
  const { employees, txsForWallet, inboundTotal, payrollHistory } = useAppStore();
  const [selectedPayslipIdx, setSelectedPayslipIdx] = useState<number | null>(null);
  const [vaultAlloc, setVaultAlloc]  = useState(20);

  // Find the employee record that matches the connected wallet (if any)
  const meEmployee = useMemo(
    () => address
      ? employees.find((e) => e.walletAddress.toLowerCase() === address.toLowerCase())
      : undefined,
    [employees, address],
  );

  // All transactions for this wallet, newest first
  const myTxs = useMemo(
    () => (address ? txsForWallet(address) : []),
    [address, txsForWallet],
  );

  // Running USDC balance: sum of all confirmed inbound transactions
  const ledgerBalance = useMemo(
    () => (address ? inboundTotal(address) : 0),
    [address, inboundTotal],
  );

  // Build payslips from payroll history where this employee appears
  // (Payroll runs record employee wallets in their tx label; we match by wallet)
  const myPayslips = useMemo(() => {
    return payrollHistory.map((run) => ({
      ...run,
      // Find this employee's tx for that run in the ledger
      myTx: myTxs.find(
        (t) => t.type === 'payroll' && t.timestamp.startsWith(run.executedAt.slice(0, 7)),
      ),
    }));
  }, [payrollHistory, myTxs]);

  return (
    <div className="space-y-5">
      {/* ── Hero balance card ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0d1f3c 0%, #0e7490 100%)',
          boxShadow: '0 8px 32px rgba(6,182,212,0.18)',
        }}
      >
        <div className="absolute -top-6 -right-6 w-36 h-36 rounded-full opacity-10"
          style={{ background: 'var(--cyan)' }} />
        <div className="relative z-10">
          {meEmployee && (
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {meEmployee.name} &bull; {meEmployee.department}
            </p>
          )}
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {meEmployee ? 'Wallet Balance' : 'USDC Balance (Zisipay ledger)'}
          </p>
          <div className="display font-bold mb-0.5" style={{ fontSize: '2.5rem', color: '#fff', letterSpacing: '-0.04em' }}>
            ${ledgerBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            USDC &bull; Arc Testnet &bull; {myTxs.filter((t) => t.direction === 'in').length} payments received
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => onNavigate?.('send')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(6,182,212,0.2)', color: '#67e8f9' }}
            >
              <Send size={14} /> Send
            </button>
            <button
              onClick={() => onNavigate?.('send')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            >
              <Wallet size={14} /> Receive
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Vault allocation ────────────────────────────────────────────────── */}
      <SectionCard title="Salary Vault Allocation">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>Zisipay USDC Yield Vault</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Current APY: <span style={{ color: 'var(--success)', fontWeight: 700 }}>7.2%</span>
            </div>
          </div>
          <div className="text-right">
            <div className="display font-bold text-xl tabular-nums" style={{ color: 'var(--success)' }}>{vaultAlloc}%</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>of net pay</div>
          </div>
        </div>

        <input
          type="range" min={0} max={80} step={5}
          value={vaultAlloc}
          onChange={(e) => setVaultAlloc(Number(e.target.value))}
          className="w-full mb-3"
          style={{ accentColor: 'var(--cyan)' }}
        />

        <div className="flex justify-between text-xs mb-3" style={{ color: 'var(--muted)' }}>
          {[0, 20, 40, 60, 80].map((v) => <span key={v}>{v}%</span>)}
        </div>

        {meEmployee && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Vault deposit/mo', value: `$${((meEmployee.salary * vaultAlloc) / 100).toFixed(0)}`, color: 'var(--success)' },
              { label: 'Wallet received/mo', value: `$${(meEmployee.salary - (meEmployee.salary * vaultAlloc) / 100).toFixed(0)}`, color: 'var(--cyan-dark)' },
            ].map((v) => (
              <div key={v.label} className="p-3 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
                <div className="font-bold text-base tabular-nums" style={{ color: v.color }}>{v.value}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{v.label}</div>
              </div>
            ))}
          </div>
        )}

        {meEmployee && (
          <div className="p-3 rounded-xl mb-3" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cyan-dark)' }}>
              <TrendingUp size={12} />
              At 7.2% APY, depositing ${((meEmployee.salary * vaultAlloc) / 100).toFixed(0)}/mo
              earns ~${((meEmployee.salary * vaultAlloc / 100) * 12 * 0.072).toFixed(0)}/year in yield.
            </div>
          </div>
        )}

        <NetworkFeeBadge />

        <button
          className="mt-3 w-full py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, var(--cyan-dark), var(--blue))' }}
          onClick={() => onNavigate?.('yield')}
        >
          Manage in Yield Vaults
        </button>
      </SectionCard>

      {/* ── Payroll history payslips ────────────────────────────────────────── */}
      {myPayslips.length > 0 && (
        <SectionCard title="My Payslips">
          <div className="space-y-3">
            {myPayslips.map((ps, idx) => (
              <button
                key={ps.id}
                onClick={() => setSelectedPayslipIdx(selectedPayslipIdx === idx ? null : idx)}
                className="w-full text-left"
              >
                <div
                  className="p-4 rounded-xl transition-all"
                  style={{
                    background: selectedPayslipIdx === idx ? 'rgba(6,182,212,0.06)' : 'var(--surface-muted)',
                    border: `1px solid ${selectedPayslipIdx === idx ? 'rgba(6,182,212,0.25)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{ps.month}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        {new Date(ps.executedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                          ${ps.totalNet.toLocaleString()}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>net pay</div>
                      </div>
                      <ChevronRight
                        size={14}
                        style={{
                          color: 'var(--muted)',
                          transform: selectedPayslipIdx === idx ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.2s',
                        }}
                      />
                    </div>
                  </div>

                  {selectedPayslipIdx === idx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 pt-4"
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--ink-2)' }}>Gross Pay</span>
                          <span className="tabular-nums font-semibold" style={{ color: 'var(--success)' }}>
                            ${ps.totalGross.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--ink-2)' }}>Total Deductions</span>
                          <span className="tabular-nums" style={{ color: 'var(--danger)' }}>
                            -${(ps.totalGross - ps.totalNet).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--ink-2)' }}>Net Pay</span>
                          <span className="tabular-nums font-bold" style={{ color: 'var(--ink)' }}>
                            ${ps.totalNet.toLocaleString()}
                          </span>
                        </div>
                        <div
                          className="flex items-center justify-between pt-2 mt-2"
                          style={{ borderTop: '1px solid var(--border)' }}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="text-xs" style={{ color: 'var(--muted)' }}>To vault ({vaultAlloc}%)</div>
                              <div className="font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
                                ${((ps.totalNet * vaultAlloc) / 100).toFixed(0)}
                              </div>
                            </div>
                            <Minus size={12} style={{ color: 'var(--muted)' }} />
                            <div>
                              <div className="text-xs" style={{ color: 'var(--muted)' }}>To wallet</div>
                              <div className="font-semibold tabular-nums" style={{ color: 'var(--cyan-dark)' }}>
                                ${(ps.totalNet - (ps.totalNet * vaultAlloc) / 100).toFixed(0)}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <a
                              href={buildTxExplorerUrl(ARC_TESTNET_ID, ps.txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-semibold"
                              style={{ color: 'var(--cyan-dark)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Explorer <ArrowUpRight size={10} />
                            </a>
                            <button
                              className="flex items-center gap-1 text-xs font-semibold"
                              style={{ color: 'var(--muted)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download size={10} /> PDF
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── Live Activity from ledger ────────────────────────────────────────── */}
      <SectionCard title="Activity (live)">
        {myTxs.length === 0 ? (
          <div className="text-center py-8">
            <Clock size={28} className="mx-auto mb-2" style={{ color: 'var(--muted)' }} />
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No activity yet.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Received payments and sends appear here instantly after Arc confirmation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {myTxs.slice(0, 30).map((h) => (
              <div key={h.id} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: h.direction === 'in' ? 'var(--success-bg)' : 'var(--danger-bg)' }}
                >
                  {h.direction === 'in'
                    ? <ArrowDownLeft size={14} style={{ color: 'var(--success)' }} />
                    : <ArrowUpRight  size={14} style={{ color: 'var(--danger)'  }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{h.label}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {relTime(h.timestamp)}
                    {h.type === 'payroll' && ' · payroll'}
                    {h.status === 'pending' && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                        pending
                      </span>
                    )}
                  </div>
                </div>
                <a
                  href={`https://testnet.arcscan.app/tx/${h.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold tabular-nums flex items-center gap-1 group"
                  style={{ color: h.direction === 'in' ? 'var(--success)' : 'var(--danger)', textDecoration: 'none' }}
                >
                  {h.direction === 'in' ? '+' : '-'}${h.amount.toFixed(2)}
                  <ArrowUpRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--muted)' }} />
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
