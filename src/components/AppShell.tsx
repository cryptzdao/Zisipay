import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  TrendingUp as TrendingUpIcon,
  Settings,
  Send,
  FileText,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Bell,
  Wallet as WalletIcon,
  Zap,
  ArrowLeftRight,
  ExternalLink as ExternalLinkIcon,
  AlertCircle as AlertCircleIcon,
  CheckCircle2 as CheckCircle2Icon,
  RefreshCw,
} from 'lucide-react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi';
import { erc20Abi, isAddress } from 'viem';
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts';
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money';
import { ZisipayLogo } from './ZisipayLogo';
import { QRDisplay } from './QRDisplay';
import { CompanyDashboard } from './CompanyDashboard';
import { HRDashboard } from './HRDashboard';
import { EmployeePortal } from './EmployeePortal';
import { PayrollPreview } from './PayrollPreview';
import { SettingsPanel } from './SettingsPanel';
import { useAppStore } from '../store/AppStore';

export type UserRole = 'admin' | 'hr' | 'finance' | 'employee';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard',       icon: LayoutDashboard, roles: ['admin', 'finance'] },
  { id: 'payroll',   label: 'Payroll Preview',  icon: CreditCard,      roles: ['admin', 'finance'] },
  { id: 'employees', label: 'Employees',        icon: Users,           roles: ['admin', 'hr'] },
  { id: 'portal',    label: 'My Portal',        icon: WalletIcon,      roles: ['employee'] },
  { id: 'send',      label: 'Send / Receive',   icon: Send,            roles: ['employee', 'admin', 'finance'] },
  { id: 'yield',     label: 'Yield Vaults',     icon: TrendingUpIcon,  roles: ['admin', 'finance', 'employee'] },
  { id: 'onramp',    label: 'On / Off-Ramp',    icon: ArrowLeftRight,  roles: ['admin', 'finance', 'employee'] },
  { id: 'reports',   label: 'Reports',          icon: FileText,        roles: ['admin', 'finance', 'hr'] },
  { id: 'settings',  label: 'Settings',         icon: Settings,        roles: ['admin'] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin:    'Super Admin',
  hr:       'HR Manager',
  finance:  'Finance',
  employee: 'Employee',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin:    '#06b6d4',
  hr:       '#818cf8',
  finance:  '#34d399',
  employee: '#fb923c',
};

interface AppShellProps {
  role: UserRole;
  onSignOut: () => void;
}

export function AppShell({ role, onSignOut }: AppShellProps) {
  const { address } = useAccount();
  const { employees } = useAppStore();
  const [activeNav, setActiveNav] = useState(() => {
    if (role === 'employee') return 'portal';
    if (role === 'hr')       return 'employees';
    return 'dashboard';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(role));
  const shortAddr  = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected';

  function renderContent() {
    switch (activeNav) {
      case 'dashboard': return <CompanyDashboard role={role} onNavigate={setActiveNav} />;
      case 'payroll':   return <PayrollPreview />;
      case 'employees': return <HRDashboard />;
      case 'portal':    return <EmployeePortal onNavigate={setActiveNav} />;
      case 'send':      return <SendReceivePanel employees={employees} senderAddress={address} />;
      case 'yield':     return <YieldVaultsPanel role={role} />;
      case 'onramp':    return <OnrampOfframpPanel />;
      case 'reports':   return <ReportsPanel />;
      case 'settings':  return <SettingsPanel />;
      default:          return <CompanyDashboard role={role} onNavigate={setActiveNav} />;
    }
  }

  return (
    <div className="flex min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 h-dvh z-30 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: 240, background: 'var(--sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <ZisipayLogo size={30} variant="reversed" />
            <span className="display font-bold text-lg" style={{ color: '#fff', letterSpacing: '-0.04em' }}>
              Zisi<span style={{ color: '#06b6d4' }}>pay</span>
            </span>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} color="#94a3b8" />
          </button>
        </div>

        {/* Role badge */}
        <div className="mx-4 mb-4 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Signed in as</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: ROLE_COLORS[role] }} />
            <span className="text-sm font-semibold" style={{ color: ROLE_COLORS[role] }}>{ROLE_LABELS[role]}</span>
          </div>
          <div className="mono text-xs mt-1 truncate" style={{ color: '#475569' }}>{shortAddr}</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-all text-left"
                style={{
                  background:  active ? 'rgba(6,182,212,0.15)' : 'transparent',
                  color:       active ? '#06b6d4' : '#94a3b8',
                  borderLeft:  active ? '2px solid #06b6d4' : '2px solid transparent',
                }}
              >
                <Icon size={16} />
                {item.label}
                {active && <ChevronRight size={13} className="ml-auto" />}
              </button>
            );
          })}
        </nav>

        {/* Bottom user block */}
        <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 px-2 py-2 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--cyan-dark)', color: '#fff' }}
            >
              {role[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: '#e2e8f0' }}>{ROLE_LABELS[role]}</div>
              <div className="mono text-xs truncate" style={{ color: '#475569' }}>{shortAddr}</div>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ color: '#64748b' }}
          >
            <LogOut size={14} />
            Switch role / company
          </button>

          {/* Social */}
          <a
            href="https://x.com/zisipay"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors hover:opacity-80"
            style={{ color: '#94a3b8' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L2.25 2.25h6.985l4.266 5.638Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
            </svg>
            @zisipay
          </a>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-4 lg:px-6 py-3.5"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}
        >
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} style={{ color: 'var(--ink)' }} />
            </button>
            <div>
              <h1 className="display font-bold text-base" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {visibleNav.find((n) => n.id === activeNav)?.label ?? 'Dashboard'}
              </h1>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Arc Testnet &bull; USDC-native</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--cyan)' }} />
            </button>
            <ConnectKitButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{renderContent()}</main>
      </div>
    </div>
  );
}

/* ── Shared UI primitives ─────────────────────────────────────────────────── */

