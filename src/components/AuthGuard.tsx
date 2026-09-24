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
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
        {/* iOS Ambient Light Blobs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-10 left-10 w-[32rem] h-[32rem] bg-blue-500/15 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-[36rem] h-[36rem] bg-indigo-500/15 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[28rem] h-[28rem] bg-sky-400/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-2xl overflow-hidden relative z-10">
          {/* Left / Top Banner with sapphire-indigo liquid gradient */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-8 sm:p-12 flex flex-col justify-between text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 rounded-xl bg-blue-500/30 border border-white/30 backdrop-blur-md flex items-center justify-center shadow-lg">
                  <Package className="w-5 h-5 text-blue-300" />
                </div>
                <h1 className="text-xl font-bold tracking-tight">LogiTrack <span className="text-blue-400">Pro</span></h1>
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                  Intelligent <br/>
                  <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-200 bg-clip-text text-transparent">
                    Inventory.
                  </span>
                </h2>
                <p className="text-xs tracking-wide text-slate-300/80 leading-relaxed max-w-xs font-normal">
                  ระบบบริหารและติดตามสต็อกสินค้าแบบเรียลไทม์ พร้อมการวิเคราะห์และตรวจสอบเอกสารด้วย AI
                </p>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10 text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Secure Cloud Infrastructure
            </div>
          </div>

          {/* Right / Bottom Action */}
          <div className="p-8 sm:p-12 flex flex-col justify-center bg-white/50 backdrop-blur-xl">
            <div className="space-y-8">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 inline-block mb-3">
                  เข้าสู่ระบบ
                </span>
                <h3 className="text-xl font-bold text-slate-900">Personnel Access</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  เข้าสู่ระบบด้วยบัญชี Google เพื่อเข้าถึงคลังสินค้าและซิงค์ข้อมูล
                </p>
              </div>

              <button 
                onClick={signIn}
                className="w-full group flex items-center justify-between p-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.1)] active:scale-[0.98] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200/60 shadow-inner">
                     <img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold tracking-wide text-slate-800">เข้าสู่ระบบด้วย Google</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>

              <div className="text-center">
                <p className="text-[11px] text-slate-400 font-medium">
                  หากเปิดใน iframe แล้วติดปัญหาการยืนยันตัวตน <br/>
                  สามารถลอง <span className="text-blue-600 font-semibold">เปิดในแท็บใหม่ (New Tab)</span>
                </p>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-100/70 border border-slate-200/60 backdrop-blur-sm">
                <Warehouse className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                  FIREBASE_FIRESTORE_V1 // ENCRYPTED_CHANNEL<br/>
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
