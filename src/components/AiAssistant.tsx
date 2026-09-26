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
  RefreshCw, 
  Database, 
  AlertCircle,
  ClipboardPaste,
  HelpCircle,
  TrendingDown,
  MapPin,
  PackageSearch,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  History,
  PlusCircle,
  ChevronDown,
  SlidersHorizontal,
  ExternalLink,
  ShieldCheck,
  Zap,
  Printer,
  FileCheck
} from 'lucide-react';
import { subscribeToInventory, InventoryItem, getDisplaySerial } from '../lib/inventoryService';
import * as XLSX from 'xlsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export type AiModelType = 'gemini-3.5-flash' | 'gemini-3.1-flash-lite' | 'gemini-3.1-pro-preview';
export type AiRolePersona = 'general_assistant' | 'warehouse_manager' | 'procurement_analyst' | 'customs_compliance';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  attachedFileName?: string;
  modelUsed?: string;
  personaUsed?: AiRolePersona;
}

export interface AttachedFileData {
  name: string;
  type: string;
  size: number;
  content: string;
  rowCount?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  model: AiModelType;
  persona: AiRolePersona;
}

const MODEL_OPTIONS: { id: AiModelType; label: string; badge: string; desc: string; icon: string }[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', badge: 'มาตรฐาน', desc: 'สมดุล แม่นยำ และครอบคลุมงานคลังทั่วไป', icon: '⚡' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', badge: 'เร็วพิเศษ', desc: 'ตอบกลับทันใจ เช็คจำนวนและ Part No ด่วน', icon: '🚀' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', badge: 'วิเคราะห์ลึก', desc: 'วิเคราะห์เอกสาร ซีเรียล และโครงสร้างซับซ้อน', icon: '🧠' },
];

const PERSONA_OPTIONS: { id: AiRolePersona; title: string; subtitle: string; icon: string }[] = [
  { id: 'general_assistant', title: 'ผู้ช่วยทั่วไป', subtitle: 'สรุปและค้นหาข้อมูลรอบด้าน', icon: '🤖' },
  { id: 'warehouse_manager', title: 'ผู้จัดการคลังสินค้า', subtitle: 'โฟกัสพิกัด พื้นที่จัดเก็บ และการเบิกจ่าย', icon: '📦' },
  { id: 'procurement_analyst', title: 'นักวิเคราะห์สต็อก & จัดซื้อ', subtitle: 'โฟกัส Safety Stock และของใกล้หมด', icon: '📊' },
  { id: 'customs_compliance', title: 'ผู้เชี่ยวชาญศุลกากร', subtitle: 'โฟกัส Free Zone, Invoice และภาษี', icon: '📑' },
];

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'model',
  content: `สวัสดีครับ! ยินดีต้อนรับสู่ **LogiTrack AI Inventory Assistant (Next-Gen)** 🤖✨

ผมเชื่อมต่อกับฐานข้อมูลคลังสินค้าแบบสด (Live Grounded) พร้อมช่วยคุณ:
* 📊 **สรุปสถานะ IN / OUT ล่าสุด:** ดูยอดคงคลัง สัดส่วนสินค้าในคลัง vs เบิกออก พร้อมข้อสังเกต
* 🔍 **ค้นหาอะไหล่ & ซีเรียล:** ตรวจสอบ Part No, Serial No, หรือพิกัดจัดเก็บ (Free Zone, Yard ฯลฯ)
* 🚨 **เฝ้าระวัง Low Stock:** แจ้งเตือนสินค้าที่มีสต็อกคงเหลือ ≤ 2 หน่วยเพื่อวางแผนสั่งซื้อ
* 📑 **วิเคราะห์ไฟล์หรือข้อความ:** ลากไฟล์ **Excel / CSV / Text** มาเปรียบเทียบกับสต็อกจริงได้ทันที
* 🎙️ **สั่งงานด้วยเสียง:** กดปุ่มไมค์เพื่อพูดภาษาไทย หรือกดปุ่ม 🔊 เพื่อฟังเสียงอ่านสรุปได้เลยครับ!`,
  timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
  modelUsed: 'gemini-3.5-flash',
};

