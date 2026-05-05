import React, { useEffect, useState } from 'react';
import { 
  Package, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  MapPin, 
  Search,
  Filter,
  Activity,
  History,
  CircleAlert,
  Database,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { 
  subscribeToInventory, 
  subscribeToLogs, 
  InventoryItem, 
  TransactionLog,
  wipeAllData 
} from '../lib/inventoryService';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { HoldToConfirmButton } from './HoldToConfirmButton';

export function InventoryList() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    return subscribeToInventory(setItems);
  }, []);

  const filtered = items.filter(i => 
    i.serialNo.toLowerCase().includes(search.toLowerCase()) || 
    i.description.toLowerCase().includes(search.toLowerCase()) ||
    i.partNo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity" />
          <input 
            type="text" 
            placeholder="Search Serial / Part / Desc..."
            className="pl-12 pr-6 py-4 bg-white border-2 border-slate-900 text-[10px] uppercase tracking-widest focus:outline-none focus:border-blue-600 w-64 md:w-96 transition-all font-black"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 opacity-40" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Filter_Enabled</span>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-900 neo-brutalism-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white border-b-2 border-slate-900">
                <th className="px-8 py-5 text-[10px] uppercase font-black tracking-widest">Status</th>
                <th className="px-8 py-5 text-[10px] uppercase font-black tracking-widest">Serial No</th>
                <th className="px-8 py-5 text-[10px] uppercase font-black tracking-widest">Part Reference</th>
                <th className="px-8 py-5 text-[10px] uppercase font-black tracking-widest">Import Entry</th>
                <th className="px-8 py-5 text-[10px] uppercase font-black tracking-widest">Location</th>
                <th className="px-8 py-5 text-[10px] uppercase font-black tracking-widest text-right">Commit Time</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-24 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-20">
                      <Package className="w-16 h-16" />
                      <p className="text-sm uppercase font-black tracking-widest">Data_Buffer_Empty</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.serialNo} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-5">
                      <span className={`inline-flex items-center gap-2 px-3 py-1 border-2 font-black text-[9px] uppercase tracking-tighter ${
                        item.status === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                      }`}>
                        {item.status === 'IN' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {item.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-xs font-black font-mono tracking-tighter text-slate-900">
                      {item.serialNo}
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[9px] uppercase opacity-40 font-black mb-1">{item.partNo}</p>
                      <p className="text-[11px] font-bold tracking-tight uppercase truncate max-w-[200px]">{item.description}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-black text-blue-600 tracking-tighter italic">{item.importEntryNo || 'N/A'}</p>
                      <p className="text-[9px] font-bold uppercase opacity-30 tracking-widest">Line {item.importEntryLineNo || '-'}</p>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3 h-3 opacity-20" />
                        <span className="text-[10px] uppercase font-black tracking-widest">{item.currentLocation}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <p className="text-[10px] font-mono font-bold italic">
                        {item.lastUpdate?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} @ {item.lastUpdate?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-slate-900 border-t-2 border-slate-900 flex justify-between px-8">
           <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold tracking-widest">System_Online</span>
          <span className="text-[10px] font-mono uppercase text-white/40 font-bold tracking-widest">Total_Records: {filtered.length}</span>
        </div>
      </div>
    </div>
  );
}

export function TransactionHistory() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  useEffect(() => {
    return subscribeToLogs(setLogs);
  }, []);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {logs.map((log, idx) => (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={`${log.serialNo}-${idx}`}
            className="bg-white border-2 border-slate-900 p-8 flex items-center gap-12 neo-brutalism-shadow active-neo-brutalism relative overflow-hidden group"
          >
            <div className={`w-2 h-full absolute left-0 top-0 ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            
            <div className="shrink-0 flex flex-col items-center gap-1 w-24">
              <span className="text-[11px] font-mono font-black italic">
                {log.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
              </span>
              <span className="text-[9px] uppercase font-black opacity-30 mt-1">
                {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div className="w-64 shrink-0">
              <p className="text-[9px] uppercase font-black text-slate-400 mb-2 tracking-widest">Invoice Ref</p>
              <p className="text-xs font-black font-mono">#{log.invoiceNo}</p>
            </div>

            <div className="flex-1 grid grid-cols-4 gap-12">
              <div className="border-l-2 border-slate-100 pl-8">
                <p className="text-[9px] uppercase font-black text-slate-400 mb-2 tracking-widest">Asset ID</p>
                <p className="text-xs font-black font-mono tracking-tighter">{log.serialNo}</p>
              </div>
              <div className="col-span-2 border-l-2 border-slate-100 pl-8">
                <p className="text-[9px] uppercase font-black text-slate-400 mb-2 tracking-widest">Geographic Routing</p>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] uppercase font-black truncate max-w-[140px]">{log.origin}</span>
                  <div className="flex items-center gap-1 opacity-20">
                    <div className="w-1 h-1 bg-slate-900" />
                    <div className="w-12 h-[2px] bg-slate-900" />
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] uppercase font-black truncate max-w-[140px] text-blue-600">{log.destination}</span>
                </div>
              </div>
              <div className="border-l-2 border-slate-100 pl-8">
                <p className="text-[9px] uppercase font-black text-slate-400 mb-2 tracking-widest">Import Entry</p>
                <p className="text-[11px] font-black italic text-blue-600">{log.importEntryNo || 'N/A'}</p>
                <p className="text-[9px] font-bold uppercase opacity-30 tracking-widest">Line {log.importEntryLineNo || '-'}</p>
              </div>
            </div>

            <div className={cn(
              "shrink-0 w-24 h-24 border-2 border-slate-900 flex flex-col items-center justify-center gap-1",
              log.transactionType === 'IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            )}>
              {log.transactionType === 'IN' ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
              <span className="text-[10px] font-black uppercase tracking-tighter">{log.transactionType}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<TransactionLog[]>([]);

  useEffect(() => {
    const unsub1 = subscribeToInventory(setItems);
    const unsub2 = subscribeToLogs(setLogs);
    return () => { unsub1(); unsub2(); };
  }, []);

  const totalIn = items.filter(i => i.status === 'IN').length;
  const totalOut = items.filter(i => i.status === 'OUT').length;
  
  const stats = [
    { label: 'Master Assets', value: items.length, icon: Package },
    { label: 'Base Stock', value: totalIn, icon: ArrowDownLeft, color: 'text-emerald-600' },
    { label: 'Deployed', value: totalOut, icon: ArrowUpRight, color: 'text-red-600' },
    { label: 'Recent Cycles', value: logs.length, icon: Activity, trend: 'ONLINE' },
  ];

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white border-4 border-slate-900 p-8 neo-brutalism-shadow group">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 border-2 border-slate-900 bg-slate-50 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <stat.icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-40">{stat.label}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-5xl font-black font-mono tracking-tighter italic">{stat.value}</span>
              {stat.trend && (
                <span className="text-[9px] uppercase font-black p-1 border-2 border-slate-900 bg-emerald-50 text-emerald-600">{stat.trend}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
              <span className="w-2 h-2 bg-slate-900"></span>
              Synchronous Activity Stream
            </h3>
            <button className="text-[10px] uppercase font-black tracking-widest text-blue-600 hover:underline">Commit History</button>
          </div>
          <div className="space-y-4">
            {logs.slice(0, 5).map((log, idx) => (
              <div key={idx} className="bg-white border-2 border-slate-900 p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-8">
                  <div className={cn(
                    "w-12 h-12 border-2 border-slate-900 flex items-center justify-center shrink-0",
                    log.transactionType === 'IN' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {log.transactionType === 'IN' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-tighter italic overflow-hidden">Asset_#{log.serialNo} routed to {log.destination}</p>
                    <p className="text-[9px] uppercase opacity-40 font-black mt-1 font-mono">IX: {log.invoiceNo} • ADDR: {log.date?.toDate().toLocaleTimeString()}</p>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-mono font-black italic opacity-40 uppercase tracking-widest">{log.transactionType}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 text-white p-10 border-4 border-slate-900 neo-brutalism-shadow relative overflow-hidden h-full">
            <div className="relative z-10 space-y-8">
              <div className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-emerald-400" />
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Core Status</h4>
              </div>
              <h4 className="text-2xl font-black leading-tight uppercase italic scale-y-110 origin-left">
                All systems <br/>Stabilized. <br/>Flow optimized.
              </h4>
              <div className="w-full h-1 bg-white/10" />
              <p className="text-[10px] opacity-60 leading-relaxed uppercase font-black tracking-widest">
                Distributed ledger sync complete. <br/>
                Wait_State: Idle.
              </p>
            </div>
            <Package className="absolute -right-20 -bottom-20 w-80 h-80 opacity-5 -rotate-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsView() {
  return (
    <div className="space-y-12">
      <div className="border-b-4 border-slate-900 pb-8">
        <h2 className="text-4xl font-black uppercase tracking-tighter italic">System Configuration</h2>
        <p className="text-xs font-bold uppercase tracking-widest opacity-40 mt-2">Administrative Control & Global State Management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-8">
          <div className="flex items-center gap-4 text-blue-600">
            <ShieldAlert className="w-8 h-8" />
            <h3 className="text-xl font-black uppercase tracking-tight">Danger Zone</h3>
          </div>
          
          <div className="p-8 border-4 border-slate-900 bg-red-50 space-y-8 neo-brutalism-shadow">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-red-600" />
                <h4 className="text-sm font-black uppercase tracking-widest text-red-600">Inventory Wipe</h4>
              </div>
              <p className="text-[10px] uppercase font-bold leading-relaxed text-slate-500 max-w-sm">
                Irreversibly delete all master inventory records. This action does not affect transaction logs but will leave the base stock at zero.
              </p>
              <HoldToConfirmButton 
                label="Clear Inventory"
                subLabel="Hold for 3 seconds to confirm"
                onConfirm={() => wipeAllData('inventory')}
                className="w-full bg-white text-red-600 border-red-600"
              />
            </div>

            <div className="w-full h-px bg-red-200" />

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-red-600" />
                <h4 className="text-sm font-black uppercase tracking-widest text-red-600">Journal Wipe</h4>
              </div>
              <p className="text-[10px] uppercase font-bold leading-relaxed text-slate-500 max-w-sm">
                Clear all transaction logs and movement history. Master inventory state will remain intact, but audit trails will be lost.
              </p>
              <HoldToConfirmButton 
                label="Clear Activity Logs"
                subLabel="Hold for 3 seconds to confirm"
                onConfirm={() => wipeAllData('logs')}
                className="w-full bg-white text-red-600 border-red-600"
              />
            </div>

            <div className="w-full h-px bg-red-200" />

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Trash2 className="w-5 h-5 text-red-900" />
                <h4 className="text-sm font-black uppercase tracking-widest text-red-900">Total System Reset</h4>
              </div>
              <p className="text-[10px] uppercase font-bold leading-relaxed text-slate-400 max-w-sm">
                Full factory reset. Deletes all inventory and logs. This cannot be undone.
              </p>
              <HoldToConfirmButton 
                label="Factory Wipe"
                subLabel="Hold for 3 seconds to confirm total reset"
                onConfirm={() => wipeAllData('all')}
                className="w-full bg-slate-900 text-white"
              />
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="flex items-center gap-4 text-slate-400">
            <Activity className="w-8 h-8" />
            <h3 className="text-xl font-black uppercase tracking-tight">System Info</h3>
          </div>
          
          <div className="p-8 border-4 border-slate-900 bg-white space-y-6 neo-brutalism-shadow">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase opacity-30">Node_Identifier</label>
              <p className="text-sm font-mono font-bold">AIS-PRODUCTION-NODE-851323226653</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase opacity-30">Status</label>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse border border-slate-900" />
                <p className="text-sm font-mono font-bold">STABLE_ONLINE</p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase opacity-30">Protocol</label>
              <p className="text-sm font-mono font-bold italic">HTTPS_SECURE_WSS</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

