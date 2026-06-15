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
  ArrowRight,
  Download,
  CheckSquare,
  Square,
  Save,
  Check,
  Upload,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { 
  subscribeToInventory, 
  subscribeToLogs, 
  InventoryItem, 
  TransactionLog,
  wipeAllData,
  updateInventoryItem,
  importMasterInventory,
  addManualInventoryItem,
  getDisplaySerial
} from '../lib/inventoryService';
import * as XLSX from 'xlsx';
import { exportItemsToExcel, exportLogsToExcel, generateItemsTSV } from '../lib/exportUtils';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { HoldToConfirmButton } from './HoldToConfirmButton';

export function InventoryList() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedSegment, setSelectedSegment] = useState<string>('ALL');
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [tempItem, setTempItem] = useState<InventoryItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [modalTab, setModalTab] = useState<'profile' | 'history'>('profile');
  const [copyNotification, setCopyNotification] = useState<string | null>(null);

  // Manual Add Item States
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualItem, setManualItem] = useState<Partial<InventoryItem>>({
    serialNo: '',
    partNo: '',
    description: '',
    status: 'IN',
    currentLocation: 'In-Base',
    coo: '',
    hsCode: '',
    eccn: '',
    qty: 1,
    uom: 'EA',
    unitPrice: 0,
    amount: 0,
    itemWeight: '',
    meaningInThai: '',
    dimension: '',
    package: '',
    customEntry: '',
    vessel: '',
    segment: '',
    ibase: '',
    remark: '',
    lineItem: '',
    invoiceNo: '',
    customsStatus: ''
  });
  const [isManualSaving, setIsManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [autofillFeedback, setAutofillFeedback] = useState<string | null>(null);
  const [activeSuggestionField, setActiveSuggestionField] = useState<'serial' | 'part' | 'desc' | null>(null);

  // Helper to get suggestions based on user input
  const getSerialSuggestions = (val: string) => {
    if (!val || val.trim().length < 2) return [];
    const searchVal = val.trim().toUpperCase();
    const matches: InventoryItem[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.serialNo && item.serialNo.toUpperCase().includes(searchVal)) {
        const canonical = item.serialNo.trim().toUpperCase();
        if (!seen.has(canonical)) {
          seen.add(canonical);
          matches.push(item);
          if (matches.length >= 6) break;
        }
      }
    }
    return matches;
  };

  const getPartSuggestions = (val: string) => {
    if (!val || val.trim().length < 2) return [];
    const searchVal = val.trim().toUpperCase();
    const matches: InventoryItem[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.partNo && item.partNo.toUpperCase().includes(searchVal)) {
        const canonical = item.partNo.trim().toUpperCase();
        if (!seen.has(canonical)) {
          seen.add(canonical);
          matches.push(item);
          if (matches.length >= 6) break;
        }
      }
    }
    return matches;
  };

  const getDescSuggestions = (val: string) => {
    if (!val || val.trim().length < 2) return [];
    const searchVal = val.trim().toUpperCase();
    const matches: InventoryItem[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (item.description && item.description.toUpperCase().includes(searchVal)) {
        const key = `${(item.description || '').trim().toUpperCase()}_${(item.partNo || '').trim().toUpperCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(item);
          if (matches.length >= 6) break;
        }
      }
    }
    return matches;
  };

  const applyTemplate = (selected: InventoryItem, sourceField: string) => {
    setManualItem(prev => {
      const updatedPrice = selected.unitPrice !== undefined ? Number(selected.unitPrice) : prev.unitPrice || 0;
      const updatedQty = prev.qty !== undefined ? Number(prev.qty) : 1;
      return {
        ...prev,
        serialNo: sourceField === 'serial' ? (selected.serialNo || prev.serialNo) : prev.serialNo,
        partNo: selected.partNo || prev.partNo,
        description: selected.description || prev.description,
        coo: selected.coo || prev.coo,
        hsCode: selected.hsCode || prev.hsCode,
        eccn: selected.eccn || prev.eccn,
        uom: selected.uom || prev.uom,
        unitPrice: updatedPrice,
        amount: updatedPrice * updatedQty,
        itemWeight: selected.itemWeight || prev.itemWeight,
        meaningInThai: selected.meaningInThai || prev.meaningInThai,
        dimension: selected.dimension || prev.dimension,
        package: selected.package || prev.package,
        segment: selected.segment || prev.segment,
        ibase: selected.ibase || prev.ibase,
        customsStatus: selected.customsStatus || prev.customsStatus,
        currentLocation: selected.currentLocation || prev.currentLocation,
        customEntry: selected.customEntry || prev.customEntry || selected.importEntryNo,
        importEntryNo: selected.importEntryNo || prev.importEntryNo || selected.customEntry,
        importEntryLineNo: selected.importEntryLineNo || prev.importEntryLineNo || selected.lineItem,
        lineItem: selected.lineItem || prev.lineItem || selected.importEntryLineNo,
        inboundDate: selected.inboundDate || prev.inboundDate,
        vessel: selected.vessel || prev.vessel,
        remark: selected.remark || prev.remark,
      };
    });
    setAutofillFeedback(`ดึงข้อมูลอัตโนมัติจากสินค้าต้นแบบสำเร็จ! (จากฟิลด์ ${sourceField === 'serial' ? 'S/N' : sourceField === 'part' ? 'Part Ref' : 'Description'})`);
    setActiveSuggestionField(null);
    setTimeout(() => {
      setAutofillFeedback(null);
    }, 4000);
  };


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

  // ดึงรายชื่อ Segment ทั้งหมดที่มี และจัดเรียงให้สวยงาม
  const uniqueSegments = Array.from(
    new Set(items.map(i => i.segment).filter(Boolean))
  ).sort() as string[];

  const filtered = items.filter(i => {
    const matchesSearch = 
      i.serialNo.toLowerCase().includes(search.toLowerCase()) || 
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.partNo.toLowerCase().includes(search.toLowerCase()) ||
      (i.invoiceNo || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.customEntry || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.customsStatus || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.ibase || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.segment || '').toLowerCase().includes(search.toLowerCase());

    const matchesLocation = 
      selectedLocation === 'ALL' || 
      i.currentLocation === selectedLocation;

    const matchesSegment =
      selectedSegment === 'ALL' ||
      i.segment === selectedSegment;

    return matchesSearch && matchesLocation && matchesSegment;
  });

  const toggleSelect = (serialNo: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); // prevent opening details popup when checkbox clicked
    setSelectedSerials(prev => {
      if (prev.includes(serialNo)) {
        return prev.filter(s => s !== serialNo);
      } else {
        return [...prev, serialNo];
      }
    });
  };

  const toggleSelectAll = () => {
    const filteredSerials = filtered.map(i => i.serialNo);
    const allFilteredAreSelected = filteredSerials.every(serialNo => selectedSerials.includes(serialNo));

    if (allFilteredAreSelected) {
      // Unselect all of the filtered items
      setSelectedSerials(prev => prev.filter(serialNo => !filteredSerials.includes(serialNo)));
    } else {
      // Add all filtered items to selection
      setSelectedSerials(prev => {
        const union = new Set([...prev, ...filteredSerials]);
        return Array.from(union);
      });
    }
  };

  const allFilteredAreSelected = filtered.length > 0 && filtered.every(i => selectedSerials.includes(i.serialNo));
  const someFilteredAreSelected = filtered.length > 0 && filtered.some(i => selectedSerials.includes(i.serialNo)) && !allFilteredAreSelected;

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setTempItem({ ...item });
    setSaveSuccess(false);
    setModalTab('profile');
  };

  const handleSaveItem = async () => {
    if (!tempItem) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await updateInventoryItem(tempItem);
      setSaveSuccess(true);
      // Automatically clear save notice after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving item configuration profile: ", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveManualItem = async () => {
    const serialUpper = (manualItem.serialNo || '').trim().toUpperCase();
    if (serialUpper && serialUpper !== 'N/A') {
      const exists = items.some(item => item.serialNo.toUpperCase() === serialUpper);
      if (exists) {
        setManualError(`ไม่สามารถบันทึกได้เนื่องจากซีเรียลหมายเลข "${manualItem.serialNo}" มีอยู่ในระบบแล้ว`);
        return;
      }
    }

    setIsManualSaving(true);
    setManualError(null);
    try {
      await addManualInventoryItem(manualItem);
      setIsManualAddOpen(false);
      setManualItem({
        serialNo: '',
        partNo: '',
        description: '',
        status: 'IN',
        currentLocation: 'In-Base',
        coo: '',
        hsCode: '',
        eccn: '',
        qty: 1,
        uom: 'EA',
        unitPrice: 0,
        amount: 0,
        itemWeight: '',
        meaningInThai: '',
        dimension: '',
        package: '',
        customEntry: '',
        vessel: '',
        segment: '',
        ibase: '',
        remark: '',
        lineItem: '',
        invoiceNo: 'MANUAL-ADD',
        customsStatus: ''
      });
      setCopyNotification(serialUpper ? `เพิ่มสินค้าซีเรียล "${serialUpper}" เรียบร้อยแล้ว!` : 'เพิ่มสินค้าใหม่เรียบร้อยแล้ว!');
      setTimeout(() => setCopyNotification(null), 5000);
    } catch (err: any) {
      console.error("Error manually adding item: ", err);
      setManualError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsManualSaving(false);
    }
  };


  return (
    <div className="space-y-8">
      {copyNotification && (
        <div className="fixed top-6 right-6 bg-slate-900 border-4 border-amber-400 max-w-sm p-4 z-[9999] neo-brutalism-shadow flex items-start gap-3 text-white duration-300">
          <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-sans text-xs font-black uppercase tracking-wider text-amber-400">คัดลอกข้อมูลสำเร็จ (Copy Successful)</h4>
            <p className="font-sans text-[11px] font-bold text-slate-200 mt-1">
              {copyNotification}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative group flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 opacity-20 group-focus-within:opacity-100 transition-opacity" />
          <input 
            type="text" 
            placeholder="Search Serial / Part / Desc / Invoice / Segment..."
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

      {/* Filters (Location & Segment) with Neo-brutalism layout */}
      <div className="bg-white border-2 border-slate-900 p-4 neo-brutalism-shadow space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Location Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <span className="text-[9.5px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <MapPin className="w-4 h-4 text-blue-600" />
              สถานที่จัดเก็บ (LOCATION):
            </span>
            <div className="relative flex-1">
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
                title="ล้างส่วนกรองสถานที่"
              >
                <X className="w-3.5 h-3.5" />
                <span>ล้าง</span>
              </button>
            )}
          </div>

          {/* Segment Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <span className="text-[9.5px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Activity className="w-4 h-4 text-purple-600" />
              เซกเมนต์สินค้า (SEGMENT):
            </span>
            <div className="relative flex-1">
              <select
                value={selectedSegment}
                onChange={(e) => setSelectedSegment(e.target.value)}
                className="appearance-none px-4 py-2 pr-10 bg-white border-2 border-slate-900 font-mono text-[10px] font-black uppercase focus:outline-none focus:border-blue-600 transition-colors w-full cursor-pointer h-[38px] rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              >
                <option value="ALL">★ เซกเมนต์ทั้งหมดในระบบ (SHOW ALL SEGMENTS)</option>
                {uniqueSegments.map(seg => (
                  <option key={seg} value={seg}>
                    {seg.toUpperCase()}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-700 border-l-2 border-slate-900">
                <Filter className="w-3.5 h-3.5" />
              </div>
            </div>
            
            {selectedSegment !== 'ALL' && (
              <button
                onClick={() => setSelectedSegment('ALL')}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border-2 border-slate-900 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer flex items-center gap-1.5 h-[38px] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                title="ล้างส่วนกรองเซกเมนต์"
              >
                <X className="w-3.5 h-3.5" />
                <span>ล้าง</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Options and Summary Action Toolbar */}
        <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                const tsv = generateItemsTSV(filtered);
                navigator.clipboard.writeText(tsv)
                  .then(() => {
                    setCopyNotification(`คัดลอกข้อมูลสินค้า ${filtered.length} รายการสำเร็จ! สามารถเปิด Excel หรือ Google Sheets แล้วกด Ctrl+V เพื่อวางข้อมูลได้ทันที`);
                    setTimeout(() => setCopyNotification(null), 6000);
                  })
                  .catch(err => {
                    console.error('Failed to copy TSV:', err);
                    alert('ไม่สามารถคัดลอกข้อมูลอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง');
                  });
              }}
              className="px-4 py-2 border-2 border-slate-900 bg-amber-400 hover:bg-amber-500 text-slate-900 font-extrabold text-[9px] uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 h-[38px] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
              title="คัดลอกข้อมูลตารางเพื่อไปวางใน Excel (Copy for Excel Paste)"
            >
              <Check className="w-3.5 h-3.5 text-slate-950" />
              <span>คัดลอกข้อมูลสำหรับวาง Excel ({filtered.length})</span>
            </button>

            <button
              onClick={() => exportItemsToExcel(filtered, `inventory_${selectedLocation.toLowerCase()}_${selectedSegment.toLowerCase()}_export.xlsx`)}
              className="px-4 py-2 border-2 border-slate-900 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 h-[38px] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
              title="ส่งออกรายการสินค้าทั้งหมดที่แสดงอยู่ในตัวกรองนี้ไปยังไฟล์ Excel (Download Filtered File)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดาวน์โหลดไฟล์ Excel</span>
            </button>

            <button
              onClick={() => {
                setManualError(null);
                setManualItem({
                  serialNo: '',
                  partNo: '',
                  description: '',
                  status: 'IN',
                  currentLocation: 'In-Base',
                  coo: '',
                  hsCode: '',
                  eccn: '',
                  qty: 1,
                  uom: 'EA',
                  unitPrice: 0,
                  amount: 0,
                  itemWeight: '',
                  meaningInThai: '',
                  dimension: '',
                  package: '',
                  customEntry: '',
                  vessel: '',
                  segment: '',
                  ibase: '',
                  remark: '',
                  lineItem: '',
                  invoiceNo: 'MANUAL-ADD',
                  customsStatus: ''
                });
                setIsManualAddOpen(true);
              }}
              className="px-4 py-2 border-2 border-slate-900 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 h-[38px] shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
              title="เพิ่มรายการสินค้าใหม่เข้าสู่คลังแบบกรอกเอง (Add Item Manually)"
            >
              <Package className="w-3.5 h-3.5" />
              <span>เพิ่มสินค้าด้วยตัวเอง (Manual Add)</span>
            </button>
          </div>

          <div className="text-left md:text-right shrink-0">
            <span className="text-[8px] uppercase font-black text-slate-400 block tracking-[0.2em] mb-0.5">Matched count</span>
            <span className="text-xs font-black font-mono text-slate-800 bg-slate-50 px-2.5 py-1.5 border border-slate-200 block min-w-[70px] text-center">
              {filtered.length} / {items.length} รายการ
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-900 neo-brutalism-shadow overflow-hidden">
        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white border-b-2 border-slate-900">
                  <th className="px-4 py-4 w-12 text-center select-none font-black text-[10px] uppercase">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                      className="p-1 text-white hover:text-emerald-400 font-black cursor-pointer"
                      title="เลือกทั้งหมด"
                    >
                      {allFilteredAreSelected ? (
                        <CheckSquare className="w-4.5 h-4.5 text-emerald-400" />
                      ) : someFilteredAreSelected ? (
                        <div className="w-4.5 h-4.5 border-2 border-amber-400 bg-amber-400/20 flex items-center justify-center">
                          <div className="w-2.5 h-1 bg-amber-400 animate-pulse" />
                        </div>
                      ) : (
                        <Square className="w-4.5 h-4.5" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200">IBASE</th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200 text-center">Line Item</th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200">Part No.</th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200">Serial No.</th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200">Description</th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200 text-center">QTY</th>
                  <th className="px-4 py-4 text-[10px] uppercase font-black tracking-widest text-slate-200 text-center">Status / Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-24 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-20">
                        <Package className="w-16 h-16" />
                        <p className="text-sm uppercase font-black tracking-widest">Data_Buffer_Empty</p>
                      </div>
                    </td>
                  </tr>
                ) : (() => {
                  // Group items by file code / admin code (invoiceNo)
                  const itemsByGroup: { [key: string]: InventoryItem[] } = {};
                  filtered.forEach(item => {
                    const groupName = item.invoiceNo || 'UNASSIGNED';
                    if (!itemsByGroup[groupName]) {
                      itemsByGroup[groupName] = [];
                    }
                    itemsByGroup[groupName].push(item);
                  });

                  const groups = Object.keys(itemsByGroup).sort((a, b) => {
                    if (a === 'UNASSIGNED') return 1;
                    if (b === 'UNASSIGNED') return -1;
                    return a.localeCompare(b);
                  });

                  const groupColors = [
                    { bg: 'bg-amber-50/90 text-amber-950 border-amber-300', tag: 'bg-amber-300 text-amber-950 border-amber-400' },
                    { bg: 'bg-sky-50/90 text-sky-950 border-sky-300', tag: 'bg-sky-300 text-sky-950 border-sky-400' },
                    { bg: 'bg-emerald-50/90 text-emerald-950 border-emerald-300', tag: 'bg-emerald-300 text-emerald-950 border-emerald-400' },
                    { bg: 'bg-indigo-50/90 text-indigo-950 border-indigo-300', tag: 'bg-indigo-300 text-indigo-950 border-indigo-400' },
                  ];

                  return groups.map((groupName, groupIdx) => {
                    const groupItems = itemsByGroup[groupName];
                    const colorScheme = groupColors[groupIdx % groupColors.length];
                    
                    return (
                      <React.Fragment key={groupName}>
                        {/* Group Header Row */}
                        <tr className={cn("border-y-2 border-slate-900/10 font-bold", colorScheme.bg)}>
                          <td colSpan={8} className="px-4 py-2.5 align-middle select-none">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn("px-2.5 py-1 text-[11px] font-black uppercase tracking-widest border-2 border-slate-900", colorScheme.tag)}>
                                  📂 {groupName === 'UNASSIGNED' ? 'ไม่มีรหัสไฟล์ / UNASSIGNED' : `ไฟล์: ${groupName}`}
                                </span>
                                <span className="text-[10px] text-slate-700 font-extrabold bg-white/60 px-2 py-0.5 border border-slate-400/30">
                                  สินค้าในไฟล์นี้ {groupItems.length} รายการ
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Group Item Rows */}
                        {groupItems.map((item) => {
                          const isChecked = selectedSerials.includes(item.serialNo);
                          return (
                            <tr 
                              key={item.serialNo} 
                              className={cn(
                                "hover:bg-slate-100 cursor-pointer border-b border-slate-200 transition-colors group",
                                isChecked ? "bg-blue-50/30" : ""
                              )}
                              onClick={() => handleSelectItem(item)}
                            >
                              {/* Checkbox */}
                              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={(e) => toggleSelect(item.serialNo, e)}
                                  className="p-1 hover:scale-110 transition-transform cursor-pointer"
                                >
                                  {isChecked ? (
                                    <CheckSquare className="w-4.5 h-4.5 text-blue-600 fill-blue-50" />
                                  ) : (
                                    <Square className="w-4.5 h-4.5 text-slate-300 hover:text-slate-500" />
                                  )}
                                </button>
                              </td>

                              {/* IBASE */}
                              <td className="px-4 py-3 text-[11px] font-mono font-black tracking-tight text-slate-755 select-all">
                                {item.ibase || '-'}
                              </td>

                              {/* Line Item */}
                              <td className="px-4 py-3 text-center text-xs font-mono font-bold text-slate-500">
                                {item.lineItem || '-'}
                              </td>

                              {/* Part No */}
                              <td className="px-4 py-3 text-xs font-mono font-black tracking-tighter text-slate-800 break-all select-all">
                                {item.partNo || 'N/A'}
                              </td>

                              {/* Serial No */}
                              <td className="px-4 py-3 text-xs font-sans font-black tracking-tighter text-blue-600 break-all select-all">
                                {getDisplaySerial(item.serialNo)}
                              </td>

                              {/* Description */}
                              <td className="px-4 py-3 max-w-[320px]">
                                <p className="text-[11.5px] font-bold text-slate-900 leading-snug truncate" title={item.description}>
                                  {item.description}
                                </p>
                                {item.meaningInThai && (
                                  <p className="text-[10px] font-medium text-slate-500 mt-0.5 truncate" title={item.meaningInThai}>
                                    แปล: {item.meaningInThai}
                                  </p>
                                )}
                              </td>

                              {/* QTY */}
                              <td className="px-4 py-3 text-center text-xs font-mono font-bold text-slate-800">
                                {item.qty !== undefined ? item.qty : 1}
                              </td>

                              {/* Status / Location */}
                              <td className="px-4 py-3 max-w-[240px]">
                                <div className="flex items-center justify-center gap-1.5 min-w-0">
                                  <span className={cn(
                                    "inline-flex items-center gap-1.5 px-2 py-0.5 border-2 font-black text-[8px] uppercase tracking-tighter shrink-0",
                                    item.status === 'IN' ? 'border-emerald-600 bg-emerald-55 text-emerald-600' : 'border-red-600 bg-red-55 text-red-600'
                                  )}>
                                    {item.status}
                                  </span>
                                  <span 
                                    className="text-[9.5px] font-bold text-slate-600 border border-slate-300 bg-slate-50 px-1.5 py-0.5 max-w-[120px] sm:max-w-[150px] md:max-w-[180px] truncate block cursor-help select-all shrink"
                                    title={item.currentLocation}
                                  >
                                    {item.currentLocation}
                                  </span>
                                  {item.customsStatus && (
                                    <span className={cn(
                                      "inline-flex items-center px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-tighter shrink-0",
                                      item.customsStatus.toLowerCase() === 'fz' ? 'border-orange-550 bg-orange-100 text-orange-800' :
                                      item.customsStatus.toLowerCase() === 'drawback' ? 'border-rose-550 bg-rose-100 text-rose-800' :
                                      'border-blue-550 bg-blue-100 text-blue-800'
                                    )}>
                                      {item.customsStatus}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
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
                {filtered.map((item) => {
                  const isChecked = selectedSerials.includes(item.serialNo);
                  return (
                    <div 
                      key={item.serialNo}
                      className={cn(
                        "bg-white border-2 border-slate-900 p-4 neo-brutalism-shadow hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] transition-all flex flex-col justify-between group relative min-h-[175px] cursor-pointer",
                        isChecked ? "border-blue-600 bg-blue-50/10 shadow-[3px_3px_0px_0px_rgba(37,99,235,1)]" : ""
                      )}
                      onClick={() => handleSelectItem(item)}
                    >
                      <div>
                        {/* Header status and location */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => toggleSelect(item.serialNo, e)}
                              className="p-0.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                              title="เลือกรายการสินค้า"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 fill-blue-50" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                              )}
                            </button>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border-2 font-black text-[8px] uppercase tracking-tighter ${
                              item.status === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                            }`}>
                              {item.status === 'IN' ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                              {item.status}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 max-w-[60%]">
                            <MapPin className="w-2.5 h-2.5 opacity-30 shrink-0" />
                            <span className="text-[8.5px] uppercase font-black tracking-widest truncate" title={item.currentLocation}>
                              {item.currentLocation}
                            </span>
                          </div>
                        </div>

                        {/* Serial Number (Asset ID) */}
                        <p className="text-[11px] font-black font-mono tracking-tighter text-slate-900 break-all bg-slate-50 border-2 border-slate-900/10 px-2 py-0.5 mb-2 leading-none">
                          {getDisplaySerial(item.serialNo)}
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
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-slate-900 border-t-2 border-slate-900 flex justify-between px-8">
          <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold tracking-widest">System_Online</span>
          <span className="text-[10px] font-mono uppercase text-white/40 font-bold tracking-widest">Total_Records: {filtered.length}</span>
        </div>
      </div>

      {/* Floating Selection Action Panel */}
      {selectedSerials.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border-4 border-slate-900 text-white p-4 flex flex-col md:flex-row items-center justify-between gap-4 z-50 shadow-[4px_4px_0px_0px_rgba(244,63,94,1)] w-[90%] max-w-2xl select-none">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-mono text-[10px] font-black tracking-tight border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              เลือก {selectedSerials.length} ชิ้น
            </span>
            <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-350 hidden md:block">
              ตรวจสอบแล้ว {selectedSerials.length} รายการ ➔ สั่งทำการเขียนสเปค Excel ได้ทันที
            </p>
          </div>
          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <button
              type="button"
              onClick={() => {
                const selectedItems = items.filter(item => selectedSerials.includes(item.serialNo));
                const tsv = generateItemsTSV(selectedItems);
                navigator.clipboard.writeText(tsv)
                  .then(() => {
                    setCopyNotification(`คัดลอกข้อมูลสินค้าที่เลือก ${selectedItems.length} รายการแล้ว! สามารถกด Ctrl+V เพื่อวางใน Excel ได้ทันที`);
                    setTimeout(() => setCopyNotification(null), 6000);
                  })
                  .catch(err => {
                    console.error('Failed to copy selected TSV:', err);
                    alert('คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง');
                  });
              }}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[9.5px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-x-0.5 active:translate-y-0.5"
              title="คัดลอกข้อมูลเฉพาะส่วนที่ท่านเลือกไปวางใน Excel (Copy Selected to Excel)"
            >
              <Check className="w-3.5 h-3.5 text-slate-950" />
              <span>คัดลอกสำหรับ Excel ({selectedSerials.length} ชิ้น)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const selectedItems = items.filter(item => selectedSerials.includes(item.serialNo));
                exportItemsToExcel(selectedItems, `selected_admin_export_${selectedSerials.length}_items.xlsx`);
              }}
              className="px-4 py-2 bg-emerald-550 hover:bg-emerald-650 text-white font-black text-[9.5px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-x-0.5 active:translate-y-0.5"
              title="ส่งออกแบบฟูลออฟชั่น เฉพาะตัวที่ท่านติ๊กเลือก"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดึงออกใส่ Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSerials([])}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-black text-[9px] uppercase tracking-widest cursor-pointer border border-slate-700"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Pop-up Administrative Modal Panel (Tabbed & Form Editable) */}
      {selectedItem && tempItem && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => {
            setSelectedItem(null);
            setTempItem(null);
            setIsLocationExpanded(false);
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white border-4 border-slate-900 w-full max-w-5xl neo-brutalism-shadow relative my-8 flex flex-col max-h-[90vh] overflow-hidden rounded-none shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => {
                setSelectedItem(null);
                setTempItem(null);
                setIsLocationExpanded(false);
              }}
              className="absolute top-4 right-4 border-2 border-slate-900 bg-white hover:bg-red-500 hover:text-white p-1.5 transition-colors neo-brutalism-shadow active:translate-x-0.5 active:translate-y-0.5 z-10 cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Heading Header */}
            <div className="bg-slate-900 text-white p-6 pr-16 shrink-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[9px] uppercase font-black bg-blue-600 text-white px-2 py-0.5 border border-blue-400 font-mono tracking-widest">
                  แผงควบคุมหลักฝ่ายแอดมิน (CIPL PROFILE WORKSPACE)
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border border-white font-black text-[9px] uppercase ${
                  tempItem.status === 'IN' ? 'bg-emerald-600' : 'bg-red-600'
                }`}>
                  {tempItem.status}
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-black font-mono tracking-tighter uppercase break-all">
                {getDisplaySerial(tempItem.serialNo)}
              </h3>
            </div>

            {/* Navigation Tab Heads */}
            <div className="flex border-b-4 border-slate-900 bg-slate-100 font-black text-[10px] uppercase tracking-wider shrink-0 select-none">
              <button
                type="button"
                onClick={() => setModalTab('profile')}
                className={cn(
                  "px-6 py-4 border-r-2 border-slate-900 transition-colors uppercase cursor-pointer flex-1 md:flex-none",
                  modalTab === 'profile' ? "bg-white text-slate-900 border-b-[4px] border-b-blue-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                📝 รายละเอียดฝ่ายแอดมิน & การศุลกากร
              </button>
              <button
                type="button"
                onClick={() => setModalTab('history')}
                className={cn(
                  "px-6 py-4 border-r-2 border-slate-900 transition-colors uppercase cursor-pointer flex-1 md:flex-none",
                  modalTab === 'history' ? "bg-white text-slate-900 border-b-[4px] border-b-blue-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                🚚 บันทึกประวัติเคลื่อนย้าย ({logs.filter(log => log.serialNo?.trim() === selectedItem.serialNo?.trim()).length} รอบ)
              </button>
            </div>

            {/* Tab Panels Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              {modalTab === 'profile' ? (
                <div className="space-y-6">
                  {/* Master Description Details Section */}
                  <div className="bg-white border-2 border-slate-900 p-4 rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-8 space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black uppercase">รายละเอียดชิ้นส่วนอังกฤษ (DESCRIPTION)</label>
                      <input 
                        type="text" 
                        value={tempItem.description || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, description: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-950 font-sans text-xs font-bold uppercase focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                      />
                    </div>
                    <div className="md:col-span-4 space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black uppercase">รหัสชิ้นส่วนแบรนด์ (PART REF / NUMBER)</label>
                      <input 
                        type="text" 
                        value={tempItem.partNo || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, partNo: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-950 font-mono text-xs font-bold uppercase focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Dense visual matrix layout for CIPL fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    
                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-blue-600 font-black block select-none">แปลภาษาไทย (MEANING IN THAI) ★</label>
                      <input 
                        type="text" 
                        value={tempItem.meaningInThai || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, meaningInThai: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                        placeholder="กรอกคำอธิบายภาษาไทย"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">แหล่งที่มา (COO COUNTRY)</label>
                      <input 
                        type="text" 
                        value={tempItem.coo || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, coo: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800 font-semibold"
                        placeholder="COO เช่น US, TH, SG"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">พิกัด HS CODE</label>
                      <input 
                        type="text" 
                        value={tempItem.hsCode || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, hsCode: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800 font-semibold"
                        placeholder="เช่น 8431.43.00"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">รหัส ECCN สหรัฐ</label>
                      <input 
                        type="text" 
                        value={tempItem.eccn || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, eccn: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800 font-semibold"
                        placeholder="เช่น EAR99"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">จำนวนพัสดุ (QTY)</label>
                      <input 
                        type="number" 
                        value={tempItem.qty !== undefined ? tempItem.qty : 1} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const up = tempItem.unitPrice || 0;
                          setTempItem({ ...tempItem, qty: val, amount: val * up });
                        }}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">หน่วยนับ (UOM)</label>
                      <input 
                        type="text" 
                        value={tempItem.uom || 'EA'} 
                        onChange={(e) => setTempItem({ ...tempItem, uom: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800 font-semibold"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">ราคาต่อหน่วย (UNIT PRICE)</label>
                      <input 
                        type="number" 
                        value={tempItem.unitPrice !== undefined ? tempItem.unitPrice : 0} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const q = tempItem.qty || 1;
                          setTempItem({ ...tempItem, unitPrice: val, amount: q * val });
                        }}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black block">ยอดรวมทั้งสิ้น (AMOUNT)</label>
                      <input 
                        type="number" 
                        value={tempItem.amount !== undefined ? tempItem.amount : 0} 
                        onChange={(e) => setTempItem({ ...tempItem, amount: Number(e.target.value) })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-black block">น้ำหนักสุทธิ (WEIGHT KG)</label>
                      <input 
                        type="text" 
                        value={tempItem.itemWeight || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, itemWeight: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="น้ำหนัก (KG)"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-black block">ขนาดพัสดุ (DIMENSIONS L/W/H)</label>
                      <input 
                        type="text" 
                        value={tempItem.dimension || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, dimension: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="ขนาดภายนอก"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-black block">ประเภทกล่อง (PACKAGE TYPE)</label>
                      <input 
                        type="text" 
                        value={tempItem.package || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, package: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="เช่น Box, Wooden Case"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-slate-400 font-black block">เรือ / พาหนะ (VESSEL NAME)</label>
                      <input 
                        type="text" 
                        value={tempItem.vessel || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, vessel: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="ชื่อพาหนะขนส่ง"
                      />
                    </div>

                     <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-blue-600 font-bold block">หมายเลขสำแดง (CUSTOMS ENTRY)</label>
                      <input 
                        type="text" 
                        value={tempItem.customEntry || tempItem.importEntryNo || ''} 
                        onChange={(e) => setTempItem({ 
                          ...tempItem, 
                          customEntry: e.target.value, 
                          importEntryNo: e.target.value 
                        })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="เลขใบขนสินค้า เช่น A00..."
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-3.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-1">
                      <label className="text-[8.5px] text-blue-600 font-bold block">สิทธิ์ศุลกากร (CUSTOMS STATUS)</label>
                      <input 
                        type="text" 
                        value={tempItem.customsStatus || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, customsStatus: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="Local, FZ, Drawback"
                      />
                    </div>
                  </div>

                  {/* Route planning and notes layout */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="bg-white border-2 border-slate-900 p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] md:col-span-4 space-y-2">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black uppercase">รหัสสาขาวิชา / เซ็กเมนต์ (SEGMENT / IBASE)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input 
                          type="text" 
                          value={tempItem.segment || ''} 
                          title="SEGMENT"
                          onChange={(e) => setTempItem({ ...tempItem, segment: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-semibold uppercase text-slate-800"
                          placeholder="SEGMENT"
                        />
                        <input 
                          type="text" 
                          value={tempItem.ibase || ''} 
                          title="IBASE CODE"
                          onChange={(e) => setTempItem({ ...tempItem, ibase: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-mono font-semibold uppercase text-slate-800"
                          placeholder="IBASE"
                        />
                      </div>
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] md:col-span-4 space-y-2">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black uppercase flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-emerald-600" />
                        <span>พิกัดจัดเก็บปัจจุบัน (CURRENT LOCATION / PATHS)</span>
                      </label>
                      <input 
                        type="text" 
                        value={tempItem.currentLocation || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, currentLocation: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 border-2 border-slate-950 font-sans text-xs font-black uppercase focus:outline-none focus:border-emerald-600 rounded-none text-emerald-850"
                        placeholder="In-Base หรือพิกัดจัดเก็บปลายทาง"
                      />
                    </div>

                    <div className="bg-white border-2 border-slate-900 p-4 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] md:col-span-4 space-y-2">
                      <label className="text-[8.5px] text-slate-400 font-mono font-black uppercase">หมายเหตุเพิ่มเติมแอดมิน (ADMIN REMARKS)</label>
                      <input 
                        type="text" 
                        value={tempItem.remark || ''} 
                        onChange={(e) => setTempItem({ ...tempItem, remark: e.target.value })}
                        className="w-full px-3 py-1.5 bg-slate-50 border-2 border-slate-950 font-sans text-xs font-semibold focus:outline-none focus:border-blue-600 rounded-none text-slate-800"
                        placeholder="เช่น แนบใบอนุญาตนำเข้าพิเศษ"
                      />
                    </div>
                  </div>

                  {/* Actions workspace banner for direct copy or excel exporting */}
                  <div className="bg-amber-50 border-2 border-amber-950 p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none">
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-amber-850 shrink-0" />
                      <p className="text-[10.5px] text-amber-950 font-bold uppercase tracking-wide leading-snug">
                        คัดลอกข้อมูลเฉพาะของสินค้าชิ้นนี้นำไปวางใน Excel ได้ทันที!
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const tsv = generateItemsTSV([tempItem]);
                          navigator.clipboard.writeText(tsv)
                            .then(() => {
                              setCopyNotification(`คัดลอกข้อมูลของสินค้าชิ้นนี้ (${tempItem.serialNo}) สำเร็จ! สามารถนำไปวางใน Excel ได้ทันที`);
                              setTimeout(() => setCopyNotification(null), 5000);
                            })
                            .catch(err => {
                              console.error('Failed to copy single item TSV:', err);
                              alert('คัดลอกไม่สำเร็จ กรุณาลองอีกครั้ง');
                            });
                        }}
                        className="px-4 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[9.5px] uppercase tracking-widest cursor-pointer border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                      >
                        <span>คัดลอกไปวาง Excel (Copy)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportItemsToExcel([tempItem], `item_customs_${tempItem.serialNo}.xlsx`)}
                        className="px-4 py-2.5 bg-emerald-605 hover:bg-emerald-705 text-white font-black text-[9.5px] uppercase tracking-widest cursor-pointer border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                      >
                        <span>ดาวน์โหลด Excel</span>
                      </button>
                    </div>
                  </div>

                </div>
              ) : (
                /* History Logs viewport section */
                <table className="w-full text-left border-collapse bg-white border-2 border-slate-900 rounded-none overflow-hidden select-none">
                  <thead>
                    <tr className="bg-slate-900 text-white border-b-2 border-slate-900 font-mono font-black text-[9px] uppercase tracking-widest">
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-5 py-3.5">Route Description</th>
                      <th className="px-5 py-3.5">Invoice Ref</th>
                      <th className="px-5 py-3.5 text-right">Customs Entry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {logs.filter(log => log.serialNo?.trim() === selectedItem.serialNo?.trim()).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-xs opacity-30 uppercase font-black tracking-widest">
                          ไม่มีประวัติเดินทางสำแดงไว้ในระบบ
                        </td>
                      </tr>
                    ) : (
                      logs
                        .filter(log => log.serialNo?.trim() === selectedItem.serialNo?.trim())
                        .sort((a, b) => {
                          const timeA = a.date?.toDate ? a.date.toDate().getTime() : 0;
                          const timeB = b.date?.toDate ? b.date.toDate().getTime() : 0;
                          return timeB - timeA;
                        })
                        .map((log, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors text-[11px] font-semibold text-slate-800">
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border-2 text-[8px] font-black uppercase ${
                                log.transactionType === 'IN' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-red-600 bg-red-50 text-red-600'
                              }`}>
                                {log.transactionType === 'IN' ? 'IN' : 'OUT'}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-mono text-[10.5px]">
                              {log.date?.toDate ? log.date.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </td>
                            <td className="px-5 py-4 font-sans">
                              <span className="font-extrabold">{log.origin}</span>
                              <span className="mx-2 text-slate-400">➔</span>
                              <span className="font-extrabold text-blue-600">{log.destination}</span>
                            </td>
                            <td className="px-5 py-4 font-mono text-slate-500">
                              #{log.invoiceNo || 'N/A'}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-blue-600">
                              {log.importEntryNo || 'N/A'} {log.importEntryLineNo ? `[Line ${log.importEntryLineNo}]` : ''}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Controls Bar */}
            <div className="p-4 bg-white border-t-4 border-slate-900 flex justify-between items-center px-6 shrink-0 flex-wrap gap-4 select-none">
              <div className="flex items-center gap-3">
                {saveSuccess ? (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 border-2 border-emerald-350 flex items-center gap-1">
                    <Check className="w-4 h-4 text-emerald-600" /> บันทึกการแก้ไขพารามิเตอร์สำเร็จเรียบร้อย!
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {modalTab === 'profile' && (
                  <button
                    type="button"
                    onClick={handleSaveItem}
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกแก้ไข (Save Changes)'}</span>
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    setTempItem(null);
                    setIsLocationExpanded(false);
                  }}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                >
                  ปิดหน้าต่างแผงควบคุม
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ➕ Pop-up Manual Add Item Modal Panel */}
      {isManualAddOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => {
            if (!isManualSaving) {
              setIsManualAddOpen(false);
            }
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white border-4 border-slate-900 w-full max-w-4xl neo-brutalism-shadow relative my-8 flex flex-col max-h-[90vh] overflow-hidden rounded-none shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => {
                if (!isManualSaving) {
                  setIsManualAddOpen(false);
                }
              }}
              className="absolute top-4 right-4 border-2 border-slate-900 bg-white hover:bg-red-500 hover:text-white p-1.5 transition-colors neo-brutalism-shadow active:translate-x-0.5 active:translate-y-0.5 z-10 cursor-pointer"
              aria-label="Close dialog"
              disabled={isManualSaving}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-6 pr-16 shrink-0">
              <span className="text-[9px] uppercase font-black bg-blue-600 text-white px-2 py-0.5 border border-blue-400 font-mono tracking-widest">
                เพิ่มข้อมูลสินค้าแมนนวล (MANUAL ITEM CREATION WORKSPACE)
              </span>
              <h3 className="text-xl md:text-2xl font-black font-sans tracking-tight uppercase mt-1">
                สร้างรายการสินค้าใหม่ด้วยตนเอง
              </h3>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
              {manualError && (
                <div className="bg-red-50 border-2 border-red-900 p-4 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black uppercase text-red-900 font-sans">เกิดข้อผิดพลาดในการตรวจสอบ</h4>
                    <p className="text-[11px] font-bold text-red-800 mt-1">{manualError}</p>
                  </div>
                </div>
              )}

              {autofillFeedback && (
                <div className="bg-emerald-50 border-2 border-emerald-500 p-4 flex items-start gap-3 shadow-[2px_2px_0px_0px_rgba(16,185,129,1)]">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black uppercase text-emerald-900 font-sans">ดึงข้อมูลอัตโนมัติสำเร็จ (Autofill Active)</h4>
                    <p className="text-[11px] font-bold text-emerald-800 mt-1">{autofillFeedback}</p>
                  </div>
                </div>
              )}

              {/* SECTION 1: CORE ITEM DETAILS */}
              <div className="bg-white border-2 border-slate-900 p-5 rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-4">
                <div className="border-b-2 border-slate-900 pb-2 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 font-sans">1. ข้อมูลหลักของสินค้า (Core Item Details)</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1 relative">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">หมายเลขซีเรียล (SERIAL NUMBER / S/N) <span className="text-blue-500 font-bold">(หากไม่มีจะระบุเป็น N/A)</span></label>
                    <input 
                      type="text" 
                      value={manualItem.serialNo || ''} 
                      onChange={(e) => {
                        setManualItem({ ...manualItem, serialNo: e.target.value });
                        setActiveSuggestionField('serial');
                      }}
                      onFocus={() => setActiveSuggestionField('serial')}
                      onBlur={() => {
                        setTimeout(() => {
                          if (activeSuggestionField === 'serial') setActiveSuggestionField(null);
                        }, 200);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-950 font-mono text-xs font-black uppercase focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น S/N-9999-XYZ (เว้นว่างได้)"
                    />
                    {/* Serial Suggestion Panel */}
                    {activeSuggestionField === 'serial' && getSerialSuggestions(manualItem.serialNo || '').length > 0 && (
                      <div className="absolute left-0 right-0 z-50 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] mt-1 max-h-60 overflow-y-auto divide-y divide-slate-200">
                        {getSerialSuggestions(manualItem.serialNo || '').map((item) => (
                          <button
                            key={item.serialNo}
                            type="button"
                            onMouseDown={() => applyTemplate(item, 'serial')}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex flex-col gap-0.5 cursor-pointer"
                          >
                            <span className="text-[10px] font-black text-blue-600 font-mono uppercase">{getDisplaySerial(item.serialNo)}</span>
                            <span className="text-[9.5px] font-bold text-slate-800 line-clamp-1">{item.description}</span>
                            <div className="flex gap-2 text-[8px] font-mono font-bold text-slate-500 uppercase">
                              {item.partNo && <span>Part: {item.partNo}</span>}
                              {item.unitPrice !== undefined && <span>Price: ${item.unitPrice}</span>}
                              {item.uom && <span>UOM: {item.uom}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 relative">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">รหัสอะไหล่ (PART REF / NUMBER)</label>
                    <input 
                      type="text" 
                      value={manualItem.partNo || ''} 
                      onChange={(e) => {
                        setManualItem({ ...manualItem, partNo: e.target.value.trim() });
                        setActiveSuggestionField('part');
                      }}
                      onFocus={() => setActiveSuggestionField('part')}
                      onBlur={() => {
                        setTimeout(() => {
                          if (activeSuggestionField === 'part') setActiveSuggestionField(null);
                        }, 200);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-950 font-mono text-xs font-bold uppercase focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น 100234567"
                    />
                    {/* Part Suggestion Panel */}
                    {activeSuggestionField === 'part' && getPartSuggestions(manualItem.partNo || '').length > 0 && (
                      <div className="absolute left-0 right-0 z-50 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] mt-1 max-h-60 overflow-y-auto divide-y divide-slate-200">
                        {getPartSuggestions(manualItem.partNo || '').map((item, idx) => (
                          <button
                            key={`${item.serialNo}-${item.partNo || idx}`}
                            type="button"
                            onMouseDown={() => applyTemplate(item, 'part')}
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex flex-col gap-0.5 cursor-pointer"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black text-slate-900 font-mono uppercase">PART: {item.partNo}</span>
                              <span className="text-[8px] font-mono font-black uppercase text-blue-600 bg-blue-50 px-1 border border-blue-200">{getDisplaySerial(item.serialNo)}</span>
                            </div>
                            <span className="text-[9.5px] font-bold text-slate-800 line-clamp-1">{item.description}</span>
                            <div className="flex gap-2 text-[8px] font-mono font-bold text-slate-500 uppercase">
                              {item.unitPrice !== undefined && <span>Price: ${item.unitPrice}</span>}
                              {item.uom && <span>UOM: {item.uom}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase block">ทิศทาง / สถานะ (STATUS DIRECTION)</label>
                    <div className="grid grid-cols-2 gap-2 h-[38px]">
                      <button
                        type="button"
                        onClick={() => setManualItem({ ...manualItem, status: 'IN' })}
                        className={cn(
                          "border-2 font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer rounded-none",
                          manualItem.status === 'IN'
                            ? "bg-emerald-600 border-slate-900 text-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                            : "bg-white border-slate-300 hover:border-slate-800 text-slate-600"
                        )}
                      >
                        เข้าคลัง (IN)
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualItem({ ...manualItem, status: 'OUT' })}
                        className={cn(
                          "border-2 font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer rounded-none",
                          manualItem.status === 'OUT'
                            ? "bg-red-600 border-slate-900 text-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                            : "bg-white border-slate-300 hover:border-slate-800 text-slate-600"
                        )}
                      >
                        ออกคลัง (OUT)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 relative">
                  <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">ชื่ออธิบายอังกฤษ (DESCRIPTION) <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={manualItem.description || ''} 
                    onChange={(e) => {
                      setManualItem({ ...manualItem, description: e.target.value });
                      setActiveSuggestionField('desc');
                    }}
                    onFocus={() => setActiveSuggestionField('desc')}
                    onBlur={() => {
                      setTimeout(() => {
                        if (activeSuggestionField === 'desc') setActiveSuggestionField(null);
                      }, 200);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-950 font-sans text-xs font-bold uppercase focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                    placeholder="เช่น TUBING PUMP INSERT ACCESSORIES"
                    required
                  />
                  {/* Desc Suggestion Panel */}
                  {activeSuggestionField === 'desc' && getDescSuggestions(manualItem.description || '').length > 0 && (
                    <div className="absolute left-0 right-0 z-50 bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] mt-1 max-h-60 overflow-y-auto divide-y divide-slate-200">
                      {getDescSuggestions(manualItem.description || '').map((item, idx) => (
                        <button
                          key={`${item.serialNo}-${item.description || idx}`}
                          type="button"
                          onMouseDown={() => applyTemplate(item, 'desc')}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex flex-col gap-0.5 cursor-pointer"
                        >
                          <span className="text-[10px] font-black text-slate-900 uppercase line-clamp-1">{item.description}</span>
                          <div className="flex flex-wrap gap-2 text-[8px] font-mono font-bold text-slate-500 uppercase mt-0.5">
                            {item.partNo && <span className="text-blue-600">Part: {item.partNo}</span>}
                            {item.serialNo && <span>S/N: {getDisplaySerial(item.serialNo)}</span>}
                            {item.unitPrice !== undefined && <span>Price: ${item.unitPrice}</span>}
                            {item.uom && <span>UOM: {item.uom}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: CUSTOMS & LOGISTICS */}
              <div className="bg-white border-2 border-slate-900 p-5 rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-4">
                <div className="border-b-2 border-slate-900 pb-2 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 font-sans">2. ข้อมูลการศุลกากรและพิกัดจัดเก็บ (Customs & Location Details)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">หมายเลขสำแดงใบขน (CUSTOMS ENTRY / IMPORT ENTRY NO)</label>
                    <input 
                      type="text" 
                      value={manualItem.customEntry || ''} 
                      onChange={(e) => setManualItem({ 
                        ...manualItem, 
                        customEntry: e.target.value.trim(),
                        importEntryNo: e.target.value.trim()
                      })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น A012-06406-xxxxx"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">ลำดับรายการในใบขน (IMPORT ENTRY LINE / LINE ITEM)</label>
                    <input 
                      type="text" 
                      value={manualItem.lineItem || ''} 
                      onChange={(e) => setManualItem({ 
                        ...manualItem, 
                        lineItem: e.target.value.trim(),
                        importEntryLineNo: e.target.value.trim()
                      })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น 1 หรือ 45"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">วันนำเข้า/เคลียร์สินค้า (INBOUND DATE)</label>
                    <input 
                      type="text" 
                      value={manualItem.inboundDate || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, inboundDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น 24/12/2025"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">สิทธิ์ทางศุลกากร (CUSTOMS STATUS)</label>
                    <select
                      value={manualItem.customsStatus || ''}
                      onChange={(e) => setManualItem({ ...manualItem, customsStatus: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none rounded-none text-slate-900 h-[34px]"
                    >
                      <option value="">-- เลือกสิทธิ์ศุลกากร --</option>
                      <option value="Local">Local (เสียภาษีปกติ)</option>
                      <option value="FZ">FZ (เขตปลอดอากร Free Zone)</option>
                      <option value="Drawback">Drawback (ขอคืนอากร ม.29)</option>
                      <option value="19 Bis">19 Bis (สิทธิ์ 19 ทวิ)</option>
                      <option value="BOI">BOI (ได้รับการส่งเสริมการลงทุน)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">แหล่งกำเนิดสินค้า (COUNTRY OF ORIGIN / COO)</label>
                    <input 
                      type="text" 
                      value={manualItem.coo || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, coo: e.target.value.toUpperCase() })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น US, TH, SG, CN"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">พิกัดสถานที่เก็บปัจจุบัน (CURRENT LOCATION)</label>
                    <input 
                      type="text" 
                      value={manualItem.currentLocation || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, currentLocation: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น In-Base หรือ Free Zone"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">เซกเมนต์วิชาความรู้ (SEGMENT)</label>
                    <input 
                      type="text" 
                      value={manualItem.segment || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, segment: e.target.value.toUpperCase() })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น D&M, SLK, SPS"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">รหัส IBASE (IBASE CODE/NUMBER)</label>
                    <input 
                      type="text" 
                      value={manualItem.ibase || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, ibase: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น 123445"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">ใบกำกับสินค้า/อินวอยซ์อ้างอิง (INVOICE REF/NO)</label>
                    <input 
                      type="text" 
                      value={manualItem.invoiceNo || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, invoiceNo: e.target.value.trim() })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น CIPL-9999-MANUAL"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: COMMERCIAL & PHYSICAL SPECIFICATION */}
              <div className="bg-white border-2 border-slate-900 p-5 rounded-none shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] space-y-4">
                <div className="border-b-2 border-slate-900 pb-2 flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 font-sans">3. รายละเอียดทางการค้าและขนาดสินค้า (Commercial & Physical Specs)</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">จำนวนที่แอด (QTY OF ITEM)</label>
                    <input 
                      type="number" 
                      value={manualItem.qty || 1} 
                      onChange={(e) => setManualItem({ ...manualItem, qty: Math.max(1, Number(e.target.value)) })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">หน่วยนับ (UNIT / UOM)</label>
                    <input 
                      type="text" 
                      value={manualItem.uom || 'EA'} 
                      onChange={(e) => setManualItem({ ...manualItem, uom: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900 text-center uppercase"
                      placeholder="เช่น EA, SET, BOX"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">ราคาต่อหน่วย (UNIT PRICE USD)</label>
                    <input 
                      type="number" 
                      value={manualItem.unitPrice || 0} 
                      onChange={(e) => {
                        const price = Number(e.target.value);
                        const qty = manualItem.qty || 1;
                        setManualItem({ 
                          ...manualItem, 
                          unitPrice: price,
                          amount: price * qty
                        });
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">มูลค่ารวม (TOTAL AMOUNT USD)</label>
                    <input 
                      type="number" 
                      value={manualItem.amount || 0} 
                      onChange={(e) => setManualItem({ ...manualItem, amount: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 bg-slate-100 border-2 border-slate-900 font-mono text-xs font-bold focus:outline-none rounded-none text-slate-900"
                      disabled
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">ขนาดทางกายภาพ (DIMENSIONS)</label>
                    <input 
                      type="text" 
                      value={manualItem.dimension || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, dimension: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น 120 x 80 x 50 CM"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">ชนิดของบรรจุภัณฑ์ (PACKAGE TYPE)</label>
                    <input 
                      type="text" 
                      value={manualItem.package || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, package: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น WOODEN BOX, PALLET"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">ขนส่งเรือ/เครื่องบิน (VESSEL NAME)</label>
                    <input 
                      type="text" 
                      value={manualItem.vessel || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, vessel: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น FLIGHT TG-xxx"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">น้ำหนักสินค้าชิ้นนั้น (ITEM WEIGHT)</label>
                    <input 
                      type="text" 
                      value={manualItem.itemWeight || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, itemWeight: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น 450 KGS"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">แปลข้อมูลความหมายไทย (MEANING IN THAI)</label>
                    <input 
                      type="text" 
                      value={manualItem.meaningInThai || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, meaningInThai: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น วาล์วสำหรับอุปกรณ์ควบคุมปั๊มแรงดัน"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">หมายเหตุเพิ่มเติมของแอดมิน (REMARKS)</label>
                    <input 
                      type="text" 
                      value={manualItem.remark || ''} 
                      onChange={(e) => setManualItem({ ...manualItem, remark: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border-2 border-slate-900 text-xs font-bold focus:outline-none focus:border-blue-600 rounded-none text-slate-900"
                      placeholder="เช่น ส่งพิกัดสิทธิ์ศุลกากรเร่งรัดพิเศษ"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 bg-white border-t-4 border-slate-900 flex justify-between items-center px-6 shrink-0 flex-wrap gap-4 select-none">
              <span className="text-[9.5px] font-sans font-extrabold text-slate-400">
                ⚠️ การคลิกปุ่มบันทึกจะสร้าง Log ประวัติเข้าคลัง MANUAL-ENTRY โดยอัตโนมัติ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualAddOpen(false)}
                  disabled={isManualSaving}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-900 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                >
                  ยกเลิก (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleSaveManualItem}
                  disabled={isManualSaving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isManualSaving ? 'กำลังจัดเก็บสินค้า...' : 'บันทึกเพิ่มสินค้า (Save Item)'}</span>
                </button>
              </div>
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setSuccess(false);
    setImportedCount(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Grab values as header 1 matrix
        const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (!jsonData || jsonData.length === 0) {
          throw new Error('ไม่พบข้อมูลในไฟล์ Excel (Your Excel file appears to be empty)');
        }

        // Auto-resolve vertically and horizontally merged cells using SheetJS merges metadata
        if (worksheet['!merges']) {
          worksheet['!merges'].forEach((merge: any) => {
            const startRow = merge.s.r;
            const startCol = merge.s.c;
            const endRow = merge.e.r;
            const endCol = merge.e.c;
            
            const mainValue = jsonData[startRow]?.[startCol];
            if (mainValue !== undefined && mainValue !== null && mainValue !== '') {
              for (let r = startRow; r <= endRow; r++) {
                if (!jsonData[r]) {
                  jsonData[r] = [];
                }
                for (let c = startCol; c <= endCol; c++) {
                  while (jsonData[r].length <= c) {
                    jsonData[r].push(null);
                  }
                  // Fill the merged value if it's currently empty/undefined
                  if (jsonData[r][c] === undefined || jsonData[r][c] === null || jsonData[r][c] === '') {
                    jsonData[r][c] = mainValue;
                  }
                }
              }
            }
          });
        }

        // Search for header row containing key columns
        let headerRowIndex = -1;
        let headerKeys: string[] = [];

        for (let i = 0; i < Math.min(jsonData.length, 50); i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;
          
          const hasPartNo = row.some(cell => {
            const str = String(cell || '').toLowerCase().trim();
            return str === 'part no.' || str === 'part no' || str === 'partno' || str === 'part_no' || str === 'part_number';
          });
          const hasSerialNo = row.some(cell => {
            const str = String(cell || '').toLowerCase().trim();
            return str === 'serial no.' || str === 'serial no' || str === 'serialno' || str === 'serial_no' || str === 'serial_number';
          });
          const hasDescription = row.some(cell => {
            const str = String(cell || '').toLowerCase().trim();
            return str === 'description' || str === 'item' || str === 'desc';
          });

          if ((hasPartNo && hasSerialNo) || (hasPartNo && hasDescription) || (hasSerialNo && hasDescription)) {
            headerRowIndex = i;
            headerKeys = Array.from(row).map(cell => String(cell || '').toLowerCase().trim());
            break;
          }
        }

        // Fallback to first row
        if (headerRowIndex === -1) {
          headerRowIndex = 0;
          headerKeys = Array.from(jsonData[0] || []).map(cell => String(cell || '').toLowerCase().trim());
        }

        const getColIdx = (keywords: string[]) => {
          return headerKeys.findIndex(key => 
            key && typeof key === 'string' && keywords.some(keyword => key.includes(keyword))
          );
        };

        const colIdxs = {
          invoiceNo: getColIdx(['files no', 'file no', 'files', 'file']),
          lineItem: getColIdx(['line item', 'line', 'item line']),
          partNo: getColIdx(['part no', 'partno', 'part_no', 'part']),
          serialNo: getColIdx(['serial no', 'serialno', 'serial_no', 'serial']),
          description: getColIdx(['description', 'desc']),
          coo: getColIdx(['coo', 'origin', 'country of origin']),
          hsCode: getColIdx(['hs code', 'hscode', 'hs_code', 'hs']),
          eccn: getColIdx(['eccn']),
          qty: getColIdx(['qty', 'quantity', 'quantity/qty']),
          uom: getColIdx(['uom', 'unit']),
          unitPrice: getColIdx(['unit price', 'price', 'unit_price']),
          amount: getColIdx(['amount']),
          itemWeight: getColIdx(['weight', 'item weight', 'weight (kg)', 'weight(kg)']),
          meaningInThai: getColIdx(['meaning in thai', 'meaning index', 'thai', 'meaning']),
          dimension: getColIdx(['dimension', 'dimention', 'dimensions']),
          package: getColIdx(['package']),
          status: getColIdx(['status']),
          customEntry: getColIdx(['custom entry', 'custom_entry', 'import entry no', 'import entry', 'import_entry', 'entry no', 'entry_no']),
          destination: getColIdx(['destination', 'dest']),
          vessel: getColIdx(['vessel']),
          segment: getColIdx(['segment']),
          ibase: getColIdx(['ibase']),
          remark: getColIdx(['remark', 'remarks'])
        };

        const parsedItems: Partial<InventoryItem>[] = [];

        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;

          const partNo = colIdxs.partNo !== -1 ? String(row[colIdxs.partNo] || '').trim() : '';
          const serialNo = colIdxs.serialNo !== -1 ? String(row[colIdxs.serialNo] || '').trim() : '';
          const description = colIdxs.description !== -1 ? String(row[colIdxs.description] || '').trim() : '';

          // Skip completely empty rows
          if (!partNo && !serialNo && !description) {
            continue;
          }

          const parseNumber = (val: any): number | undefined => {
            if (val === undefined || val === null) return undefined;
            if (typeof val === 'number') return val;
            const cleaned = String(val).replace(/,/g, '').trim();
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? undefined : parsed;
          };

          const item: Partial<InventoryItem> = {
            serialNo: serialNo || 'N/A',
            partNo: partNo || 'N/A',
            description: description || 'No Description',
            status: 'IN',
            currentLocation: 'In-Base'
          };

          if (colIdxs.invoiceNo !== -1 && row[colIdxs.invoiceNo] !== undefined) {
            item.invoiceNo = String(row[colIdxs.invoiceNo] || '').trim();
          }
          if (colIdxs.lineItem !== -1 && row[colIdxs.lineItem] !== undefined) {
            item.lineItem = String(row[colIdxs.lineItem] || '').trim();
          }
          if (colIdxs.coo !== -1 && row[colIdxs.coo] !== undefined) {
            item.coo = String(row[colIdxs.coo] || '').trim();
          }
          if (colIdxs.hsCode !== -1 && row[colIdxs.hsCode] !== undefined) {
            item.hsCode = String(row[colIdxs.hsCode] || '').trim();
          }
          if (colIdxs.eccn !== -1 && row[colIdxs.eccn] !== undefined) {
            item.eccn = String(row[colIdxs.eccn] || '').trim();
          }
          if (colIdxs.qty !== -1 && row[colIdxs.qty] !== undefined) {
            item.qty = parseNumber(row[colIdxs.qty]) ?? 1;
          }
          if (colIdxs.uom !== -1 && row[colIdxs.uom] !== undefined) {
            item.uom = String(row[colIdxs.uom] || '').trim();
          }
          if (colIdxs.unitPrice !== -1 && row[colIdxs.unitPrice] !== undefined) {
            item.unitPrice = parseNumber(row[colIdxs.unitPrice]) ?? 0;
          }
          if (colIdxs.amount !== -1 && row[colIdxs.amount] !== undefined) {
            item.amount = parseNumber(row[colIdxs.amount]) ?? 0;
          }
          if (colIdxs.itemWeight !== -1 && row[colIdxs.itemWeight] !== undefined) {
            const wNum = parseNumber(row[colIdxs.itemWeight]);
            item.itemWeight = wNum !== undefined ? wNum : String(row[colIdxs.itemWeight]).trim();
          }
          if (colIdxs.meaningInThai !== -1 && row[colIdxs.meaningInThai] !== undefined) {
            item.meaningInThai = String(row[colIdxs.meaningInThai] || '').trim();
          }
          if (colIdxs.dimension !== -1 && row[colIdxs.dimension] !== undefined) {
            item.dimension = String(row[colIdxs.dimension] || '').trim();
          }
          if (colIdxs.package !== -1 && row[colIdxs.package] !== undefined) {
            item.package = String(row[colIdxs.package] || '').trim();
          }
          if (colIdxs.customEntry !== -1 && row[colIdxs.customEntry] !== undefined) {
            const val = String(row[colIdxs.customEntry] || '').trim();
            item.customEntry = val;
            item.importEntryNo = val;
          }
          if (colIdxs.status !== -1 && row[colIdxs.status] !== undefined) {
            item.customsStatus = String(row[colIdxs.status] || '').trim();
          }
          if (colIdxs.destination !== -1 && row[colIdxs.destination] !== undefined) {
            item.currentLocation = String(row[colIdxs.destination] || '').trim() || 'In-Base';
          }
          if (colIdxs.vessel !== -1 && row[colIdxs.vessel] !== undefined) {
            item.vessel = String(row[colIdxs.vessel] || '').trim();
          }
          if (colIdxs.segment !== -1 && row[colIdxs.segment] !== undefined) {
            item.segment = String(row[colIdxs.segment] || '').trim();
          }
          if (colIdxs.ibase !== -1 && row[colIdxs.ibase] !== undefined) {
            item.ibase = String(row[colIdxs.ibase] || '').trim();
          }
          if (colIdxs.remark !== -1 && row[colIdxs.remark] !== undefined) {
            item.remark = String(row[colIdxs.remark] || '').trim();
          }

          parsedItems.push(item);
        }

        if (parsedItems.length === 0) {
          throw new Error('ไม่สามารถวิเคราะห์ข้อมูลสินค้าได้ หรือไม่มีแถวสินค้าที่ถูกต้องในไฟล์ Excel นี้ (Could not parse any valid product rows with part, serial, or description)');
        }

        console.log('Parsed Master Inventory items count:', parsedItems.length);
        
        // Save items bulk wise
        await importMasterInventory(parsedItems);

        setImportedCount(parsedItems.length);
        setSuccess(true);
      } catch (err: any) {
        console.error('Error importing master file:', err);
        setError(err.message || String(err));
      } finally {
        setIsProcessing(false);
        event.target.value = '';
      }
    };

    reader.onerror = () => {
      setError('เกิดข้อผิดพลาดในการอ่านไฟล์ (Failed to read file)');
      setIsProcessing(false);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-12">
      <div className="border-b-4 border-slate-900 pb-8">
        <h2 className="text-4xl font-black uppercase tracking-tighter italic">System Configuration</h2>
        <p className="text-xs font-bold uppercase tracking-widest opacity-40 mt-2">Administrative Control & Global State Management</p>
      </div>

      {/* MASTER INVENTORY UPLOADER CONTAINER */}
      <div className="p-8 border-4 border-slate-900 bg-white space-y-6 neo-brutalism-shadow">
        <div className="border-b-2 border-slate-200 pb-4">
          <div className="flex items-center gap-3 text-emerald-600">
            <Upload className="w-6 h-6" />
            <h3 className="text-xl font-black uppercase tracking-tight">นำเข้า Master Inventory (Import Master File)</h3>
          </div>
          <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">
            เพิ่มฐานข้อมูลสินค้าหลักโดยตรงจากไฟล์ Excel เพื่อใช้เป็นข้อมูลตั้งต้นสำหรับการจับคู่ CIPL
          </p>
        </div>

        <div className="relative border-4 border-dashed border-slate-900 bg-slate-50 p-8 flex flex-col items-center justify-center text-center group hover:bg-slate-100 transition-colors">
          <input 
            type="file" 
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            disabled={isProcessing}
          />
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Upload className="w-12 h-12 animate-bounce text-emerald-600" />
              <span className="font-mono text-[10px] font-black uppercase text-slate-800">
                กำลังนำเข้าข้อมูล Master Inventory... (PROCESSING MASTER INVENTORY...)
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Upload className="w-12 h-12 text-slate-400 group-hover:text-amber-500 group-hover:scale-110 transition-all duration-300" />
              <div className="space-y-2">
                <span className="font-mono text-xs font-black uppercase text-slate-800 block">
                  คลิกที่นี่ หรือ ลากไฟล์ Excel มาวาง เพื่อดำเนินการอัปโหลด
                </span>
                <span className="text-[9px] uppercase font-bold text-slate-400 block">
                  รองรับเอกสารนามสกุล .xlsx และ .xls บันทึกข้อมูลคอลัมน์ Part No, Serial No, Description, COO, และอื่นๆ
                </span>
              </div>
            </div>
          )}
        </div>

        {/* FEEDBACK STATUS ALERTS */}
        {success && (
          <div className="flex items-start gap-4 bg-emerald-50 border-4 border-emerald-500 p-6 text-emerald-800 transition-all font-mono">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider">นำเข้าข้อมูลสินค้าสำเร็จ! (Import Success)</h4>
              <p className="text-xs uppercase font-bold mt-1 text-emerald-700">
                เพิ่มรายการสินค้าในไฟล์ Master Inventory ลงในฐานข้อมูลผู้ใช้งานของคุณเรียบร้อยแล้ว ทั้งหมด {importedCount} รายการ
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-4 bg-red-50 border-4 border-red-500 p-6 text-red-800 transition-all font-mono">
            <AlertCircle className="w-6 h-6 shrink-0 text-red-600" />
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider">เกิดข้อผิดพลาดในการนำเข้าข้อมูล (Import Failed)</h4>
              <p className="text-xs uppercase font-bold mt-1 text-red-600">
                {error}
              </p>
            </div>
          </div>
        )}
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

