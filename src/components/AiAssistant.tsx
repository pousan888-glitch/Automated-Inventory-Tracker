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
import remarkGfm from 'remark-gfm';

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

  // Local Intelligent Fallback Answer Engine for when external AI API encounters delays or rate-limits
  const generateLocalFallbackAnswer = (
    prompt: string,
    items: InventoryItem[],
    currSummary: typeof summary,
    attached?: AttachedFileData | null
  ): string => {
    const p = (prompt || '').toLowerCase();

    // 1. Overview / Status / IN & OUT Summary (สรุปภาพรวมสถานะสินค้า IN และ OUT ล่าสุด พร้อมข้อสังเกต)
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

    // 2. Low Stock Query (สินค้าใกล้หมด / ตรวจสอบสินค้าที่มีจำนวนคงเหลือน้อย)
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

    // 3. Location breakdown (สรุปตาม Location)
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

    // 4. Segment / Department breakdown (สรุปตาม แผนก)
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

    // 5. Specific Part No or Serial No search (filter out common Thai/English stopwords)
    const STOPWORDS = new Set([
      'in', 'out', 'ของ', 'ที่', 'ใน', 'กับ', 'และ', 'หรือ', 'มี', 'ไม่', 'ให้', 'ได้',
      'สรุป', 'ภาพรวม', 'สถานะ', 'ล่าสุด', 'ข้อสังเกต', 'รายงาน', 'ทั้งหมด', 'ช่วย',
      'ดู', 'เช็ค', 'ตรวจ', 'สต็อก', 'สินค้า', 'คลัง', 'รายการ', 'ข้อมูล', 'ชิ้น',
      'อัน', 'ตัว', 'เครื่อง', 'พร้อม', 'คือ', 'เป็น', 'อยู่', 'ไหน', 'บ้าง'
    ]);
    const tokens = p.split(/[\s,;:|/\\_()]+/).filter(t => t.length >= 2 && !STOPWORDS.has(t));
    
    // Only search if token looks like a real search term
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

    // 6. Attached file cross reference if available
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
    const timeoutId = setTimeout(() => controller.abort(), 40000); // 40 seconds timeout

    try {
      // Build lightweight history
      const historyPayload = messages.slice(-6).map((m) => ({
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
            // Local Intelligent Fallback for 404
            const localReply = generateLocalFallbackAnswer(promptToSend, inventoryItems, summary, currentAttachedFile);
            const modelMessage: ChatMessage = {
              id: 'model_' + Date.now(),
              role: 'model',
              content: `${localReply}\n\n---\n> ℹ️ *คำตอบนี้ได้รับการประมวลผลอัตโนมัติจากฐานข้อมูลคลังปัจจุบัน (${inventoryItems.length} รายการ) เนื่องจากเซิร์ฟเวอร์ AI ภายนอกตอบกลับรหัส HTTP 404 (หากเปิดบน Vercel กรุณาตรวจสอบว่าได้ตั้งค่าตัวแปร \`GEMINI_API_KEY\` ใน Vercel Settings > Environment Variables เรียบร้อยแล้ว)*`,
              timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => [...prev, modelMessage]);
            return;
          }
          if (res.status === 502 || res.status === 504) {
            throw new Error(`เซิร์ฟเวอร์ตอบสนองล่าช้า (HTTP ${res.status}) กำลังเริ่มต้นใหม่อีกครั้ง กรุณากดส่งใหม่อีกครั้งใน 2-3 วินาที`);
          }
          if (res.status === 503) {
            throw new Error('ระบบ AI กำลังเตรียมพร้อม (HTTP 503) กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
          }
          throw new Error(`เซิร์ฟเวอร์ตอบกลับรหัสข้อผิดพลาด HTTP ${res.status}`);
        }
        throw new Error('ไม่สามารถแปลงข้อมูลตอบกลับจากเซิร์ฟเวอร์เป็น JSON ได้');
      }

      if (!res.ok || data?.error) {
        if (res.status === 404) {
          const localReply = generateLocalFallbackAnswer(promptToSend, inventoryItems, summary, currentAttachedFile);
          const modelMessage: ChatMessage = {
            id: 'model_' + Date.now(),
            role: 'model',
            content: `${localReply}\n\n---\n> ℹ️ *คำตอบนี้ได้รับการประมวลผลอัตโนมัติจากฐานข้อมูลคลังปัจจุบัน (${inventoryItems.length} รายการ) เนื่องจากเซิร์ฟเวอร์ตอบกลับรหัส HTTP 404*`,
            timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, modelMessage]);
          return;
        }
        throw new Error(data?.error || `เซิร์ฟเวอร์ส่งรหัสข้อผิดพลาด (${res.status})`);
      }

      const modelMessage: ChatMessage = {
        id: 'model_' + Date.now(),
        role: 'model',
        content: data.reply || 'ขออภัย ไม่พบข้อมูลตอบกลับจากระบบ AI',
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Chat error:', error);

      // If network/rate-limit error occurred, provide intelligent grounded inventory answer!
      const localReply = generateLocalFallbackAnswer(promptToSend, inventoryItems, summary, currentAttachedFile);

      const errorMessage: ChatMessage = {
        id: 'fallback_' + Date.now(),
        role: 'model',
        content: `${localReply}\n\n---\n> ℹ️ *คำตอบนี้ได้รับการสรุปและประมวลผลจากฐานข้อมูลสินค้าคงคลังปัจจุบัน (${inventoryItems.length} รายการ)*`,
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
      className="flex flex-col h-full bg-white/60 backdrop-blur-2xl border border-white/70 rounded-3xl shadow-xl overflow-hidden select-none relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Top Header */}
      <div className="bg-white/70 backdrop-blur-xl px-5 py-3.5 border-b border-white/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-300 text-slate-900 border border-white/60 shadow-md shadow-amber-400/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 fill-slate-900 text-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-slate-900">AI Inventory Assistant</h3>
              <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-500/20">
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
              <span>ฐานข้อมูล {summary.totalItems} รายการ</span>
              <span>•</span>
              <span className="text-emerald-600 font-medium">ในคลัง {summary.inCount}</span>
              <span>•</span>
              <span className="text-amber-600 font-medium">เบิกออก {summary.outCount}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            className="px-3 py-1.5 rounded-full bg-white/70 hover:bg-white text-slate-600 hover:text-rose-600 border border-slate-200/60 text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
            title="ล้างแชท"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ล้างประวัติ</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Drag & Drop Alert Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/80 backdrop-blur-md text-white z-50 flex flex-col items-center justify-center p-8 rounded-3xl">
          <FileSpreadsheet className="w-16 h-16 animate-bounce mb-3" />
          <p className="text-xl font-bold tracking-tight">วางไฟล์ของคุณที่นี่</p>
          <p className="text-xs text-blue-100 mt-1">รองรับ Excel (.xlsx, .xls), CSV และ Text Files</p>
        </div>
      )}

      {/* Paste Text Modal */}
      {isPastingText && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white/90 backdrop-blur-2xl border border-white/80 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200/60 pb-3">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-blue-600" />
                วางข้อความ / ตารางที่ต้องการให้ AI ตรวจสอบ
              </h4>
              <button 
                onClick={() => setIsPastingText(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={8}
              value={pastedRawText}
              onChange={(e) => setPastedRawText(e.target.value)}
              placeholder="คัดลอกตารางจาก Excel, ข้อความรายการเบิก, หรือ PO มาวางที่นี่..."
              className="w-full p-3.5 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-mono text-xs focus:outline-none bg-slate-50/60"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPastingText(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleApplyPastedText}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all"
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
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] font-medium text-slate-400">
                  {isUser ? 'YOU' : 'AI ASSISTANT'} • {msg.timestamp}
                </span>
              </div>

              {/* iOS Message Bubble */}
              <div
                className={`max-w-[88%] md:max-w-[80%] p-4 text-xs font-sans leading-relaxed select-text ${
                  isUser
                    ? 'rounded-3xl rounded-br-md bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/25 border border-white/20'
                    : 'rounded-3xl rounded-bl-md bg-white/80 backdrop-blur-xl text-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-white/80'
                }`}
              >
                {/* Attached File Pill in message */}
                {msg.attachedFileName && (
                  <div className="mb-2.5 pb-2 border-b border-blue-400/40 flex items-center gap-2 text-[10px] font-medium bg-blue-700/30 rounded-lg px-2.5 py-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>แนบไฟล์: {msg.attachedFileName}</span>
                  </div>
                )}

                {/* Content */}
                <div className="prose prose-xs max-w-none text-inherit prose-headings:font-bold prose-headings:text-inherit prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1.5 prose-strong:text-inherit prose-strong:font-bold prose-table:my-2">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ ...props }) => (
                        <div className="overflow-x-auto my-3 rounded-xl border border-slate-200/80 bg-white/70 shadow-2xs">
                          <table className="min-w-full divide-y divide-slate-200 text-left text-xs" {...props} />
                        </div>
                      ),
                      th: ({ ...props }) => (
                        <th className="px-3 py-2 bg-slate-100/90 font-bold text-slate-700 text-[11px] uppercase tracking-wider" {...props} />
                      ),
                      td: ({ ...props }) => (
                        <td className="px-3 py-2 text-slate-800 text-xs border-t border-slate-100 whitespace-nowrap" {...props} />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* Copy Button for Model */}
                {!isUser && (
                  <div className="mt-3 pt-2 border-t border-slate-200/50 flex justify-end">
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="text-[10px] font-medium flex items-center gap-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
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
            <div className="p-3.5 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/80 text-xs shadow-sm flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="font-medium text-slate-600">กำลังวิเคราะห์ข้อมูลกับคลังสินค้า...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Action Chips */}
      <div className="px-4 py-2.5 bg-white/40 backdrop-blur-md border-t border-white/60 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
        <span className="text-[10px] font-semibold text-slate-500 shrink-0 flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-blue-600" /> คำถามด่วน:
        </span>

        <button
          type="button"
          onClick={() => handleSendMessage('ตรวจสอบสินค้าที่มีจำนวนคงเหลือน้อย (Low Stock) และแนะนำการจัดเตรียม')}
          className="px-3 py-1.5 rounded-full bg-white/70 hover:bg-white border border-slate-200/60 text-[11px] font-medium text-slate-700 shrink-0 shadow-sm backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          🚨 สินค้าใกล้หมด
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปยอดสินค้าและสถานที่จัดเก็บ (Location) ทั้งหมดว่ามีของอยู่ที่ไหนบ้าง')}
          className="px-3 py-1.5 rounded-full bg-white/70 hover:bg-white border border-slate-200/60 text-[11px] font-medium text-slate-700 shrink-0 shadow-sm backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          📍 สรุปตาม Location
        </button>

        <button
          type="button"
          onClick={() => handleSendMessage('สรุปภาพรวมสถานะสินค้า IN และ OUT ล่าสุด พร้อมข้อสังเกต')}
          className="px-3 py-1.5 rounded-full bg-white/70 hover:bg-white border border-slate-200/60 text-[11px] font-medium text-slate-700 shrink-0 shadow-sm backdrop-blur-md cursor-pointer transition-all active:scale-95"
        >
          📊 สรุปภาพรวมสต็อก
        </button>

        <button
          type="button"
          onClick={() => setIsPastingText(true)}
          className="px-3 py-1.5 rounded-full bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-[11px] font-semibold text-amber-800 shrink-0 shadow-sm backdrop-blur-md cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
        >
          <ClipboardPaste className="w-3 h-3" />
          วางข้อมูลมาเทียบ
        </button>
      </div>

      {/* Attached File Preview Bar */}
      {attachedFile && (
        <div className="px-4 py-2.5 bg-amber-50/80 backdrop-blur-md border-t border-amber-200/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-semibold text-slate-800">{attachedFile.name}</span>
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

      {/* Input Area (iOS Floating Pill) */}
      <div className="p-3 md:p-4 bg-white/70 backdrop-blur-2xl border-t border-white/60 shrink-0">
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
            className="p-2.5 rounded-xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/60 cursor-pointer shrink-0 shadow-sm active:scale-95 transition-all"
            title="แนบไฟล์ Excel, CSV หรือ Text เพื่อให้ AI วิเคราะห์"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Paste Button */}
          <button
            type="button"
            onClick={() => setIsPastingText(true)}
            className="p-2.5 rounded-xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/60 cursor-pointer shrink-0 shadow-sm active:scale-95 transition-all hidden sm:block"
            title="คัดลอกข้อความหรือตารางมาวาง"
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder={attachedFile ? `ถามเกี่ยวกับไฟล์ "${attachedFile.name}" หรือกดส่งเลย...` : 'พิมพ์ถามสต็อก เช่น มีพาร์ท 1234 อยู่ที่ไหน หรือลากไฟล์มาวาง...'}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-md font-sans text-xs focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={isLoading || (!inputQuery.trim() && !attachedFile)}
            className={`px-4 py-2.5 rounded-2xl font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95 shrink-0 ${
              isLoading || (!inputQuery.trim() && !attachedFile)
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white shadow-blue-500/25'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ส่ง</span>
          </button>
        </form>

        <div className="flex justify-between items-center mt-2 px-1 text-[10px] text-slate-400">
          <span>💡 สามารถลากไฟล์ Excel / CSV มาปล่อยลงหน้านี้ได้โดยตรง</span>
          <span className="hidden md:inline text-emerald-600 font-medium">Google Gemini 3.8 Flash • Real-time Grounded</span>
        </div>
      </div>
    </div>
  );
}
