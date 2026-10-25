import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  DollarSign,
  Zap,
  RefreshCw,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { useAccount, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { getUsdc } from '@/onchain-facts';
import { Amount, usdcDecimalsFor } from '@/onchain-money';
import { SectionCard, NetworkFeeBadge } from './AppShell';
import type { UserRole } from './AppShell';

const ARC_TESTNET_ID = 5042002;
const usdcFact = getUsdc(ARC_TESTNET_ID);

interface CompanyDashboardProps {
  role: UserRole;
  onNavigate: (id: string) => void;
}

const STATS = [
  { label: 'Treasury Balance', value: '$246,800', sub: 'USDC on Arc', icon: DollarSign, color: 'var(--cyan)', delta: '+$12,400', positive: true },
  { label: 'Total Employees', value: '42', sub: 'Active · 3 pending', icon: Users, color: '#818cf8', delta: '+3', positive: true },
  { label: 'Yield Earned (MTD)', value: '$3,218', sub: 'USDC Yield Vault', icon: TrendingUp, color: 'var(--success)', delta: '+7.2% APY', positive: true },
  { label: 'Next Payroll', value: '$186,400', sub: 'Due Oct 25, 2026', icon: Zap, color: '#fb923c', delta: '3 days', positive: false },
];

const RECENT_TXS = [
  { type: 'in', label: 'Treasury Top-up', amount: '+$50,000', time: '2h ago', status: 'confirmed' },
  { type: 'out', label: 'Payroll — Sep 25', amount: '-$178,200', time: '27d ago', status: 'confirmed' },
  { type: 'in', label: 'Yield Claim — Galaxy', amount: '+$2,180', time: '4d ago', status: 'confirmed' },
  { type: 'out', label: 'Advance — E. Okoro', amount: '-$1,200', time: '6d ago', status: 'confirmed' },
];

export function CompanyDashboard({ role, onNavigate }: CompanyDashboardProps) {
  const { address } = useAccount();
  const [refreshing, setRefreshing] = useState(false);

  const { data: rawBalance, isLoading: balLoading } = useReadContract(
    usdcFact && address
      ? {
          address: usdcFact.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
          chainId: ARC_TESTNET_ID,
        }
      : undefined
  );

  const formattedBalance =
    rawBalance !== undefined
      ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
      : null;

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <div className="space-y-5">
      {/* Hero treasury card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 55%, #0e7490 100%)',
          boxShadow: '0 8px 32px rgba(6,182,212,0.18)',
        }}
      >
        {/* Decorative accent circle — top right only */}
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-10" style={{ background: 'var(--cyan)' }} />

        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Company Treasury
            </p>
            <div className="display font-bold mb-1" style={{ fontSize: '2.5rem', color: '#fff', letterSpacing: '-0.04em' }}>
              {balLoading ? (
                <span className="animate-pulse" style={{ color: 'rgba(255,255,255,0.4)' }}>Loading...</span>
              ) : formattedBalance !== null ? (
                `$${formattedBalance}`
              ) : (
                '$246,800.00'
              )}
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              USDC &bull; Arc Testnet
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2.5 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <RefreshCw size={15} color="#fff" className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Action row */}
        {(role === 'admin' || role === 'finance') && (
          <div className="relative z-10 flex gap-3 mt-5">
            <button
              onClick={() => onNavigate('onramp')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            >
              <ArrowDownLeft size={14} /> Deposit
            </button>
            <button
              onClick={() => onNavigate('payroll')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(6,182,212,0.25)', color: '#67e8f9' }}
            >
              <Zap size={14} /> Run Payroll
            </button>
            <button
              onClick={() => onNavigate('yield')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
            >
              <TrendingUp size={14} /> Yield
            </button>
          </div>
        )}
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <SectionCard>
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${stat.color}18` }}
                  >
                    <Icon size={16} style={{ color: stat.color }} />
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: stat.positive ? 'var(--success-bg)' : 'var(--warning-bg)',
                      color: stat.positive ? 'var(--success)' : 'var(--warning)',
                    }}
                  >
                    {stat.delta}
                  </span>
                </div>
                <div className="display font-bold text-xl tabular-nums" style={{ color: 'var(--ink)' }}>
                  {stat.value}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {stat.label}
                </div>
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {stat.sub}
                </div>
              </SectionCard>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent transactions */}
        <SectionCard title="Recent Activity">
          <div className="space-y-3">
            {RECENT_TXS.map((tx) => (
              <div key={tx.label + tx.time} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: tx.type === 'in' ? 'var(--success-bg)' : 'rgba(220,38,38,0.08)',
                  }}
                >
                  {tx.type === 'in'
                    ? <ArrowDownLeft size={14} style={{ color: 'var(--success)' }} />
                    : <ArrowUpRight size={14} style={{ color: 'var(--danger)' }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{tx.label}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{tx.time}</div>
                </div>
                <div
                  className="text-sm font-bold tabular-nums"
                  style={{ color: tx.type === 'in' ? 'var(--success)' : 'var(--danger)' }}
                >
                  {tx.amount}
                </div>
              </div>
            ))}
          </div>
          <button
            className="mt-4 w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            View all transactions <ArrowRight size={12} />
          </button>
        </SectionCard>

        {/* Yield overview */}
        <SectionCard title="Yield Overview">
          <div className="space-y-3">
            {[
              { name: 'Galaxy USDC Vault', deposited: '$45,000', apy: '7.2%' },
              { name: 'Steakhouse USDC', deposited: '$12,000', apy: '5.8%' },
            ].map((v) => (
              <div key={v.name} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{v.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>ERC-4626 Vault &bull; {v.deposited} deposited</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-bold" style={{ color: 'var(--success)' }}>{v.apy}</div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>APY</div>
                  </div>
                  <button
                    onClick={() => onNavigate('yield')}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(6,182,212,0.1)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.2)' }}
                  >
                    Manage
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Total yield earned (MTD)</span>
              <span className="font-bold text-sm tabular-nums" style={{ color: 'var(--success)' }}>+$3,218.40</span>
            </div>
          </div>
          <NetworkFeeBadge />
          <div className="flex items-center justify-between mt-3">
            <a
              href="https://explorer.testnet.arc.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--cyan-dark)' }}
            >
              Arc Explorer <ExternalLink size={10} />
            </a>
            <button
              onClick={() => onNavigate('yield')}
              className="text-xs font-semibold flex items-center gap-1"
              style={{ color: 'var(--cyan-dark)' }}
            >
              All vaults <ArrowRight size={11} />
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
