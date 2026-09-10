import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  Paperclip, 
  FileSpreadsheet, 
  FileText, 
  X, 
  Trash2, 
  Copy, 
  Check, 
  Sparkles, 
  ArrowDown, 
  RefreshCw, 
  Database, 
  AlertCircle,
  ClipboardPaste,
  FileCheck2,
  HelpCircle,
  TrendingDown,
  MapPin,
  PackageSearch
} from 'lucide-react';
import { subscribeToInventory, InventoryItem, getDisplaySerial } from '../lib/inventoryService';
import * as XLSX from 'xlsx';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  attachedFileName?: string;
}

interface AttachedFileData {
  name: string;
  type: string;
  size: number;
  content: string; // text summary or extracted spreadsheet/text
  rowCount?: number;
}

export default function AiAssistant({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      content: `สวัสดีครับ! ผมคือ **LogiTrack AI Inventory Assistant** 🤖\n\nผมพร้อมช่วยวิเคราะห์และตอบคำถามเกี่ยวกับสต็อกสินค้าของคุณแบบเรียลไทม์:\n* 🔍 **เช็คสต็อก:** สอบถามจำนวนคงเหลือ, Part No, Serial No, หรือ Location\n* 📑 **วิเคราะห์เอกสาร:** ลากไฟล์ **Excel / CSV / Text** มาวาง เพื่อตรวจสอบว่ามีรายการไหนตรงกับในคลัง หรือสินค้าไหนยังไม่ได้รับเข้า\n* 📋 **คัดลอกข้อความมาวาง:** แปะรายการเบิก/PO หรือข้อความ เพื่อให้ AI ช่วยสรุปและเปรียบเทียบทันที\n\nคุณสามารถลองคลิกคำถามด่วนด้านล่าง หรือพิมพ์คำถามได้เลยครับ!`,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [attachedFile, setAttachedFile] = useState<AttachedFileData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPastingText, setIsPastingText] = useState(false);
  const [pastedRawText, setPastedRawText] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to live inventory data
  useEffect(() => {
    const unsubscribe = subscribeToInventory((items) => {
      setInventoryItems(items);
    });
    return () => unsubscribe();
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Inventory summary computation
  const summary = React.useMemo(() => {
    const totalItems = inventoryItems.length;
    const inCount = inventoryItems.filter(i => i.status === 'IN').length;
    const outCount = inventoryItems.filter(i => i.status === 'OUT').length;
    const totalQty = inventoryItems.reduce((acc, curr) => acc + (Number(curr.qty) || 1), 0);
    const locations = Array.from(new Set(inventoryItems.map(i => i.currentLocation).filter(Boolean)));
    const lowStockItems = inventoryItems.filter(i => (Number(i.qty) || 1) <= 2 && i.status === 'IN');

    return {
      totalItems,
      inCount,
      outCount,
      totalQty,
      locations,
      lowStockCount: lowStockItems.length,
    };
  }, [inventoryItems]);

  // Parse files (Excel, CSV, TXT)
  const processUploadedFile = async (file: File) => {
    const fileName = file.name;
    const ext = fileName.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });

        // Convert first 150 rows to clean tabular text
        const rowsToFormat = jsonData.slice(0, 150);
        const formattedText = rowsToFormat
          .map((row: any[]) => (Array.isArray(row) ? row.join(' | ') : String(row)))
          .join('\n');

        setAttachedFile({
          name: fileName,
          type: ext === 'csv' ? 'CSV Document' : 'Excel Spreadsheet',
          size: file.size,
          content: formattedText,
          rowCount: jsonData.length,
        });
      } else {
        // Plain text, JSON, or log files
        const text = await file.text();
        setAttachedFile({
          name: fileName,
          type: 'Text/Document',
          size: file.size,
          content: text.slice(0, 15000),
          rowCount: text.split('\n').length,
        });
      }
    } catch (err: any) {
      console.error('Failed to read file:', err);
      alert('ไม่สามารถอ่านไฟล์ได้ โปรดตรวจสอบว่าเป็นไฟล์ Excel, CSV หรือ Text ที่ถูกต้อง');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleApplyPastedText = () => {
    if (!pastedRawText.trim()) return;
    setAttachedFile({
      name: 'ข้อมูลที่คัดลอกมาวาง (Pasted Data)',
      type: 'Text/Table',
      size: pastedRawText.length,
      content: pastedRawText.trim(),
      rowCount: pastedRawText.split('\n').length,
    });
    setIsPastingText(false);
    setPastedRawText('');
  };

  // Submit message to AI
  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || inputQuery).trim();
    if (!promptToSend && !attachedFile) return;

    const currentAttachedFile = attachedFile;
    const userMsgId = 'usr_' + Date.now();
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: promptToSend || `วิเคราะห์ข้อมูลจากไฟล์: ${currentAttachedFile?.name}`,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      attachedFileName: currentAttachedFile?.name,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setAttachedFile(null);
    setIsLoading(true);

    try {
      // Build lightweight history
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptToSend,
          history: historyPayload,
          inventorySummary: summary,
          inventoryItems: inventoryItems.slice(0, 300), // send snapshot to ground answer
          attachedFile: currentAttachedFile ? {
            name: currentAttachedFile.name,
            type: currentAttachedFile.type,
            content: currentAttachedFile.content,
          } : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Server responded with error');
      }

      const modelMessage: ChatMessage = {
        id: 'model_' + Date.now(),
        role: 'model',
        content: data.reply || 'ขออภัย ไม่สามารถประมวลผลคำตอบได้',
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: 'err_' + Date.now(),
        role: 'model',
        content: `⚠️ เกิดข้อผิดพลาด: ${error?.message || 'ไม่สามารถติดต่อ AI Server ได้'}\n\n*กรุณาตรวจสอบว่าการเชื่อมต่ออินเทอร์เน็ตเสถียร หรือตั้งค่า API Key ครบถ้วน*`,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleClearHistory = () => {
    if (window.confirm('คุณต้องการล้างประวัติการสนทนานี้หรือไม่?')) {
      setMessages([
        {
          id: 'welcome_reset',
          role: 'model',
          content: 'เริ่มการสนทนาใหม่เรียบร้อยครับ! สอบถามข้อมูลสต็อกสินค้า หรือลากไฟล์มาวางได้เลยครับ 🤖',
          timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-slate-50 border-4 border-slate-900 neo-brutalism-shadow overflow-hidden select-none"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Top Header */}
      <div className="bg-slate-900 text-white px-5 py-3.5 border-b-2 border-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-400 text-slate-950 border-2 border-white flex items-center justify-center font-black">
            <Sparkles className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider">AI INVENTORY ASSISTANT</h3>
              <span className="text-[9px] bg-emerald-500 text-slate-950 font-mono font-bold px-1.5 py-0.2 border border-white">
                LIVE_GROUNDED
              </span>
            </div>
            <p className="text-[10px] text-slate-300 font-mono flex items-center gap-2">
              <span>ฐานข้อมูล: {summary.totalItems} รายการ</span>
              <span>•</span>
              <span className="text-emerald-400">ในคลัง: {summary.inCount}</span>
              <span>•</span>
              <span className="text-amber-300">เบิกออก: {summary.outCount}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-red-400 border border-slate-700 text-[10px] flex items-center gap-1 font-mono uppercase cursor-pointer"
            title="ล้างแชท"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ล้างประวัติ</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 bg-white hover:bg-red-500 hover:text-white text-slate-900 border-2 border-slate-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Drag & Drop Alert Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/90 text-white z-50 flex flex-col items-center justify-center p-8 border-4 border-dashed border-white">
          <FileSpreadsheet className="w-16 h-16 animate-bounce mb-3" />
          <p className="text-xl font-black uppercase tracking-wider">วางไฟล์ของคุณที่นี่</p>
          <p className="text-xs font-mono opacity-90 mt-1">รองรับ Excel (.xlsx, .xls), CSV และ Text Files</p>
        </div>
      )}

      {/* Paste Text Modal */}
      {isPastingText && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-slate-900 max-w-lg w-full p-5 space-y-4 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)]">
            <div className="flex justify-between items-center border-b-2 border-slate-900 pb-2">
              <h4 className="font-black text-sm uppercase flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-blue-600" />
                วางข้อความ / ตารางที่ต้องการให้ AI ตรวจสอบ
              </h4>
              <button 
                onClick={() => setIsPastingText(false)}
                className="p-1 hover:bg-slate-100 border border-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={8}
              value={pastedRawText}
              onChange={(e) => setPastedRawText(e.target.value)}
              placeholder="คัดลอกตารางจาก Excel, ข้อความรายการเบิก, หรือ PO มาวางที่นี่..."
              className="w-full p-3 border-2 border-slate-900 font-mono text-xs focus:outline-none focus:border-blue-600 bg-slate-50"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPastingText(false)}
                className="px-3 py-1.5 border border-slate-900 text-xs font-bold hover:bg-slate-100"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleApplyPastedText}
                className="px-4 py-1.5 bg-blue-600 text-white font-bold text-xs uppercase border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
              >
                นำเข้าข้อมูลสู่แชท
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {isUser ? 'YOU' : 'AI ASSISTANT'} • {msg.timestamp}
                </span>
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[88%] md:max-w-[80%] p-4 border-2 border-slate-900 text-xs font-sans leading-relaxed select-text ${
                  isUser
                    ? 'bg-blue-600 text-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
                    : 'bg-white text-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]'
                }`}
              >
                {/* Attached File Pill in message */}
                {msg.attachedFileName && (
                  <div className="mb-2.5 pb-2 border-b border-blue-400/50 flex items-center gap-2 text-[10px] font-mono font-black bg-blue-700/50 px-2 py-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>แนบไฟล์: {msg.attachedFileName}</span>
                  </div>
                )}

                {/* Content */}
                <div className="prose prose-xs max-w-none text-inherit prose-headings:font-black prose-headings:text-inherit prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1.5 prose-strong:text-inherit prose-strong:font-black prose-table:border-collapse prose-table:my-2 prose-th:border prose-th:border-slate-800 prose-th:p-1 prose-th:bg-slate-100 prose-td:border prose-td:border-slate-300 prose-td:p-1">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>

                {/* Copy Button for Model */}
                {!isUser && (
                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-end">
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="text-[10px] font-mono font-bold flex items-center gap-1 text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      {copiedMsgId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>คัดลอกคำตอบ</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="p-3 bg-white border-2 border-slate-900 text-xs shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="font-bold font-mono text-slate-700">กำลังวิเคราะห์ข้อมูลกับคลังสินค้า...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Action Chips */}
      <div className="px-4 py-2 bg-slate-100 border-t-2 border-slate-900 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
        <span className="text-[9px] font-black uppercase text-slate-500 font-mono shrink-0 flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-blue-600" /> คำถามด่วน:
        </span>

        <button
          type="button"
          onClick={() => handleSendMessage('ตรวจสอบสินค้าที่มีจำนวนคงเหลือน้อย (Low Stock) และแนะนำการจัดเตรียม')}
          className="px-2.5 py-1 bg-white border border-slate-900 hover:bg-amber-100 font-sans text-[10px] font-bold text-slate-800 shrink-0 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
        >
          🚨 สินค้าใกล้หมด
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปยอดสินค้าและสถานที่จัดเก็บ (Location) ทั้งหมดว่ามีของอยู่ที่ไหนบ้าง')}
          className="px-2.5 py-1 bg-white border border-slate-900 hover:bg-blue-100 font-sans text-[10px] font-bold text-slate-800 shrink-0 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
        >
          📍 สรุปตาม Location
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปภาพรวมสถานะสินค้า IN และ OUT ล่าสุด พร้อมข้อสังเกต')}
          className="px-2.5 py-1 bg-white border border-slate-900 hover:bg-emerald-100 font-sans text-[10px] font-bold text-slate-800 shrink-0 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
        >
          📊 สรุปภาพรวมสต็อก
        </button>

        <button
          type="button"
          onClick={() => setIsPastingText(true)}
          className="px-2.5 py-1 bg-amber-300 border border-slate-900 hover:bg-amber-400 font-sans text-[10px] font-black text-slate-900 shrink-0 shadow-[1px_1px_0px_0px_rgba(15,23,42,1)] cursor-pointer flex items-center gap-1"
        >
          <ClipboardPaste className="w-3 h-3" />
          วางข้อมูลมาเทียบ
        </button>
      </div>

      {/* Attached File Preview Bar */}
      {attachedFile && (
        <div className="px-4 py-2 bg-amber-100 border-t-2 border-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileSpreadsheet className="w-4 h-4 text-amber-700 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-bold text-slate-900">{attachedFile.name}</span>
              <span className="text-[10px] font-mono text-slate-500 ml-2">
                ({attachedFile.rowCount ? `${attachedFile.rowCount} แถว` : `${(attachedFile.size / 1024).toFixed(1)} KB`})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            className="p-1 hover:bg-amber-200 text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 md:p-4 bg-white border-t-2 border-slate-900 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex gap-2 items-center"
        >
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInput}
            accept=".xlsx,.xls,.csv,.txt,.json"
            className="hidden"
          />

          {/* Attach Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 border-2 border-slate-900 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
            title="แนบไฟล์ Excel, CSV หรือ Text เพื่อให้ AI วิเคราะห์"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Paste Button */}
          <button
            type="button"
            onClick={() => setIsPastingText(true)}
            className="p-2.5 border-2 border-slate-900 bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 hidden sm:block"
            title="คัดลอกข้อความหรือตารางมาวาง"
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder={attachedFile ? `ถามคำถามเกี่ยวกับไฟล์ "${attachedFile.name}" หรือกดส่งเลย...` : 'พิมพ์คำถาม เช่น มีพาร์ท 1234 อยู่ที่ไหน หรือลากไฟล์มาวาง...'}
            disabled={isLoading}
            className="flex-1 px-3 py-2 border-2 border-slate-900 font-sans text-xs font-bold focus:outline-none focus:border-blue-600 bg-slate-50"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={isLoading || (!inputQuery.trim() && !attachedFile)}
            className={`px-4 py-2 border-2 border-slate-900 font-black text-xs uppercase flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 shrink-0 ${
              isLoading || (!inputQuery.trim() && !attachedFile)
                ? 'bg-slate-200 text-slate-400 border-slate-400 cursor-not-allowed shadow-none'
                : 'bg-amber-400 hover:bg-amber-500 text-slate-950'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ส่ง</span>
          </button>
        </form>

        <div className="flex justify-between items-center mt-2 px-1 text-[9.5px] font-mono text-slate-400">
          <span>💡 สามารถลากไฟล์ Excel / CSV มาปล่อยลงหน้านี้ได้โดยตรง</span>
          <span className="hidden md:inline text-emerald-600 font-bold">Google Gemini 3.8 Flash • Real-time Grounded</span>
        </div>
      </div>
    </div>
  );
}
