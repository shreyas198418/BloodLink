import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LayoutShell, NavSection } from './components/LayoutShell.tsx';
import { LoginView } from './components/LoginView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { InventoryView } from './components/InventoryView.tsx';
import { DonorsView } from './components/DonorsView.tsx';
import { RequestsView } from './components/RequestsView.tsx';
import { MatchingView } from './components/MatchingView.tsx';
import { BloodBanksView } from './components/BloodBanksView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';

function BloodLinkRouter() {
  const { user, loading } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [openCreateFlag, setOpenCreateFlag] = useState(false);
  const [selectedMatchRequestId, setSelectedMatchRequestId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 mx-auto rounded-lg bg-[#E53945] animate-pulse" />
          <p className="text-sm font-medium text-[#7B8499]">Loading BloodLink...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  function handleNavigate(
    section: NavSection,
    options?: { openCreate?: boolean; requestId?: string },
  ) {
    setActiveSection(section);
    setOpenCreateFlag(Boolean(options?.openCreate));
    if (options?.requestId) {
      setSelectedMatchRequestId(options.requestId);
    }
  }

  return (
    <LayoutShell activeSection={activeSection} onNavigate={(sec) => handleNavigate(sec)}>
      {activeSection === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
      {activeSection === 'inventory' && (
        <InventoryView
          initialOpenCreate={openCreateFlag}
          onConsumedOpenCreate={() => setOpenCreateFlag(false)}
        />
      )}
      {activeSection === 'donors' && (
        <DonorsView
          initialOpenCreate={openCreateFlag}
          onConsumedOpenCreate={() => setOpenCreateFlag(false)}
        />
      )}
      {activeSection === 'requests' && (
        <RequestsView
          initialOpenCreate={openCreateFlag}
          onConsumedOpenCreate={() => setOpenCreateFlag(false)}
          onOpenMatching={(reqId) => handleNavigate('matching', { requestId: reqId })}
        />
      )}
      {activeSection === 'matching' && (
        <MatchingView initialRequestId={selectedMatchRequestId} />
      )}
      {activeSection === 'blood-banks' && <BloodBanksView />}
      {activeSection === 'analytics' && <AnalyticsView />}
      {activeSection === 'settings' && <SettingsView />}
    </LayoutShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BloodLinkRouter />
    </AuthProvider>
  );
}
