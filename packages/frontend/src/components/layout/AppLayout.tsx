import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import MobileHeader from './MobileHeader';
import FAB from './FAB';
import Onboarding from '../Onboarding';
import AIAssistant from '../AIAssistant';
import QuickMovimiento from '../QuickMovimiento';
import CommandPalette, { useCommandPaletteShortcut } from '../CommandPalette';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickMovOpen, setQuickMovOpen] = useState(false);
  const [quickMovTipo, setQuickMovTipo] = useState<string | undefined>();

  useCommandPaletteShortcut(setSearchOpen);

  const handleQuickMov = (tipo?: string) => {
    setQuickMovTipo(tipo);
    setQuickMovOpen(true);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 overflow-auto">
        <div className="p-4 lg:p-6 pt-14 lg:pt-6 pb-20 lg:pb-6 max-w-7xl page-enter">
          <Outlet />
        </div>
      </main>

      {/* Mobile header with page title + search */}
      <MobileHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <BottomNav />
      <FAB onQuickMov={handleQuickMov} />

      {/* Global overlays */}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickMovimiento open={quickMovOpen} onClose={() => setQuickMovOpen(false)} tipoInicial={quickMovTipo} />
      <Onboarding />
      <AIAssistant />
    </div>
  );
}
