import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import FileProcessor from './components/FileProcessor';
import { Dashboard, InventoryList, TransactionHistory, SettingsView } from './components/Views';
import { auth } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'history' | 'upload' | 'settings'>('dashboard');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return <InventoryList />;
      case 'history':
        return <TransactionHistory />;
      case 'upload':
        return <FileProcessor />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AuthGuard>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={user}>
        {renderContent()}
      </Layout>
    </AuthGuard>
  );
}
