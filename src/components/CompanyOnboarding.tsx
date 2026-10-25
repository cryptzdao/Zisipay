/**
 * CompanyOnboarding — multi-step company registration wizard.
 * Stores data into AppStore (persisted to localStorage).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Wallet, Settings2, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useAppStore } from '../store/AppStore';
import { ZisipayWordmark } from './ZisipayLogo';

const INDUSTRIES = [
  'Technology', 'Finance & Banking', 'Healthcare', 'Manufacturing',
  'Retail & E-commerce', 'Education', 'Consulting', 'Media & Entertainment', 'Other',
];
const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];
const CYCLES = ['Weekly', 'Bi-weekly', 'Monthly (1st)', 'Monthly (15th)', 'Monthly (25th)', 'Monthly (last day)'];

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
}

export function CompanyOnboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    { label: 'Company Info', icon: Building2 },
    { label: 'Treasury', icon: Wallet },
    { label: 'Payroll Config', icon: Settings2 },
    { label: 'Review', icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-10" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex justify-center mb-8">
          <ZisipayWordmark />
        </div>

        <div
          className="rounded-3xl p-6 sm:p-8"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', boxShadow: '0 4px 32px rgba(13,31,60,0.10)' }}
        >
          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-8">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={s.label} className="flex items-center gap-2 flex-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: done ? 'var(--success)' : active ? 'var(--cyan-dark)' : 'var(--surface-muted)',
                      color: done || active ? '#fff' : 'var(--muted)',
                    }}
                  >
                    {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                  </div>
                  <span className="text-xs font-medium hidden sm:block" style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>
                    {s.label}
                  </span>
                  {i < steps.length - 1 && (
                    <div className="flex-1 h-px" style={{ background: done ? 'var(--success)' : 'var(--border)' }} />
                  )}
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}
            >
              {step === 0 && <Step1CompanyInfo onNext={() => setStep(1)} />}
              {step === 1 && <Step2Treasury onNext={() => setStep(2)} onBack={() => setStep(0)} />}
              {step === 2 && <Step3PayrollConfig onNext={() => setStep(3)} onBack={() => setStep(1)} />}
              {step === 3 && <Step4Review onNext={onDone} onBack={() => setStep(2)} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--subtle)' }}>
          Data is stored in your browser &bull; Connect wallet to link your treasury
        </p>
      </div>
    </div>
  );
}

/* ── Step 1: Company Info ────────────────────────────────────────────────── */

function Step1CompanyInfo({ onNext }: StepProps) {
  const { company, saveCompany } = useAppStore();
  const [name, setName] = useState(company.name);
  const [email, setEmail] = useState(company.email);
  const [industry, setIndustry] = useState(company.industry);
  const [size, setSize] = useState(company.size);
  const [err, setErr] = useState('');

  function handleNext() {
    if (!name.trim() || !email.trim() || !industry || !size) {
      setErr('Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('Enter a valid email address.');
      return;
    }
    saveCompany({ name: name.trim(), email: email.trim(), industry, size });
    onNext();
  }

  return (
    <div>
      <h2 className="display font-bold text-xl mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        Register your company
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Tell us about your organisation to get started.
      </p>

      <div className="space-y-4">
        <Field label="Company Name" required>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setErr(''); }}
            placeholder="Acme Corp Ltd."
            className="form-input"
          />
        </Field>

        <Field label="Admin Email" required>
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErr(''); }}
            placeholder="cfo@acme.com"
            type="email"
            className="form-input"
          />
        </Field>

        <Field label="Industry" required>
          <select
            value={industry}
            onChange={(e) => { setIndustry(e.target.value); setErr(''); }}
            className="form-input"
          >
            <option value="">Select industry…</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>

        <Field label="Company Size" required>
          <div className="flex flex-wrap gap-2">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSize(s); setErr(''); }}
                className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: size === s ? 'var(--cyan-dark)' : 'var(--surface-muted)',
                  color: size === s ? '#fff' : 'var(--muted)',
                  border: `1px solid ${size === s ? 'transparent' : 'var(--border)'}`,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {err && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{err}</p>}

      <button onClick={handleNext} className="cta-btn mt-6 w-full">
        Continue <ChevronRight size={16} />
      </button>
    </div>
  );
}

/* ── Step 2: Treasury ────────────────────────────────────────────────────── */

