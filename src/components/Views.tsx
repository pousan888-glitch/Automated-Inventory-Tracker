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
  ShieldAlert,
  LayoutGrid,
  List,
  X,
  ArrowRight
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
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);

  useEffect(() => {
    return subscribeToInventory(setItems);
  }, []);

  useEffect(() => {
    return subscribeToLogs(setLogs);
  }, []);

  // ดึงรายชื่อสถานที่ที่มีทั้งหมด (CIPL) และจัดเรียงให้สวยงาม
  const uniqueLocations = Array.from(
    new Set(items.map(i => i.currentLocation).filter(Boolean))
  ).sort() as string[];

  const filtered = items.filter(i => {
    const matchesSearch = 
      i.serialNo.toLowerCase().includes(search.toLowerCase()) || 
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.partNo.toLowerCase().includes(search.toLowerCase());

    const matchesLocation = 
      selectedLocation === 'ALL' || 
      i.currentLocation === selectedLocation;

    return matchesSearch && matchesLocation;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative group flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity" />
          <input 
            type="text" 
            placeholder="Search Serial / Part / Desc..."
            className="pl-12 pr-6 py-4 bg-white border-2 border-slate-900 text-[10px] uppercase tracking-widest focus:outline-none focus:border-blue-600 w-full transition-all font-black"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-4 self-end sm:sm:self-auto">
          <div className="flex items-center gap-2 border-2 border-slate-900 bg-white p-1 neo-brutalism-shadow">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "px-3 py-1.5 text-[9px] uppercase font-black tracking-wider flex items-center gap-1.5 transition-colors",
                viewMode === 'grid' ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-100"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>กรอบเล็ก</span>
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={cn(
                "px-3 py-1.5 text-[9px] uppercase font-black tracking-wider flex items-center gap-1.5 transition-colors",
                viewMode === 'table' ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-100"
              )}
            >
              <List className="w-3.5 h-3.5" />
              <span>ตาราง</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Filter className="w-4 h-4 opacity-40" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Filter_Enabled</span>
          </div>
        </div>
      </div>

      {/* Location Filter Bar extracted from imported CIPL location parameters */}
      <div className="bg-white border-2 border-slate-900 p-4 neo-brutalism-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <span className="text-[9.5px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <MapPin className="w-4 h-4 text-blue-600" />
            สถานที่จัดเก็บ (LOCATION FILTER):
          </span>
          <div className="relative flex-1 max-w-sm sm:max-w-md">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="appearance-none px-4 py-2 pr-10 bg-white border-2 border-slate-900 font-mono text-[10px] font-black uppercase focus:outline-none focus:border-blue-600 transition-colors w-full cursor-pointer h-[38px] rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
            >
              <option value="ALL">★ สรุปทั้งหมดในระบบ (SHOW ALL LOCATIONS)</option>
              {uniqueLocations.map(loc => (
                <option key={loc} value={loc}>
                  {loc.toUpperCase()}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-700 border-l-2 border-slate-900">
              <Filter className="w-3.5 h-3.5" />
            </div>
          </div>
          
          {selectedLocation !== 'ALL' && (
            <button
              onClick={() => setSelectedLocation('ALL')}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border-2 border-slate-900 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-1.5 h-[38px] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>ล้างตัวกรอง</span>
            </button>
          )}
        </div>
        
        <div className="text-left md:text-right shrink-0">
          <span className="text-[8px] uppercase font-black text-slate-400 block tracking-[0.2em] mb-0.5">Matched count</span>
          <span className="text-base font-black font-mono text-slate-800 bg-slate-50 px-2 py-1 border border-slate-200">
            {filtered.length} / {items.length}
          </span>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-900 neo-brutalism-shadow overflow-hidden">
        {viewMode === 'table' ? (
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
                    <td colSpan={6} className="p-24 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-20">
                        <Package className="w-16 h-16" />
                        <p className="text-sm uppercase font-black tracking-widest">Data_Buffer_Empty</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr 
                      key={item.serialNo} 
                      className="hover:bg-slate-100/80 cursor-pointer transition-colors group"
                      onClick={() => setSelectedItem(item)}
                    >
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
                        <div className="flex items-center justify-end gap-3 font-mono font-bold text-slate-400 group-hover:text-slate-900">
                          <span className="text-[8px] font-sans font-black uppercase text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-50 px-2 py-0.5 border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                            ประวัติ ➔
                          </span>
                          <p className="text-[10px] italic">
                            {item.lastUpdate?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} @ {item.lastUpdate?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Small Boxes (กรอบเล็กๆ) Grid view */
          <div className="p-6">
            {filtered.length === 0 ? (
              <div className="p-24 text-center">
                <div className="flex flex-col items-center gap-2 opacity-20">
                  <Package className="w-16 h-16" />
                  <p className="text-sm uppercase font-black tracking-widest">Data_Buffer_Empty</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {filtered.map((item) => (
                  <div 
                    key={item.serialNo}
                    className="bg-white border-2 border-slate-900 p-4 neo-brutalism-shadow hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all flex flex-col justify-between group relative min-h-[160px] cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <div>
                      {/* Header status and location */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border-2 font-black text-[8px] uppercase tracking-tighter ${
                          item.status === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                        }`}>
                          {item.status === 'IN' ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                          {item.status}
                        </span>
                        
                        <div className="flex items-center gap-1 max-w-[60%]">
                          <MapPin className="w-2.5 h-2.5 opacity-30 shrink-0" />
                          <span className="text-[8.5px] uppercase font-black tracking-widest truncate" title={item.currentLocation}>
                            {item.currentLocation}
                          </span>
                        </div>
                      </div>

                      {/* Serial Number (Asset ID) */}
                      <p className="text-[11px] font-black font-mono tracking-tighter text-slate-900 break-all bg-slate-50 border-2 border-slate-900/10 px-2 py-0.5 mb-2 leading-none">
                        {item.serialNo}
                      </p>

                      {/* Description and Part */}
                      <div className="space-y-0.5">
                        <p className="text-[8px] uppercase opacity-50 font-black tracking-tight">{item.partNo || 'NO PART REF'}</p>
                        <p className="text-[9.5px] font-bold tracking-tight uppercase line-clamp-2 leading-tight text-slate-800" title={item.description}>
                          {item.description}
                        </p>
                      </div>
                    </div>

                    {/* Footer entry and timing */}
                    <div className="mt-4 pt-2 border-t-2 border-slate-100 flex flex-col gap-1.5">
                      {item.importEntryNo ? (
                        <div className="flex items-center justify-between text-[8px] gap-2">
                          <span className="font-black text-blue-600 truncate italic">
                            IE: {item.importEntryNo}
                          </span>
                          <span className="font-bold uppercase opacity-45 shrink-0">
                            Line: {item.importEntryLineNo || '-'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[8px] opacity-25 uppercase font-mono italic">
                          No Import Entry
                        </div>
                      )}
                      
                      <div className="text-[8.5px] font-mono font-bold text-slate-400 text-right flex items-center justify-between gap-1 leading-none mt-1">
                        <span className="text-blue-600 font-sans font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity text-[7.5px] tracking-wider shrink-0">
                          ดูประวัติ ➔
                        </span>
                        <span className="text-right">
                          {item.lastUpdate?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} @ {item.lastUpdate?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-slate-900 border-t-2 border-slate-900 flex justify-between px-8">
          <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold tracking-widest">System_Online</span>
          <span className="text-[10px] font-mono uppercase text-white/40 font-bold tracking-widest">Total_Records: {filtered.length}</span>
        </div>
      </div>

      {/* Pop-up Modal to show item transport history trail */}
      {selectedItem && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedItem(null);
            setIsLocationExpanded(false);
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white border-4 border-slate-900 p-6 md:p-8 w-full max-w-5xl neo-brutalism-shadow relative h-[92vh] max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => {
                setSelectedItem(null);
                setIsLocationExpanded(false);
              }}
              className="absolute top-4 right-4 border-2 border-slate-900 bg-white hover:bg-red-500 hover:text-white p-1.5 transition-colors neo-brutalism-shadow active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Heading */}
            <div className="mb-6">
              <span className="text-[9px] uppercase font-black text-blue-600 tracking-widest bg-blue-50 px-2.5 py-1 border-2 border-slate-900 leading-none inline-block mb-2">
                ประวัติการเคลื่อนย้ายสินทรัพย์ (Asset Trail)
              </span>
              <h3 className="text-xl md:text-2xl font-black font-mono tracking-tighter text-slate-900 break-all bg-slate-105 border-2 border-slate-900 px-4 py-2 mt-1">
                {selectedItem.serialNo}
              </h3>
            </div>

            {/* Asset Profile Info Brief */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 border-2 border-slate-900 mb-4 text-xs font-bold uppercase tracking-tight">
              <div className="space-y-1 md:col-span-8">
                <p className="text-[8.5px] text-slate-400 font-black">รายละเอียดสินค้า (Description):</p>
                <p className="text-slate-800 leading-snug">{selectedItem.description || '-'}</p>
              </div>
              <div className="space-y-1 md:col-span-4">
                <p className="text-[8.5px] text-slate-400 font-black">รหัสอ้างอิง (Part No):</p>
                <p className="text-slate-800 font-mono text-[11px]">{selectedItem.partNo || '-'}</p>
              </div>
              <div className="space-y-1 md:col-span-3">
                <p className="text-[8.5px] text-slate-400 font-black">สถานะปัจจุบัน (Status):</p>
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 border-2 font-black text-[9px] leading-normal uppercase ${
                    selectedItem.status === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                  }`}>
                    {selectedItem.status === 'IN' ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                    {selectedItem.status}
                  </span>
                </div>
              </div>
              <div className="space-y-1 md:col-span-9">
                <p className="text-[8.5px] text-slate-400 font-black">ตำแหน่งพิกัดสินค้า (Current Location):</p>
                <div 
                  className={cn(
                    "text-slate-800 flex items-start gap-2 p-1.5 rounded-sm cursor-pointer transition-all border-2 min-h-[34px]",
                    isLocationExpanded 
                      ? "bg-slate-100/40 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]" 
                      : "bg-white border-slate-900/10 hover:border-slate-900"
                  )}
                  onClick={() => setIsLocationExpanded(!isLocationExpanded)}
                  title={isLocationExpanded ? "คลิกเพื่อย่อ" : "คลิกเพื่อดูข้อความเต็ม"}
                >
                  <MapPin className="w-3.5 h-3.5 opacity-50 shrink-0 text-blue-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-[10px] md:text-xs font-black text-slate-800 leading-tight tracking-wide", 
                      isLocationExpanded ? "" : "truncate max-w-full"
                    )}>
                      {selectedItem.currentLocation || '-'}
                    </p>
                    {selectedItem.currentLocation && selectedItem.currentLocation.length > 30 && (
                      <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest mt-1 inline-flex items-center gap-1 leading-none rounded-sm px-1.5 py-0.5 bg-blue-50 border border-blue-200">
                        {isLocationExpanded ? "✖ คลิกเพื่อย่อลง" : "➔ คลิกเพื่อขยายเป็นข้อความเต็ม"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-3 flex items-center gap-2">
              <History className="w-4 h-4 opacity-70" />
              <span>บันทึกการเดินทางเข้าออกคลัง (History Entries)</span>
            </h4>

            {/* Log Entries Viewport List */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 border-2 border-slate-900 bg-slate-50/70 p-4 neo-brutalism-shadow min-h-0">
              {logs.filter(log => log.serialNo?.trim() === selectedItem.serialNo?.trim()).length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-slate-300 bg-white flex flex-col items-center gap-1 justify-center opacity-40">
                  <Clock className="w-10 h-10" />
                  <p className="text-[9.5px] font-black uppercase tracking-widest">No historical sync logs stored</p>
                </div>
              ) : (
                logs
                  .filter(log => log.serialNo?.trim() === selectedItem.serialNo?.trim())
                  .sort((a, b) => {
                    const timeA = a.date?.toDate ? a.date.toDate().getTime() : 0;
                    const timeB = b.date?.toDate ? b.date.toDate().getTime() : 0;
                    return timeB - timeA;
                  })
                  .map((log, index) => (
                    <div 
                      key={index} 
                      className="bg-white border-2 border-slate-900 p-3.5 hover:bg-slate-50 hover:translate-y-[-1px] transition-all relative overflow-hidden flex flex-col md:flex-row md:items-center gap-2 md:gap-4 neo-brutalism-shadow-sm min-h-[55px]"
                    >
                      {/* Left vertical status indicator strip */}
                      <div className={`w-1.5 h-full absolute left-0 top-0 ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      
                      {/* Responsive Grid Layout for Info Fields */}
                      <div className="pl-3 flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center">
                        
                        {/* Transaction Status (col-span-2) */}
                        <div className="md:col-span-2 flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border border-slate-900 font-black text-[8px] uppercase tracking-tighter ${
                            log.transactionType === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                          }`}>
                            {log.transactionType}
                          </span>
                          <span className="text-[9.5px] font-mono font-bold text-slate-800 md:hidden">
                            {log.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                          </span>
                        </div>

                        {/* Date (col-span-2) */}
                        <div className="hidden md:block md:col-span-2 leading-tight">
                          <p className="text-[10px] font-mono font-black text-slate-800">
                            {log.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-[8.5px] font-mono text-slate-400 font-bold mt-0.5">
                            {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </p>
                        </div>

                        {/* Routing Path (col-span-5) */}
                        <div className="md:col-span-5 flex items-center gap-1.5 min-w-0 bg-slate-50 px-2 py-1 border border-slate-200 rounded-sm">
                          <span className="truncate text-slate-800 font-black text-[9px] max-w-[44%] leading-none" title={log.origin}>
                            {log.origin}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-40 shrink-0">
                            <span className="w-1 h-1 bg-slate-900 rounded-full" />
                            <ArrowRight className="w-3 h-3 text-slate-900" />
                          </div>
                          <span className="truncate text-blue-600 font-black text-[9px] max-w-[44%] leading-none" title={log.destination}>
                            {log.destination}
                          </span>
                        </div>

                        {/* Invoice & Imports details (col-span-3) */}
                        <div className="md:col-span-3 flex md:flex-row justify-between items-center md:items-center gap-1.5 text-right mt-1.5 md:mt-0">
                          <div className="text-left md:text-right">
                            <p className="text-[7px] uppercase text-slate-400 font-black leading-none">Invoice</p>
                            <p className="text-[9px] font-mono font-bold text-slate-700 leading-normal">#{log.invoiceNo}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[7px] uppercase text-slate-400 font-black leading-none">Import Entry</p>
                            <p className="text-[9px] font-bold text-blue-600 italic leading-normal">
                              {log.importEntryNo || 'N/A'} {log.importEntryLineNo ? `(L:${log.importEntryLineNo})` : ''}
                            </p>
                          </div>
                        </div>

                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="mt-6 pt-4 border-t-2 border-slate-100 flex justify-end">
              <button 
                onClick={() => {
                  setSelectedItem(null);
                  setIsLocationExpanded(false);
                }}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest transition-colors neo-brutalism-shadow active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export function TransactionHistory() {
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    return subscribeToLogs(setLogs);
  }, []);

  const filteredLogs = logs.filter(log => {
    if (!log.date) return true;
    const logDate = log.date.toDate();
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (logDate < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (logDate > end) return false;
    }
    
    return true;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
          <History className="w-4 h-4 opacity-70" />
          <span>บันทึกประวัติการเดินระบบ</span>
        </h3>
        
        <div className="flex items-center gap-2 border-2 border-slate-900 bg-white p-1 neo-brutalism-shadow">
          <button 
            onClick={() => setViewMode('grid')}
            className={cn(
              "px-3 py-1.5 text-[9px] uppercase font-black tracking-wider flex items-center gap-1.5 transition-colors",
              viewMode === 'grid' ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-100"
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>กรอบเล็ก</span>
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "px-3 py-1.5 text-[9px] uppercase font-black tracking-wider flex items-center gap-1.5 transition-colors",
              viewMode === 'list' ? "bg-slate-900 text-white" : "text-slate-900 hover:bg-slate-100"
            )}
          >
            <List className="w-3.5 h-3.5" />
            <span>รายการยาว</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white border-2 border-slate-900 p-4 neo-brutalism-shadow flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center flex-1">
          <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
            <span className="text-[9px] uppercase font-black tracking-[0.15em] text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-slate-900 rounded-full"></span>
              เริ่มต้น (Start Date)
            </span>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 bg-white border-2 border-slate-900 font-mono text-xs font-black uppercase focus:outline-none focus:border-blue-600 transition-colors w-full h-[38px]"
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
            <span className="text-[9px] uppercase font-black tracking-[0.15em] text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
              สิ้นสุด (End Date)
            </span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 bg-white border-2 border-slate-900 font-mono text-xs font-black uppercase focus:outline-none focus:border-blue-600 transition-colors w-full h-[38px]"
            />
          </div>

          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 self-start md:self-auto bg-red-50 hover:bg-red-100 text-red-600 border-2 border-red-650 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-1.5 h-[38px] md:mt-[18px] neo-brutalism-shadow-sm active:translate-x-0.5 active:translate-y-0.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>ล้างการกรอง</span>
            </button>
          )}
        </div>

        <div className="text-left md:text-right shrink-0">
          <span className="text-[8px] uppercase font-black text-slate-400 block tracking-[0.2em] mb-0.5">Matched Records</span>
          <span className="text-base font-black font-mono text-slate-800 bg-slate-50 px-2 py-1 border border-slate-200">
            {filteredLogs.length} / {logs.length}
          </span>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center gap-2 justify-center opacity-40">
              <History className="w-12 h-12 text-slate-600" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-800">ไม่พบประวัติในช่วงวันที่ระบุ</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.4) }}
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
            ))
          )}
        </div>
      ) : (
        /* Small boxes (กรอบเล็กๆ) Grid View for logs */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredLogs.length === 0 ? (
            <div className="col-span-full p-16 text-center border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center gap-2 justify-center opacity-40 w-full">
              <History className="w-12 h-12 text-slate-600" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-800">ไม่พบประวัติในช่วงวันที่ระบุ</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.4) }}
                key={`${log.serialNo}-${idx}`}
                className="bg-white border-2 border-slate-900 p-4 neo-brutalism-shadow hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all flex flex-col justify-between group relative min-h-[175px] overflow-hidden"
              >
                {/* Left accent bar */}
                <div className={`w-1.5 h-full absolute left-0 top-0 ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                
                <div className="pl-1.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Date & Badge */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <div className="flex flex-col text-[8px] font-mono leading-none">
                        <span className="font-black text-slate-800">
                          {log.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                        </span>
                        <span className="opacity-45 mt-0.5">
                          {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      </div>

                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 border-2 font-black text-[8px] uppercase tracking-tighter ${
                        log.transactionType === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                      }`}>
                        {log.transactionType}
                      </span>
                    </div>

                    {/* Invoice Ref */}
                    <div className="mb-2">
                      <p className="text-[7.5px] uppercase font-black text-slate-400 tracking-widest leading-none">Invoice Ref</p>
                      <p className="text-[10px] font-black font-mono break-all text-slate-700 leading-normal">#{log.invoiceNo}</p>
                    </div>

                    {/* Asset ID */}
                    <div className="mb-2">
                      <p className="text-[7.5px] uppercase font-black text-slate-400 tracking-widest leading-none">Asset ID</p>
                      <p className="text-[10px] font-black font-mono break-all text-blue-900 bg-blue-50/50 p-1 border border-blue-100 mt-0.5 leading-snug">
                        {log.serialNo}
                      </p>
                    </div>

                    {/* Routing Address */}
                    <div className="mb-2">
                      <p className="text-[7.5px] uppercase font-black text-slate-400 tracking-widest leading-none mb-1">Route</p>
                      <div className="flex items-center justify-between text-[8px] font-black gap-1">
                        <span className="truncate max-w-[45%] text-slate-700" title={log.origin}>{log.origin}</span>
                        <ArrowUpRight className="w-2.5 h-2.5 opacity-30 shrink-0" />
                        <span className="truncate max-w-[45%] text-blue-600" title={log.destination}>{log.destination}</span>
                      </div>
                    </div>
                  </div>

                  {/* Import Entry & Line */}
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[8px]">
                    <span className="font-bold text-slate-400 uppercase tracking-tight">Import Entry</span>
                    {log.importEntryNo ? (
                      <span className="font-black text-blue-600 truncate italic max-w-[70%]" title={log.importEntryNo}>
                        {log.importEntryNo} (L:{log.importEntryLineNo || '-'})
                      </span>
                    ) : (
                      <span className="opacity-30 italic">N/A</span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<TransactionLog | null>(null);

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
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 border border-slate-200">
              คลิกเพื่อดูรายละเอียดรอบงาน (Click to Inspect)
            </span>
          </div>
          <div className="space-y-4">
            {logs.slice(0, 5).map((log, idx) => (
              <div 
                key={idx} 
                onClick={() => setSelectedLog(log)}
                className="bg-white border-2 border-slate-900 p-6 flex items-center justify-between hover:bg-slate-50 hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all cursor-pointer group rounded-none"
              >
                <div className="flex items-center gap-8">
                  <div className={cn(
                    "w-12 h-12 border-2 border-slate-900 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    log.transactionType === 'IN' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {log.transactionType === 'IN' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-tighter italic overflow-hidden">Asset_#{log.serialNo} routed to {log.destination}</p>
                    <p className="text-[9px] uppercase opacity-40 font-black mt-1 font-mono">Invoice: {log.invoiceNo} • ADDR: {log.date?.toDate().toLocaleTimeString()}</p>
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

      {/* Pop-up modal details for selected log, showing associated/co-processed invoice batch records */}
      {selectedLog && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedLog(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white border-4 border-slate-900 p-6 md:p-8 w-full max-w-5xl neo-brutalism-shadow relative h-[92vh] max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 border-2 border-slate-900 bg-white hover:bg-red-500 hover:text-white p-1.5 transition-colors neo-brutalism-shadow active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Heading */}
            <div className="mb-6">
              <span className="text-[9px] uppercase font-black text-blue-600 tracking-widest bg-blue-50 px-2.5 py-1 border-2 border-slate-900 leading-none inline-block mb-2">
                รายละเอียดรอบกิจกรรมระบบ (Activity Cycle Detail)
              </span>
              <h3 className="text-xl md:text-2xl font-black font-mono tracking-tighter text-slate-900 break-all bg-slate-50 border-2 border-slate-900 px-4 py-2 mt-1">
                INVOICE / BILL REF: #{selectedLog.invoiceNo}
              </h3>
            </div>

            {/* Primary Log Details Segment */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 border-2 border-slate-900 mb-4 text-xs font-bold uppercase tracking-tight">
              <div className="space-y-1">
                <p className="text-[8.5px] text-slate-400 font-black">เลขคุมสินทรัพย์ (Selected Asset):</p>
                <p className="text-slate-800 font-mono text-xs leading-snug font-black">{selectedLog.serialNo}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[8.5px] text-slate-400 font-black">ประเภทรายการ (Type):</p>
                <div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 border-2 font-black text-[9px] uppercase tracking-tighter ${
                    selectedLog.transactionType === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                  }`}>
                    {selectedLog.transactionType}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[8.5px] text-slate-400 font-black">เวลาทำรายการ (Timestamp):</p>
                <p className="text-slate-800 font-mono text-[10px] leading-snug">
                  {selectedLog.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}<br />
                  @ {selectedLog.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[8.5px] text-slate-400 font-black">ใบขนขาเข้า (Import Entry):</p>
                <p className="font-bold text-blue-600 italic text-[11px] leading-snug">
                  {selectedLog.importEntryNo || 'N/A'}<br />
                  {selectedLog.importEntryLineNo ? `(LINE: ${selectedLog.importEntryLineNo})` : ''}
                </p>
              </div>
            </div>

            {/* Related items header */}
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <History className="w-4 h-4 opacity-70" />
                <span>สินทรัพย์ที่นำเข้า-ส่งออกในวงงานรอบเดียวกัน (Items in this Shipment Batch)</span>
              </span>
              <span className="bg-slate-900 text-white px-2.5 py-0.5 text-[9px] font-mono font-black border-2 border-slate-900">
                {logs.filter(l => l.invoiceNo === selectedLog.invoiceNo).length} ITEMS
              </span>
            </h4>

            {/* Co-invoice batch records list viewport */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 border-2 border-slate-900 bg-slate-50/70 p-4 neo-brutalism-shadow min-h-0">
              {logs
                .filter(l => l.invoiceNo === selectedLog.invoiceNo)
                .map((log, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      "bg-white border-2 border-slate-900 p-3.5 transition-all relative overflow-hidden flex flex-col md:flex-row md:items-center gap-2 md:gap-4",
                      log.serialNo === selectedLog.serialNo ? "border-blue-600 ring-2 ring-blue-600/30 bg-blue-50/10" : "neo-brutalism-shadow-sm"
                    )}
                  >
                    {/* Left vertical status indicator strip */}
                    <div className={`w-1.5 h-full absolute left-0 top-0 ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    
                    {/* Responsive Grid Layout for Info Fields */}
                    <div className="pl-3 flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center">
                      
                      {/* Asset ID (col-span-4) */}
                      <div className="md:col-span-4 flex flex-col">
                        <span className="text-[7.5px] uppercase text-slate-400 font-black leading-none mb-0.5">Asset ID</span>
                        <span className="text-xs font-black font-mono tracking-tight text-slate-800 truncate" title={log.serialNo}>
                          {log.serialNo}
                        </span>
                      </div>

                      {/* Transaction Status (col-span-2) */}
                      <div className="md:col-span-2 flex items-center">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border border-slate-900 font-black text-[8px] uppercase tracking-tighter ${
                          log.transactionType === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                        }`}>
                          {log.transactionType}
                        </span>
                      </div>

                      {/* Routing Path (col-span-6) */}
                      <div className="md:col-span-6 flex items-center justify-between gap-1.5 min-w-0 bg-slate-50 px-2 py-1.5 border border-slate-200">
                        <div className="flex-1 min-w-0">
                          <span className="text-[7.5px] uppercase text-slate-400 font-black leading-none block mb-0.5">Route Range</span>
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-slate-700 font-black text-[9px] max-w-[45%]" title={log.origin}>
                              {log.origin}
                            </span>
                            <div className="flex items-center gap-0.5 opacity-40 shrink-0">
                              <span className="w-1 h-1 bg-slate-900 rounded-full" />
                              <ArrowRight className="w-3.5 h-3.5 text-slate-900" />
                            </div>
                            <span className="truncate text-blue-600 font-black text-[9px] max-w-[45%]" title={log.destination}>
                              {log.destination}
                            </span>
                          </div>
                        </div>
                        
                        {/* Time indicator */}
                        <div className="text-right shrink-0 border-l border-slate-200 pl-2">
                          <p className="text-[7px] uppercase text-slate-400 font-black leading-none mb-0.5">Time</p>
                          <p className="text-[9px] font-mono font-bold text-slate-700 leading-none">
                            {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
            </div>

            {/* Close Button Panel */}
            <div className="mt-5 flex justify-end gap-3 pt-4 border-t-2 border-slate-100 shrink-0">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-850 text-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer neo-brutalism-shadow active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              >
                ปิดหน้าต่าง
              </button>
            </div>

          </motion.div>
        </div>
      )}

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

