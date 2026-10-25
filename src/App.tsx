import { useState } from 'react';
import { AppStoreProvider, useAppStore } from './store/AppStore';
import { LandingPage } from './components/LandingPage';
import { CompanyOnboarding } from './components/CompanyOnboarding';
import { AppShell, type UserRole } from './components/AppShell';

function AppInner() {
  const { company } = useAppStore();
  const [role, setRole] = useState<UserRole | null>(null);
  const [registering, setRegistering] = useState(false);

  // Not connected to a role yet → landing page
  if (!role) {
    return (
      <LandingPage
        onEnterApp={(r) => {
          if (!company.registered && (r === 'admin' || r === 'finance')) {
            setRole(r);
            setRegistering(true);
          } else {
            setRole(r);
            setRegistering(false);
          }
        }}
      />
    );
  }

  // Admin/Finance entering for first time → registration wizard
  if (registering && !company.registered) {
    return (
      <CompanyOnboarding
        onDone={() => setRegistering(false)}
      />
    );
  }

  return (
    <AppShell
      role={role}
      onSignOut={() => { setRole(null); setRegistering(false); }}
    />
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <AppInner />
    </AppStoreProvider>
  );
}
