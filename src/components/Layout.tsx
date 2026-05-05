import React from 'react';
import { LogOut, Package, History, FileUp, LayoutDashboard, Settings } from 'lucide-react';
import { signOut } from '../lib/firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'inventory' | 'history' | 'upload' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'inventory' | 'history' | 'upload' | 'settings') => void;
  user: any;
}

export default function Layout({ children, activeTab, setActiveTab, user }: LayoutProps) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'history', label: 'History', icon: History },
    { id: 'upload', label: 'Upload Invoice', icon: FileUp },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden border-8 border-slate-900">
      {/* Header */}
      <header className="h-16 bg-white border-b-2 border-slate-900 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 border-2 border-slate-900"></div>
          <h1 className="text-xl font-bold tracking-tight uppercase">
            LogiTrack <span className="text-blue-600">System</span>
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Server Status</p>
            <p className="text-xs font-mono text-emerald-600">STABLE_ONLINE</p>
          </div>
          <div className="w-10 h-10 bg-slate-200 border-2 border-slate-900 flex items-center justify-center font-bold">
            {user?.email?.slice(0, 2).toUpperCase() || 'JD'}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r-2 border-slate-900 flex flex-col shrink-0">
          <nav className="flex-1 p-6 space-y-4">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center justify-between p-3 border-2 border-slate-900 font-bold transition-all active-neo-brutalism",
                  activeTab === tab.id 
                    ? "bg-slate-900 text-white neo-brutalism-shadow-sm" 
                    : "bg-white text-slate-900 hover:bg-slate-100"
                )}
              >
                <div className="flex items-center gap-3">
                  <tab.icon className="w-4 h-4" />
                  <span className="text-xs uppercase">{tab.label}</span>
                </div>
                <span className="text-[10px] opacity-40 font-mono">0{idx + 1}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t-2 border-slate-900 p-6 space-y-4">
            <div className="p-4 bg-slate-100 border-2 border-slate-900 text-[10px] font-mono leading-relaxed">
              DB: FIRESTORE_V1<br />
              NODE: REACT_CLI_PROD<br />
              AUTH: GOOGLE_SECURE
            </div>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-3 p-3 border-2 border-slate-900 bg-white text-red-600 font-bold text-[10px] uppercase tracking-wider hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-4 mb-8">
              <div className="w-3 h-3 bg-blue-600"></div>
              <h2 className="text-2xl font-black uppercase tracking-tighter italic">
                {activeTab.replace('_', ' ')}
              </h2>
            </div>
            {children}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-10 bg-slate-900 text-white flex items-center px-8 justify-between shrink-0">
        <p className="text-[10px] font-mono opacity-50 uppercase">© 2026 LOGITRACK V.2.1.0 // DB_CONNECTED_SECURE</p>
        <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">System Architect Enabled</p>
      </footer>
    </div>
  );
}
