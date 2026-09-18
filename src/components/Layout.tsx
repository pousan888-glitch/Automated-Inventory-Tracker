import React, { useState } from 'react';
import { LogOut, Package, History, FileUp, LayoutDashboard, Settings, Sparkles, Menu, X, MoreHorizontal } from 'lucide-react';
import { signOut } from '../lib/firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'inventory' | 'history' | 'upload' | 'ai_chat' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'inventory' | 'history' | 'upload' | 'ai_chat' | 'settings') => void;
  user: any;
}

export default function Layout({ children, activeTab, setActiveTab, user }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'history', label: 'History', icon: History },
    { id: 'upload', label: 'Upload Invoice', icon: FileUp },
    { id: 'ai_chat', label: 'AI Assistant', icon: Sparkles, badge: 'AI' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden border-0 md:border-8 border-slate-900">
      {/* Header */}
      <header className="h-14 sm:h-16 bg-white border-b-2 border-slate-900 flex items-center justify-between px-3 sm:px-6 md:px-8 shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 sm:p-2 border-2 border-slate-900 bg-white hover:bg-slate-100 text-slate-900 md:hidden flex items-center justify-center cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
            aria-label="เปิดเมนูหลัก"
            title="เมนูระบบ"
          >
            <Menu className="w-5 h-5 text-slate-900" />
          </button>

          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 border-2 border-slate-900 shrink-0"></div>
          <h1 className="text-base sm:text-xl font-bold tracking-tight uppercase truncate">
            LogiTrack <span className="text-blue-600">System</span>
          </h1>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Server Status</p>
            <p className="text-xs font-mono text-emerald-600 font-bold">STABLE_ONLINE</p>
          </div>
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-200 border-2 border-slate-900 flex items-center justify-center font-bold text-xs sm:text-sm shrink-0">
            {user?.email?.slice(0, 2).toUpperCase() || 'JD'}
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Content */}
          <aside className="relative w-[85%] max-w-xs bg-white border-r-4 border-slate-900 flex flex-col h-full z-10 shadow-[8px_0px_0px_0px_rgba(15,23,42,1)] overflow-y-auto animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b-2 border-slate-900">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-blue-500 border border-white"></div>
                <span className="font-black text-sm tracking-wider uppercase">LOGITRACK MENU</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 cursor-pointer"
                aria-label="ปิดเมนู"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation tabs */}
            <nav className="flex-1 p-4 space-y-2.5">
              {tabs.map((tab, idx) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-3 border-2 border-slate-900 font-bold transition-all text-left cursor-pointer",
                    activeTab === tab.id 
                      ? "bg-slate-900 text-white shadow-[3px_3px_0px_0px_rgba(59,130,246,1)]" 
                      : "bg-white text-slate-900 hover:bg-slate-100"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <tab.icon className={cn("w-4 h-4 shrink-0", tab.id === 'ai_chat' && "text-amber-400")} />
                    <span className="text-xs uppercase font-black">{tab.label}</span>
                    {tab.id === 'ai_chat' && (
                      <span className="text-[8px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.5 border border-slate-900 font-mono">
                        GEMINI
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-50 font-mono">0{idx + 1}</span>
                </button>
              ))}
            </nav>

            {/* Drawer Bottom info & Sign Out */}
            <div className="mt-auto border-t-2 border-slate-900 p-4 space-y-3 bg-slate-50">
              <div className="p-2.5 bg-white border-2 border-slate-900 text-[9px] font-mono leading-relaxed">
                USER: <span className="font-bold text-blue-700 truncate block">{user?.email || 'LOGGED_IN'}</span>
                DB: FIRESTORE_V1 • ONLINE
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 border-2 border-slate-900 bg-white text-red-600 font-bold text-xs uppercase tracking-wider hover:bg-red-50 transition-colors shadow-[2px_2px_0px_0px_rgba(220,38,38,1)] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ (Sign Out)
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop Sidebar (hidden on mobile) */}
        <aside className="hidden md:flex md:w-64 bg-white border-r-2 border-slate-900 flex-col shrink-0">
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
                  <tab.icon className={cn("w-4 h-4", tab.id === 'ai_chat' && "text-amber-400")} />
                  <span className="text-xs uppercase">{tab.label}</span>
                  {tab.id === 'ai_chat' && (
                    <span className="text-[8px] font-black bg-amber-400 text-slate-950 px-1.5 py-0.5 border border-slate-900 font-mono">
                      GEMINI
                    </span>
                  )}
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
              className="w-full flex items-center justify-center gap-3 p-3 border-2 border-slate-900 bg-white text-red-600 font-bold text-[10px] uppercase tracking-wider hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full max-w-full">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 md:p-8 pb-20 md:pb-8">
            <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-3 mb-4 sm:mb-6">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-600 shrink-0"></div>
              <h2 className="text-lg sm:text-2xl font-black uppercase tracking-tighter italic truncate">
                {activeTab.replace('_', ' ')}
              </h2>
            </div>
            {children}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (Fast 1-Thumb Switching) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-slate-900 flex items-stretch justify-around px-1 py-1 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        {tabs.slice(0, 5).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-1 px-0.5 min-h-[48px] rounded-none transition-all cursor-pointer",
                isActive
                  ? "text-blue-700 font-black bg-blue-50/80 border-t-2 border-blue-600 -mt-1"
                  : "text-slate-600 hover:text-slate-900 font-bold"
              )}
            >
              <tab.icon className={cn("w-4 h-4 mb-0.5 shrink-0", isActive ? "text-blue-600" : "text-slate-600")} />
              <span className="text-[9px] leading-tight uppercase tracking-tight truncate max-w-[60px]">
                {tab.id === 'upload' ? 'Upload' : tab.id === 'ai_chat' ? 'AI' : tab.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-1 px-0.5 min-h-[48px] transition-all cursor-pointer",
            activeTab === 'settings'
              ? "text-blue-700 font-black bg-blue-50/80 border-t-2 border-blue-600 -mt-1"
              : "text-slate-600 hover:text-slate-900 font-bold"
          )}
        >
          <MoreHorizontal className="w-4 h-4 mb-0.5 text-slate-600 shrink-0" />
          <span className="text-[9px] leading-tight uppercase tracking-tight">เมนู</span>
        </button>
      </nav>

      {/* Desktop Footer (hidden on mobile to save screen space) */}
      <footer className="hidden md:flex h-10 bg-slate-900 text-white items-center px-8 justify-between shrink-0">
        <p className="text-[10px] font-mono opacity-50 uppercase">© 2026 LOGITRACK V.2.1.0 // DB_CONNECTED_SECURE</p>
        <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">System Architect Enabled</p>
      </footer>
    </div>
  );
}
