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
    <div className="min-h-screen text-slate-800 font-sans flex flex-col overflow-hidden relative">
      {/* Dynamic Ambient Fluid Background for Liquid Glass refraction */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[34rem] h-[34rem] bg-blue-400/15 rounded-full blur-3xl" />
        <div className="absolute top-1/4 -right-24 w-[30rem] h-[30rem] bg-indigo-400/12 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 left-1/4 w-[36rem] h-[36rem] bg-sky-300/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-[22rem] h-[22rem] bg-violet-400/10 rounded-full blur-3xl" />
      </div>

      {/* iOS Liquid Glass Header */}
      <header className="h-16 bg-white/70 backdrop-blur-2xl border-b border-white/60 flex items-center justify-between px-4 sm:px-6 md:px-8 shrink-0 z-20 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-white/75 hover:bg-white border border-white/80 text-slate-700 md:hidden flex items-center justify-center cursor-pointer shadow-sm active:scale-95 transition-all"
            aria-label="เปิดเมนูหลัก"
            title="เมนูระบบ"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>

          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-500 border border-white/40 shadow-md shadow-blue-500/25 flex items-center justify-center text-white shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate flex items-center gap-1.5">
              <span>LogiTrack</span>
              <span className="text-xs font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                PRO
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <div className="text-right hidden md:block">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-semibold tracking-wide">SYSTEM ACTIVE</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-white/80 border border-white/90 shadow-sm flex items-center justify-center font-bold text-xs text-blue-600 backdrop-blur-md shrink-0">
            {user?.email?.slice(0, 2).toUpperCase() || 'JD'}
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* iOS Liquid Glass Drawer Content */}
          <aside className="relative w-[82%] max-w-xs bg-white/85 backdrop-blur-3xl border-r border-white/70 flex flex-col h-full z-10 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-250">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-sm">
                  <Package className="w-4 h-4" />
                </div>
                <span className="font-bold text-sm tracking-tight text-slate-900">LogiTrack System</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                aria-label="ปิดเมนู"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation tabs */}
            <nav className="flex-1 p-4 space-y-1.5">
              {tabs.map((tab, idx) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-2xl font-semibold text-xs transition-all text-left cursor-pointer",
                    activeTab === tab.id 
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25 border border-white/30" 
                      : "bg-white/50 text-slate-700 hover:bg-white/80 hover:text-slate-900 border border-white/60"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <tab.icon className={cn("w-4 h-4 shrink-0", activeTab === tab.id ? "text-white" : "text-slate-500")} />
                    <span>{tab.label}</span>
                    {tab.id === 'ai_chat' && (
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                        activeTab === tab.id ? "bg-white/20 text-white" : "bg-amber-500/15 text-amber-600"
                      )}>
                        AI
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-mono", activeTab === tab.id ? "text-white/60" : "text-slate-400")}>0{idx + 1}</span>
                </button>
              ))}
            </nav>

            {/* Drawer Bottom info & Sign Out */}
            <div className="mt-auto border-t border-slate-200/50 p-4 space-y-3 bg-white/40 backdrop-blur-md">
              <div className="p-3 rounded-2xl bg-white/70 border border-white/80 text-[11px] space-y-1 shadow-sm">
                <span className="text-slate-400 font-medium block">เชื่อมต่อระบบ</span>
                <span className="font-semibold text-slate-800 truncate block">{user?.email || 'Authenticated'}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  signOut();
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-50/90 hover:bg-rose-100 text-rose-600 font-semibold text-xs transition-colors border border-rose-200/50 cursor-pointer shadow-sm active:scale-95"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ (Sign Out)
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Desktop Sidebar (iOS Glass Sidebar) */}
        <aside className="hidden md:flex md:w-64 bg-white/65 backdrop-blur-2xl border-r border-white/60 flex-col shrink-0">
          <nav className="flex-1 p-4 space-y-1.5">
            {tabs.map((tab, idx) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center justify-between px-3.5 py-3 rounded-2xl font-medium text-xs transition-all cursor-pointer",
                  activeTab === tab.id 
                    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/25 border border-white/30 font-semibold" 
                    : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60 border border-transparent"
                )}
              >
                <div className="flex items-center gap-3">
                  <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-white" : "text-slate-500")} />
                  <span>{tab.label}</span>
                  {tab.id === 'ai_chat' && (
                    <span className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                      activeTab === tab.id ? "bg-white/20 text-white" : "bg-amber-500/15 text-amber-600"
                    )}>
                      AI
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px] font-mono", activeTab === tab.id ? "text-white/60" : "text-slate-400")}>0{idx + 1}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-slate-200/50 p-4 space-y-3">
            <div className="p-3.5 bg-white/70 backdrop-blur-md rounded-2xl border border-white/80 text-[10px] font-mono space-y-1 text-slate-500 shadow-sm">
              <div className="flex justify-between items-center">
                <span>DATABASE</span>
                <span className="text-emerald-600 font-bold">ONLINE</span>
              </div>
              <div className="flex justify-between items-center">
                <span>SECURITY</span>
                <span className="text-blue-600 font-bold">VERIFIED</span>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-2.5 p-2.5 rounded-xl bg-white/60 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-medium text-xs border border-white/80 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden w-full max-w-full">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 md:p-8 pb-24 md:pb-8">
            <div className="flex items-center gap-3 pb-3 mb-4 sm:mb-6">
              <div className="w-2.5 h-6 rounded-full bg-gradient-to-b from-blue-600 to-indigo-500 shrink-0"></div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 capitalize">
                {activeTab.replace('_', ' ')}
              </h2>
            </div>
            {children}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (iOS Floating Glass Dock) */}
      <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 bg-white/80 backdrop-blur-2xl border border-white/70 shadow-[0_12px_40px_rgba(15,23,42,0.12)] rounded-3xl p-1.5 flex items-center justify-around">
        {tabs.slice(0, 5).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-all cursor-pointer relative",
                isActive
                  ? "text-blue-600 font-semibold bg-blue-500/10 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <tab.icon className={cn("w-4 h-4 mb-0.5 shrink-0 transition-transform", isActive && "scale-110 text-blue-600")} />
              <span className="text-[10px] leading-tight font-medium truncate max-w-[56px]">
                {tab.id === 'upload' ? 'Upload' : tab.id === 'ai_chat' ? 'AI' : tab.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-blue-600 mt-0.5"></span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-2xl transition-all cursor-pointer",
            activeTab === 'settings'
              ? "text-blue-600 font-semibold bg-blue-500/10"
              : "text-slate-500 hover:text-slate-800"
          )}
        >
          <MoreHorizontal className="w-4 h-4 mb-0.5 text-slate-500 shrink-0" />
          <span className="text-[10px] leading-tight font-medium">เมนู</span>
        </button>
      </nav>

      {/* Desktop Footer */}
      <footer className="hidden md:flex h-9 bg-white/50 backdrop-blur-xl border-t border-white/60 text-slate-500 items-center px-8 justify-between shrink-0 text-[11px] z-20">
        <p className="font-mono">© 2026 LogiTrack Pro • Liquid Glass Edition</p>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span className="font-medium text-slate-600">Cloud Sync Active</span>
        </div>
      </footer>
    </div>
  );
}
