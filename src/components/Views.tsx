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
  CheckCircle2,
  RefreshCw,
  Plus,
  Minus,
  Building2,
  ExternalLink,
  Eye,
  ChevronRight,
  Copy
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
  getDisplaySerial,
  processPartialInOut,
  cleanupOutInventoryItems
} from '../lib/inventoryService';
import * as XLSX from 'xlsx';
import { exportItemsToExcel, exportLogsToExcel, generateItemsTSV } from '../lib/exportUtils';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { HoldToConfirmButton } from './HoldToConfirmButton';
import { auth } from '../lib/firebase';

interface InventoryListProps {
  initialSegment?: string;
  onClearInitialSegment?: () => void;
}

export function InventoryList({ initialSegment, onClearInitialSegment }: InventoryListProps = {}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  // Default to 'grid' (กรอบเล็ก) on mobile screens (< 768px) so users don't have to scroll horizontally
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'grid';
    }
    return 'table';
  });
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedSegment, setSelectedSegment] = useState<string>(initialSegment || 'ALL');

  useEffect(() => {
    if (initialSegment) {
      setSelectedSegment(initialSegment);
    }
  }, [initialSegment]);
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

  // IN/OUT Stock Deduction Modal States
  const [inOutItem, setInOutItem] = useState<InventoryItem | null>(null);
  const [inOutType, setInOutType] = useState<'IN' | 'OUT'>('OUT');
  const [inOutQty, setInOutQty] = useState<number>(1);
  const [inOutDestination, setInOutDestination] = useState<string>('ต่างประเทศ/เบิกใช้งาน');
  const [inOutInvoice, setInOutInvoice] = useState<string>('');
  const [inOutRemark, setInOutRemark] = useState<string>('');
  const [isInOutProcessing, setIsInOutProcessing] = useState<boolean>(false);

  const handleOpenInOutModal = (item: InventoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setInOutItem(item);
    setInOutType(item.status === 'IN' ? 'OUT' : 'IN');
    setInOutQty(1);
    setInOutDestination(item.status === 'IN' ? 'ต่างประเทศ/เบิกใช้งาน' : 'In-Base');
    setInOutInvoice('');
    setInOutRemark('');
  };

  const handleConfirmInOut = async () => {
    if (!inOutItem) return;
    setIsInOutProcessing(true);
    try {
      await processPartialInOut({
        item: inOutItem,
        transactionType: inOutType,
        qtyToProcess: inOutQty,
        destinationLocation: inOutDestination,
        invoiceNo: inOutInvoice,
        remark: inOutRemark
      });
      const isFullOut = inOutType === 'OUT' && inOutQty >= (inOutItem.qty !== undefined ? Number(inOutItem.qty) : 1);
      const msg = inOutType === 'OUT'
        ? (isFullOut 
            ? `ตัดสต็อกเบิกออกทั้งหมด ${inOutQty} ${inOutItem.uom || 'EA'} สำเร็จ! รายการนี้ถูกนำออกจากระบบคงคลังเรียบร้อยแล้ว`
            : `ทำรายการตัดสต็อกเบิกออกจำนวน ${inOutQty} ${inOutItem.uom || 'EA'} สำเร็จแล้ว!`)
        : `ทำรายการรับเข้าเพิ่มจำนวน ${inOutQty} ${inOutItem.uom || 'EA'} เรียบร้อยแล้ว!`;
      setCopyNotification(msg);
      setTimeout(() => setCopyNotification(null), 5000);
      setInOutItem(null);
      if (isFullOut && selectedItem?.serialNo === inOutItem.serialNo) {
        setSelectedItem(null);
      }
    } catch (err: any) {
      console.error("Error processing in/out:", err);
      alert('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถตัดสต็อกได้'));
    } finally {
      setIsInOutProcessing(false);
    }
  };

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
    // Automatically purge any residual OUT items from the inventory database to ensure real-time clarity
    cleanupOutInventoryItems().catch(console.error);
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
    // Strictly exclude any OUT or 0-qty items: admin wants items that are cut/invoiced out to leave the inventory view completely
    if (i.status === 'OUT' || (i.qty !== undefined && Number(i.qty) <= 0)) {
      return false;
    }

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
      (selectedSegment === 'ไม่ระบุแผนก (Unassigned)' ? !i.segment || i.segment.trim() === '' : i.segment === selectedSegment);

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
    <div className="space-y-6 sm:space-y-8">
      {copyNotification && (
        <div className="fixed top-6 right-6 bg-slate-900/90 backdrop-blur-xl border border-white/20 max-w-sm p-4 z-[9999] rounded-2xl shadow-2xl flex items-start gap-3 text-white duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-emerald-400">คัดลอกข้อมูลสำเร็จ (Copy Successful)</h4>
            <p className="font-sans text-xs text-slate-200 mt-1">
              {copyNotification}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative group flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input 
            type="text" 
            placeholder="ค้นหา Serial / Part / Desc / Invoice / แผนก..."
            className="pl-11 pr-4 py-3 rounded-2xl bg-white/70 backdrop-blur-md border border-white/80 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 w-full transition-all shadow-sm font-medium"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* iOS Segmented Control for View Mode */}
          <div className="flex items-center p-1 rounded-2xl bg-white/70 backdrop-blur-md border border-white/80 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === 'grid' 
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/25" 
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="มุมมองกรอบเล็ก (เหมาะสำหรับมือถือ)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>กรอบเล็ก</span>
              <span className="md:hidden text-[8px] px-1 py-0.2 bg-amber-400 text-slate-950 font-bold rounded-full">
                แนะนำ
              </span>
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === 'table' 
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/25" 
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="มุมมองตาราง"
            >
              <List className="w-3.5 h-3.5" />
              <span>ตาราง</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters (Location & Segment) with iOS Liquid Glass */}
      <div className="liquid-glass-card p-5 sm:p-6 rounded-3xl border border-white/80 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Location Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <MapPin className="w-4 h-4 text-blue-600" />
              สถานที่จัดเก็บ (Location):
            </span>
            <div className="relative flex-1">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="appearance-none px-4 py-2.5 pr-10 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-xl font-mono text-xs font-semibold uppercase focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all w-full cursor-pointer h-[40px] text-slate-800 shadow-sm"
              >
                <option value="ALL">★ สรุปทั้งหมดในระบบ (Show All Locations)</option>
                {uniqueLocations.map(loc => (
                  <option key={loc} value={loc}>
                    {loc.toUpperCase()}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <Filter className="w-3.5 h-3.5" />
              </div>
            </div>
            
            {selectedLocation !== 'ALL' && (
              <button
                onClick={() => setSelectedLocation('ALL')}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 h-[40px]"
                title="ล้างส่วนกรองสถานที่"
              >
                <X className="w-3.5 h-3.5" />
                <span>ล้าง</span>
              </button>
            )}
          </div>

          {/* Segment Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Activity className="w-4 h-4 text-indigo-600" />
              แผนกสินค้า (Segment):
            </span>
            <div className="relative flex-1">
              <select
                value={selectedSegment}
                onChange={(e) => {
                  setSelectedSegment(e.target.value);
                  if (onClearInitialSegment && e.target.value === 'ALL') {
                    onClearInitialSegment();
                  }
                }}
                className="appearance-none px-4 py-2.5 pr-10 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-xl font-mono text-xs font-semibold uppercase focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all w-full cursor-pointer h-[40px] text-slate-800 shadow-sm"
              >
                <option value="ALL">★ แผนกทั้งหมดในระบบ (Show All Segments)</option>
                {selectedSegment !== 'ALL' && !uniqueSegments.includes(selectedSegment) && (
                  <option value={selectedSegment}>
                    {selectedSegment.toUpperCase()}
                  </option>
                )}
                {uniqueSegments.map(seg => (
                  <option key={seg} value={seg}>
                    {seg.toUpperCase()}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <Filter className="w-3.5 h-3.5" />
              </div>
            </div>
            
            {selectedSegment !== 'ALL' && (
              <button
                onClick={() => {
                  setSelectedSegment('ALL');
                  if (onClearInitialSegment) onClearInitialSegment();
                }}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 h-[40px]"
                title="ล้างส่วนกรองเซกเมนต์"
              >
                <X className="w-3.5 h-3.5" />
                <span>ล้าง</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Options and Summary Action Toolbar */}
        <div className="pt-3 border-t border-slate-200/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
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
              className="px-4 py-2 rounded-xl bg-white/80 hover:bg-white text-slate-700 font-semibold text-xs border border-white/80 shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 h-[38px]"
              title="คัดลอกข้อมูลตารางเพื่อไปวางใน Excel (Copy for Excel Paste)"
            >
              <Check className="w-3.5 h-3.5 text-blue-600" />
              <span>คัดลอกสำหรับ Excel ({filtered.length})</span>
            </button>

            <button
              onClick={() => exportItemsToExcel(filtered, `inventory_${selectedLocation.toLowerCase()}_${selectedSegment.toLowerCase()}_export.xlsx`)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white font-semibold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 h-[38px]"
              title="ส่งออกรายการสินค้าทั้งหมดไปยังไฟล์ Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดาวน์โหลด Excel</span>
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
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-xs shadow-md shadow-blue-500/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 h-[38px]"
              title="เพิ่มรายการสินค้าใหม่เข้าสู่คลังแบบกรอกเอง (Add Item Manually)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มสินค้า (Manual Add)</span>
            </button>
          </div>

          <div className="text-left md:text-right shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-0.5">Matched count</span>
            <span className="text-xs font-bold font-mono text-slate-800 bg-white/80 px-3 py-1.5 rounded-xl border border-white/80 block min-w-[70px] text-center shadow-sm">
              {filtered.length} / {items.length} รายการ
            </span>
          </div>
        </div>
      </div>

      <div className="liquid-glass-card rounded-3xl border border-white/80 shadow-md overflow-hidden">
        {viewMode === 'table' ? (
          <div>
            {/* Mobile notification for table mode with 1-click switch to grid */}
            <div className="md:hidden bg-amber-500/10 backdrop-blur-md border-b border-amber-500/20 p-2.5 px-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
                <span>📱 กำลังแสดงแบบตาราง (สไลด์ข้างเพื่อดูข้อมูล)</span>
              </div>
              <button
                onClick={() => setViewMode('grid')}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 shrink-0 shadow-sm cursor-pointer active:scale-95 transition-all"
              >
                <LayoutGrid className="w-3 h-3 text-slate-950" />
                <span>เปลี่ยนเป็นกรอบเล็ก</span>
              </button>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/75 backdrop-blur-md text-slate-500 border-b border-slate-200/60">
                  <th className="px-4 py-3.5 w-12 text-center select-none font-semibold text-[10px] uppercase">
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                      className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                      title="เลือกทั้งหมด"
                    >
                      {allFilteredAreSelected ? (
                        <CheckSquare className="w-4.5 h-4.5 text-blue-600" />
                      ) : someFilteredAreSelected ? (
                        <div className="w-4.5 h-4.5 rounded border border-blue-500 bg-blue-500/20 flex items-center justify-center">
                          <div className="w-2 h-1 bg-blue-600 rounded-sm" />
                        </div>
                      ) : (
                        <Square className="w-4.5 h-4.5 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500">IBASE</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500 text-center">Line</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500">Part No.</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500">Serial No.</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500">Description</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500 text-center">QTY</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500 text-center">Status / Location</th>
                  <th className="px-4 py-3.5 text-[10px] uppercase font-bold tracking-wider text-slate-500 text-center">จัดการสต็อก (IN-OUT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-24 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-30">
                        <Package className="w-14 h-14" />
                        <p className="text-xs font-semibold text-slate-500">ไม่มีข้อมูลสินค้าในระบบ</p>
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
                    { bg: 'bg-white/80 text-slate-800', tag: 'bg-amber-500/15 text-amber-800 border-amber-500/30' },
                    { bg: 'bg-white/80 text-slate-800', tag: 'bg-blue-500/15 text-blue-800 border-blue-500/30' },
                    { bg: 'bg-white/80 text-slate-800', tag: 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30' },
                    { bg: 'bg-white/80 text-slate-800', tag: 'bg-indigo-500/15 text-indigo-800 border-indigo-500/30' },
                  ];

                  return groups.map((groupName, groupIdx) => {
                    const groupItems = itemsByGroup[groupName];
                    const colorScheme = groupColors[groupIdx % groupColors.length];
                    
                    return (
                      <React.Fragment key={groupName}>
                        {/* Group Header Row */}
                        <tr className="bg-slate-50/80 backdrop-blur-sm border-y border-slate-200/50">
                          <td colSpan={9} className="px-4 py-2.5 align-middle select-none">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className={cn("px-3 py-1 text-xs font-bold rounded-full border shadow-sm", colorScheme.tag)}>
                                  📂 {groupName === 'UNASSIGNED' ? 'ไม่มีรหัสไฟล์' : `ไฟล์: ${groupName}`}
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {groupItems.length} รายการ
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
                                "hover:bg-blue-50/40 cursor-pointer border-b border-slate-100 transition-colors group",
                                isChecked ? "bg-blue-50/50" : ""
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
                              <td className="px-4 py-3 text-[11px] font-mono font-medium text-slate-600 select-all">
                                {item.ibase || '-'}
                              </td>

                              {/* Line Item */}
                              <td className="px-4 py-3 text-center text-xs font-mono font-medium text-slate-400">
                                {item.lineItem || '-'}
                              </td>

                              {/* Part No */}
                              <td className="px-4 py-3 text-xs font-mono font-bold tracking-tight text-slate-800 break-all select-all">
                                {item.partNo || 'N/A'}
                              </td>

                              {/* Serial No */}
                              <td className="px-4 py-3 text-xs font-sans font-bold tracking-tight text-blue-600 break-all select-all">
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
                                <span className="bg-amber-100 text-amber-950 px-2 py-0.5 border border-amber-300 font-black">
                                  {item.qty !== undefined ? item.qty : 1} {item.uom || 'EA'}
                                </span>
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

                              {/* IN/OUT Action */}
                              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenInOutModal(item, e)}
                                  className="px-2.5 py-1 bg-amber-400 hover:bg-amber-500 text-slate-950 border-2 border-slate-900 text-[9.5px] font-black uppercase tracking-tight inline-flex items-center gap-1 shadow-[1.5px_1.5px_0px_0px_rgba(15,23,42,1)] cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
                                  title="ตัดสต็อกเบิกออก / คืนเข้าคลัง"
                                >
                                  <RefreshCw className="w-3 h-3 text-slate-950" />
                                  <span>เบิก/คืน (IN-OUT)</span>
                                </button>
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
        </div>
        ) : (
          /* Small Boxes (กรอบเล็กๆ) Grid view - Optimized for Mobile */
          <div className="p-3 sm:p-4 md:p-6">
            {filtered.length === 0 ? (
              <div className="p-16 sm:p-24 text-center">
                <div className="flex flex-col items-center gap-2 opacity-20">
                  <Package className="w-16 h-16" />
                  <p className="text-sm uppercase font-black tracking-widest">Data_Buffer_Empty</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
                {filtered.map((item) => {
                  const isChecked = selectedSerials.includes(item.serialNo);
                  return (
                    <div 
                      key={item.serialNo}
                      className={cn(
                        "bg-white/70 backdrop-blur-xl border border-white/80 p-4 rounded-2xl shadow-sm hover:shadow-lg hover:border-blue-400/50 hover:bg-white/90 transition-all flex flex-col justify-between group relative min-h-[185px] cursor-pointer",
                        isChecked ? "border-blue-500 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-md" : ""
                      )}
                      onClick={() => handleSelectItem(item)}
                    >
                      <div>
                        {/* Header status, invoice tag, and location */}
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-tight ${
                              item.status === 'IN' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border border-rose-500/20 bg-rose-500/10 text-rose-700'
                            }`}>
                              {item.status === 'IN' ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                              {item.status}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1 max-w-[60%] justify-end">
                            <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                            <span className="text-[10px] uppercase font-bold tracking-tight truncate text-slate-600" title={item.currentLocation}>
                              {item.currentLocation || 'In-Base'}
                            </span>
                          </div>
                        </div>

                        {/* Invoice & Department Tags */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {item.invoiceNo && (
                            <span className="text-[9px] font-mono font-semibold bg-slate-100/80 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200/60 truncate max-w-[130px]" title={item.invoiceNo}>
                              📁 #{item.invoiceNo}
                            </span>
                          )}
                          {item.segment && (
                            <span className="text-[9px] font-mono font-semibold bg-blue-500/10 text-blue-800 px-2 py-0.5 rounded-md border border-blue-500/20 truncate max-w-[110px]" title={item.segment}>
                              🏢 {item.segment}
                            </span>
                          )}
                        </div>

                        {/* Serial Number with Quick Copy button */}
                        <div className="flex items-center justify-between gap-1 bg-white/80 backdrop-blur-md border border-white/90 shadow-sm rounded-xl px-2.5 py-1.5 mb-2">
                          <p className="text-xs font-bold font-mono tracking-tight text-slate-900 break-all leading-tight">
                            {getDisplaySerial(item.serialNo)}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(getDisplaySerial(item.serialNo));
                              setCopyNotification(`คัดลอก S/N: ${getDisplaySerial(item.serialNo)} เรียบร้อย`);
                              setTimeout(() => setCopyNotification(null), 2500);
                            }}
                            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-800 rounded-lg cursor-pointer shrink-0 transition-colors"
                            title="คัดลอก Serial Number"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Description and Part */}
                        <div className="space-y-0.5 mb-2">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-[10px] uppercase font-bold tracking-tight text-blue-600 font-mono">
                              {item.partNo || 'NO PART REF'}
                            </p>
                            {item.customsStatus && (
                              <span className="text-[8px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                {item.customsStatus}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold tracking-tight line-clamp-2 leading-snug text-slate-800" title={item.description}>
                            {item.description}
                          </p>
                          {item.meaningInThai && (
                            <p className="text-[10px] text-slate-500 line-clamp-1 italic">
                              ({item.meaningInThai})
                            </p>
                          )}
                        </div>

                        {/* QTY & Action Button */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                            QTY: {item.qty !== undefined ? item.qty : 1} {item.uom || 'EA'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleOpenInOutModal(item, e)}
                            className="px-3 py-1.5 bg-gradient-to-tr from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-sans text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-all"
                            title="ตัดสต็อกเบิกออก / คืนเข้าคลัง"
                          >
                            <RefreshCw className="w-3 h-3 text-slate-950" />
                            <span>เบิก/คืน</span>
                          </button>
                        </div>
                      </div>

                      {/* Footer entry and timing */}
                      <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-1">
                        {item.importEntryNo ? (
                          <div className="flex items-center justify-between text-[9px] gap-2">
                            <span className="font-semibold text-blue-600 truncate italic">
                              IE: {item.importEntryNo}
                            </span>
                            <span className="text-slate-400 font-medium shrink-0">
                              Line: {item.importEntryLineNo || '-'}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-400 italic">
                            No Import Entry
                          </div>
                        )}
                        
                        <div className="text-[9px] font-mono text-slate-400 text-right flex items-center justify-between gap-1 leading-none mt-0.5">
                          <span className="text-blue-600 font-sans font-bold text-[9px] tracking-wide shrink-0 flex items-center gap-0.5">
                            ดูรายละเอียด ➔
                          </span>
                          <span className="text-right text-[9px]">
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
        <div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border-2 sm:border-4 border-slate-900 text-white p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 z-40 shadow-[4px_4px_0px_0px_rgba(244,63,94,1)] w-[94%] sm:w-[90%] max-w-2xl select-none">
          <div className="flex items-center justify-between w-full md:w-auto gap-3">
            <span className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-mono text-[10px] font-black tracking-tight border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
              เลือก {selectedSerials.length} ชิ้น
            </span>
            <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-350 hidden md:block">
              ตรวจสอบแล้ว {selectedSerials.length} รายการ ➔ สั่งทำการเขียนสเปค Excel ได้ทันที
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto justify-end w-full md:w-auto">
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
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => {
            setSelectedItem(null);
            setTempItem(null);
            setIsLocationExpanded(false);
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-3xl border border-white/80 w-full max-w-5xl rounded-3xl shadow-2xl relative my-auto sm:my-8 flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => {
                setSelectedItem(null);
                setTempItem(null);
                setIsLocationExpanded(false);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-white/80 shadow-sm flex items-center justify-center transition-colors z-10 cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Heading Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-5 sm:p-6 pr-14 sm:pr-16 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-white/10">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-[10px] uppercase font-bold bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30 font-mono tracking-wide">
                    CIPL Profile Workspace
                  </span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                    tempItem.status === 'IN' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                  }`}>
                    {tempItem.status}
                  </span>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-amber-400/30">
                    คงเหลือ: {tempItem.qty !== undefined ? tempItem.qty : 1} {tempItem.uom || 'EA'}
                  </span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold font-mono tracking-tight uppercase break-all">
                  {getDisplaySerial(tempItem.serialNo)}
                </h3>
              </div>

              <button
                type="button"
                onClick={(e) => handleOpenInOutModal(tempItem, e)}
                className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-sans text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 transition-all shrink-0 self-start md:self-auto"
              >
                <RefreshCw className="w-3.5 h-3.5 text-slate-950" />
                <span>ตัดสต็อก / เบิกออก-คืนเข้า (IN-OUT)</span>
              </button>
            </div>

            {/* Navigation Tab Heads (iOS Segmented Tabs) */}
            <div className="flex border-b border-slate-200/60 bg-white/60 backdrop-blur-md px-4 pt-2 font-semibold text-xs tracking-tight shrink-0 select-none overflow-x-auto scrollbar-none gap-2">
              <button
                type="button"
                onClick={() => setModalTab('profile')}
                className={cn(
                  "px-4 py-2.5 rounded-t-xl transition-all cursor-pointer whitespace-nowrap",
                  modalTab === 'profile' ? "bg-white text-blue-600 font-bold border-b-2 border-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                📝 รายละเอียดฝ่ายแอดมิน & การศุลกากร
              </button>
              <button
                type="button"
                onClick={() => setModalTab('history')}
                className={cn(
                  "px-4 sm:px-6 py-3 sm:py-4 border-r-2 border-slate-900 transition-colors uppercase cursor-pointer whitespace-nowrap",
                  modalTab === 'history' ? "bg-white text-slate-900 border-b-[4px] border-b-blue-600" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                🚚 บันทึกประวัติเคลื่อนย้าย ({logs.filter(log => log.serialNo?.trim() === selectedItem.serialNo?.trim()).length} รอบ)
              </button>
            </div>

            {/* Tab Panels Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50/50">
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
                      <label className="text-[8.5px] text-slate-400 font-mono font-black uppercase">แผนก (SEGMENT / IBASE)</label>
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
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => {
            if (!isManualSaving) {
              setIsManualAddOpen(false);
            }
          }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-3xl border border-white/80 w-full max-w-4xl rounded-3xl shadow-2xl relative my-auto sm:my-8 flex flex-col max-h-[95vh] sm:max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => {
                if (!isManualSaving) {
                  setIsManualAddOpen(false);
                }
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-white/80 shadow-sm flex items-center justify-center transition-colors z-10 cursor-pointer"
              aria-label="Close dialog"
              disabled={isManualSaving}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-5 sm:p-6 pr-14 sm:pr-16 shrink-0 border-b border-white/10">
              <span className="text-[10px] uppercase font-bold bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30 font-mono tracking-wide">
                Manual Item Creation
              </span>
              <h3 className="text-xl md:text-2xl font-bold font-sans tracking-tight uppercase mt-1">
                สร้างรายการสินค้าใหม่ด้วยตนเอง
              </h3>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50/50 space-y-4 sm:space-y-6">
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
                    <label className="text-[8.5px] text-slate-500 font-mono font-black uppercase">แผนก (SEGMENT)</label>
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
                    <label className="text-[8.5px] text-slate-500 font-mono font-black block">จำนวน (QTY OF ITEM)</label>
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
            <div className="p-3 sm:p-4 bg-white border-t-2 sm:border-t-4 border-slate-900 flex justify-between items-center px-4 sm:px-6 shrink-0 flex-wrap gap-3 select-none">
              <span className="text-[8.5px] sm:text-[9.5px] font-sans font-extrabold text-slate-400">
                ⚠️ การคลิกปุ่มบันทึกจะสร้าง Log ประวัติเข้าคลัง MANUAL-ENTRY โดยอัตโนมัติ
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsManualAddOpen(false)}
                  disabled={isManualSaving}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border-2 border-slate-900 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                >
                  ยกเลิก (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleSaveManualItem}
                  disabled={isManualSaving}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white border-2 border-slate-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isManualSaving ? 'กำลังจัดเก็บสินค้า...' : 'บันทึกเพิ่มสินค้า (Save Item)'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 🚚 Pop-up IN/OUT Stock Deduction Modal Panel */}
      {inOutItem && (
        <div 
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto select-none"
          onClick={() => { if (!isInOutProcessing) setInOutItem(null); }}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white/90 backdrop-blur-3xl border border-white/80 w-full max-w-lg rounded-3xl shadow-2xl relative my-auto sm:my-8 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Close Button */}
            <button 
              onClick={() => { if (!isInOutProcessing) setInOutItem(null); }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-white/80 shadow-sm flex items-center justify-center transition-colors z-10 cursor-pointer"
              disabled={isInOutProcessing}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-5 pr-14 border-b border-white/10">
              <span className="text-[10px] uppercase font-bold bg-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400/30 font-mono tracking-wide">
                Stock Movement Workspace
              </span>
              <h3 className="text-lg font-bold font-sans tracking-tight uppercase mt-1.5 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>ทำรายการเบิกออก / คืนเข้าสต็อก</span>
              </h3>
            </div>

            {/* Item Summary Box */}
            <div className="p-4 sm:p-5 bg-white/60 backdrop-blur-md border-b border-slate-200/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                  S/N: {getDisplaySerial(inOutItem.serialNo)}
                </span>
                <span className={cn(
                  "text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border",
                  inOutItem.status === 'IN' ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-rose-500/10 text-rose-700 border-rose-500/20"
                )}>
                  สถานะ: {inOutItem.status} ({inOutItem.currentLocation || 'In-Base'})
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-800 uppercase font-sans line-clamp-2">
                {inOutItem.description}
              </p>
              <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-200/60">
                <span>PART: {inOutItem.partNo || 'N/A'}</span>
                <span className="text-blue-700 font-bold bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                  คงเหลือ: {inOutItem.qty !== undefined ? inOutItem.qty : 1} {inOutItem.uom || 'EA'}
                </span>
              </div>
            </div>

            {/* Main Action Form */}
            <div className="p-5 space-y-5">
              {/* Toggle IN / OUT */}
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block mb-1.5 font-mono">
                  ประเภทรายการ (TRANSACTION ACTION)
                </label>
                <div className="grid grid-cols-2 gap-3 h-[42px]">
                  <button
                    type="button"
                    onClick={() => {
                      setInOutType('OUT');
                      if (inOutDestination === 'In-Base') setInOutDestination('ต่างประเทศ/เบิกใช้งาน');
                    }}
                    className={cn(
                      "border-2 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all",
                      inOutType === 'OUT'
                        ? "bg-red-600 border-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                        : "bg-white border-slate-300 text-slate-600 hover:border-slate-800"
                    )}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    <span>🔴 เบิกออก (Check OUT)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInOutType('IN');
                      setInOutDestination('In-Base');
                    }}
                    className={cn(
                      "border-2 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all",
                      inOutType === 'IN'
                        ? "bg-emerald-600 border-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                        : "bg-white border-slate-300 text-slate-600 hover:border-slate-800"
                    )}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>🟢 คืนเข้า (Check IN)</span>
                  </button>
                </div>
              </div>

              {/* Quantity to Process */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 font-mono">
                    ระบุจำนวนที่ต้องการ{inOutType === 'OUT' ? 'เบิกออก' : 'รับเข้า'} (QTY TO {inOutType})
                  </label>
                  <span className="text-[10px] font-bold text-slate-500">
                    มีในระบบ {inOutItem.qty || 1} {inOutItem.uom || 'EA'}
                  </span>
                </div>

                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setInOutQty(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 border-2 border-slate-900 bg-slate-100 hover:bg-slate-200 font-black text-lg flex items-center justify-center cursor-pointer shrink-0"
                  >
                    -
                  </button>

                  <input 
                    type="number"
                    min={1}
                    max={inOutType === 'OUT' ? (inOutItem.qty || 1) : 99999}
                    value={inOutQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setInOutQty(Math.max(1, val));
                    }}
                    className="flex-1 h-10 border-2 border-slate-950 px-3 text-center font-mono text-base font-black bg-white focus:outline-none focus:border-blue-600"
                  />

                  <button
                    type="button"
                    onClick={() => setInOutQty(prev => prev + 1)}
                    className="w-10 h-10 border-2 border-slate-900 bg-slate-100 hover:bg-slate-200 font-black text-lg flex items-center justify-center cursor-pointer shrink-0"
                  >
                    +
                  </button>
                </div>

                {/* Preset Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[8.5px] font-black text-slate-400 uppercase font-mono">ปุ่มเลือกด่วน:</span>
                  {[1, 2, 5, 10].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setInOutQty(n)}
                      className="px-2.5 py-1 bg-white border border-slate-900 hover:bg-slate-100 font-mono text-[9px] font-black cursor-pointer shadow-[1px_1px_0px_0px_rgba(15,23,42,1)]"
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setInOutQty(inOutItem.qty || 1)}
                    className="px-2.5 py-1 bg-amber-300 border border-slate-900 hover:bg-amber-400 font-sans text-[9px] font-black cursor-pointer shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] uppercase"
                  >
                    เบิกทั้งหมด ({inOutItem.qty || 1})
                  </button>
                </div>

                {/* Dynamic Result Notice */}
                <div className="p-3 bg-amber-50 border-2 border-amber-300 text-[11px] font-bold text-amber-950 space-y-1">
                  {inOutType === 'OUT' ? (
                    <p>
                      ✂️ เบิกออก <span className="font-black text-red-600">{inOutQty}</span> {inOutItem.uom || 'EA'} ➔ สต็อกในคลังจะถูกตัดเหลือ <span className="font-black text-blue-700">{Math.max(0, (inOutItem.qty || 1) - inOutQty)}</span> {inOutItem.uom || 'EA'}
                    </p>
                  ) : (
                    <p>
                      📥 รับเข้าเพิ่ม <span className="font-black text-emerald-600">{inOutQty}</span> {inOutItem.uom || 'EA'} ➔ รวมสต็อกในคลังเป็น <span className="font-black text-blue-700">{(inOutItem.qty || 1) + inOutQty}</span> {inOutItem.uom || 'EA'}
                    </p>
                  )}
                </div>
              </div>

              {/* Destination Location */}
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block font-mono">
                  {inOutType === 'OUT' ? 'สถานที่ปลายทาง / แท่นเจาะ / ผู้เบิกไปใช้งาน (DESTINATION)' : 'สถานที่รับเข้าคลัง (LOCATION)'}
                </label>
                <input 
                  type="text"
                  value={inOutDestination}
                  onChange={(e) => setInOutDestination(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-slate-900 bg-slate-50 font-sans text-xs font-bold uppercase focus:outline-none focus:border-blue-600"
                  placeholder={inOutType === 'OUT' ? 'เช่น แท่นเจาะ Rig 4 / Songkhla Yard / Export' : 'In-Base'}
                />
                {/* Quick chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['Songkhla Base', 'Rig 4', 'Free Zone', 'Export', 'Yard 2'].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setInOutDestination(chip)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 font-sans text-[8.5px] font-bold text-slate-700 cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ref / Invoice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[8.5px] font-black uppercase text-slate-500 block font-mono">
                    เลขที่เอกสาร / INVOICE REF
                  </label>
                  <input 
                    type="text"
                    value={inOutInvoice}
                    onChange={(e) => setInOutInvoice(e.target.value)}
                    className="w-full px-2.5 py-1.5 border-2 border-slate-900 bg-slate-50 font-mono text-xs font-bold uppercase focus:outline-none focus:border-blue-600"
                    placeholder={inOutType === 'OUT' ? 'OUT-2026-001' : 'IN-2026-001'}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8.5px] font-black uppercase text-slate-500 block font-mono">
                    หมายเหตุ / REMARKS
                  </label>
                  <input 
                    type="text"
                    value={inOutRemark}
                    onChange={(e) => setInOutRemark(e.target.value)}
                    className="w-full px-2.5 py-1.5 border-2 border-slate-900 bg-slate-50 font-sans text-xs font-bold focus:outline-none focus:border-blue-600"
                    placeholder="ระบุเหตุผลการเบิก"
                  />
                </div>
              </div>
            </div>

            {/* Footer Submit */}
            <div className="p-4 bg-slate-900 border-t-2 border-slate-900 flex justify-between items-center gap-3">
              <button
                type="button"
                onClick={() => setInOutItem(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-black text-[10px] uppercase cursor-pointer border border-slate-700"
                disabled={isInOutProcessing}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={handleConfirmInOut}
                disabled={isInOutProcessing}
                className={cn(
                  "px-6 py-2.5 font-black text-xs uppercase tracking-wider border-2 border-slate-900 flex items-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] active:translate-x-0.5 active:translate-y-0.5",
                  inOutType === 'OUT' ? "bg-amber-400 hover:bg-amber-500 text-slate-950" : "bg-emerald-500 hover:bg-emerald-600 text-slate-950"
                )}
              >
                <Check className="w-4 h-4 text-slate-950" />
                <span>{isInOutProcessing ? 'กำลังตัดสต็อก...' : `ยืนยัน${inOutType === 'OUT' ? 'ตัดสต็อกเบิกออก' : 'รับเข้าสต็อก'} (${inOutQty} ${inOutItem.uom || 'EA'})`}</span>
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
    <div className="space-y-6 sm:space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-200/50 shadow-xs">
              <History className="w-4 h-4" />
            </div>
            <span>บันทึกประวัติการเดินระบบ</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 ml-10.5">ตรวจสอบบันทึกการนำเข้า-ส่งออกสินค้าและเส้นทางการขนส่ง</p>
        </div>
        
        {/* iOS Segmented Switcher */}
        <div className="flex items-center gap-1 bg-white/60 backdrop-blur-xl border border-white/80 p-1 rounded-2xl shadow-xs self-start sm:self-auto">
          <button 
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              "px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer",
              viewMode === 'grid' 
                ? "bg-white text-slate-900 shadow-xs font-bold border border-black/5" 
                : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>กรอบเล็ก</span>
          </button>
          <button 
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              "px-3.5 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer",
              viewMode === 'list' 
                ? "bg-white text-slate-900 shadow-xs font-bold border border-black/5" 
                : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
            )}
          >
            <List className="w-3.5 h-3.5" />
            <span>รายการยาว</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar (iOS Liquid Glass) */}
      <div className="liquid-glass-card p-4 sm:p-5 rounded-3xl border border-white/80 shadow-sm flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-stretch md:items-center flex-1">
          <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-slate-700 rounded-full"></span>
              เริ่มต้น (Start Date)
            </span>
            <input 
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="glass-input px-3.5 py-2 text-xs font-medium rounded-xl transition-colors w-full h-[40px] text-slate-700"
            />
          </div>

          <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
              สิ้นสุด (End Date)
            </span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="glass-input px-3.5 py-2 text-xs font-medium rounded-xl transition-colors w-full h-[40px] text-slate-700"
            />
          </div>

          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 self-start md:self-auto bg-rose-50/80 hover:bg-rose-100 text-rose-600 border border-rose-200/60 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 h-[40px] md:mt-[22px] shadow-xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>ล้างการกรอง</span>
            </button>
          )}
        </div>

        <div className="text-left md:text-right shrink-0">
          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1">Matched Records</span>
          <span className="inline-flex items-center text-xs font-bold font-mono text-slate-700 bg-white/70 border border-white/90 px-3 py-1.5 rounded-xl shadow-2xs">
            {filteredLogs.length} / {logs.length}
          </span>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-3 sm:space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-white/60 bg-white/30 backdrop-blur-md rounded-3xl flex flex-col items-center gap-2 justify-center">
              <History className="w-10 h-10 text-slate-400 opacity-60" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600">ไม่พบประวัติในช่วงวันที่ระบุ</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <motion.div 
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                key={`${log.serialNo}-${idx}`}
                className="liquid-glass-card p-4 sm:p-5 md:p-6 rounded-3xl border border-white/80 hover:bg-white/80 hover:shadow-lg transition-all flex flex-col md:flex-row md:items-center gap-4 md:gap-8 lg:gap-10 relative overflow-hidden group"
              >
                <div className={`w-1.5 h-full absolute left-0 top-0 ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                
                <div className="flex items-center justify-between md:flex-col md:items-center gap-1 md:w-24 shrink-0">
                  <div className="flex flex-col md:items-center">
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {log.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 mt-0.5">
                      {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Badge on mobile */}
                  <div className={cn(
                    "md:hidden px-2.5 py-1 rounded-full border flex items-center gap-1 font-bold text-[10px]",
                    log.transactionType === 'IN' 
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
                      : 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                  )}>
                    {log.transactionType === 'IN' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    <span>{log.transactionType}</span>
                  </div>
                </div>

                <div className="w-full md:w-52 shrink-0">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider">Invoice Ref</p>
                  <p className="text-xs font-mono font-bold text-slate-800 break-all">#{log.invoiceNo}</p>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 w-full">
                  <div className="border-t sm:border-t-0 md:border-l border-white/60 pt-2 sm:pt-0 md:pl-5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider">Asset ID</p>
                    <p className="text-xs font-bold font-mono text-blue-600 break-all">{log.serialNo}</p>
                  </div>
                  <div className="sm:col-span-2 border-t sm:border-t-0 md:border-l border-white/60 pt-2 sm:pt-0 md:pl-5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider">Geographic Routing</p>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">{log.origin}</span>
                      <div className="flex items-center gap-1 text-slate-400 shrink-0">
                        <div className="w-1 h-1 bg-slate-400 rounded-full" />
                        <div className="w-6 sm:w-10 h-[1.5px] bg-slate-300" />
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-blue-600 truncate max-w-[120px]">{log.destination}</span>
                    </div>
                  </div>
                  <div className="border-t sm:border-t-0 md:border-l border-white/60 pt-2 sm:pt-0 md:pl-5">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5 tracking-wider">Import Entry</p>
                    <p className="text-xs font-bold text-slate-800 truncate">{log.importEntryNo || 'N/A'}</p>
                    <p className="text-[10px] text-slate-400">Line {log.importEntryLineNo || '-'}</p>
                  </div>
                </div>

                <div className={cn(
                  "hidden md:flex shrink-0 w-16 h-16 rounded-2xl border flex-col items-center justify-center gap-0.5 shadow-2xs",
                  log.transactionType === 'IN' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-600'
                )}>
                  {log.transactionType === 'IN' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                  <span className="text-[10px] font-bold">{log.transactionType}</span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      ) : (
        /* Small boxes Grid View for logs (iOS Liquid Glass) */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
          {filteredLogs.length === 0 ? (
            <div className="col-span-full p-16 text-center border-2 border-dashed border-white/60 bg-white/30 backdrop-blur-md rounded-3xl flex flex-col items-center gap-2 justify-center w-full">
              <History className="w-10 h-10 text-slate-400 opacity-60" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600">ไม่พบประวัติในช่วงวันที่ระบุ</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                key={`${log.serialNo}-${idx}`}
                className="liquid-glass-card p-4 rounded-3xl border border-white/80 hover:bg-white/85 hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col justify-between group relative min-h-[175px] overflow-hidden"
              >
                {/* Left accent bar */}
                <div className={`w-1 h-full absolute left-0 top-0 ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                
                <div className="pl-1 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Date & Badge */}
                    <div className="flex items-center justify-between gap-1 mb-2.5">
                      <div className="flex flex-col text-[10px] font-mono leading-tight">
                        <span className="font-bold text-slate-800">
                          {log.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                        </span>
                        <span className="text-slate-400">
                          {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                      </div>

                      <span className={cn(
                        "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold border",
                        log.transactionType === 'IN' 
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
                          : 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                      )}>
                        {log.transactionType}
                      </span>
                    </div>

                    {/* Invoice Ref */}
                    <div className="mb-2">
                      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Invoice Ref</p>
                      <p className="text-xs font-mono font-bold text-slate-700 break-all leading-snug">#{log.invoiceNo}</p>
                    </div>

                    {/* Asset ID */}
                    <div className="mb-2">
                      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Asset ID</p>
                      <p className="text-[11px] font-mono font-bold text-blue-700 bg-blue-500/5 px-2 py-1 rounded-lg border border-blue-200/50 mt-0.5 break-all">
                        {log.serialNo}
                      </p>
                    </div>

                    {/* Routing Address */}
                    <div className="mb-2">
                      <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Route</p>
                      <div className="flex items-center justify-between text-[11px] font-medium gap-1">
                        <span className="truncate max-w-[45%] text-slate-700" title={log.origin}>{log.origin}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[45%] text-blue-600 font-semibold" title={log.destination}>{log.destination}</span>
                      </div>
                    </div>
                  </div>

                  {/* Import Entry & Line */}
                  <div className="mt-2 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-400 uppercase tracking-tight">Import Entry</span>
                    {log.importEntryNo ? (
                      <span className="font-bold text-blue-600 truncate max-w-[70%]" title={log.importEntryNo}>
                        {log.importEntryNo} (L:{log.importEntryLineNo || '-'})
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">N/A</span>
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

interface DashboardProps {
  onNavigateToInventory?: (department: string) => void;
}

export function Dashboard({ onNavigateToInventory }: DashboardProps = {}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<TransactionLog | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  useEffect(() => {
    const unsub1 = subscribeToInventory(setItems);
    const unsub2 = subscribeToLogs(setLogs);
    return () => { unsub1(); unsub2(); };
  }, []);

  const currentUserId = auth.currentUser?.uid;

  // Filter items and logs if 'Show Mine Only' toggle is enabled
  const filteredItems = showOnlyMine && currentUserId
    ? items.filter(i => i.userId === currentUserId)
    : items;

  const filteredLogs = showOnlyMine && currentUserId
    ? logs.filter(l => l.userId === currentUserId)
    : logs;

  const totalIn = filteredItems.filter(i => i.status === 'IN').length;
  const totalOut = filteredLogs.filter(l => l.transactionType === 'OUT').length;
  
  const stats = [
    { 
      label: 'MASTER ASSETS', 
      value: filteredItems.length, 
      icon: Package,
      waveColor: '#3b82f6',
      wavePath: 'M 0 32 Q 25 15, 50 25 T 100 12 T 150 28 T 200 8 T 250 25 L 250 40 L 0 40 Z'
    },
    { 
      label: 'BASE STOCK', 
      value: totalIn, 
      icon: ArrowDownLeft, 
      color: 'text-emerald-600',
      waveColor: '#10b981',
      wavePath: 'M 0 28 Q 20 35, 40 18 T 80 32 T 120 15 T 160 26 T 200 12 T 250 30 L 250 40 L 0 40 Z'
    },
    { 
      label: 'DEPLOYED', 
      value: totalOut, 
      icon: ArrowUpRight, 
      color: 'text-red-600',
      waveColor: '#ef4444',
      wavePath: 'M 0 35 Q 30 35, 60 30 T 120 22 T 180 12 T 220 8 T 250 5 L 250 40 L 0 40 Z'
    },
    { 
      label: 'RECENT CYCLES', 
      value: filteredLogs.length, 
      icon: Activity, 
      trend: 'ONLINE',
      waveColor: '#6366f1',
      wavePath: 'M 0 20 Q 15 8, 30 25 T 60 12 T 90 32 T 120 18 T 150 26 T 180 8 T 210 28 T 250 15 L 250 40 L 0 40 Z'
    },
  ];

  // Helper to format date in fine style matching screenshot (e.g. "MAY, 2:22:20 PM" or "JUN 18, 10:46:26 PM")
  const formatLogDate = (dateObj: any) => {
    if (!dateObj) return 'N/A';
    try {
      const d = typeof dateObj.toDate === 'function' ? dateObj.toDate() : new Date(dateObj);
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthStr = months[d.getMonth()];
      const day = d.getDate();
      
      const timeStr = d.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: true 
      });
      return `${monthStr} ${day}, ${timeStr}`;
    } catch (e) {
      return 'N/A';
    }
  };

  // Group items by Department (Segment) to show piece count and item count per department
  const departmentStats = React.useMemo(() => {
    const map: { [dept: string]: { name: string; totalQty: number; count: number } } = {};
    filteredItems.forEach(item => {
      const rawDept = (item.segment || '').trim();
      const dept = rawDept || 'ไม่ระบุแผนก (Unassigned)';
      const qty = item.qty !== undefined && Number(item.qty) > 0 ? Number(item.qty) : 1;
      
      if (!map[dept]) {
        map[dept] = { name: dept, totalQty: 0, count: 0 };
      }
      map[dept].totalQty += qty;
      map[dept].count += 1;
    });
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredItems]);

  const grandTotalQty = React.useMemo(() => {
    return departmentStats.reduce((sum, d) => sum + d.totalQty, 0);
  }, [departmentStats]);

  // Math for donut chart (At Base vs Deployed)
  const totalCount = totalIn + totalOut;
  const pctIn = totalCount > 0 ? (totalIn / totalCount) * 100 : 0;
  const pctOut = totalCount > 0 ? (totalOut / totalCount) * 100 : 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in w-full max-w-full overflow-hidden">
      
      {/* Upper sub-header toolbar (iOS Liquid Glass) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">SYNCHRONIZED LEDGER</span>
          <h3 className="text-base sm:text-lg font-bold font-sans text-slate-900 tracking-tight flex items-center gap-2">
            <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block"></span>
            Asset Management Workspace
          </h3>
        </div>
        
        {/* iOS Glass Toggle Switch */}
        <div className="flex items-center justify-between sm:justify-start gap-3 bg-white/70 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/80 shadow-sm self-start sm:self-auto">
          <span className="text-xs font-semibold text-slate-700 tracking-tight">แสดงเฉพาะของฉัน</span>
          <button 
            type="button"
            onClick={() => setShowOnlyMine(!showOnlyMine)}
            className={cn(
              "w-11 h-6 flex items-center p-0.5 transition-all duration-300 rounded-full select-none cursor-pointer",
              showOnlyMine ? "bg-blue-600 justify-end" : "bg-slate-200 justify-start"
            )}
          >
            <span className="w-5 h-5 bg-white rounded-full shadow-md"></span>
          </button>
        </div>
      </div>

      {/* 4 Metric cards in iOS Liquid Glass */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {stats.map((stat, idx) => (
          <div 
            key={idx} 
            className="liquid-glass-card flex flex-col justify-between p-4 sm:p-6 rounded-3xl group relative overflow-hidden min-h-28 sm:min-h-40 border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_14px_36px_rgba(0,113,227,0.1)] transition-all duration-300"
          >
            <div>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="p-1.5 sm:p-2 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 group-hover:scale-110 transition-transform duration-200 shrink-0">
                  <stat.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-sans truncate">{stat.label}</span>
              </div>
              <div className="z-10 relative">
                <span className="text-2xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-900">{stat.value}</span>
              </div>
            </div>
            
            {/* Smooth trendline graphics */}
            <div className="absolute inset-x-0 bottom-0 h-8 sm:h-10 w-full opacity-60 pointer-events-none">
              <svg width="100%" height="100%" viewBox="0 0 250 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`grad-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={stat.waveColor} stopOpacity="0.4" />
                    <stop offset="100%" stopColor={stat.waveColor} stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={stat.wavePath} fill={`url(#grad-${idx})`} stroke={stat.waveColor} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>

            {stat.trend && (
              <span className="absolute top-3 right-3 sm:top-4 sm:right-4 text-[9px] font-semibold rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-2 py-0.5 leading-none">
                {stat.trend}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* PROMINENT TOP PANEL: Department Breakdown (iOS Liquid Glass) */}
      <div className="liquid-glass-card p-4 sm:p-6 rounded-3xl border border-white/80 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-md shadow-blue-500/20 shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-slate-900 font-sans">
                  สรุปสต็อกแยกตามแผนก
                </h4>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-700 rounded-full border border-blue-500/20 font-mono">
                  {departmentStats.length} แผนก
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Department Inventory Breakdown
              </p>
            </div>
          </div>

          {/* Grand Total Highlight Badge */}
          <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 bg-white/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/90 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">
              ยอดคงคลังรวมทุกแผนก:
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold font-mono text-blue-600">
                {grandTotalQty.toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-slate-600 font-sans">
                ชิ้น
              </span>
              <span className="text-[11px] text-slate-400 font-mono ml-1">
                ({filteredItems.length} รายการ)
              </span>
            </div>
          </div>
        </div>

        {/* Department Grid: View all departments in iOS Liquid Glass Cards */}
        {departmentStats.length === 0 ? (
          <div className="py-8 text-center text-xs font-semibold text-slate-400 italic">
            ไม่พบข้อมูลสินค้าคงคลังในระบบ
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 pt-2">
            {departmentStats.map((dept, idx) => {
              const pct = grandTotalQty > 0 ? (dept.totalQty / grandTotalQty) * 100 : 0;
              return (
                <div 
                  key={idx}
                  onClick={() => onNavigateToInventory?.(dept.name)}
                  className="bg-white/60 backdrop-blur-md border border-white/80 hover:border-blue-400/60 p-4 rounded-2xl flex flex-col justify-between transition-all duration-200 hover:shadow-lg hover:bg-white/90 group cursor-pointer relative"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-bold text-xs text-slate-900 truncate group-hover:text-blue-600 transition-colors" title={dept.name}>
                        {dept.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
                          {pct.toFixed(1)}%
                        </span>
                        {onNavigateToInventory && (
                          <div 
                            className="p-1 text-slate-400 group-hover:text-blue-600 transition-colors"
                            title="ไปที่หน้าคลังสินค้า (Filter Inventory)"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1.5 my-1">
                      <span className="text-2xl font-extrabold font-mono text-slate-900 group-hover:text-blue-600 transition-colors">
                        {dept.totalQty.toLocaleString()}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 font-sans">
                        ชิ้น
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-3">
                    {/* Visual iOS Progress Bar */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-white/80">
                      <div 
                        className="bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full h-full transition-all duration-500" 
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                      <span>{dept.count.toLocaleString()} SKUs</span>
                      <span>จาก {grandTotalQty.toLocaleString()} ชิ้น</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main split grid: Left Asset Management Table, Right Side Dashboard Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start w-full max-w-full">
        
        {/* Left Column: Asset Management Hub TABLE (iOS Liquid Glass) */}
        <div className="lg:col-span-8 space-y-4 w-full max-w-full overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-200/60 pb-2">
            <h3 className="text-xs font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
              ASSET MANAGEMENT HUB
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-mono md:hidden">← เลื่อนตารางซ้ายขวาได้ →</span>
              <span className="text-[10px] font-medium text-slate-500 bg-white/70 px-2.5 py-1 rounded-full border border-white/80 hidden sm:inline-block shadow-sm">
                คลิกที่แถวเพื่อดูรายละเอียด
              </span>
            </div>
          </div>

          <div className="liquid-glass-card rounded-3xl overflow-hidden border border-white/80 shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-white/70 backdrop-blur-md border-b border-slate-200/60 text-[10px] font-sans font-bold text-slate-500 uppercase">
                    <th className="px-4 py-3 font-semibold tracking-tight">TIMESTAMP</th>
                    <th className="px-4 py-3 font-semibold tracking-tight">ACTIVITY</th>
                    <th className="px-4 py-3 font-semibold tracking-tight">ASSET ID</th>
                    <th className="px-4 py-3 font-semibold tracking-tight">STATUS</th>
                    <th className="px-4 py-3 font-semibold tracking-tight">INVOICE REF</th>
                    <th className="px-4 py-3 font-semibold tracking-tight text-right">QUANTITY</th>
                    <th className="px-4 py-3 font-semibold tracking-tight">HANDLED BY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-800">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-xs font-medium text-slate-400 italic">
                        ไม่พบประวัติรายการเคลื่อนไหว
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.slice(0, 10).map((log, idx) => {
                      const isItemIn = log.transactionType === 'IN';
                      const dispQty = isItemIn ? (log.qty || 1) : -Math.abs(log.qty || 1);
                      const handledByEmail = log.userId ? log.userId.slice(0, 5).toUpperCase() : 'STAFF';

                      // iOS Pill Badges
                      const statusBadge = isItemIn ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-tight uppercase border border-emerald-500/20 bg-emerald-500/10 text-emerald-700">
                          IN-STOCK
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-tight uppercase border border-rose-500/20 bg-rose-500/10 text-rose-700">
                          OUT-OF-STOCK
                        </span>
                      );

                      return (
                        <tr 
                          key={idx} 
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-slate-400 whitespace-nowrap text-[10px]">
                            {formatLogDate(log.date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {isItemIn ? (
                                <div className="p-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 shrink-0">
                                  <ArrowDownLeft className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <div className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 shrink-0">
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </div>
                              )}
                              <span className="font-semibold text-slate-900 uppercase font-sans text-xs">
                                {isItemIn ? 'Stock Received' : 'Asset Deployed'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 font-mono break-all whitespace-nowrap max-w-[120px] truncate" title={log.serialNo}>
                            {getDisplaySerial(log.serialNo)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {statusBadge}
                          </td>
                          <td className="px-4 py-3 text-slate-500 truncate max-w-[100px] whitespace-nowrap text-xs" title={log.invoiceNo}>
                            {log.invoiceNo || 'MANUAL-ADD'}
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right font-extrabold font-mono",
                            dispQty < 0 ? 'text-rose-600' : 'text-slate-900'
                          )}>
                            {dispQty}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-400 whitespace-nowrap text-[11px]">
                            Staff ({handledByEmail})
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar layout (iOS Liquid Glass Cards) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Card 1: CORE STATUS Panel */}
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-6 border border-white/10 shadow-xl relative overflow-hidden min-h-[160px] flex flex-col justify-between">
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-blue-300">CORE STATUS</h4>
              </div>
              <h4 className="text-xl font-bold leading-tight tracking-tight text-white font-sans">
                All Systems Active.<br/>Ledger Synchronized.
              </h4>
            </div>
            
            <div className="relative z-10">
              <div className="w-full h-px bg-white/10 my-3" />
              <p className="text-[10px] text-slate-300/80 font-mono leading-relaxed">
                DISTRIBUTED LEDGER ONLINE<br/>
                STATUS: <span className="text-emerald-400 font-bold">OPERATIONAL</span>
              </p>
            </div>
            <Package className="absolute -right-12 -bottom-12 w-48 h-48 opacity-[0.04] -rotate-12 pointer-events-none" />
          </div>

          {/* Card 2: INVENTORY COMPOSITION (Donut Chart) */}
          <div className="liquid-glass-card p-6 rounded-3xl border border-white/80 space-y-4">
            <div className="border-b border-slate-200/60 pb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-600 inline-block rounded-full"></span>
                Inventory Composition
              </h4>
              <span className="text-[10px] font-mono font-semibold text-slate-400">{totalCount} UNITS</span>
            </div>

            {/* Custom SVG Donut rendering counts exact to base vs deployed */}
            <div className="py-2 flex flex-col items-center justify-center relative">
              <svg width="130" height="130" viewBox="0 0 130 130" className="mx-auto select-none">
                <circle cx="65" cy="65" r="46" fill="transparent" stroke="#f1f5f9" strokeWidth="11" />
                {totalCount > 0 ? (
                  <>
                    {/* At Base portion */}
                    <circle
                      cx="65"
                      cy="65"
                      r="46"
                      fill="transparent"
                      stroke="#3b82f6"
                      strokeWidth="11"
                      strokeDasharray={`${2 * Math.PI * 46}`}
                      strokeDashoffset={`${2 * Math.PI * 46 * (1 - pctIn / 100)}`}
                      strokeLinecap="round"
                      transform="rotate(-90 65 65)"
                      className="transition-all duration-700 ease-out"
                    />
                    {/* Deployed portion */}
                    {pctOut > 0 && (
                      <circle
                        cx="65"
                        cy="65"
                        r="46"
                        fill="transparent"
                        stroke="#94a3b8"
                        strokeWidth="11"
                        strokeDasharray={`${2 * Math.PI * 46}`}
                        strokeDashoffset={`${2 * Math.PI * 46 * (1 - pctOut / 100)}`}
                        strokeLinecap="round"
                        transform={`rotate(${(pctIn * 3.6) - 90} 65 65)`}
                        className="transition-all duration-700 ease-out"
                      />
                    )}
                  </>
                ) : (
                  <circle cx="65" cy="65" r="46" fill="transparent" stroke="#e2e8f0" strokeWidth="11" />
                )}
                {/* Center label */}
                <text x="65" y="63" textAnchor="middle" className="text-xl font-black font-sans fill-slate-900">
                  {totalCount}
                </text>
                <text x="65" y="78" textAnchor="middle" className="text-[8.5px] font-black text-slate-400 font-mono tracking-widest uppercase">
                  UNITS
                </text>
              </svg>

              {/* Legends matching image design */}
              <div className="w-full mt-4 space-y-2 text-[10px] font-bold text-slate-700 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#3b82f6] inline-block shrink-0 border border-slate-900"></span>
                    <span>อยู่ในเบส (At Base)</span>
                  </div>
                  <span className="font-mono text-[11px] font-black">{totalIn} ({pctIn.toFixed(0)}%)</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-[#94a3b8] inline-block shrink-0 border border-slate-900"></span>
                    <span>นอกเบส (Deployed)</span>
                  </div>
                  <span className="font-mono text-[11px] font-black text-slate-500">{totalOut} ({pctOut.toFixed(0)}%)</span>
                </div>
              </div>
            </div>
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
            className="bg-white/90 backdrop-blur-2xl border border-white/80 p-6 md:p-8 w-full max-w-5xl rounded-3xl shadow-2xl relative h-[92vh] max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Heading */}
            <div className="mb-5">
              <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 inline-block mb-2">
                รายละเอียดรอบกิจกรรมระบบ (Activity Cycle Detail)
              </span>
              <h3 className="text-lg md:text-xl font-bold font-mono tracking-tight text-slate-900 break-all bg-white/70 border border-white/80 rounded-2xl px-4 py-2.5 mt-1 shadow-sm">
                INVOICE / BILL REF: #{selectedLog.invoiceNo}
              </h3>
            </div>

            {/* Primary Log Details Segment */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white/60 p-4 rounded-2xl border border-white/80 mb-4 text-xs font-medium tracking-tight shadow-sm">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-semibold">เลขคุมสินทรัพย์ (Selected Asset):</p>
                <p className="text-slate-800 font-mono text-xs leading-snug font-bold">{selectedLog.serialNo}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-semibold">ประเภทรายการ (Type):</p>
                <div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-tight ${
                    selectedLog.transactionType === 'IN' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border border-rose-500/20 bg-rose-500/10 text-rose-700'
                  }`}>
                    {selectedLog.transactionType}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-semibold">เวลาทำรายการ (Timestamp):</p>
                <p className="text-slate-800 font-mono text-[10px] leading-snug">
                  {selectedLog.date?.toDate().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}<br />
                  @ {selectedLog.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-semibold">ใบขนขาเข้า (Import Entry):</p>
                <p className="font-semibold text-blue-600 text-[11px] leading-snug">
                  {selectedLog.importEntryNo || 'N/A'}<br />
                  {selectedLog.importEntryLineNo ? `(LINE: ${selectedLog.importEntryLineNo})` : ''}
                </p>
              </div>
            </div>

            {/* Related items header */}
            <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-600" />
                <span>สินทรัพย์ที่นำเข้า-ส่งออกในวงงานรอบเดียวกัน (Shipment Batch)</span>
              </span>
              <span className="bg-blue-500/10 text-blue-700 px-3 py-0.5 text-[10px] font-mono font-bold rounded-full border border-blue-500/20">
                {logs.filter(l => l.invoiceNo === selectedLog.invoiceNo).length} ITEMS
              </span>
            </h4>

            {/* Co-invoice batch records list viewport */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-2.5 rounded-2xl border border-slate-200/60 bg-white/50 p-3 min-h-0">
              {logs
                .filter(l => l.invoiceNo === selectedLog.invoiceNo)
                .map((log, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      "bg-white/80 backdrop-blur-md rounded-2xl border p-3 transition-all relative overflow-hidden flex flex-col md:flex-row md:items-center gap-2 md:gap-4 shadow-sm",
                      log.serialNo === selectedLog.serialNo ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/50" : "border-white/80"
                    )}
                  >
                    {/* Left vertical status indicator strip */}
                    <div className={`w-1 h-full absolute left-0 top-0 rounded-l-2xl ${log.transactionType === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    
                    {/* Responsive Grid Layout for Info Fields */}
                    <div className="pl-2.5 flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center">
                      
                      {/* Asset ID (col-span-4) */}
                      <div className="md:col-span-4 flex flex-col">
                        <span className="text-[8px] uppercase text-slate-400 font-semibold leading-none mb-0.5">Asset ID</span>
                        <span className="text-xs font-bold font-mono tracking-tight text-slate-800 truncate" title={log.serialNo}>
                          {log.serialNo}
                        </span>
                      </div>

                      {/* Transaction Status (col-span-2) */}
                      <div className="md:col-span-2 flex items-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] uppercase tracking-tight ${
                          log.transactionType === 'IN' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border border-rose-500/20 bg-rose-500/10 text-rose-700'
                        }`}>
                          {log.transactionType}
                        </span>
                      </div>

                      {/* Routing Path (col-span-6) */}
                      <div className="md:col-span-6 flex items-center justify-between gap-1.5 min-w-0 bg-white/70 px-2.5 py-1.5 rounded-xl border border-slate-200/60">
                        <div className="flex-1 min-w-0">
                          <span className="text-[8px] uppercase text-slate-400 font-semibold leading-none block mb-0.5">Route</span>
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-slate-700 font-medium text-[10px] max-w-[45%]" title={log.origin}>
                              {log.origin}
                            </span>
                            <div className="flex items-center gap-0.5 opacity-40 shrink-0">
                              <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                            </div>
                            <span className="truncate text-blue-600 font-medium text-[10px] max-w-[45%]" title={log.destination}>
                              {log.destination}
                            </span>
                          </div>
                        </div>
                        
                        {/* Time indicator */}
                        <div className="text-right shrink-0 border-l border-slate-200/80 pl-2">
                          <p className="text-[8px] uppercase text-slate-400 font-medium leading-none mb-0.5">Time</p>
                          <p className="text-[10px] font-mono text-slate-700 leading-none font-semibold">
                            {log.date?.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
            </div>

            {/* Close Button Panel */}
            <div className="mt-4 flex justify-end gap-3 pt-3 border-t border-slate-200/50 shrink-0">
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95"
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
    <div className="space-y-8 sm:space-y-10 animate-fade-in">
      <div className="border-b border-white/60 pb-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">System Configuration</h2>
        <p className="text-xs font-medium text-slate-500 mt-1">Administrative Control & Global State Management</p>
      </div>

      {/* MASTER INVENTORY UPLOADER CONTAINER (iOS Liquid Glass) */}
      <div className="liquid-glass-card p-6 sm:p-8 rounded-3xl border border-white/80 shadow-md space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3 text-emerald-600">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-200/50 shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">นำเข้า Master Inventory (Import Master File)</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 ml-12">
            เพิ่มฐานข้อมูลสินค้าหลักโดยตรงจากไฟล์ Excel เพื่อใช้เป็นข้อมูลตั้งต้นสำหรับการจับคู่ CIPL
          </p>
        </div>

        <div className="relative border-2 border-dashed border-slate-200/80 hover:border-blue-400 bg-white/40 hover:bg-white/70 p-8 sm:p-10 rounded-2xl flex flex-col items-center justify-center text-center group transition-all duration-300">
          <input 
            type="file" 
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            disabled={isProcessing}
          />
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Upload className="w-10 h-10 animate-bounce text-emerald-600" />
              <span className="text-xs font-bold text-slate-700">
                กำลังนำเข้าข้อมูล Master Inventory... (PROCESSING MASTER INVENTORY...)
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-200/50 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <div className="space-y-1">
                <span className="text-xs sm:text-sm font-semibold text-slate-800 block">
                  คลิกที่นี่ หรือ ลากไฟล์ Excel มาวาง เพื่อดำเนินการอัปโหลด
                </span>
                <span className="text-[11px] text-slate-400 block">
                  รองรับเอกสารนามสกุล .xlsx และ .xls บันทึกข้อมูลคอลัมน์ Part No, Serial No, Description, COO, และอื่นๆ
                </span>
              </div>
            </div>
          )}
        </div>

        {/* FEEDBACK STATUS ALERTS */}
        {success && (
          <div className="flex items-start gap-3.5 bg-emerald-500/10 border border-emerald-500/30 p-4 sm:p-5 rounded-2xl text-emerald-800 transition-all">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold">นำเข้าข้อมูลสินค้าสำเร็จ! (Import Success)</h4>
              <p className="text-xs font-medium mt-0.5 text-emerald-700">
                เพิ่มรายการสินค้าในไฟล์ Master Inventory ลงในฐานข้อมูลผู้ใช้งานของคุณเรียบร้อยแล้ว ทั้งหมด {importedCount} รายการ
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3.5 bg-rose-500/10 border border-rose-500/30 p-4 sm:p-5 rounded-2xl text-rose-800 transition-all">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <h4 className="text-xs sm:text-sm font-bold">เกิดข้อผิดพลาดในการนำเข้าข้อมูล (Import Failed)</h4>
              <p className="text-xs font-medium mt-0.5 text-rose-600">
                {error}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 text-rose-600">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center border border-rose-200/50">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800">Danger Zone</h3>
          </div>
          
          <div className="liquid-glass-card p-6 sm:p-8 rounded-3xl border border-rose-200/60 bg-rose-50/40 backdrop-blur-xl shadow-md space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-rose-600" />
                <h4 className="text-xs sm:text-sm font-bold text-rose-700">Inventory Wipe</h4>
              </div>
              <p className="text-xs text-slate-500 max-w-sm">
                Irreversibly delete all master inventory records. This action does not affect transaction logs but will leave the base stock at zero.
              </p>
              <HoldToConfirmButton 
                label="Clear Inventory"
                subLabel="Hold for 3 seconds to confirm"
                onConfirm={() => wipeAllData('inventory')}
                className="w-full"
              />
            </div>

            <div className="w-full h-px bg-rose-200/60" />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-rose-600" />
                <h4 className="text-xs sm:text-sm font-bold text-rose-700">Journal Wipe</h4>
              </div>
              <p className="text-xs text-slate-500 max-w-sm">
                Clear all transaction logs and movement history. Master inventory state will remain intact, but audit trails will be lost.
              </p>
              <HoldToConfirmButton 
                label="Clear Activity Logs"
                subLabel="Hold for 3 seconds to confirm"
                onConfirm={() => wipeAllData('logs')}
                className="w-full"
              />
            </div>

            <div className="w-full h-px bg-rose-200/60" />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-700" />
                <h4 className="text-xs sm:text-sm font-bold text-rose-800">Total System Reset</h4>
              </div>
              <p className="text-xs text-slate-500 max-w-sm">
                Full factory reset. Deletes all inventory and logs. This cannot be undone.
              </p>
              <HoldToConfirmButton 
                label="Factory Wipe"
                subLabel="Hold for 3 seconds to confirm total reset"
                onConfirm={() => wipeAllData('all')}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-8 h-8 rounded-xl bg-slate-500/10 text-slate-600 flex items-center justify-center border border-slate-200/50">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800">System Info</h3>
          </div>
          
          <div className="liquid-glass-card p-6 sm:p-8 rounded-3xl border border-white/80 shadow-md space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Node_Identifier</label>
              <p className="text-xs sm:text-sm font-mono font-semibold text-slate-700">AIS-PRODUCTION-NODE-851323226653</p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</label>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse ring-4 ring-emerald-500/20" />
                <p className="text-xs sm:text-sm font-mono font-semibold text-emerald-600">STABLE_ONLINE</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Protocol</label>
              <p className="text-xs sm:text-sm font-mono font-semibold text-slate-700">HTTPS_SECURE_WSS</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

