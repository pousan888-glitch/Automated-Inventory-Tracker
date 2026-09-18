import { GoogleGenAI, ThinkingLevel } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('ไม่พบตัวแปรสภาพแวดล้อม GEMINI_API_KEY บนเซิร์ฟเวอร์ กรุณาตรวจสอบการตั้งค่า Environment Variables ใน Vercel หรือระบบคลาวด์');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Only POST is accepted.' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_e) {
        // use raw body
      }
    }

    const { message, history = [], inventorySummary, inventoryItems = [], attachedFile } = body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Environment Variables ของเซิร์ฟเวอร์ (กรุณาเพิ่มใน Vercel Settings > Environment Variables)' 
      });
    }

    if (!message && !attachedFile) {
      return res.status(400).json({ error: 'Message or attached file is required.' });
    }

    // Format inventory summary and compact item records to ground AI
    let inventoryContextText = '';
    if (inventorySummary) {
      inventoryContextText += `\n[INVENTORY SYSTEM SUMMARY]\n`;
      inventoryContextText += `- Total Items in DB: ${inventorySummary.totalItems || 0}\n`;
      inventoryContextText += `- Items Currently IN (In-Base/Yard): ${inventorySummary.inCount || 0}\n`;
      inventoryContextText += `- Items Currently OUT (Dispatched/Exported): ${inventorySummary.outCount || 0}\n`;
      inventoryContextText += `- Total Quantity in Stock: ${inventorySummary.totalQty || 0}\n`;
      if (inventorySummary.locations && inventorySummary.locations.length > 0) {
        inventoryContextText += `- Key Locations: ${inventorySummary.locations.join(', ')}\n`;
      }
      if (inventorySummary.lowStockCount !== undefined) {
        inventoryContextText += `- Items with Low Stock (<= 2 qty): ${inventorySummary.lowStockCount}\n`;
      }
    }

    if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
      inventoryContextText += `\n[LIVE INVENTORY DATA (${inventoryItems.length} items)]:\n`;
      const itemsFormatted = inventoryItems.slice(0, 300).map((item: any, idx: number) => {
        return `${idx + 1}. PartNo: ${item.partNo || 'N/A'} | SN: ${item.serialNo || 'N/A'} | Desc: ${item.description || 'N/A'} | Qty: ${item.qty !== undefined ? item.qty : 1} ${item.uom || 'EA'} | Status: ${item.status || 'IN'} | Location: ${item.currentLocation || 'In-Base'} | Dept/Segment: ${item.segment || '-'} | Customs: ${item.customsStatus || '-'}`;
      }).join('\n');
      inventoryContextText += itemsFormatted;
      if (inventoryItems.length > 300) {
        inventoryContextText += `\n... [and ${inventoryItems.length - 300} more items in full database]`;
      }
    } else {
      inventoryContextText += `\n[LIVE INVENTORY DATA]: Currently no items recorded or inventory is empty.`;
    }

    let attachedFileContext = '';
    if (attachedFile && attachedFile.content) {
      attachedFileContext = `\n[ATTACHED FILE CONTENT / UPLOADED DATA]:\nFile Name: ${attachedFile.name || 'unnamed'}\nType: ${attachedFile.type || 'text'}\n---\n${attachedFile.content.slice(0, 15000)}\n---`;
    }

    const systemInstruction = `You are "LogiTrack AI Inventory Assistant" (ผู้ช่วยอัจฉริยะจัดการคลังสินค้าและอะไหล่).
You are integrated directly into the LogiTrack warehouse inventory system.
Your job is to:
1. Answer queries accurately based on the LIVE INVENTORY DATA and INVENTORY SYSTEM SUMMARY provided.
2. If the user asks about stock balance, specific Part Numbers, Serial Numbers, Locations (In-Base, Rig, Yard, Export), Customs status, or low stock, give factual details from the context.
3. If an ATTACHED FILE or pasted invoice/list is provided:
   - Analyze and cross-reference every part or serial number with the live inventory.
   - Clearly identify: (a) Items already in stock (with available qty and current location), (b) Items not found / missing in inventory, (c) Any discrepancies.
   - Suggest appropriate stock action (e.g. Check IN / Check OUT).
4. Provide structured, clean responses with markdown headings, tables, bullet points, or bold key numbers.
5. Answer in Thai by default (or the language the user asked in), maintaining a helpful, polite, professional, and technically proficient tone.`;

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-6)) {
        if (h.content) {
          contents.push({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.content }],
          });
        }
      }
    }

    const userPrompt = `${attachedFileContext ? attachedFileContext + '\n\n' : ''}${inventoryContextText}\n\n[USER QUERY]: ${message || 'ช่วยวิเคราะห์และสรุปข้อมูลตามไฟล์หรือข้อมูลที่แนบมานี้เทียบกับสต็อกสินค้า'}`;

    contents.push({
      role: 'user',
      parts: [{ text: userPrompt }],
    });

    const genAI = getGenAI();
    const response = await genAI.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    res.status(200).json({
      success: true,
      reply: response.text || 'ไม่มีข้อมูลตอบกลับจากระบบ',
    });
  } catch (error: any) {
    console.error('Error in Vercel serverless AI chat:', error);
    res.status(500).json({
      error: error?.message || 'เกิดข้อผิดพลาดในการประมวลผลคำตอบจาก AI',
    });
  }
}
