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

        {/* Floating Quick AI Button (compact circular FAB) */}
        {activeTab !== 'ai_chat' && (
          <div className="fixed bottom-16 right-3.5 md:bottom-14 md:right-6 z-30">
            <button
              onClick={() => setIsQuickAiOpen(true)}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center transition-all cursor-pointer group"
              title="ถาม AI สต็อก (Gemini Assistant)"
              aria-label="เปิดถาม AI สต็อก"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950 text-slate-950" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border border-white text-[8px] font-mono text-white font-black items-center justify-center">
                  AI
                </span>
              </span>
            </button>
          </div>
        )}

        {/* Quick AI Drawer / Modal */}
        {isQuickAiOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/50 p-2 sm:p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-2xl h-[95vh] sm:h-[90vh] bg-white border-2 sm:border-4 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] sm:shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] flex flex-col">
              <AiAssistant onClose={() => setIsQuickAiOpen(false)} />
            </div>
          </div>
        )}
      </Layout>
    </AuthGuard>
  );
}
