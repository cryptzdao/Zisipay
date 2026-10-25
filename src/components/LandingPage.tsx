import { useState } from 'react';
import { motion } from 'framer-motion';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import {
  ArrowRight,
  Shield,
  Zap,
  TrendingUp,
  Users,
  Building2,
  Globe,
} from 'lucide-react';
import { ZisipayLogo } from './ZisipayLogo';

interface LandingPageProps {
  onEnterApp: (role: 'admin' | 'hr' | 'finance' | 'employee') => void;
}

const ROLES = [
  {
    id: 'admin' as const,
    label: 'Super Admin',
    desc: 'Full platform control, company setup, roles',
    icon: Shield,
    color: 'from-blue-600 to-blue-800',
  },
  {
    id: 'finance' as const,
    label: 'Finance',
    desc: 'Treasury, payroll execution, yield dashboard',
    icon: TrendingUp,
    color: 'from-cyan-500 to-cyan-700',
  },
  {
    id: 'hr' as const,
    label: 'HR Manager',
    desc: 'Employee records, earnings, deductions',
    icon: Users,
    color: 'from-indigo-500 to-indigo-700',
  },
  {
    id: 'employee' as const,
    label: 'Employee',
    desc: 'Payslips, vault yield, send & receive',
    icon: Building2,
    color: 'from-teal-500 to-teal-700',
  },
];

const FEATURES = [
  { icon: Zap, title: 'Sub-second finality', desc: 'Deterministic settlement on Arc' },
  { icon: TrendingUp, title: 'Earn while you sleep', desc: 'Auto-route salary to USDC yield vaults' },
  { icon: Shield, title: 'USDC-native gas', desc: 'Predictable fees, zero volatility' },
  { icon: Globe, title: 'Cross-chain funding', desc: 'CCTP/Gateway for USDC inflows' },
];

export function LandingPage({ onEnterApp }: LandingPageProps) {
  const { isConnected } = useAccount();
  const [selectedRole, setSelectedRole] = useState<'admin' | 'hr' | 'finance' | 'employee' | null>(null);

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-2.5">
          <ZisipayLogo size={34} />
          <span className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
            Zisi<span style={{ color: 'var(--cyan)' }}>pay</span>
          </span>
        </div>
        <ConnectKitButton />
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl"
        >
          {/* Logo hero */}
          <div className="flex justify-center mb-8">
            <div
              className="p-5 rounded-3xl shadow-xl"
              style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 50%, #0e7490 100%)' }}
            >
              <ZisipayLogo size={64} variant="reversed" />
            </div>
          </div>

          <h1 className="display font-bold mb-3" style={{ fontSize: '2.75rem', letterSpacing: '-0.04em', color: 'var(--ink)', lineHeight: 1.1 }}>
            One click seamless<br />
            <span style={{ color: 'var(--cyan)' }}>payroll</span>
            <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: '2rem' }}>  +  </span>
            <span style={{ color: 'var(--blue-mid)' }}>Your yield.</span>
          </h1>

          <p className="text-base mb-10" style={{ color: 'var(--muted)', maxWidth: '52ch', margin: '0 auto 2.5rem' }}>
            A self-custodial payroll platform built on Arc. Pay employees in USDC with full role-based control, automatic yield routing to on-chain vaults, and sub-second settlement.
          </p>

          {/* Feature chips */}
          <div className="flex flex-wrap justify-center gap-2.5 mb-12">
            {FEATURES.map(({ icon: Icon, title }) => (
              <span
                key={title}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
              >
                <Icon size={13} style={{ color: 'var(--cyan)' }} />
                {title}
              </span>
            ))}
          </div>

          {/* Role selector */}
          {isConnected ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <p className="text-sm font-semibold mb-4 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
                Enter as
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto mb-6">
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const active = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRole(role.id)}
                      className="p-4 rounded-2xl text-left transition-all"
                      style={{
                        background: active
                          ? 'linear-gradient(135deg, var(--cyan-dark), var(--blue))'
                          : 'var(--surface)',
                        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                        boxShadow: active ? '0 4px 20px rgba(6,182,212,0.25)' : 'none',
                        color: active ? '#fff' : 'var(--ink)',
                      }}
                    >
                      <Icon size={20} className="mb-2" style={{ color: active ? '#67e8f9' : 'var(--cyan)' }} />
                      <div className="font-semibold text-sm">{role.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>
                        {role.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                disabled={!selectedRole}
                onClick={() => selectedRole && onEnterApp(selectedRole)}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, var(--cyan-dark) 0%, var(--blue) 100%)',
                  boxShadow: selectedRole ? '0 4px 24px rgba(6,182,212,0.30)' : 'none',
                }}
              >
                Enter Zisipay
                <ArrowRight size={16} />
              </button>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to get started</p>
              <ConnectKitButton label="Connect Wallet" />
            </div>
          )}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {/* Social handles */}
        <div className="flex justify-center gap-6 mb-4">
          {/* X (Twitter) */}
          <a
            href="https://x.com/zisipay"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          >
            {/* X logo */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L2.25 2.25h6.985l4.266 5.638Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
            </svg>
            @zisipay
          </a>
        </div>
        <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
          Powered by <span style={{ color: 'var(--cyan)' }}>Arc</span> &amp; Circle &bull; USDC-native gas &bull; ERC-4626 yield vaults
        </p>
      </footer>
    </div>
  );
}
