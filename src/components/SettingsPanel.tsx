import { useState } from 'react';
import { Save, Loader2, CheckCircle2 } from 'lucide-react';
import { SectionCard, NetworkFeeBadge } from './AppShell';
import { useAppStore } from '../store/AppStore';
import { Field } from './CompanyOnboarding';

const CYCLES = ['Weekly', 'Bi-weekly', 'Monthly (1st)', 'Monthly (15th)', 'Monthly (25th)', 'Monthly (last day)'];

export function SettingsPanel() {
  const { company, saveCompany, resetAll } = useAppStore();
  const [form, setForm] = useState({ ...company });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    saveCompany(form);
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="max-w-lg space-y-5">
      <SectionCard title="Company Settings">
        <div className="space-y-4">
          <Field label="Company Name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className="form-input" />
          </Field>
          <Field label="Admin Email">
            <input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" className="form-input" />
          </Field>
          <Field label="Industry" required={false}>
            <input value={form.industry} onChange={(e) => set('industry', e.target.value)} className="form-input" />
          </Field>
          <Field label="Treasury Wallet Address" required={false}>
            <input value={form.treasuryAddress} onChange={(e) => set('treasuryAddress', e.target.value)} placeholder="0x…" className="form-input mono" />
          </Field>
          <Field label="Payroll Cycle" required={false}>
            <select value={form.payrollCycle} onChange={(e) => set('payrollCycle', e.target.value)} className="form-input">
              {CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label={`Default Vault Allocation — ${form.defaultVaultAlloc}%`} required={false}>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={form.defaultVaultAlloc}
              onChange={(e) => set('defaultVaultAlloc', Number(e.target.value))}
              className="w-full mt-1"
              style={{ accentColor: 'var(--cyan)' }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--muted)' }}>
              <span>0%</span><span>40%</span><span>80%</span>
            </div>
          </Field>
        </div>
        <NetworkFeeBadge />

        <button onClick={() => { void handleSave(); }} disabled={saving} className="cta-btn w-full mt-4">
          {saving ? (
            <><Loader2 size={14} className="animate-spin" /> Saving…</>
          ) : saved ? (
            <><CheckCircle2 size={14} /> Settings saved</>
          ) : (
            <><Save size={14} /> Save Settings</>
          )}
        </button>
      </SectionCard>

      {/* Danger zone */}
      <SectionCard title="Danger Zone">
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Reset clears all company data, employees, and payroll history from this browser. This cannot be undone.
        </p>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.3)' }}
          >
            Reset all app data
          </button>
        ) : (
          <div className="p-4 rounded-xl" style={{ background: 'var(--danger-bg)', border: '1px solid rgba(220,38,38,0.3)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--danger)' }}>Are you sure? This deletes everything.</p>
            <div className="flex gap-3">
              <button onClick={resetAll} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: 'var(--danger)' }}>
                Yes, reset
              </button>
              <button onClick={() => setConfirmReset(false)} className="back-btn">Cancel</button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
