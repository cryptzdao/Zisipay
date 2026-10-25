/**
 * AppStore — React Context that holds all mutable Zisipay app state.
 * Persisted to localStorage so data survives page refresh.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface Company {
  name: string;
  email: string;
  industry: string;
  size: string;
  treasuryAddress: string;
  payrollCycle: string;
  defaultVaultAlloc: number;
  registered: boolean;
  /** ISO date string for the next scheduled payroll run, e.g. "2026-10-25" */
  scheduledPayrollDate: string;
  /** 24h time string, e.g. "09:00" */
  scheduledPayrollTime: string;
  /** Whether auto-execute is armed — admin must explicitly enable */
  autoPayrollEnabled: boolean;
  /** How often the payroll recurs after each execution */
  payrollFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export type EmployeeStatus = 'active' | 'pending' | 'inactive';

export interface EarningDeduction {
  id: string;
  name: string;
  type: 'earning' | 'deduction';
  method: 'fixed' | 'percent';
  value: number;
  taxable: boolean;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  salary: number;
  walletAddress: string;
  vaultAlloc: number;
  status: EmployeeStatus;
  joinedAt: string;
  customFields: Record<string, string>;
}

export interface PayrollRun {
  id: string;
  month: string;
  executedAt: string;
  txHash: string;
  totalGross: number;
  totalNet: number;
  totalVault: number;
  employeeCount: number;
}

/**
 * A single money movement in the system.
 * `to` and `from` are wallet addresses OR email strings (for pre-wallet sends).
 * `type`: 'payroll' = automated payroll disbursement, 'send' = manual P2P send,
 *         'vault' = vault deposit/withdraw, 'ramp' = on/offramp
 */
export interface TxRecord {
  id: string;
  type: 'payroll' | 'send' | 'vault' | 'ramp';
  label: string;
  from: string;         // sender address/email
  to: string;           // recipient address/email
  amount: number;       // positive USDC amount
  direction: 'in' | 'out'; // relative to the current viewer (set per-wallet at query time)
  memo?: string;
  txHash: string;
  timestamp: string;    // ISO
  status: 'confirmed' | 'pending';
}

interface AppState {
  company: Company;
  employees: Employee[];
  earningsDeductions: EarningDeduction[];
  payrollHistory: PayrollRun[];
  ledger: TxRecord[];   // ALL transactions ever recorded
}

interface AppStore extends AppState {
  saveCompany: (c: Partial<Company>) => void;
  addEmployee: (e: Omit<Employee, 'id' | 'joinedAt'>) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  removeEmployee: (id: string) => void;
  addEarningDeduction: (ed: Omit<EarningDeduction, 'id'>) => void;
  removeEarningDeduction: (id: string) => void;
  addPayrollRun: (run: Omit<PayrollRun, 'id'>) => void;
  recordTx: (tx: Omit<TxRecord, 'id' | 'timestamp'>) => TxRecord;
  /** Returns all txs where `wallet` appears as `to` or `from`, newest first. */
  txsForWallet: (wallet: string) => TxRecord[];
  /** Sum of all inbound confirmed txs for a wallet (simulated balance). */
  inboundTotal: (wallet: string) => number;
  resetAll: () => void;
}

/* ── Defaults ───────────────────────────────────────────────────────────── */

const DEFAULT_EARNINGS_DEDUCTIONS: EarningDeduction[] = [
  { id: 'e1', name: 'Housing Allowance', type: 'earning',   method: 'fixed',   value: 500,  taxable: false },
  { id: 'e2', name: 'Transport',          type: 'earning',   method: 'fixed',   value: 200,  taxable: false },
  { id: 'e3', name: 'Performance Bonus',  type: 'earning',   method: 'percent', value: 10,   taxable: true  },
  { id: 'd1', name: 'Pension (Employee)', type: 'deduction', method: 'percent', value: 8,    taxable: false },
  { id: 'd2', name: 'Health Insurance',   type: 'deduction', method: 'fixed',   value: 150,  taxable: false },
  { id: 'd3', name: 'Income Tax',         type: 'deduction', method: 'percent', value: 15,   taxable: true  },
];

const DEFAULT_COMPANY: Company = {
  name: '',
  email: '',
  industry: '',
  size: '',
  treasuryAddress: '',
  payrollCycle: 'Monthly (25th)',
  defaultVaultAlloc: 15,
  registered: false,
  scheduledPayrollDate: '',
  scheduledPayrollTime: '09:00',
  autoPayrollEnabled: false,
  payrollFrequency: 'monthly',
};

const INITIAL_STATE: AppState = {
  company: DEFAULT_COMPANY,
  employees: [],
  earningsDeductions: DEFAULT_EARNINGS_DEDUCTIONS,
  payrollHistory: [],
  ledger: [],
};