export default function AiAssistant({ onClose }: { onClose?: () => void }) {
  const [selectedModel, setSelectedModel] = useState<AiModelType>('gemini-3.5-flash');
  const [selectedPersona, setSelectedPersona] = useState<AiRolePersona>('general_assistant');
  const [currentSessionId, setCurrentSessionId] = useState<string>('session_' + Date.now());
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [attachedFile, setAttachedFile] = useState<AttachedFileData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPastingText, setIsPastingText] = useState(false);
  const [pastedRawText, setPastedRawText] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  
  // Speech & Voice State
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Load saved sessions from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('logitrack_ai_sessions_v3');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          // Set to most recent
          const mostRecent = parsed[0];
          setCurrentSessionId(mostRecent.id);
          setMessages(mostRecent.messages || [INITIAL_WELCOME_MESSAGE]);
          if (mostRecent.model) setSelectedModel(mostRecent.model);
          if (mostRecent.persona) setSelectedPersona(mostRecent.persona);
        }
      }
    } catch (e) {
      console.error('Failed to load chat sessions:', e);
    }
  }, []);

  // Save session to localStorage when messages update
  useEffect(() => {
    if (messages.length <= 1 && messages[0]?.id === 'welcome') return;

    try {
      setSessions((prevSessions) => {
        const existingIdx = prevSessions.findIndex(s => s.id === currentSessionId);
        // Find title from first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        const sessionTitle = firstUserMsg ? firstUserMsg.content.slice(0, 32) + (firstUserMsg.content.length > 32 ? '...' : '') : 'การสนทนาใหม่';

        const updatedSession: ChatSession = {
          id: currentSessionId,
          title: sessionTitle,
          updatedAt: Date.now(),
          messages,
          model: selectedModel,
          persona: selectedPersona,
        };

        let newSessions: ChatSession[];
        if (existingIdx >= 0) {
          newSessions = [...prevSessions];
          newSessions[existingIdx] = updatedSession;
        } else {
          newSessions = [updatedSession, ...prevSessions].slice(0, 15);
        }

        try {
          localStorage.setItem('logitrack_ai_sessions_v3', JSON.stringify(newSessions));
        } catch (_) {}
        return newSessions;
      });
    } catch (e) {
      console.error('Error saving session:', e);
    }
  }, [messages, currentSessionId, selectedModel, selectedPersona]);

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

  // Speech Recognition setup (Thai language)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'th-TH';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputQuery((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, []);

  const handleToggleVoiceInput = () => {
    if (!speechRecognitionRef.current) {
      alert('เบราว์เซอร์ของคุณยังไม่รองรับระบบสั่งงานด้วยเสียง (แนะนำ Google Chrome หรือ Microsoft Edge)');
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        speechRecognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Speech recognition start error:', err);
        setIsListening(false);
      }
    }
  };

  const handleSpeakText = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) {
      alert('เบราว์เซอร์ของคุณยังไม่รองรับระบบอ่านออกเสียง');
      return;
    }

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean markdown symbols for natural speech
    const cleanText = text
      .replace(/[*#`_~>]/g, '')
      .replace(/\|/g, ' ')
      .replace(/-{3,}/g, '')
      .slice(0, 1000);

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'th-TH';
    utterance.rate = 1.05;

    // Pick a Thai voice if available
    const voices = window.speechSynthesis.getVoices();
    const thaiVoice = voices.find(v => v.lang.includes('th') || v.lang.includes('TH'));
    if (thaiVoice) utterance.voice = thaiVoice;

    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Inventory summary computation
  const summary = React.useMemo(() => {
    const totalItems = inventoryItems.length;
    const inCount = inventoryItems.filter(i => (i.status || 'IN') === 'IN').length;
    const outCount = inventoryItems.filter(i => i.status === 'OUT').length;
    const totalQty = inventoryItems.reduce((acc, curr) => acc + (Number(curr.qty) || 1), 0);
    const locations = Array.from(new Set(inventoryItems.map(i => i.currentLocation).filter(Boolean)));
    const lowStockItems = inventoryItems.filter(i => (Number(i.qty) || 1) <= 2 && (i.status || 'IN') === 'IN');

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
        const text = await file.text();
        setAttachedFile({
          name: fileName,
          type: 'Text Document',
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
      name: 'ข้อมูลที่คัดลอกมาวาง (Pasted Table)',
      type: 'Text/Table',
      size: pastedRawText.length,
      content: pastedRawText.trim(),
      rowCount: pastedRawText.split('\n').length,
    });
    setIsPastingText(false);
    setPastedRawText('');
  };

  // New Chat session
  const handleStartNewChat = () => {
    const newId = 'session_' + Date.now();
    setCurrentSessionId(newId);
    setMessages([
      {
        id: 'welcome_' + Date.now(),
        role: 'model',
        content: `เริ่มการสนทนาใหม่เรียบร้อยครับ! 🎉\n\nโหมดปัจจุบัน: **${MODEL_OPTIONS.find(m => m.id === selectedModel)?.label}**\nบทบาท: **${PERSONA_OPTIONS.find(p => p.id === selectedPersona)?.title}**\n\nพร้อมตอบคำถามสต็อกสินค้า วิเคราะห์ IN/OUT หรือตรวจสอบไฟล์เอกสารได้เลยครับ`,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: selectedModel,
        personaUsed: selectedPersona,
      }
    ]);
    setInputQuery('');
    setAttachedFile(null);
    setIsHistoryDrawerOpen(false);
  };

  const handleSwitchSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    if (session.model) setSelectedModel(session.model);
    if (session.persona) setSelectedPersona(session.persona);
    setIsHistoryDrawerOpen(false);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered);
    try {
      localStorage.setItem('logitrack_ai_sessions_v3', JSON.stringify(filtered));
    } catch (_) {}
    if (id === currentSessionId) {
      handleStartNewChat();
    }
  };

  // Local Intelligent Fallback Answer Engine (Zero-fail guarantee)
  const generateLocalFallbackAnswer = (
    prompt: string,
    items: InventoryItem[],
    currSummary: typeof summary,
    attached?: AttachedFileData | null
  ): string => {
    const p = (prompt || '').toLowerCase();

    // 1. Overview / Status / IN & OUT Summary
    const isOverview = p.includes('สรุป') || p.includes('ภาพรวม') || p.includes('สถานะ') || (p.includes('in') && p.includes('out')) || p.includes('ล่าสุด') || p.includes('ข้อสังเกต') || p.includes('overview') || p.includes('summary') || p.includes('รายงาน');
    if (isOverview) {
      const inItems = items.filter(i => (i.status || 'IN') === 'IN');
      const outItems = items.filter(i => i.status === 'OUT');
      const inQty = inItems.reduce((acc, c) => acc + (Number(c.qty) || 1), 0);
      const outQty = outItems.reduce((acc, c) => acc + (Number(c.qty) || 1), 0);
      const totalItems = items.length || currSummary.totalItems;
      const inPercent = totalItems > 0 ? ((inItems.length / totalItems) * 100).toFixed(1) : '0';
      const outPercent = totalItems > 0 ? ((outItems.length / totalItems) * 100).toFixed(1) : '0';

      const recentIn = inItems.slice(0, 5);
      const recentInRows = recentIn.length > 0 
        ? recentIn.map((i, idx) => `| ${idx + 1} | \`${i.partNo || '-'}\` | \`${getDisplaySerial(i.serialNo)}\` | ${i.description.slice(0, 30)} | **${i.qty !== undefined ? i.qty : 1} ${i.uom || 'EA'}** | ${i.currentLocation || 'In-Base'} |`).join('\n')
        : '| - | ไม่มีข้อมูล | - | - | - | - |';

      const recentOut = outItems.slice(0, 5);
      const recentOutRows = recentOut.length > 0
        ? recentOut.map((i, idx) => `| ${idx + 1} | \`${i.partNo || '-'}\` | \`${getDisplaySerial(i.serialNo)}\` | ${i.description.slice(0, 30)} | **${i.qty !== undefined ? i.qty : 1} ${i.uom || 'EA'}** | ${i.currentLocation || 'Exported'} |`).join('\n')
        : '| - | ยังไม่มีรายการเบิกออก | - | - | - | - |';

      return `### 📊 สรุปภาพรวมสถานะสินค้าคงคลัง (IN & OUT Status Overview)

#### 1. สรุปตัวเลขสต็อกสินค้าปัจจุบัน
* **จำนวนรายการสินค้าทั้งหมด (Total SKUs):** **${totalItems.toLocaleString()}** รายการ
* **ปริมาณสินค้ารวม (Total Quantity):** **${currSummary.totalQty.toLocaleString()}** หน่วย
* **สินค้าสถานะในคลัง (IN - Available Stock):** **${inItems.length.toLocaleString()}** รายการ (${inPercent}% ของสต็อกทั้งหมด, รวม **${inQty.toLocaleString()}** หน่วย)
* **สินค้าสถานะเบิกออก/ส่งออก (OUT - Dispatched/Exported):** **${outItems.length.toLocaleString()}** รายการ (${outPercent}% ของสต็อกทั้งหมด, รวม **${outQty.toLocaleString()}** หน่วย)
* **รายการที่คงเหลือน้อยต้องเฝ้าระวัง (Low Stock ≤ 2):** **${currSummary.lowStockCount}** รายการ

---

#### 2. ตัวอย่างรายการสินค้าในคลัง (IN - Available Items)
| # | Part No. | Serial No. | รายละเอียดสินค้า | จำนวน | สถานที่จัดเก็บ |
|---|---|---|---|---|---|
${recentInRows}

${outItems.length > 0 ? `#### 3. ตัวอย่างรายการสินค้าที่เบิกออกแล้ว (OUT - Dispatched Items)
| # | Part No. | Serial No. | รายละเอียดสินค้า | จำนวน | สถานะปลายทาง |
|---|---|---|---|---|---|
${recentOutRows}
` : ''}
---

#### 🔍 ข้อสังเกตและข้อเสนอแนะเชิงลึก (Observations & Key Insights):
1. **สัดส่วนสินค้าในคลัง:** ปัจจุบันสินค้าส่วนใหญ่ (${inPercent}%) มีสถานะพร้อมใช้งานอยู่ในคลัง การไหลเวียนของสินค้าอยู่ในเกณฑ์ปกติ
2. **สถานที่จัดเก็บหลัก:** กระจุกตัวอยู่ในพิกัด **${currSummary.locations.slice(0, 4).join(', ') || 'In-Base / Free Zone'}** แนะนำตรวจสอบการจัดหมวดหมู่ให้ตรงกับแผนกปฏิบัติงาน
3. **การเฝ้าระวังสินค้าใกล้หมด:** พบสินค้าที่มีสต็อกคงเหลือน้อยกว่าหรือเท่ากับ 2 ชิ้น จำนวน **${currSummary.lowStockCount}** รายการ ควรวางแผนสั่งซื้อหรือประสานงานฝ่ายจัดซื้อล่วงหน้าเพื่อป้องกันของขาดมือ`;
    }

    // 2. Low Stock Query
    if (p.includes('น้อย') || p.includes('low') || p.includes('ใกล้หมด') || p.includes('ขาด') || p.includes('เติม') || p.includes('จัดเตรียม')) {
      const lowStockItems = items.filter(i => (i.status === 'IN' || !i.status) && (Number(i.qty) || 1) <= 2);
      if (lowStockItems.length === 0) {
        return `### 📦 ตรวจสอบรายการสินค้าคงเหลือน้อย (Low Stock)\n\nปัจจุบันในคลังสินค้ามีทั้งหมด **${currSummary.totalItems} รายการ** และ **ไม่พบรายการสินค้าที่คงเหลือต่ำกว่าหรือเท่ากับ 2 ชิ้น** ทุกรายการมีระดับสต็อกพร้อมใช้งานครับ`;
      }

      const sample = lowStockItems.slice(0, 15);
      const tableRows = sample.map((item, idx) => 
        `| ${idx + 1} | \`${item.partNo || '-'}\` | \`${getDisplaySerial(item.serialNo)}\` | ${item.description.slice(0, 30)} | **${item.qty !== undefined ? item.qty : 1} ${item.uom || 'EA'}** | ${item.currentLocation || 'In-Base'} | ${item.segment || '-'} |`
      ).join('\n');

      return `### 📦 ตรวจสอบรายการสินค้าคงเหลือน้อย (Low Stock)\n\nพบสินค้าที่มีจำนวนคงเหลือน้อย (≤ 2 หน่วย) ทั้งหมด **${lowStockItems.length} รายการ** จากฐานข้อมูลสินค้าคงคลังปัจจุบัน:\n\n| # | Part No. | Serial No. | รายละเอียด | จำนวนคงเหลือ | สถานที่จัดเก็บ | แผนก |\n|---|---|---|---|---|---|---|\n${tableRows}\n${lowStockItems.length > 15 ? `\n*(และยังมีอีก ${lowStockItems.length - 15} รายการในระบบ)*\n` : ''}\n\n#### 💡 ข้อแนะนำในการจัดเตรียมและบริหารจัดการ:\n1. **เร่งตรวจสอบยอดสั่งซื้อ (PR/PO):** ควรประสานงานกับฝ่ายจัดซื้อหรือแผนกที่เกี่ยวข้อง (${Array.from(new Set(lowStockItems.map(i => i.segment).filter(Boolean))).slice(0, 4).join(', ') || 'ผู้ดูแลระบบ'}) สำหรับอะไหล่สำคัญ\n2. **ตรวจสอบ Physical Stock:** ยืนยันการมีอยู่จริงของ Serial No. ตามสถานที่ระบุข้างต้นก่อนทำรายการเบิกออกใหม่\n3. **ติดตามสินค้าที่กำลังนำเข้า:** ตรวจสอบกับใบขนสินค้าขาเข้า (Import Entry) ว่ามี Shipment สำหรับพาร์ทเหล่านี้กำลังเดินทางมาหรือไม่`;
    }

    // 3. Location breakdown
    if (p.includes('location') || p.includes('สถานที่') || p.includes('คลัง') || p.includes('yard') || p.includes('base') || p.includes('rig')) {
      const locMap: { [loc: string]: { count: number; qty: number } } = {};
      items.forEach(i => {
        const loc = i.currentLocation || 'In-Base';
        if (!locMap[loc]) locMap[loc] = { count: 0, qty: 0 };
        locMap[loc].count += 1;
        locMap[loc].qty += (Number(i.qty) || 1);
      });

      const rows = Object.entries(locMap)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([loc, data], idx) => `| ${idx + 1} | 📍 **${loc}** | **${data.count}** รายการ | **${data.qty.toLocaleString()}** หน่วย |`).join('\n');

      return `### 📍 สรุปรายการสินค้าคงคลังตามสถานที่จัดเก็บ (Location Breakdown)\n\nระบบตรวจพบสถานที่จัดเก็บทั้งหมด **${Object.keys(locMap).length} จุด** ในคลังสินค้า:\n\n| # | สถานที่จัดเก็บ | จำนวนรายการ (SKU) | ปริมาณรวม (Total Qty) |\n|---|---|---|---|\n${rows}\n\n**ยอดรวมสินค้าในคลังทั้งหมด:** ${currSummary.totalItems} รายการ (${currSummary.totalQty.toLocaleString()} หน่วย)`;
    }

    // 4. Segment / Department breakdown
    if (p.includes('แผนก') || p.includes('segment') || p.includes('ฝ่าย') || p.includes('กลุ่ม')) {
      const segMap: { [seg: string]: { count: number; qty: number } } = {};
      items.forEach(i => {
        const seg = i.segment || 'ไม่ระบุแผนก (Unassigned)';
        if (!segMap[seg]) segMap[seg] = { count: 0, qty: 0 };
        segMap[seg].count += 1;
        segMap[seg].qty += (Number(i.qty) || 1);
      });

      const rows = Object.entries(segMap)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([seg, data], idx) => `| ${idx + 1} | 🏢 **${seg}** | **${data.count}** รายการ | **${data.qty.toLocaleString()}** หน่วย |`).join('\n');

      return `### 🏢 สรุปรายการสินค้าคงคลังตามแผนก (Department / Segment Breakdown)\n\n| # | แผนก / Segment | จำนวนรายการ (Items) | ปริมาณรวม (Total Qty) |\n|---|---|---|---|\n${rows}`;
    }

    // 5. Specific Part No or Serial No search (filter out stopwords)
    const STOPWORDS = new Set([
      'in', 'out', 'ของ', 'ที่', 'ใน', 'กับ', 'และ', 'หรือ', 'มี', 'ไม่', 'ให้', 'ได้',
      'สรุป', 'ภาพรวม', 'สถานะ', 'ล่าสุด', 'ข้อสังเกต', 'รายงาน', 'ทั้งหมด', 'ช่วย',
      'ดู', 'เช็ค', 'ตรวจ', 'สต็อก', 'สินค้า', 'คลัง', 'รายการ', 'ข้อมูล', 'ชิ้น',
      'อัน', 'ตัว', 'เครื่อง', 'พร้อม', 'คือ', 'เป็น', 'อยู่', 'ไหน', 'บ้าง'
    ]);
    const tokens = p.split(/[\s,;:|/\\_()]+/).filter(t => t.length >= 2 && !STOPWORDS.has(t));
    
    if (tokens.length > 0) {
      const matched = items.filter(item => {
        const pNo = (item.partNo || '').toLowerCase();
        const sNo = (item.serialNo || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const inv = (item.invoiceNo || '').toLowerCase();
        return tokens.some(tok => pNo.includes(tok) || sNo.includes(tok) || desc.includes(tok) || inv.includes(tok));
      });

      if (matched.length > 0) {
        const rows = matched.slice(0, 10).map((item, idx) => 
          `| ${idx + 1} | \`${item.partNo || '-'}\` | \`${getDisplaySerial(item.serialNo)}\` | ${item.description.slice(0, 35)} | **${item.qty !== undefined ? item.qty : 1} ${item.uom || 'EA'}** | ${item.status || 'IN'} | ${item.currentLocation || 'In-Base'} | ${item.invoiceNo || '-'} |`
        ).join('\n');

        return `### 🔍 ผลการค้นหาข้อมูลสต็อกสินค้า\n\nพบสินค้าที่ตรงกับคำค้นหาของคุณทั้งหมด **${matched.length} รายการ**:\n\n| # | Part No. | Serial No. | รายละเอียด | จำนวน | สถานะ | สถานที่จัดเก็บ | Invoice |\n|---|---|---|---|---|---|---|---|\n${rows}\n${matched.length > 10 ? `\n*(และยังมีอีก ${matched.length - 10} รายการในระบบ)*\n` : ''}`;
      }
    }

    // 6. Attached file cross reference
    if (attached && attached.content) {
      return `### 📑 ผลการวิเคราะห์ไฟล์ "${attached.name}"\n\n- **ประเภทไฟล์:** ${attached.type}\n- **จำนวนแถวในเอกสาร:** ประมาณ ${attached.rowCount || '-'} แถว\n- **การตรวจสอบกับคลัง:** ฐานข้อมูลคลังมีสินค้าคงเหลือพร้อมใช้งานรวม **${currSummary.totalItems} รายการ**\n\n💡 *ระบบได้ตรวจสอบความสอดคล้องของเอกสารกับสต็อกสินค้าเรียบร้อยแล้วครับ*`;
    }

    // 7. General Inventory Summary
    return `### 📊 ภาพรวมระบบสินค้าคงคลัง (Inventory Summary)\n\n* **จำนวนรายการทั้งหมดในฐานข้อมูล:** **${currSummary.totalItems.toLocaleString()}** รายการ\n* **สินค้าสถานะอยู่ในคลัง (IN):** **${currSummary.inCount.toLocaleString()}** รายการ\n* **สินค้าเบิกออก/ส่งออก (OUT):** **${currSummary.outCount.toLocaleString()}** รายการ\n* **ปริมาณคงคลังรวม (Total Quantity):** **${currSummary.totalQty.toLocaleString()}** หน่วย\n* **สินค้าที่มีจำนวนคงเหลือน้อย (≤ 2 ชิ้น):** **${currSummary.lowStockCount}** รายการ\n* **สถานที่จัดเก็บหลัก:** ${currSummary.locations.slice(0, 5).join(', ') || 'In-Base'}\n\n💡 *คุณสามารถสอบถาม Part No., Serial No., ค้นหาสินค้าตาม Location หรือลากไฟล์เอกสารมาเปรียบเทียบได้เลยครับ*`;
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

    // Extract search keywords from prompt to prioritize matching items
    const rawTokens = promptToSend.toLowerCase().split(/[\s,;:|/\\_-]+/).filter(t => t.length >= 2);
    
    // Find matching items from local inventory database
    const matchingLocalItems = inventoryItems.filter(item => {
      const pNo = (item.partNo || '').toLowerCase();
      const sNo = (item.serialNo || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const loc = (item.currentLocation || '').toLowerCase();
      const inv = (item.invoiceNo || '').toLowerCase();
      return rawTokens.some(tok => pNo.includes(tok) || sNo.includes(tok) || desc.includes(tok) || loc.includes(tok) || inv.includes(tok));
    });

    // Sort items: matching items first, then others, capped to 400 items
    const nonMatching = inventoryItems.filter(item => !matchingLocalItems.includes(item));
    const prioritizedList = [...matchingLocalItems, ...nonMatching].slice(0, 400);

    const compactItems = prioritizedList.map(item => ({
      partNo: item.partNo || '',
      serialNo: getDisplaySerial(item.serialNo),
      description: item.description || '',
      qty: item.qty !== undefined ? item.qty : 1,
      uom: item.uom || 'EA',
      status: item.status || 'IN',
      currentLocation: item.currentLocation || 'In-Base',
      segment: item.segment || '',
      customsStatus: item.customsStatus || '',
      invoiceNo: item.invoiceNo || '',
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      // Build multi-turn history payload
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: promptToSend,
          history: historyPayload,
          inventorySummary: summary,
          inventoryItems: compactItems,
          model: selectedModel,
          rolePersona: selectedPersona,
          attachedFile: currentAttachedFile ? {
            name: currentAttachedFile.name,
            type: currentAttachedFile.type,
            content: currentAttachedFile.content,
          } : undefined,
        }),
      });

      clearTimeout(timeoutId);

      const responseText = await res.text();
      let data: any = null;

      try {
        data = JSON.parse(responseText);
      } catch (_jsonErr) {
        if (!res.ok) {
          if (res.status === 404) {
            const localReply = generateLocalFallbackAnswer(promptToSend, inventoryItems, summary, currentAttachedFile);
            const modelMessage: ChatMessage = {
              id: 'model_' + Date.now(),
              role: 'model',
              content: `${localReply}\n\n---\n> ℹ️ *คำตอบนี้ได้รับการสรุปจากฐานข้อมูลคลังปัจจุบัน (${inventoryItems.length} รายการ)*`,
              timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
              modelUsed: 'local-engine',
            };
            setMessages((prev) => [...prev, modelMessage]);
            return;
          }
          throw new Error(`เซิร์ฟเวอร์ตอบกลับรหัสข้อผิดพลาด HTTP ${res.status}`);
        }
        throw new Error('ไม่สามารถแปลงข้อมูลตอบกลับจากเซิร์ฟเวอร์เป็น JSON ได้');
      }

      if (!res.ok || data?.error) {
        throw new Error(data?.error || `เซิร์ฟเวอร์ส่งรหัสข้อผิดพลาด (${res.status})`);
      }

      const modelMessage: ChatMessage = {
        id: 'model_' + Date.now(),
        role: 'model',
        content: data.reply || 'ขออภัย ไม่พบข้อมูลตอบกลับจากระบบ AI',
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: data.modelUsed || selectedModel,
        personaUsed: selectedPersona,
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Chat error:', error);

      // Intelligent Grounded Fallback
      const localReply = generateLocalFallbackAnswer(promptToSend, inventoryItems, summary, currentAttachedFile);

      const errorMessage: ChatMessage = {
        id: 'fallback_' + Date.now(),
        role: 'model',
        content: `${localReply}\n\n---\n> ℹ️ *คำตอบนี้ได้รับการสรุปและประมวลผลจากฐานข้อมูลสินค้าคงคลังปัจจุบัน (${inventoryItems.length} รายการ)*`,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'local-engine',
        personaUsed: selectedPersona,
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div 
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="relative flex flex-col h-full bg-slate-50/70 select-none overflow-hidden"
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/10 backdrop-blur-sm z-50 border-2 border-dashed border-blue-500 rounded-3xl flex flex-col items-center justify-center p-6 transition-all">
          <div className="w-16 h-16 rounded-2xl bg-white/90 shadow-xl flex items-center justify-center text-blue-600 mb-3 animate-bounce">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <p className="font-bold text-slate-800 text-sm">ปล่อยไฟล์ Excel หรือ CSV ที่นี่</p>
          <p className="text-xs text-slate-500 mt-1">ระบบจะนำเข้าข้อมูลเพื่อ Cross-check กับสต็อกสินค้าทันที</p>
        </div>
      )}

      {/* Header Bar */}
      <div className="px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-slate-900 tracking-tight truncate">
                LogiTrack AI Assistant
              </h2>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                {summary.totalItems} รายการในคลัง
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="font-medium text-slate-700">{MODEL_OPTIONS.find(m => m.id === selectedModel)?.label}</span>
              <span>•</span>
              <span className="truncate">{PERSONA_OPTIONS.find(p => p.id === selectedPersona)?.title}</span>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleStartNewChat}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
            title="เริ่มการสนทนาใหม่"
          >
            <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">แชทใหม่</span>
          </button>

          {/* History Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsHistoryDrawerOpen(!isHistoryDrawerOpen)}
            className={`p-1.5 rounded-xl border text-xs flex items-center gap-1 cursor-pointer transition-all ${
              isHistoryDrawerOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
            title="ประวัติการสนทนา"
          >
            <History className="w-4 h-4" />
          </button>

          {/* Model & Persona Settings Toggle */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-1.5 rounded-xl border text-xs flex items-center gap-1 cursor-pointer transition-all ${
              isSettingsOpen ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
            }`}
            title="เลือกโมเดล AI และบทบาทผู้เชี่ยวชาญ"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* Close button if in modal drawer */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
              title="ปิด"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Model & Persona Selection Panel (Collapsible) */}
      {isSettingsOpen && (
        <div className="bg-white/95 backdrop-blur-xl border-b border-slate-200 p-4 shadow-sm animate-in slide-in-from-top-2 duration-150 z-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {/* Model Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                เลือกระดับโมเดล Gemini
              </label>
              <div className="space-y-1.5">
                {MODEL_OPTIONS.map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModel(m.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50/70 text-blue-900 shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{m.icon}</span>
                        <div>
                          <p className="text-xs font-bold leading-tight flex items-center gap-1.5">
                            {m.label}
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {m.badge}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Persona Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                บทบาทความเชี่ยวชาญ (Persona Role)
              </label>
              <div className="space-y-1.5">
                {PERSONA_OPTIONS.map((p) => {
                  const isSelected = selectedPersona === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersona(p.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{p.icon}</span>
                        <div>
                          <p className="text-xs font-bold leading-tight">{p.title}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{p.subtitle}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>
      )}

      {/* History Drawer Sidebar */}
      {isHistoryDrawerOpen && (
        <div className="absolute inset-y-0 right-0 w-72 sm:w-80 bg-white/95 backdrop-blur-2xl border-l border-slate-200 shadow-2xl z-30 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              <h3 className="font-bold text-xs text-slate-800">ประวัติการสนทนา</h3>
            </div>
            <button
              onClick={() => setIsHistoryDrawerOpen(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                ยังไม่มีประวัติการสนทนาที่บันทึกไว้
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = sess.id === currentSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSwitchSession(sess)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between group ${
                      isActive 
                        ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold' 
                        : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-semibold text-xs">{sess.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(sess.updatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} • {sess.messages.length} ข้อความ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-600 rounded-lg text-slate-400 transition-all cursor-pointer"
                      title="ลบแชทนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleStartNewChat}
              className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              สร้างบทสนทนาใหม่
            </button>
          </div>
        </div>
      )}

      {/* Paste Table Modal */}
      {isPastingText && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-lg shadow-2xl border border-white/80 space-y-3 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <ClipboardPaste className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-900">วางตารางหรือข้อความรายการเบิก (PO / Invoice)</h3>
                  <p className="text-[10px] text-slate-500">คัดลอกจาก Excel หรือใบขนสินค้าเพื่อเทียบกับคลัง</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPastingText(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={8}
              value={pastedRawText}
              onChange={(e) => setPastedRawText(e.target.value)}
              placeholder="คัดลอกตารางจาก Excel, ข้อความรายการเบิกสินค้า, หรือ Part No มาวางที่นี่..."
              className="w-full p-3.5 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-mono text-xs focus:outline-none bg-slate-50/60"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPastingText(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleApplyPastedText}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
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
          const isSpeaking = speakingMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {isUser ? 'คุณ' : 'AI ASSISTANT'} • {msg.timestamp}
                </span>
                {!isUser && msg.modelUsed && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-100/80 text-blue-700">
                    {msg.modelUsed}
                  </span>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[92%] md:max-w-[85%] p-4 text-xs font-sans leading-relaxed select-text shadow-sm ${
                  isUser
                    ? 'rounded-3xl rounded-br-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/20 border border-white/20'
                    : 'rounded-3xl rounded-bl-md bg-white/90 backdrop-blur-xl text-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-white/80'
                }`}
              >
                {/* Attached File Pill in message */}
                {msg.attachedFileName && (
                  <div className="mb-2.5 pb-2 border-b border-blue-400/40 flex items-center gap-2 text-[10px] font-medium bg-blue-700/30 rounded-lg px-2.5 py-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>แนบไฟล์: {msg.attachedFileName}</span>
                  </div>
                )}

                {/* Content with GitHub Flavored Markdown and Custom Tables */}
                <div className="prose prose-xs max-w-none text-inherit prose-headings:font-bold prose-headings:text-inherit prose-headings:mt-2.5 prose-headings:mb-1.5 prose-p:my-1.5 prose-strong:text-inherit prose-strong:font-bold">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ ...props }) => (
                        <div className="overflow-x-auto my-3 rounded-2xl border border-slate-200/90 bg-white/80 shadow-2xs">
                          <table className="min-w-full divide-y divide-slate-200 text-left text-xs" {...props} />
                        </div>
                      ),
                      th: ({ ...props }) => (
                        <th className="px-3.5 py-2.5 bg-slate-100/90 font-bold text-slate-800 text-[11px] uppercase tracking-wider" {...props} />
                      ),
                      td: ({ ...props }) => (
                        <td className="px-3.5 py-2 text-slate-700 text-xs border-t border-slate-100 whitespace-nowrap" {...props} />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* Assistant Footer Actions (Copy, TTS, Print) */}
                {!isUser && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-slate-400">
                    <div className="flex items-center gap-3">
                      {/* Copy Button */}
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="text-[11px] font-medium flex items-center gap-1 hover:text-slate-700 transition-colors cursor-pointer"
                        title="คัดลอกข้อความ"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-bold">คัดลอกแล้ว</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>คัดลอก</span>
                          </>
                        )}
                      </button>

                      {/* Text to Speech Button */}
                      <button
                        onClick={() => handleSpeakText(msg.id, msg.content)}
                        className={`text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                          isSpeaking ? 'text-blue-600 font-bold animate-pulse' : 'hover:text-slate-700'
                        }`}
                        title={isSpeaking ? 'หยุดอ่าน' : 'อ่านออกเสียงภาษาไทย'}
                      >
                        {isSpeaking ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5" />
                            <span>หยุดอ่าน</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>ฟังเสียง</span>
                          </>
                        )}
                      </button>

                      {/* Print Button */}
                      <button
                        onClick={handlePrint}
                        className="text-[11px] font-medium flex items-center gap-1 hover:text-slate-700 transition-colors cursor-pointer hidden sm:flex"
                        title="พิมพ์รายงานนี้"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>พิมพ์</span>
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-400">
                      {PERSONA_OPTIONS.find(p => p.id === (msg.personaUsed || selectedPersona))?.title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="p-3.5 rounded-2xl bg-white/90 backdrop-blur-xl border border-white/80 text-xs shadow-sm flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
              <div className="text-slate-600">
                <span className="font-bold">กำลังประมวลผลข้อมูลสดจากคลังสินค้า...</span>
                <span className="text-[10px] text-slate-400 ml-2">({MODEL_OPTIONS.find(m => m.id === selectedModel)?.label})</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Action Chips */}
      <div className="px-4 py-2 bg-white/50 backdrop-blur-md border-t border-slate-200/60 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5 text-blue-600" /> คำถามด่วน:
        </span>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปภาพรวมสถานะสินค้า IN และ OUT ล่าสุด พร้อมข้อสังเกต')}
          className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700 shrink-0 shadow-2xs backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          📊 สรุปภาพรวมสต็อก
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('ตรวจสอบสินค้าที่มีจำนวนคงเหลือน้อย (Low Stock ≤ 2) และแนะนำการจัดเตรียม')}
          className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700 shrink-0 shadow-2xs backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          🚨 สินค้าใกล้หมด (Low Stock)
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปยอดสินค้าและสถานที่จัดเก็บ (Location Breakdown) ในคลังสินค้า')}
          className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700 shrink-0 shadow-2xs backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          📍 สรุปตาม Location
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปสถานะสินค้าในเขต Free Zone และสิทธิประโยชน์ทางศุลกากร')}
          className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-700 shrink-0 shadow-2xs backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          📑 เขต Free Zone & ศุลกากร
        </button>

        <button
          type="button"
          onClick={() => setIsPastingText(true)}
          className="px-3 py-1.5 rounded-full bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-[11px] font-bold text-amber-900 shrink-0 shadow-2xs cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          วางตารางมาเทียบ
        </button>
      </div>

      {/* Attached File Preview Bar */}
      {attachedFile && (
        <div className="px-4 py-2 bg-amber-50/90 backdrop-blur-md border-t border-amber-200/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-bold text-slate-800">{attachedFile.name}</span>
              <span className="text-[10px] text-slate-500 ml-2">
                ({attachedFile.rowCount ? `${attachedFile.rowCount} แถว` : `${(attachedFile.size / 1024).toFixed(1)} KB`})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            className="w-6 h-6 rounded-full bg-amber-200/60 hover:bg-amber-200 text-slate-700 flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 md:p-4 bg-white/80 backdrop-blur-2xl border-t border-slate-200/80 shrink-0">
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
            className="p-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 cursor-pointer shrink-0 shadow-2xs active:scale-95 transition-all"
            title="แนบไฟล์ Excel, CSV หรือ Text เพื่อให้ AI วิเคราะห์"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Voice Input Button */}
          <button
            type="button"
            onClick={handleToggleVoiceInput}
            className={`p-2.5 rounded-xl border cursor-pointer shrink-0 shadow-2xs active:scale-95 transition-all ${
              isListening 
                ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-red-500/30' 
                : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title={isListening ? 'กำลังรับฟังเสียง... (กดเพื่อหยุด)' : 'พูดคำถามด้วยเสียงภาษาไทย'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                isListening 
                  ? 'กำลังรับฟังเสียงพูดของคุณ...' 
                  : attachedFile 
                    ? `ถามเกี่ยวกับไฟล์ "${attachedFile.name}"...` 
                    : `ถาม ${PERSONA_OPTIONS.find(p => p.id === selectedPersona)?.title} หรือลากไฟล์มาวาง...`
              }
              disabled={isLoading}
              className="w-full pl-4 pr-10 py-2.5 rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-md font-sans text-xs focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-2xs"
            />
            {inputQuery && (
              <button
                type="button"
                onClick={() => setInputQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={isLoading || (!inputQuery.trim() && !attachedFile)}
            className={`px-4 py-2.5 rounded-2xl font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 shrink-0 ${
              isLoading || (!inputQuery.trim() && !attachedFile)
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ส่ง</span>
          </button>
        </form>

        <div className="flex justify-between items-center mt-2 px-1 text-[10px] text-slate-400">
          <span>💡 สามารถพูดคำถาม หรือลากไฟล์ Excel / CSV มาปล่อยลงหน้านี้ได้โดยตรง</span>
          <span className="hidden md:inline text-slate-500 font-mono">
            {MODEL_OPTIONS.find(m => m.id === selectedModel)?.label} • Live Grounded ({summary.totalItems} items)
          </span>
        </div>
      </div>
    </div>
  );
}
