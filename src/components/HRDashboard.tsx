import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  X,
  Mail,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Pencil,
  UserPlus,
  Users,
} from 'lucide-react';
import { SectionCard } from './AppShell';
import { useAppStore, type Employee, type EarningDeduction } from '../store/AppStore';
import { Field } from './CompanyOnboarding';

const DEPARTMENTS = ['Engineering', 'Product', 'Design', 'Analytics', 'HR', 'Finance', 'Operations', 'Sales', 'Marketing', 'Legal'];

const DEPT_COLORS: Record<string, string> = {
  Engineering: '#06b6d4',
  Product: '#818cf8',
  Design: '#fb923c',
  Analytics: '#34d399',
  HR: '#f472b6',
  Finance: '#60a5fa',
  Operations: '#a78bfa',
  Sales: '#fbbf24',
  Marketing: '#f87171',
  Legal: '#94a3b8',
};

const STATUS_CONFIG = {
  active:   { icon: CheckCircle2, label: 'Active',   bg: 'var(--success-bg)', color: 'var(--success)' },
  pending:  { icon: Clock,        label: 'Pending',  bg: 'var(--warning-bg)', color: 'var(--warning)' },
  inactive: { icon: XCircle,      label: 'Inactive', bg: 'var(--danger-bg)',  color: 'var(--danger)'  },
};