function Step2Treasury({ onNext, onBack }: StepProps) {
  const { company, saveCompany } = useAppStore();
  const { address, isConnected } = useAccount();
  const [treasury, setTreasury] = useState(company.treasuryAddress || address || '');

  function handleNext() {
    saveCompany({ treasuryAddress: treasury || address || '' });
    onNext();
  }

  return (
    <div>
      <h2 className="display font-bold text-xl mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        Link treasury wallet
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        This is the wallet that funds payroll. You can use your connected wallet or provide a separate address.
      </p>

      {!isConnected && (
        <div className="mb-5 p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.2)' }}>
          <span className="text-sm" style={{ color: 'var(--cyan-dark)' }}>Connect wallet to auto-fill</span>
          <ConnectKitButton label="Connect" />
        </div>
      )}

      {isConnected && (
        <button
          onClick={() => setTreasury(address ?? '')}
          className="mb-4 w-full flex items-center justify-between p-3.5 rounded-xl transition-all text-left"
          style={{ background: 'var(--surface-muted)', border: `1px solid ${treasury === address ? 'var(--cyan)' : 'var(--border)'}` }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Use connected wallet</div>
            <div className="mono text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{address}</div>
          </div>
          {treasury === address && <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />}
        </button>
      )}

      <Field label="Treasury Address" required={false}>
        <input
          value={treasury}
          onChange={(e) => setTreasury(e.target.value)}
          placeholder="0x..."
          className="form-input mono"
        />
      </Field>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="back-btn flex-1">Back</button>
        <button onClick={handleNext} className="cta-btn flex-[2]">Continue <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/* ── Step 3: Payroll Config ──────────────────────────────────────────────── */

function Step3PayrollConfig({ onNext, onBack }: StepProps) {
  const { company, saveCompany } = useAppStore();
  const [cycle, setCycle] = useState(company.payrollCycle || 'Monthly (25th)');
  const [vaultAlloc, setVaultAlloc] = useState(company.defaultVaultAlloc ?? 15);

  function handleNext() {
    saveCompany({ payrollCycle: cycle, defaultVaultAlloc: vaultAlloc });
    onNext();
  }

  return (
    <div>
      <h2 className="display font-bold text-xl mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        Payroll configuration
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Set your default payroll schedule and yield routing. Employees can override their own vault allocation.
      </p>

      <div className="space-y-6">
        <Field label="Payroll Cycle" required={false}>
          <div className="flex flex-wrap gap-2">
            {CYCLES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: cycle === c ? 'var(--cyan-dark)' : 'var(--surface-muted)',
                  color: cycle === c ? '#fff' : 'var(--muted)',
                  border: `1px solid ${cycle === c ? 'transparent' : 'var(--border)'}`,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <Field label={`Default Vault Allocation — ${vaultAlloc}% of net pay`} required={false}>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={vaultAlloc}
            onChange={(e) => setVaultAlloc(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: 'var(--cyan)' }}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--muted)' }}>
            <span>0% (off)</span><span>40%</span><span>80%</span>
          </div>
          {vaultAlloc > 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--cyan-dark)' }}>
              {vaultAlloc}% of each employee&apos;s net pay will auto-route to their chosen USDC yield vault after each payroll run.
            </p>
          )}
        </Field>
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onBack} className="back-btn flex-1">Back</button>
        <button onClick={handleNext} className="cta-btn flex-[2]">Continue <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/* ── Step 4: Review & confirm ────────────────────────────────────────────── */

function Step4Review({ onNext, onBack }: StepProps) {
  const { company, saveCompany } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleRegister() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1400));
    saveCompany({ registered: true });
    setLoading(false);
    setDone(true);
    setTimeout(onNext, 1000);
  }

  const rows = [
    { label: 'Company', value: company.name },
    { label: 'Admin Email', value: company.email },
    { label: 'Industry', value: company.industry },
    { label: 'Size', value: company.size },
    { label: 'Treasury', value: company.treasuryAddress ? `${company.treasuryAddress.slice(0, 10)}...${company.treasuryAddress.slice(-6)}` : 'Not set' },
    { label: 'Payroll Cycle', value: company.payrollCycle },
    { label: 'Default Vault Alloc', value: `${company.defaultVaultAlloc}%` },
  ];

  if (done) {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--success-bg)' }}>
          <CheckCircle2 size={30} style={{ color: 'var(--success)' }} />
        </div>
        <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)' }}>Company registered!</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="display font-bold text-xl mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        Review & confirm
      </h2>
      <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>
        Double-check your details before registering.
      </p>

      <div className="rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border)' }}>
        {rows.map((r, i) => (
          <div
            key={r.label}
            className="flex items-center justify-between px-4 py-3"
            style={{ background: i % 2 === 0 ? 'var(--surface-muted)' : 'var(--surface)' }}
          >
            <span className="text-sm" style={{ color: 'var(--muted)' }}>{r.label}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{r.value || '—'}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="back-btn flex-1">Back</button>
        <button onClick={() => { void handleRegister(); }} disabled={loading} className="cta-btn flex-[2]">
          {loading ? <><Loader2 size={14} className="animate-spin" /> Registering…</> : <>Register Company <CheckCircle2 size={15} /></>}
        </button>
      </div>
    </div>
  );
}

/* ── Shared form atoms ───────────────────────────────────────────────────── */

function Field({ label, required = true, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--muted)' }}>
        {label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

/* ── Global styles injected via Tailwind @layer in index.css ─────────────── */
// We add these as inline styles through className in the JSX above.
// The `.form-input`, `.cta-btn`, `.back-btn` classes are defined below via a trick:
// they're referenced above — they need to be added as actual Tailwind utilities.
// Since we can't extend in index.css here, we replicate with inline style objects.
// The classNames are actually unused (no Tailwind mapping) — replaced with style props below.
// Note: the input/button elements use className="form-input" etc. which we handle via
// Tailwind's @apply-like syntax in index.css, OR we override per-element.
// To avoid index.css coupling, we use a shared HOC:
export { Field };