export function SectionCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', boxShadow: '0 1px 12px rgba(13,31,60,0.06)' }}
    >
      {title && (
        <h2 className="display font-bold text-sm mb-4 uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

export function NetworkFeeBadge() {
  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
      <Zap size={11} style={{ color: 'var(--cyan)' }} />
      <span>Gas fee: ~$0.001 USDC &bull; Arc Testnet</span>
    </div>
  );
}

/* ── Send / Receive panel ─────────────────────────────────────────────────── */

const ARC_TESTNET_ID = 5042002;
const USDC_FACT      = getUsdc(ARC_TESTNET_ID)!;

function parseOnchainError(err: Error | null): string {
  if (!err) return '';
  const msg = err.message.toLowerCase();
  if (msg.includes('user rejected') || msg.includes('denied'))  return 'Transaction cancelled.';
  if (msg.includes('insufficient'))                              return 'Insufficient USDC balance.';
  if (msg.includes('reverted'))                                  return 'Transaction reverted — check your balance.';
  if (msg.includes('network') || msg.includes('timeout'))       return 'Network error. Please retry.';
  return 'Something went wrong — please try again.';
}

interface SendReceivePanelProps {
  employees: import('../store/AppStore').Employee[];
  senderAddress: `0x${string}` | undefined;
}

function SendReceivePanel({ employees, senderAddress }: SendReceivePanelProps) {
  const [tab, setTab]     = useState<'send' | 'receive'>('send');
  const [to, setTo]       = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo]   = useState('');
  const [copied, setCopied] = useState(false);
  const { chainId }     = useAccount();
  const { recordTx }    = useAppStore();

  const { switchChain } = useSwitchChain();
  const onWrongChain = !!chainId && chainId !== ARC_TESTNET_ID;

  // Resolve recipient: email → employee directory, or raw 0x address
  const trimmedTo = to.trim();
  const resolvedEmployee = trimmedTo.includes('@')
    ? employees.find((e) => e.email.toLowerCase() === trimmedTo.toLowerCase())
    : employees.find((e) => e.walletAddress.toLowerCase() === trimmedTo.toLowerCase());
  const resolvedAddr: `0x${string}` | '' =
    resolvedEmployee?.walletAddress
      ? (resolvedEmployee.walletAddress as `0x${string}`)
      : isAddress(trimmedTo) ? (trimmedTo) : '';
  const resolvedName = resolvedEmployee?.name ?? '';

  // Live sender balance
  const { data: senderBalRaw, refetch: refetchBal } = useReadContract(
    senderAddress ? {
      address:      USDC_FACT.address as `0x${string}`,
      abi:          erc20Abi,
      functionName: 'balanceOf',
      args:         [senderAddress],
      chainId:      ARC_TESTNET_ID,
    } : undefined,
  );
  const senderBal = senderBalRaw !== undefined
    ? Amount.fromRaw(senderBalRaw, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2) : null;

  // wagmi: write USDC transfer + wait for on-chain receipt
  const {
    writeContract,
    data: txHash,
    isPending: isWalletPending,
    isError: isWriteError,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  // On confirmed → record real tx hash to ledger, refresh balance
  useEffect(() => {
    if (isConfirmed && txHash && resolvedAddr) {
      recordTx({
        type:      'send',
        label:     memo.trim() || `Sent to ${resolvedName || resolvedAddr.slice(0, 8) + '\u2026' + resolvedAddr.slice(-4)}`,
        from:      senderAddress ?? '',
        to:        resolvedAddr,
        amount:    parseFloat(amount),
        direction: 'out',
        txHash,
        status:    'confirmed',
      });
      void refetchBal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash]);

  const parsedAmt   = amount && parseFloat(amount) > 0 ? parseAmount(ARC_TESTNET_ID, amount) : null;
  const overBalance = senderBal !== null && parsedAmt !== null && parseFloat(amount) > parseFloat(senderBal);
  const canSend     = !!senderAddress && !!resolvedAddr && !!parsedAmt && !onWrongChain && !overBalance;
  const isBusy      = isWalletPending || isConfirming;
  const isDone      = isConfirmed && !!txHash;

  function handleSend() {
    if (!canSend || !parsedAmt) return;
    writeContract({
      address:      USDC_FACT.address as `0x${string}`,
      abi:          erc20Abi,
      functionName: 'transfer',
      args:         [resolvedAddr, parsedAmt.raw],
      chainId:      ARC_TESTNET_ID,
    });
  }

  function handleReset() {
    resetWrite();
    setTo(''); setAmount(''); setMemo('');
  }

  function handleCopy() {
    if (!senderAddress) return;
    void navigator.clipboard.writeText(senderAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-lg">
      <SectionCard title="Send / Receive USDC">
        <div className="flex rounded-xl overflow-hidden mb-5" style={{ background: 'var(--surface-muted)' }}>
          {(['send', 'receive'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); handleReset(); }}
              className="flex-1 py-2.5 text-sm font-semibold transition-all"
              style={{
                background:   tab === t ? 'var(--cyan-dark)' : 'transparent',
                color:        tab === t ? '#fff' : 'var(--muted)',
                borderRadius: tab === t ? 10 : 0,
              }}
            >
              {t === 'send' ? 'Send USDC' : 'Receive USDC'}
            </button>
          ))}
        </div>

        {tab === 'send' ? (
          isDone ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--success-bg)' }}>
                <CheckCircle2Icon size={30} style={{ color: 'var(--success)' }} />
              </div>
              <p className="font-bold text-xl mb-1" style={{ color: 'var(--ink)' }}>Sent successfully!</p>
              <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--cyan-dark)' }}>
                  ${parseFloat(amount).toFixed(2)} USDC
                </span>{' '}\u2192{' '}
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {resolvedName || resolvedAddr.slice(0, 8) + '\u2026' + resolvedAddr.slice(-6)}
                </span>
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--subtle)' }}>
                Confirmed on Arc Testnet &bull; sub-second finality
              </p>
              <a
                href={buildTxExplorerUrl(ARC_TESTNET_ID, txHash)}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold mb-4 px-4 py-2.5 rounded-xl"
                style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.25)' }}
              >
                <ExternalLinkIcon size={13} /> View on Arc Explorer
              </a>
              <div className="mono text-xs break-all px-3 py-2 rounded-lg mb-5 text-left"
                style={{ background: 'var(--surface-muted)', color: 'var(--subtle)', border: '1px solid var(--border)' }}>
                {txHash}
              </div>
              <button onClick={handleReset} className="cta-btn w-full">Send Another</button>
            </div>
          ) : (
            <div className="space-y-4">
              {!senderAddress ? (
                <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(217,119,6,0.25)' }}>
                  <AlertCircleIcon size={14} /> Connect your wallet to send USDC
                </div>
              ) : onWrongChain ? (
                <div className="p-3 rounded-xl flex items-center justify-between gap-2"
                  style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.25)' }}>
                  <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                    <AlertCircleIcon size={13} /> Switch to Arc Testnet to send
                  </span>
                  <button
                    onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: 'var(--warning)', color: '#fff' }}
                  >Switch</button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs px-1">
                  <span style={{ color: 'var(--muted)' }}>
                    Balance:{' '}
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {senderBal !== null ? `$${senderBal} USDC` : '\u2026'}
                    </span>
                  </span>
                  <button onClick={() => void refetchBal()} className="p-1 rounded" style={{ color: 'var(--muted)' }}>
                    <RefreshCw size={11} />
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  To (email or wallet address)
                </label>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="alice@company.com or 0x\u2026"
                  className="form-input"
                  disabled={isBusy}
                />
                {resolvedAddr && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                    style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)', color: 'var(--cyan-dark)' }}>
                    <CheckCircle2Icon size={11} />
                    {resolvedName && <span className="font-semibold">{resolvedName}</span>}
                    <span className="mono opacity-70">{resolvedAddr.slice(0, 8)}\u2026{resolvedAddr.slice(-6)}</span>
                  </div>
                )}
                {trimmedTo.includes('@') && !resolvedAddr && trimmedTo.length > 3 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                    Email not in directory \u2014 paste their wallet address directly.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Amount (USDC)
                </label>
                <div className="relative">
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    type="number" min="0" step="0.01"
                    className="form-input"
                    style={{ paddingRight: '4.5rem' }}
                    disabled={isBusy}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--cyan)' }}>USDC</span>
                </div>
                {overBalance && (
                  <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Exceeds your balance (${senderBal} USDC).</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Memo (optional)
                </label>
                <input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="e.g. October bonus"
                  className="form-input"
                  disabled={isBusy}
                />
              </div>

              {isWriteError && (
                <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircleIcon size={14} /> {parseOnchainError(writeError)}
                </div>
              )}

              <NetworkFeeBadge />

              <button onClick={handleSend} disabled={!canSend || isBusy} className="cta-btn w-full">
                {isWalletPending ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Confirm in wallet\u2026
                  </span>
                ) : isConfirming ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Confirming on Arc\u2026
                  </span>
                ) : (
                  `Send USDC${amount && parseFloat(amount) > 0 ? ` ($${parseFloat(amount).toFixed(2)})` : ''}`
                )}
              </button>

              <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
                Transfers settle in &lt;1 second on Arc. Gas: ~$0.001 USDC.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-5">
            {/* QR code */}
            <div className="flex flex-col items-center gap-4">
              {senderAddress ? (
                <>
                  <QRDisplay value={senderAddress} size={176} />
                  {/* Zisipay logo badge below QR */}
                  <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    <ZisipayLogo variant="icon" className="w-4 h-4" />
                    Scan to send USDC on Arc
                  </div>
                </>
              ) : (
                <div className="w-44 h-44 rounded-2xl flex flex-col items-center justify-center gap-2"
                  style={{ background: 'var(--surface-muted)', border: '2px dashed var(--border-strong)' }}>
                  <WalletIcon size={32} style={{ color: 'var(--cyan)' }} />
                  <span className="text-xs font-semibold text-center px-4" style={{ color: 'var(--muted)' }}>
                    Connect your wallet to generate QR
                  </span>
                </div>
              )}
            </div>

            {/* Address display */}
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Your USDC address</p>
              <p className="mono text-xs break-all px-3 py-2.5 rounded-xl select-all"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)', letterSpacing: '0.02em' }}>
                {senderAddress ?? '—  connect wallet to see your address  —'}
              </p>
            </div>

            {/* Copy button */}
            {senderAddress && (
              <button onClick={handleCopy}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  background: copied ? 'var(--success-bg)' : 'var(--surface-muted)',
                  border: `1px solid ${copied ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                  color: copied ? 'var(--success)' : 'var(--ink)',
                }}>
                <CheckCircle2Icon size={14} style={{ opacity: copied ? 1 : 0.5 }} />
                {copied ? 'Address copied!' : 'Copy Address'}
              </button>
            )}

            <div className="p-3 rounded-xl text-xs"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-dark)' }}>
              Share this address or QR code to receive USDC on Arc Testnet. Every inbound transfer appears instantly in your Activity feed.
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ── Yield Vaults panel ───────────────────────────────────────────── */

// Deployed ZisipayVault on Arc Testnet
const VAULT_ADDRESS = '0x7d6506d3300e30b2597e9770816c69399e6c4d60' as const;
const USDC_ADDR_VAULT = '0x3600000000000000000000000000000000000000' as const;
const ARC_TESTNET_VAULT_CHAIN = 5042002;

const VAULT_ABI = [
  { name: 'deposit',      type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'withdraw',     type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'maxWithdraw',  type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'convertToAssets', type: 'function', stateMutability: 'view',    inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'apyBps',       type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalAssets',  type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const VAULT_INFO = { name: 'Zisipay USDC Vault', symbol: 'zpUSDC', protocol: 'ERC-4626', apyBps: 720 };

type VaultMode = 'deposit' | 'withdraw';
type VaultStep = 'idle' | 'approving' | 'depositing' | 'withdrawing' | 'done';

function YieldVaultsPanel({ role: _role }: { role: UserRole }) {
  const [mode, setMode]   = useState<VaultMode>('deposit');
  const [open, setOpen]   = useState(false);
  const [amt, setAmt]     = useState('');
  const [step, setStep]   = useState<VaultStep>('idle');
  const [doneTx, setDoneTx] = useState<`0x${string}` | null>(null);
  const { address, chainId } = useAccount();
  const { switchChain }   = useSwitchChain();
  const onWrongChain      = !!chainId && chainId !== ARC_TESTNET_VAULT_CHAIN;

  const parsedAmt = amt && parseFloat(amt) > 0 ? parseAmount(ARC_TESTNET_VAULT_CHAIN, amt) : null;

  // Read: user's max withdrawable assets
  const { data: maxWithdrawRaw, refetch: refetchMax } = useReadContract(
    address ? { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'maxWithdraw', args: [address], chainId: ARC_TESTNET_VAULT_CHAIN } : undefined,
  );
  // Read: vault total assets (TVL)
  const { data: tvlRaw } = useReadContract({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'totalAssets', chainId: ARC_TESTNET_VAULT_CHAIN });
  // Read: USDC balance of user
  const { data: usdcBalRaw, refetch: refetchBal } = useReadContract(
    address ? { address: USDC_ADDR_VAULT, abi: erc20Abi, functionName: 'balanceOf', args: [address], chainId: ARC_TESTNET_VAULT_CHAIN } : undefined,
  );

  const decimals     = usdcDecimalsFor(ARC_TESTNET_VAULT_CHAIN);
  const maxWithdraw  = maxWithdrawRaw  !== undefined ? Amount.fromRaw(maxWithdrawRaw,  decimals).toFixed(2) : null;
  const tvl          = tvlRaw          !== undefined ? Amount.fromRaw(tvlRaw,          decimals).toFixed(2) : null;
  const usdcBal      = usdcBalRaw      !== undefined ? Amount.fromRaw(usdcBalRaw,      decimals).toFixed(2) : null;
  const hasDeposit   = maxWithdrawRaw  !== undefined && maxWithdrawRaw > 0n;
  const apyPct       = (VAULT_INFO.apyBps / 100).toFixed(2);

  // Step 1: approve USDC spend
  const { writeContract: approve, data: approveTxHash, isPending: isApproving, isError: isApproveErr, error: approveErr, reset: resetApprove } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Step 2: deposit into vault
  const { writeContract: deposit, data: depositTxHash, isPending: isDepositing, isError: isDepositErr, error: depositErr, reset: resetDeposit } = useWriteContract();
  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } = useWaitForTransactionReceipt({ hash: depositTxHash });

  // Step 3: withdraw from vault
  const { writeContract: withdraw, data: withdrawTxHash, isPending: isWithdrawing, isError: isWithdrawErr, error: withdrawErr, reset: resetWithdraw } = useWriteContract();
  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawConfirmed } = useWaitForTransactionReceipt({ hash: withdrawTxHash });

  // After approve confirmed → fire deposit
  useEffect(() => {
    if (isApproveConfirmed && parsedAmt && address && step === 'approving') {
      setStep('depositing');
      deposit({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'deposit', args: [parsedAmt.raw, address], chainId: ARC_TESTNET_VAULT_CHAIN });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveConfirmed]);

  // After deposit confirmed
  useEffect(() => {
    if (isDepositConfirmed && depositTxHash) {
      setStep('done'); setDoneTx(depositTxHash);
      void refetchMax(); void refetchBal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDepositConfirmed]);

  // After withdraw confirmed
  useEffect(() => {
    if (isWithdrawConfirmed && withdrawTxHash) {
      setStep('done'); setDoneTx(withdrawTxHash);
      void refetchMax(); void refetchBal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWithdrawConfirmed]);

  function handleDeposit() {
    if (!parsedAmt || !address || onWrongChain) return;
    setStep('approving');
    approve({ address: USDC_ADDR_VAULT, abi: erc20Abi, functionName: 'approve', args: [VAULT_ADDRESS, parsedAmt.raw], chainId: ARC_TESTNET_VAULT_CHAIN });
  }

  function handleWithdraw() {
    if (!parsedAmt || !address || onWrongChain) return;
    setStep('withdrawing');
    withdraw({ address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'withdraw', args: [parsedAmt.raw, address, address], chainId: ARC_TESTNET_VAULT_CHAIN });
  }

  function handleReset() {
    setStep('idle'); setAmt(''); setDoneTx(null);
    resetApprove(); resetDeposit(); resetWithdraw();
    void refetchMax(); void refetchBal();
  }

  const isBusy   = isApproving || isApproveConfirming || isDepositing || isDepositConfirming || isWithdrawing || isWithdrawConfirming;
  const anyError = isApproveErr || isDepositErr || isWithdrawErr;
  const errorMsg = anyError ? parseOnchainError(approveErr ?? depositErr ?? withdrawErr ?? null) : '';
  const overBalance = mode === 'deposit' && usdcBal !== null && parsedAmt !== null && parseFloat(amt) > parseFloat(usdcBal);
  const overWithdraw = mode === 'withdraw' && maxWithdraw !== null && parsedAmt !== null && parseFloat(amt) > parseFloat(maxWithdraw);
  const canAct = !!address && !onWrongChain && !!parsedAmt && !overBalance && !overWithdraw;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Vault card */}
      <SectionCard title="Zisipay USDC Yield Vault">
        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <TrendingUpIcon size={14} style={{ color: 'var(--cyan)' }} />
          <span className="text-xs" style={{ color: 'var(--cyan-dark)' }}>
            ERC-4626 USDC vault deployed on Arc Testnet. Deposits and withdrawals are live on-chain, confirmed on Arc Explorer.
          </span>
        </div>

        {/* Vault stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'APY',        value: `${apyPct}%`,                          color: 'var(--success)' },
            { label: 'TVL',        value: tvl !== null ? `$${parseFloat(tvl).toLocaleString()}` : '…',  color: 'var(--ink)' },
            { label: 'My deposit', value: maxWithdraw !== null ? (hasDeposit ? `$${parseFloat(maxWithdraw).toLocaleString()}` : '$0.00') : '…', color: hasDeposit ? 'var(--cyan-dark)' : 'var(--muted)' },
          ].map((s) => (
            <div key={s.label} className="p-3 rounded-xl text-center" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="font-bold tabular-nums text-base" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{VAULT_INFO.name}</div>
            <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--subtle)' }}>
              {VAULT_ADDRESS.slice(0,10)}…{VAULT_ADDRESS.slice(-8)} &bull; Arc Testnet
            </div>
          </div>
          <a href={`https://explorer.testnet.arc.io/address/${VAULT_ADDRESS}`} target="_blank" rel="noopener noreferrer"
            className="text-xs flex items-center gap-1 font-semibold" style={{ color: 'var(--cyan-dark)' }}>
            <ExternalLinkIcon size={11} /> Explorer
          </a>
        </div>

        <button
          onClick={() => { setOpen((o) => !o); handleReset(); }}
          className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, var(--cyan-dark), var(--blue))', color: '#fff' }}
        >
          {open ? 'Close' : hasDeposit ? 'Deposit / Withdraw' : 'Deposit USDC'}
        </button>
      </SectionCard>

      {/* Deposit / Withdraw form */}
      {open && (
        <SectionCard title={step === 'done' ? 'Transaction confirmed' : mode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}>
          {step === 'done' && doneTx ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--success-bg)' }}>
                <CheckCircle2Icon size={26} style={{ color: 'var(--success)' }} />
              </div>
              <p className="font-bold text-lg mb-1" style={{ color: 'var(--ink)' }}>
                {mode === 'deposit' ? 'Deposited successfully!' : 'Withdrawn successfully!'}
              </p>
              <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
                ${parseFloat(amt).toFixed(2)} USDC &bull; Arc Testnet
              </p>
              <a href={buildTxExplorerUrl(ARC_TESTNET_VAULT_CHAIN, doneTx)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl my-3"
                style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.25)' }}>
                <ExternalLinkIcon size={13} /> View on Arc Explorer
              </a>
              <div className="mono text-xs break-all px-3 py-2 rounded-lg mb-4 text-left"
                style={{ background: 'var(--surface-muted)', color: 'var(--subtle)', border: '1px solid var(--border)' }}>
                {doneTx}
              </div>
              <button onClick={handleReset} className="cta-btn w-full">New Transaction</button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Mode toggle */}
              <div className="flex rounded-xl overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
                {(['deposit', 'withdraw'] as const).map((m) => (
                  <button key={m} onClick={() => { setMode(m); handleReset(); }}
                    className="flex-1 py-2.5 text-sm font-semibold capitalize transition-all"
                    style={{
                      background:   mode === m ? 'var(--cyan-dark)' : 'transparent',
                      color:        mode === m ? '#fff' : 'var(--muted)',
                      borderRadius: mode === m ? 10 : 0,
                    }}>
                    {m}
                  </button>
                ))}
              </div>

              {/* Wallet / chain guards */}
              {!address ? (
                <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(217,119,6,0.25)' }}>
                  <AlertCircleIcon size={14} /> Connect your wallet to {mode}
                </div>
              ) : onWrongChain ? (
                <div className="p-3 rounded-xl flex items-center justify-between"
                  style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.25)' }}>
                  <span className="text-sm" style={{ color: 'var(--warning)' }}>Switch to Arc Testnet</span>
                  <button onClick={() => switchChain({ chainId: ARC_TESTNET_VAULT_CHAIN })}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--warning)', color: '#fff' }}>
                    Switch
                  </button>
                </div>
              ) : (
                <div className="flex justify-between text-xs px-1">
                  <span style={{ color: 'var(--muted)' }}>
                    {mode === 'deposit' ? 'Wallet balance: ' : 'Available to withdraw: '}
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {mode === 'deposit' ? (usdcBal !== null ? `$${usdcBal} USDC` : '…') : (maxWithdraw !== null ? `$${maxWithdraw} USDC` : '…')}
                    </span>
                  </span>
                  <button onClick={() => { void refetchBal(); void refetchMax(); }} style={{ color: 'var(--muted)' }}>
                    <RefreshCw size={11} />
                  </button>
                </div>
              )}

              {/* Amount input */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                  Amount (USDC)
                </label>
                <div className="relative">
                  <input type="number" min="0" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)}
                    placeholder="0.00" className="form-input" style={{ paddingRight: '4.5rem' }} disabled={isBusy} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--cyan)' }}>USDC</span>
                </div>
                {overBalance && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Exceeds your USDC balance (${usdcBal}).</p>}
                {overWithdraw && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>Exceeds your vault deposit (${maxWithdraw}).</p>}
                {mode === 'deposit' && amt && parseFloat(amt) > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>
                    Estimated yearly yield: ~${(parseFloat(amt) * VAULT_INFO.apyBps / 10000).toFixed(2)} USDC at {apyPct}% APY
                  </p>
                )}
              </div>

              {/* Two-step hint for deposit */}
              {mode === 'deposit' && (
                <div className="p-3 rounded-xl text-xs space-y-1" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)', color: 'var(--cyan-dark)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0`}
                      style={{ background: step === 'approving' || isApproveConfirmed ? 'var(--cyan-dark)' : 'var(--border-strong)' }}>1</span>
                    <span style={{ color: (step === 'approving' || isApproveConfirmed) ? 'var(--cyan-dark)' : 'var(--muted)' }}>
                      Approve USDC spend{isApproving ? ' — confirm in wallet…' : isApproveConfirming ? ' — confirming…' : isApproveConfirmed ? ' ✔ done' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[9px] flex-shrink-0"
                      style={{ background: step === 'depositing' || isDepositConfirmed ? 'var(--cyan-dark)' : 'var(--border-strong)' }}>2</span>
                    <span style={{ color: step === 'depositing' || isDepositConfirmed ? 'var(--cyan-dark)' : 'var(--muted)' }}>
                      Deposit into vault{isDepositing ? ' — confirm in wallet…' : isDepositConfirming ? ' — confirming on Arc…' : isDepositConfirmed ? ' ✔ done' : ''}
                    </span>
                  </div>
                </div>
              )}

              {/* Error */}
              {anyError && (
                <div className="p-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircleIcon size={14} /> {errorMsg}
                  <button onClick={handleReset} className="ml-auto text-xs underline">Reset</button>
                </div>
              )}

              <NetworkFeeBadge />

              <button onClick={mode === 'deposit' ? handleDeposit : handleWithdraw} disabled={!canAct || isBusy} className="cta-btn w-full">
                {isApproving ? (
                  <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Approve in wallet…</span>
                ) : isApproveConfirming ? (
                  <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Confirming approval…</span>
                ) : isDepositing || isWithdrawing ? (
                  <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Confirm in wallet…</span>
                ) : isDepositConfirming || isWithdrawConfirming ? (
                  <span className="flex items-center gap-2 justify-center"><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Confirming on Arc…</span>
                ) : (
                  mode === 'deposit'
                    ? `Deposit USDC${amt && parseFloat(amt) > 0 ? ' ($' + parseFloat(amt).toFixed(2) + ')' : ''}`
                    : `Withdraw USDC${amt && parseFloat(amt) > 0 ? ' ($' + parseFloat(amt).toFixed(2) + ')' : ''}`
                )}
              </button>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}


/* ── Onramp / Offramp panel ───────────────────────────────────────────── */

type RampTab  = 'sell' | 'buy';    // sell = offramp (USDC→NGN); buy = onramp (NGN→USDC)
type RampStep = 'form' | 'quote' | 'confirming-wallet' | 'confirming-chain' | 'bank-details' | 'instructions' | 'polling' | 'done' | 'error';

interface Bank    { code: string; name: string }
interface Quote   { buy: number; sell: number; mid: number; currency: string; source: string }
interface SendResult {
  id: string; status: string; usdcAmount: number; ngnAmount: number; rate: number;
  bankCode: string; accountNumber: string; accountName: string; platformWallet: string; source: string;
}
interface ReceiveResult {
  id: string; status: string; ngnAmount: number; usdcAmount: number; rate: number;
  walletAddress: string; source: string;
  paymentInstructions: { bankName: string; accountName: string; accountNumber: string; bankCode: string; amount: number; reference: string; note: string };
}

const RAMP_CHAIN = 5042002;
const USDC_ERC20 = '0x3600000000000000000000000000000000000000' as const; // arc-studio-allow-onchain-literal

const USDC_ERC20_ABI = [
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

function useRampApi() {
  const getQuote = async (currency = 'NGN'): Promise<Quote> => {
    const r = await fetch(`/api/ramp/rates?currency=${currency}`);
    if (!r.ok) throw new Error('Failed to fetch rate');
    return r.json() as Promise<Quote>;
  };
  const getBanks = async (): Promise<Bank[]> => {
    const r = await fetch('/api/ramp/banks');
    if (!r.ok) throw new Error('Failed to fetch banks');
    const d = await r.json() as { banks: Bank[] };
    return d.banks;
  };
  const verifyAccount = async (accountNumber: string, bankCode: string): Promise<string> => {
    const r = await fetch('/api/ramp/verify-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountNumber, bankCode }) });
    if (!r.ok) throw new Error('Account lookup failed');
    const d = await r.json() as { accountName: string };
    return d.accountName;
  };
  const createSend = async (body: object): Promise<SendResult> => {
    const r = await fetch('/api/ramp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Send creation failed');
    return r.json() as Promise<SendResult>;
  };
  const pollSend = async (id: string): Promise<{ status: string }> => {
    const r = await fetch(`/api/ramp/send/${id}`);
    return r.json() as Promise<{ status: string }>;
  };
  const createReceive = async (body: object): Promise<ReceiveResult> => {
    const r = await fetch('/api/ramp/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Receive creation failed');
    return r.json() as Promise<ReceiveResult>;
  };
  const pollReceive = async (id: string): Promise<{ status: string }> => {
    const r = await fetch(`/api/ramp/receive/${id}`);
    return r.json() as Promise<{ status: string }>;
  };
  return { getQuote, getBanks, verifyAccount, createSend, pollSend, createReceive, pollReceive };
}

function OnrampOfframpPanel() {
  const [tab, setTab] = useState<RampTab>('sell');
  const [step, setStep] = useState<RampStep>('form');
  const [errorMsg, setErrorMsg] = useState('');

  // Shared
  const [usdcAmt, setUsdcAmt] = useState('');
  const [ngnAmt, setNgnAmt] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);

  // Offramp (sell) — bank details
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Results
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [receiveResult, setReceiveResult] = useState<ReceiveResult | null>(null);
  const [pollStatus, setPollStatus] = useState('');
  const [doneTxHash, setDoneTxHash] = useState<`0x${string}` | null>(null);

  const { address, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const onWrongChain = !!chainId && chainId !== RAMP_CHAIN;
  const api = useRampApi();

  // USDC on-chain transfer (for offramp: send USDC to platform wallet)
  const { writeContract: transferUsdc, data: transferTxHash, isPending: isTransferPending, isError: isTransferErr, error: transferErr, reset: resetTransfer } = useWriteContract();
  const { isLoading: isTransferConfirming, isSuccess: isTransferConfirmed } = useWaitForTransactionReceipt({ hash: transferTxHash });

  const { data: usdcBalRaw } = useReadContract(
    address ? { address: USDC_ERC20, abi: USDC_ERC20_ABI, functionName: 'balanceOf', args: [address], chainId: RAMP_CHAIN } : undefined,
  );
  const decimals = usdcDecimalsFor(RAMP_CHAIN);
  const usdcBal = usdcBalRaw !== undefined ? Amount.fromRaw(usdcBalRaw, decimals).toFixed(2) : null;

  // Load quote on mount
  useEffect(() => {
    api.getQuote().then(setQuote).catch(() => null);
    api.getBanks().then(setBanks).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync amounts when quote or inputs change
  const rate = tab === 'sell' ? (quote?.sell ?? 1620) : (quote?.buy ?? 1600);
  function handleUsdcChange(v: string) {
    setUsdcAmt(v);
    if (v && parseFloat(v) > 0) setNgnAmt((parseFloat(v) * rate).toFixed(0));
    else setNgnAmt('');
  }
  function handleNgnChange(v: string) {
    setNgnAmt(v);
    if (v && parseFloat(v) > 0) setUsdcAmt((parseFloat(v) / rate).toFixed(2));
    else setUsdcAmt('');
  }

  // Verify bank account when account number + bank are filled
  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) {
      setVerifying(true);
      setAccountName('');
      api.verifyAccount(accountNumber, bankCode)
        .then((name) => setAccountName(name))
        .catch(() => setAccountName(''))
        .finally(() => setVerifying(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, bankCode]);

  // After USDC transfer confirmed on-chain: create the YC send
  useEffect(() => {
    if (!isTransferConfirmed || !transferTxHash || step !== 'confirming-chain') return;
    setDoneTxHash(transferTxHash);
    const sequenceId = `zisipay-${Date.now().toString(36)}`;
    setLoading(true);
    api.createSend({ usdcAmount: parseFloat(usdcAmt), bankCode, accountNumber, accountName, sequenceId })
      .then((result) => {
        setSendResult(result);
        setStep('polling');
        pollUntilDone('send', result.id);
      })
      .catch((e: unknown) => { setErrorMsg(String(e)); setStep('error'); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransferConfirmed]);

  function pollUntilDone(type: 'send' | 'receive', id: string) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const poll = type === 'send' ? api.pollSend(id) : api.pollReceive(id);
      poll.then((r) => {
        setPollStatus(r.status);
        if (r.status === 'completed' || r.status === 'complete' || attempts > 30) {
          clearInterval(interval);
          setStep('done');
        }
      }).catch(() => clearInterval(interval));
    }, 2000);
  }

  function handleGetQuote() {
    if (!usdcAmt || parseFloat(usdcAmt) <= 0) return;
    setLoading(true);
    api.getQuote().then((q) => {
      setQuote(q);
      setStep('bank-details');
    }).catch(() => setStep('bank-details')).finally(() => setLoading(false));
  }

  function handleConfirmOfframp() {
    if (!address || onWrongChain || !accountName || !bankCode || !accountNumber) return;
    setStep('confirming-wallet');
    const parsedAmt = parseAmount(RAMP_CHAIN, usdcAmt);
    // platform wallet address comes from env — read at runtime
    const platformWallet = import.meta.env.VITE_ZISIPAY_VAULT as `0x${string}` | undefined;
    if (!platformWallet) { setErrorMsg('Platform wallet not configured. Set VITE_ZISIPAY_VAULT in .env'); setStep('error'); return; }
    transferUsdc({ address: USDC_ERC20, abi: USDC_ERC20_ABI, functionName: 'transfer', args: [platformWallet, parsedAmt.raw], chainId: RAMP_CHAIN });
    setStep('confirming-chain');
  }

  function handleStartOnramp() {
    if (!address || !ngnAmt || parseFloat(ngnAmt) <= 0) return;
    setLoading(true);
    const sequenceId = `zisipay-${Date.now().toString(36)}`;
    api.createReceive({ ngnAmount: parseFloat(ngnAmt), walletAddress: address, sequenceId })
      .then((result) => {
        setReceiveResult(result);
        setStep('instructions');
      })
      .catch((e: unknown) => { setErrorMsg(String(e)); setStep('error'); })
      .finally(() => setLoading(false));
  }

  function handleConfirmPaid() {
    if (!receiveResult) return;
    setStep('polling');
    pollUntilDone('receive', receiveResult.id);
  }

  function reset() {
    setStep('form'); setUsdcAmt(''); setNgnAmt(''); setAccountNumber(''); setAccountName(''); setBankCode('');
    setSendResult(null); setReceiveResult(null); setPollStatus(''); setDoneTxHash(null); setErrorMsg('');
    resetTransfer();
  }

  const feeUSDC = usdcAmt && parseFloat(usdcAmt) > 0 ? (parseFloat(usdcAmt) * 0.01).toFixed(2) : '0.00';
  const netNGN  = ngnAmt && parseFloat(ngnAmt) > 0
    ? (tab === 'sell' ? parseFloat(ngnAmt) - parseFloat(ngnAmt) * 0.01 : parseFloat(ngnAmt)).toFixed(0)
    : '';

  return (
    <div className="max-w-lg space-y-4">
      {/* Credentials notice if backend not configured */}
      <div className="p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.18)', color: 'var(--cyan-dark)' }}>
        <AlertCircleIcon size={13} className="mt-0.5 flex-shrink-0" />
        <span>
          <strong>Yellow Card integration:</strong> Real NGN rails require <code>YC_API_KEY</code> and <code>YC_SECRET_KEY</code> in your <code>.env</code> file.
          Without them the demo runs in sandbox/mock mode — full UX, no real money.
          <a href="https://docs.yellowcard.engineering/docs/getting-started" target="_blank" rel="noopener noreferrer" className="ml-1 underline">Get credentials →</a>
        </span>
      </div>

      <SectionCard title="Naira On / Off-Ramp">
        {/* Tab */}
        <div className="flex rounded-xl overflow-hidden mb-5" style={{ background: 'var(--surface-muted)' }}>
          {([['sell', 'Sell USDC → NGN (Off-ramp)'], ['buy', 'Buy USDC ← NGN (On-ramp)']] as const).map(([t, label]) => (
            <button key={t} onClick={() => { setTab(t); reset(); }}
              className="flex-1 py-2.5 text-xs font-semibold transition-all"
              style={{ background: tab === t ? 'var(--cyan-dark)' : 'transparent', color: tab === t ? '#fff' : 'var(--muted)', borderRadius: tab === t ? 10 : 0 }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--success-bg)' }}>
              <CheckCircle2Icon size={26} style={{ color: 'var(--success)' }} />
            </div>
            <p className="font-bold text-lg mb-1" style={{ color: 'var(--ink)' }}>
              {tab === 'sell' ? 'NGN payment sent!' : 'USDC deposited!'}
            </p>
            <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
              {tab === 'sell'
                ? `₦${parseFloat(netNGN || ngnAmt).toLocaleString()} → your bank account (${accountNumber})`
                : `${usdcAmt} USDC → your wallet`}
            </p>
            {doneTxHash && (
              <a href={buildTxExplorerUrl(RAMP_CHAIN, doneTxHash)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl mb-3"
                style={{ background: 'rgba(6,182,212,0.12)', color: 'var(--cyan-dark)', border: '1px solid rgba(6,182,212,0.25)' }}>
                <ExternalLinkIcon size={13} /> View USDC transfer on Arc Explorer
              </a>
            )}
            <div className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Yellow Card order: <code className="font-mono">{sendResult?.id ?? receiveResult?.id}</code> &bull; status: <strong style={{ color: 'var(--success)' }}>{pollStatus || 'completed'}</strong>
            </div>
            <button onClick={reset} className="cta-btn w-full">New Transaction</button>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl flex items-start gap-2" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircleIcon size={15} className="mt-0.5 flex-shrink-0" />
              <span className="text-sm">{errorMsg}</span>
            </div>
            <button onClick={reset} className="cta-btn w-full">Try Again</button>
          </div>
        )}

        {/* ── POLLING ── */}
        {step === 'polling' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full border-4 border-t-cyan-400 animate-spin mx-auto" style={{ borderColor: 'var(--border) var(--border) var(--border) var(--cyan)' }} />
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>
              {tab === 'sell' ? 'Sending NGN to your bank…' : 'Waiting for NGN payment…'}
            </p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Status: <span className="font-semibold capitalize" style={{ color: 'var(--cyan-dark)' }}>{pollStatus || 'pending'}</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>Yellow Card is processing via NGN rails. This usually takes 30–60 seconds.</p>
          </div>
        )}

        {/* ── ONRAMP: PAYMENT INSTRUCTIONS ── */}
        {step === 'instructions' && receiveResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--cyan-dark)' }}>Transfer NGN to this account:</p>
              {[
                ['Bank', receiveResult.paymentInstructions.bankName],
                ['Account Name', receiveResult.paymentInstructions.accountName],
                ['Account Number', receiveResult.paymentInstructions.accountNumber],
                ['Amount', `₦${receiveResult.paymentInstructions.amount.toLocaleString()}`],
                ['Reference / Narration', receiveResult.paymentInstructions.reference],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center text-sm">
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="font-semibold tabular-nums font-mono text-xs" style={{ color: 'var(--ink)' }}>{value}</span>
                </div>
              ))}
              <p className="text-xs mt-2 p-2 rounded-lg" style={{ background: 'rgba(217,119,6,0.08)', color: 'var(--warning)', border: '1px solid rgba(217,119,6,0.2)' }}>
                Use the exact reference code in your transfer narration.
              </p>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              After paying, tap below. Yellow Card will confirm and send <strong>{receiveResult.usdcAmount} USDC</strong> to your wallet.
            </p>
            <button onClick={handleConfirmPaid} className="cta-btn w-full">I have paid — confirm</button>
            <button onClick={reset} className="back-btn w-full text-sm">Cancel</button>
          </div>
        )}

        {/* ── OFFRAMP: CONFIRMING ON-CHAIN ── */}
        {(step === 'confirming-wallet' || step === 'confirming-chain') && (
          <div className="text-center py-8 space-y-4">
            <div className="w-14 h-14 rounded-full border-4 border-t-cyan-400 animate-spin mx-auto" style={{ borderColor: 'var(--border) var(--border) var(--border) var(--cyan)' }} />
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>
              {isTransferPending ? 'Confirm USDC transfer in your wallet…' : isTransferConfirming ? 'Confirming USDC on Arc…' : 'Submitting to Yellow Card…'}
            </p>
            {isTransferErr && (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>
                {parseOnchainError(transferErr)} <button onClick={reset} className="ml-2 underline">Reset</button>
              </p>
            )}
          </div>
        )}

        {/* ── OFFRAMP: BANK DETAILS ── */}
        {step === 'bank-details' && tab === 'sell' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Enter your Nigerian bank details</p>

            {!address && (
              <div className="p-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid rgba(217,119,6,0.2)' }}>
                <AlertCircleIcon size={14} /> Connect your wallet to continue
              </div>
            )}
            {onWrongChain && (
              <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.2)' }}>
                <span className="text-sm" style={{ color: 'var(--warning)' }}>Switch to Arc Testnet</span>
                <button onClick={() => switchChain({ chainId: RAMP_CHAIN })} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--warning)', color: '#fff' }}>Switch</button>
              </div>
            )}

            {/* Bank selector */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Bank</label>
              <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className="form-input">
                <option value="">— Select bank —</option>
                {banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </div>

            {/* Account number */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Account Number</label>
              <input
                type="text" inputMode="numeric" maxLength={10}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit account number"
                className="form-input"
              />
            </div>

            {/* Account name (auto-resolved) */}
            {accountNumber.length === 10 && bankCode && (
              <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                {verifying ? (
                  <span className="text-xs flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                    <span className="w-3 h-3 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" /> Verifying account…
                  </span>
                ) : accountName ? (
                  <span className="text-sm flex items-center gap-2" style={{ color: 'var(--success)' }}>
                    <CheckCircle2Icon size={14} /> <strong>{accountName}</strong>
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--danger)' }}>Account not found. Check details.</span>
                )}
              </div>
            )}

            {/* Quote summary */}
            <div className="p-3 rounded-xl space-y-2" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              {[
                ['You send', `${usdcAmt} USDC`],
                ['Rate', `1 USDC = ₦${rate.toLocaleString()}`],
                ['Fee (~1%)', `-${feeUSDC} USDC`],
                ['NGN you receive', `₦${netNGN}`],
                ['Powered by', 'Yellow Card · Circle CCTP'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs">
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className="font-semibold" style={{ color: label === 'NGN you receive' ? 'var(--success)' : 'var(--ink)' }}>{value}</span>
                </div>
              ))}
            </div>

            <NetworkFeeBadge />
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              A USDC transfer will be sent on-chain to the platform wallet on Arc. Yellow Card will then disburse NGN to your bank within minutes.
            </p>

            <div className="flex gap-2">
              <button onClick={reset} className="back-btn">Back</button>
              <button
                onClick={handleConfirmOfframp}
                disabled={!accountName || !bankCode || !address || onWrongChain || loading}
                className="cta-btn flex-1">
                Confirm &amp; Transfer USDC
              </button>
            </div>
          </div>
        )}

        {/* ── FORM (initial) ── */}
        {step === 'form' && (
          <div className="space-y-4">
            {/* Chain guard */}
            {address && onWrongChain && (
              <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.2)' }}>
                <span className="text-sm" style={{ color: 'var(--warning)' }}>Switch to Arc Testnet</span>
                <button onClick={() => switchChain({ chainId: RAMP_CHAIN })} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'var(--warning)', color: '#fff' }}>Switch</button>
              </div>
            )}

            {/* Live rate */}
            {quote && (
              <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <TrendingUpIcon size={12} style={{ color: 'var(--cyan)' }} />
                <span style={{ color: 'var(--muted)' }}>Live rate:</span>
                <span className="font-bold" style={{ color: 'var(--ink)' }}>1 USDC = ₦{rate.toLocaleString()}</span>
                <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>{quote.source === 'estimate' ? 'estimated' : 'live'}</span>
              </div>
            )}

            {/* USDC amount */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                {tab === 'sell' ? 'USDC to sell' : 'USDC to receive'}
              </label>
              <div className="relative">
                <input type="number" min="0" step="0.01" value={usdcAmt} onChange={(e) => handleUsdcChange(e.target.value)}
                  placeholder="0.00" className="form-input" style={{ paddingRight: '4.5rem' }} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--cyan)' }}>USDC</span>
              </div>
              {tab === 'sell' && usdcBal !== null && (
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  Balance: <button onClick={() => handleUsdcChange(usdcBal)} className="font-semibold" style={{ color: 'var(--cyan-dark)' }}>{usdcBal} USDC</button>
                </p>
              )}
            </div>

            {/* NGN amount */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                {tab === 'sell' ? 'NGN you receive' : 'NGN to pay'}
              </label>
              <div className="relative">
                <input type="number" min="0" step="1" value={ngnAmt} onChange={(e) => handleNgnChange(e.target.value)}
                  placeholder="0" className="form-input" style={{ paddingRight: '4rem' }} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--cyan)' }}>₦</span>
              </div>
            </div>

            {usdcAmt && parseFloat(usdcAmt) > 0 && (
              <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--muted)' }}>Fee (~1%)</span>
                  <span style={{ color: 'var(--danger)' }}>-{feeUSDC} USDC</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span style={{ color: 'var(--muted)' }}>{tab === 'sell' ? 'NGN to bank' : 'Net USDC'}</span>
                  <span style={{ color: 'var(--success)' }}>
                    {tab === 'sell' ? `₦${parseInt(netNGN || '0').toLocaleString()}` : `${(parseFloat(usdcAmt) * 0.99).toFixed(2)} USDC`}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--muted)' }}>Settlement</span>
                  <span style={{ color: 'var(--ink)' }}>Yellow Card · Instant NGN rails</span>
                </div>
              </div>
            )}

            <NetworkFeeBadge />

            <button
              onClick={tab === 'sell' ? handleGetQuote : handleStartOnramp}
              disabled={!usdcAmt || parseFloat(usdcAmt) <= 0 || (!address && tab === 'sell') || loading}
              className="cta-btn w-full">
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Loading…
                </span>
              ) : tab === 'sell' ? 'Continue to Bank Details →' : 'Get Payment Instructions →'}
            </button>

            <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
              NGN rails via Yellow Card &bull; USDC settled on Arc Testnet via Circle CCTP
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}


/* ── Reports panel ────────────────────────────────────────────────────────── */

function ReportsPanel() {
  const { payrollHistory } = useAppStoreShell();
  return (
    <div className="max-w-2xl">
      <SectionCard title="Payroll Reports">
        {payrollHistory.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>No payroll runs yet. Execute a payroll to see reports here.</p>
        ) : (
          <div className="space-y-3">
            {payrollHistory.map((r) => (
              <div key={r.id} className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <div>
                  <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{r.month}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {new Date(r.executedAt).toLocaleDateString()} &bull; {r.employeeCount} employees
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums" style={{ color: 'var(--ink)' }}>${r.totalNet.toLocaleString()}</div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                    completed
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function useAppStoreShell() {
  return useAppStore();
}