export function HRDashboard() {
  const {
    employees,
    earningsDeductions,
    addEmployee,
    updateEmployee,
    removeEmployee,
    addEarningDeduction,
    removeEarningDeduction,
    company,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);

  // New ED form
  const [showEdForm, setShowEdForm] = useState(false);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.department.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || e.status === filter;
    return matchSearch && matchFilter;
  });

  const totalSalary = employees.filter((e) => e.status === 'active').reduce((s, e) => s + e.salary, 0);

  function openAdd() { setEditTarget(null); setShowModal(true); }
  function openEdit(emp: Employee) { setEditTarget(emp); setShowModal(true); }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Employees', value: employees.length },
          { label: 'Active',           value: employees.filter((e) => e.status === 'active').length,  color: 'var(--success)' },
          { label: 'Monthly Payroll',  value: `$${totalSalary.toLocaleString()}`, color: 'var(--cyan-dark)' },
        ].map((s) => (
          <SectionCard key={s.label}>
            <div className="display font-bold text-2xl tabular-nums" style={{ color: s.color ?? 'var(--ink)' }}>
              {s.value}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{s.label}</div>
          </SectionCard>
        ))}
      </div>

      {/* Employee table */}
      <SectionCard title="Employee Directory">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or dept…"
              className="form-input"
              style={{ paddingLeft: '2.2rem' }}
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'active', 'pending', 'inactive'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-2 rounded-xl text-xs font-semibold capitalize transition-all"
                style={{
                  background: filter === f ? 'var(--cyan-dark)' : 'var(--surface-muted)',
                  color: filter === f ? '#fff' : 'var(--muted)',
                  border: `1px solid ${filter === f ? 'transparent' : 'var(--border)'}`,
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={openAdd} className="cta-btn whitespace-nowrap">
            <UserPlus size={14} /> Enroll Employee
          </button>
        </div>

        {/* Empty state */}
        {employees.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--surface-muted)' }}>
              <Users size={22} style={{ color: 'var(--muted)' }} />
            </div>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>No employees yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: 'var(--muted)' }}>
              Click &ldquo;Enroll Employee&rdquo; to add your first staff member.
            </p>
            <button onClick={openAdd} className="cta-btn">
              <Plus size={14} /> Add first employee
            </button>
          </div>
        )}

        {/* List */}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Employee', 'Department', 'Salary / mo', 'Vault', 'Status', ''].map((h) => (
                    <th key={h} className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, i) => {
                  const sc = STATUS_CONFIG[emp.status];
                  const StatusIcon = sc.icon;
                  const deptColor = DEPT_COLORS[emp.department] ?? '#94a3b8';
                  return (
                    <motion.tr
                      key={emp.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      style={{ borderBottom: '1px solid var(--border)' }}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ background: `${deptColor}22`, color: deptColor }}
                          >
                            {emp.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-medium" style={{ color: 'var(--ink)' }}>{emp.name}</div>
                            <div className="text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                              <Mail size={10} /> {emp.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: `${deptColor}18`, color: deptColor }}
                        >
                          {emp.department}
                        </span>
                      </td>
                      <td className="py-3 pr-4 tabular-nums font-semibold" style={{ color: 'var(--ink)' }}>
                        ${emp.salary.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={12} style={{ color: 'var(--success)' }} />
                          <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>{emp.vaultAlloc}%</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit"
                          style={{ background: sc.bg, color: sc.color }}
                        >
                          <StatusIcon size={10} />
                          {sc.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(emp)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(6,182,212,0.08)]"
                            title="Edit"
                          >
                            <Pencil size={13} style={{ color: 'var(--muted)' }} />
                          </button>
                          <button
                            onClick={() => removeEmployee(emp.id)}
                            className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                            title="Remove"
                          >
                            <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {employees.length > 0 && filtered.length === 0 && (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--muted)' }}>No employees match your filter.</p>
        )}
      </SectionCard>

      {/* Earnings & Deductions ConfigManager */}
      <SectionCard title="Earnings & Deductions (ConfigManager)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {earningsDeductions.map((item) => (
            <EarningDeductionRow key={item.id} item={item} onRemove={removeEarningDeduction} />
          ))}
        </div>

        {showEdForm ? (
          <AddEdForm
            onSave={(ed) => { addEarningDeduction(ed); setShowEdForm(false); }}
            onCancel={() => setShowEdForm(false)}
            defaultVaultAlloc={company.defaultVaultAlloc}
          />
        ) : (
          <button
            onClick={() => setShowEdForm(true)}
            className="flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: 'var(--cyan-dark)' }}
          >
            <Plus size={14} /> Add earning or deduction type
          </button>
        )}
      </SectionCard>

      {/* Employee modal */}
      <AnimatePresence>
        {showModal && (
          <EmployeeModal
            initial={editTarget ?? undefined}
            defaultVaultAlloc={company.defaultVaultAlloc}
            onSave={(data) => {
              if (editTarget) {
                updateEmployee(editTarget.id, data);
              } else {
                addEmployee(data);
              }
              setShowModal(false);
            }}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Employee enrollment modal ───────────────────────────────────────────── */

function EmployeeModal({
  initial,
  defaultVaultAlloc,
  onSave,
  onClose,
}: {
  initial?: Employee;
  defaultVaultAlloc: number;
  onSave: (e: Omit<Employee, 'id' | 'joinedAt'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    jobTitle: initial?.jobTitle ?? '',
    department: initial?.department ?? '',
    salary: initial?.salary ?? 0,
    walletAddress: initial?.walletAddress ?? '',
    vaultAlloc: initial?.vaultAlloc ?? defaultVaultAlloc,
    status: (initial?.status ?? 'active'),
    customFields: initial?.customFields ?? {},
  });
  const [err, setErr] = useState('');

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErr('');
  }

  function validate() {
    if (!form.name.trim())      return 'Full name is required.';
    if (!form.email.trim())     return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email.';
    if (!form.jobTitle.trim())  return 'Job title is required.';
    if (!form.department)       return 'Department is required.';
    if (form.salary <= 0)       return 'Salary must be greater than 0.';
    return '';
  }

  function handleSave() {
    const e = validate();
    if (e) { setErr(e); return; }
    onSave(form);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,31,60,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 8 }}
        className="w-full max-w-lg rounded-3xl overflow-y-auto"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', maxHeight: '90dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            {initial ? 'Edit Employee' : 'Enroll Employee'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[rgba(13,31,60,0.06)]">
            <X size={18} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" required>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Emeka Okafor" className="form-input" />
            </Field>
            <Field label="Email" required>
              <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="emeka@company.com" type="email" className="form-input" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Job Title" required>
              <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Senior Engineer" className="form-input" />
            </Field>
            <Field label="Department" required>
              <select value={form.department} onChange={(e) => set('department', e.target.value)} className="form-input">
                <option value="">Select…</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Monthly Salary (USDC)" required>
              <input
                value={form.salary || ''}
                onChange={(e) => set('salary', Number(e.target.value))}
                placeholder="5000"
                type="number"
                min={0}
                className="form-input"
              />
            </Field>
            <Field label="Status" required={false}>
              <select value={form.status} onChange={(e) => set('status', e.target.value as Employee['status'])} className="form-input">
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          <Field label="Wallet Address (optional)" required={false}>
            <input
              value={form.walletAddress}
              onChange={(e) => set('walletAddress', e.target.value)}
              placeholder="0x... (auto-created via passkey if blank)"
              className="form-input mono"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Leave blank — employee links their own wallet on first login via passkey or email invite.
            </p>
          </Field>

          <Field label={`Vault Allocation — ${form.vaultAlloc}% of net pay`} required={false}>
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={form.vaultAlloc}
              onChange={(e) => set('vaultAlloc', Number(e.target.value))}
              className="w-full mt-1"
              style={{ accentColor: 'var(--cyan)' }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--muted)' }}>
              <span>0%</span><span>40%</span><span>80%</span>
            </div>
          </Field>

          {err && (
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>{err}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="back-btn flex-1">Cancel</button>
          <button onClick={handleSave} className="cta-btn flex-[2]">
            {initial ? 'Save Changes' : <>  <UserPlus size={14} /> Enroll Employee</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Earnings/Deductions row ─────────────────────────────────────────────── */

function EarningDeductionRow({ item, onRemove }: { item: EarningDeduction; onRemove: (id: string) => void }) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-xl"
      style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
    >
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{item.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: item.type === 'earning' ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: item.type === 'earning' ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {item.type}
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {item.method === 'fixed' ? `$${item.value}` : `${item.value}%`}
          </span>
          {item.taxable && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
              taxable
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onRemove(item.id)} className="p-1.5 rounded-lg hover:bg-[rgba(220,38,38,0.08)]">
        <Trash2 size={13} style={{ color: 'var(--danger)' }} />
      </button>
    </div>
  );
}

/* ── Add ED form ─────────────────────────────────────────────────────────── */

function AddEdForm({
  onSave,
  onCancel,
}: {
  onSave: (ed: Omit<EarningDeduction, 'id'>) => void;
  onCancel: () => void;
  defaultVaultAlloc: number;
}) {
  const [name, setName]       = useState('');
  const [type, setType]       = useState<'earning' | 'deduction'>('earning');
  const [method, setMethod]   = useState<'fixed' | 'percent'>('fixed');
  const [value, setValue]     = useState('');
  const [taxable, setTaxable] = useState(false);
  const [err, setErr]         = useState('');

  function handleSave() {
    if (!name.trim())          { setErr('Name is required.'); return; }
    if (!value || Number(value) <= 0) { setErr('Enter a valid value > 0.'); return; }
    onSave({ name: name.trim(), type, method, value: Number(value), taxable });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl mt-2"
      style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}
    >
      <p className="text-sm font-bold mb-3" style={{ color: 'var(--cyan-dark)' }}>New Earning / Deduction</p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Name" required>
          <input value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="e.g. Shift Allowance" className="form-input" />
        </Field>
        <Field label="Value" required>
          <input value={value} onChange={(e) => { setValue(e.target.value); setErr(''); }} placeholder={method === 'fixed' ? '500' : '10'} type="number" min={0} className="form-input" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <Field label="Type" required={false}>
          <select value={type} onChange={(e) => setType(e.target.value as 'earning' | 'deduction')} className="form-input">
            <option value="earning">Earning</option>
            <option value="deduction">Deduction</option>
          </select>
        </Field>
        <Field label="Method" required={false}>
          <select value={method} onChange={(e) => setMethod(e.target.value as 'fixed' | 'percent')} className="form-input">
            <option value="fixed">Fixed ($)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </Field>
        <Field label="Taxable?" required={false}>
          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" id="taxable" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} style={{ accentColor: 'var(--cyan)' }} />
            <label htmlFor="taxable" className="text-sm" style={{ color: 'var(--ink)' }}>Yes</label>
          </div>
        </Field>
      </div>

      {err && <p className="text-sm mb-2" style={{ color: 'var(--danger)' }}>{err}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} className="cta-btn">Save</button>
        <button onClick={onCancel} className="back-btn">Cancel</button>
      </div>
    </motion.div>
  );
}