const STORAGE_KEY = 'zisipay_state_v2';

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      company:            { ...DEFAULT_COMPANY,              ...(parsed.company            ?? {}) },
      employees:          parsed.employees                   ?? [],
      earningsDeductions: parsed.earningsDeductions          ?? DEFAULT_EARNINGS_DEDUCTIONS,
      payrollHistory:     parsed.payrollHistory              ?? [],
      ledger:             parsed.ledger                      ?? [],
    };
  } catch {
    return INITIAL_STATE;
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function fakeTxHash() {
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/* ── Context ────────────────────────────────────────────────────────────── */

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const saveCompany = useCallback((patch: Partial<Company>) => {
    setState((s) => ({ ...s, company: { ...s.company, ...patch } }));
  }, []);

  const addEmployee = useCallback((e: Omit<Employee, 'id' | 'joinedAt'>) => {
    const emp: Employee = { ...e, id: uid(), joinedAt: new Date().toISOString() };
    setState((s) => ({ ...s, employees: [...s.employees, emp] }));
  }, []);

  const updateEmployee = useCallback((id: string, patch: Partial<Employee>) => {
    setState((s) => ({
      ...s,
      employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);

  const removeEmployee = useCallback((id: string) => {
    setState((s) => ({ ...s, employees: s.employees.filter((e) => e.id !== id) }));
  }, []);

  const addEarningDeduction = useCallback((ed: Omit<EarningDeduction, 'id'>) => {
    setState((s) => ({
      ...s,
      earningsDeductions: [...s.earningsDeductions, { ...ed, id: uid() }],
    }));
  }, []);

  const removeEarningDeduction = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      earningsDeductions: s.earningsDeductions.filter((x) => x.id !== id),
    }));
  }, []);

  const addPayrollRun = useCallback((run: Omit<PayrollRun, 'id'>) => {
    setState((s) => ({
      ...s,
      payrollHistory: [{ ...run, id: uid() }, ...s.payrollHistory],
    }));
  }, []);

  const recordTx = useCallback((tx: Omit<TxRecord, 'id' | 'timestamp'>): TxRecord => {
    const full: TxRecord = { ...tx, id: uid(), timestamp: new Date().toISOString() };
    setState((s) => ({ ...s, ledger: [full, ...s.ledger] }));
    return full;
  }, []);

  // These are computed inline (not stored) for simplicity — they read from state
  // but we expose them as stable function refs via useCallback on the store value.
  // We expose them as methods on the context so consumers don't need raw ledger access.
  const resetAll = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Build the context value (recomputed every render but stable callbacks)
  const txsForWallet = useCallback(
    (wallet: string): TxRecord[] => {
      if (!wallet) return [];
      const w = wallet.toLowerCase();
      return state.ledger
        .filter((t) => t.to.toLowerCase() === w || t.from.toLowerCase() === w)
        .map((t) => ({
          ...t,
          direction: t.to.toLowerCase() === w ? 'in' : 'out',
        }));
    },
    [state.ledger],
  );

  const inboundTotal = useCallback(
    (wallet: string): number => {
      if (!wallet) return 0;
      const w = wallet.toLowerCase();
      return state.ledger
        .filter((t) => t.to.toLowerCase() === w && t.status === 'confirmed')
        .reduce((sum, t) => sum + t.amount, 0);
    },
    [state.ledger],
  );

  return (
    <Ctx.Provider
      value={{
        ...state,
        saveCompany,
        addEmployee,
        updateEmployee,
        removeEmployee,
        addEarningDeduction,
        removeEarningDeduction,
        addPayrollRun,
        recordTx,
        txsForWallet,
        inboundTotal,
        resetAll,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppStore must be used inside AppStoreProvider');
  return ctx;
}

/* ── Payroll calculation helper ─────────────────────────────────────────── */

export interface PayrollLineItem {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  walletAddress: string;
  gross: number;
  earningsBreakdown: { label: string; amount: number }[];
  deductionsBreakdown: { label: string; amount: number }[];
  net: number;
  vault: number;
  toWallet: number;
  canPay: boolean;
}

export function computePayroll(
  employees: Employee[],
  eds: EarningDeduction[],
): PayrollLineItem[] {
  return employees
    .filter((e) => e.status !== 'inactive')
    .map((emp) => {
      const base = emp.salary;

      const fixedEarnings = eds
        .filter((x) => x.type === 'earning' && x.method === 'fixed')
        .map((x) => ({ label: x.name, amount: x.value }));

      const pctEarnings = eds
        .filter((x) => x.type === 'earning' && x.method === 'percent')
        .map((x) => ({ label: x.name, amount: Math.round(base * (x.value / 100)) }));

      const earningsBreakdown = [
        { label: 'Base Salary', amount: base },
        ...fixedEarnings,
        ...pctEarnings,
      ];

      const gross = earningsBreakdown.reduce((s, x) => s + x.amount, 0);

      const deductionsBreakdown = eds
        .filter((x) => x.type === 'deduction')
        .map((x) => ({
          label: x.name,
          amount: x.method === 'fixed' ? x.value : Math.round(gross * (x.value / 100)),
        }));

      const totalDeductions = deductionsBreakdown.reduce((s, x) => s + x.amount, 0);
      const net = Math.max(0, gross - totalDeductions);
      const vault = Math.round(net * (emp.vaultAlloc / 100));
      const toWallet = net - vault;

      return {
        employeeId: emp.id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        walletAddress: emp.walletAddress,
        gross,
        earningsBreakdown,
        deductionsBreakdown,
        net,
        vault,
        toWallet,
        canPay: emp.status === 'active' && !!emp.walletAddress,
      };
    });
}
