import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import FileProcessor from './components/FileProcessor';
import { Dashboard, InventoryList, TransactionHistory, SettingsView } from './components/Views';
import AiAssistant from './components/AiAssistant';
import { auth } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Sparkles, Bot, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'upload' | 'ai_chat' | 'settings'>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [isQuickAiOpen, setIsQuickAiOpen] = useState(false);
  const [selectedInventoryDepartment, setSelectedInventoryDepartment] = useState<string>('ALL');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  const handleNavigateToInventory = (department: string) => {
    setSelectedInventoryDepartment(department);
    setActiveTab('inventory');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigateToInventory={handleNavigateToInventory} />;
      case 'inventory':
        return (
          <InventoryList 
            initialSegment={selectedInventoryDepartment} 
            onClearInitialSegment={() => setSelectedInventoryDepartment('ALL')} 
          />
        );
      case 'history':
        return <TransactionHistory />;
      case 'upload':
        return <FileProcessor />;
      case 'ai_chat':
        return (
          <div className="h-[calc(100vh-14rem)] min-h-[500px]">
            <AiAssistant />
          </div>
        );
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard onNavigateToInventory={handleNavigateToInventory} />;
    }
  };

  return (
    <AuthGuard>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={user}>
        {renderContent()}

        {/* Floating Quick AI Button (iOS Liquid Glass bubble) */}
        {activeTab !== 'ai_chat' && (
          <div className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-30">
            <button
              onClick={() => setIsQuickAiOpen(true)}
              className="relative w-12 h-12 rounded-full bg-gradient-to-tr from-amber-400 via-amber-300 to-amber-200 text-slate-900 border border-white/80 shadow-[0_8px_25px_rgba(245,158,11,0.35)] active:scale-95 flex items-center justify-center transition-all cursor-pointer backdrop-blur-xl group hover:shadow-[0_12px_30px_rgba(245,158,11,0.45)]"
              title="ถาม AI สต็อก (Gemini Assistant)"
              aria-label="เปิดถาม AI สต็อก"
            >
              <Sparkles className="w-5 h-5 fill-slate-900 text-slate-900 transition-transform group-hover:scale-110" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border border-white text-[8px] font-mono text-white font-black items-center justify-center shadow-sm">
                  AI
                </span>
              </span>
            </button>
          </div>
        )}

        {/* Quick AI Drawer / Modal (iOS Liquid Glass Sheet) */}
        {isQuickAiOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end bg-slate-900/30 backdrop-blur-md p-2 sm:p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl h-[92vh] sm:h-[88vh] bg-white/85 backdrop-blur-2xl border border-white/80 shadow-2xl rounded-3xl overflow-hidden flex flex-col">
              <AiAssistant onClose={() => setIsQuickAiOpen(false)} />
            </div>
          </div>
        )}
      </Layout>
    </AuthGuard>
  );
}
