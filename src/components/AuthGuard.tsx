import React, { useState, useEffect } from 'react';
import { Package, ArrowRight, Loader2, Warehouse } from 'lucide-react';
import { auth, signIn } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { motion } from 'motion/react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F0F0] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin opacity-20" />
        <p className="text-[10px] uppercase font-bold tracking-widest opacity-40">Authenticating...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 border-8 border-slate-900">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 border-4 border-slate-900 bg-white neo-brutalism-shadow overflow-hidden">
          <div className="bg-slate-900 p-12 flex flex-col justify-between text-white relative">
            <div>
              <div className="flex items-center gap-3 mb-12">
                <div className="w-8 h-8 bg-blue-600 border-2 border-white"></div>
                <h1 className="text-2xl font-bold uppercase tracking-tight">LogiTrack <span className="text-blue-400">System</span></h1>
              </div>
              <div className="space-y-6">
                <h2 className="text-6xl font-black tracking-tighter leading-[0.9] uppercase italic">
                  Geometric <br/>Balance <br/>Inventory.
                </h2>
                <div className="w-12 h-2 bg-blue-600"></div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-bold leading-relaxed max-w-xs">
                  A high-integrity asset tracking system built on deterministic logic pathways and brutalist efficiency.
                </p>
              </div>
            </div>
            
            <div className="mt-12 pt-12 border-t border-white/10 text-[10px] font-mono opacity-40 uppercase tracking-widest">
              Core Hub Authentication Required
            </div>
          </div>

          <div className="p-12 flex flex-col justify-center">
            <div className="space-y-12">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-4 bg-slate-900 text-white inline-block px-2 py-1">Personnel Access</h3>
                <p className="text-[10px] uppercase opacity-60 tracking-widest leading-relaxed">
                  Connect your verified personnel account to synchronize state across the distributed logistic network.
                </p>
              </div>

              <button 
                onClick={signIn}
                className="w-full group flex items-center justify-between p-6 border-2 border-slate-900 bg-emerald-500 text-white font-bold neo-brutalism-shadow active-neo-brutalism"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-white border-2 border-slate-900 flex items-center justify-center">
                     <img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4" />
                  </div>
                  <span className="text-xs uppercase tracking-widest">Authorize via Google</span>
                </div>
                <ArrowRight className="w-5 h-5" />
              </button>

              <div className="text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Trouble signing in? <br/>
                  Try <span className="text-blue-600">Opening in New Tab</span> if you're in a frame.
                </p>
              </div>

              <div className="flex items-start gap-4 p-4 bg-slate-50 border-2 border-slate-900">
                <Warehouse className="w-5 h-5 opacity-40 shrink-0" />
                <p className="text-[9px] font-mono uppercase leading-relaxed text-slate-500">
                  SECURE_GATEWAY_V.2 // ESTABLISHING_HANDSHAKE... <br/>
                  READY_FOR_COMMUNICATION
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
