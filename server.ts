import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('ไม่พบค่าตัวแปรสภาพแวดล้อม GEMINI_API_KEY บนเซิร์ฟเวอร์ กรุณาตรวจสอบการตั้งค่า Secrets');
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // AI Chat endpoint with Live Inventory & Attached Files
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { 
        message, 
        history = [], 
        inventorySummary, 
        inventoryItems = [], 
        attachedFile,
        model = 'gemini-3.5-flash',
        rolePersona = 'general_assistant'
      } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: 'GEMINI_API_KEY is not configured on the server. Please verify settings.' 
        });
      }

      if (!message && !attachedFile) {
        return res.status(400).json({ error: 'Message or attached file is required.' });
      }

      // Format inventory sample & stats to ground the answer in actual data
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

      // Persona configuration
      let personaTitle = 'ผู้ช่วยอัจฉริยะจัดการคลังสินค้าและอะไหล่ (General Inventory Assistant)';
      let personaFocus = 'ครอบคลุมรอบด้าน ทั้งยอดสต็อกคงเหลือ พิกัดจัดเก็บ และความพร้อมใช้งาน';
      if (rolePersona === 'warehouse_manager') {
        personaTitle = 'ผู้ช่วยผู้จัดการคลังสินค้า (Warehouse Operations Specialist)';
        personaFocus = 'เน้นการปฏิบัติการจริงในพื้นที่คลัง (Yard, Base, Workshop), ตรวจสอบพิกัดการจัดเก็บ (Current Location), ความเร็วในการกระจายสินค้า และความถูกต้องของการทำ Check IN / Check OUT';
      } else if (rolePersona === 'procurement_analyst') {
        personaTitle = 'นักวิเคราะห์สต็อกและวางแผนจัดซื้อ (Procurement & Demand Analyst)';
        personaFocus = 'เน้นการวิเคราะห์สต็อกสินค้าคงเหลือน้อย (Safety Stock ≤ 2 หน่วย), ประเมินความเสี่ยงของขาดมือ (Stock-out Risk), อะไหล่สำรองสำคัญ และให้คำแนะนำการเปิด PR/PO จัดซื้อล่วงหน้า';
      } else if (rolePersona === 'customs_compliance') {
        personaTitle = 'ผู้เชี่ยวชาญศุลกากรและเอกสารนำเข้า-ส่งออก (Customs & Free Zone Compliance Specialist)';
        personaFocus = 'เน้นการตรวจสอบสิทธิประโยชน์ภาษีในเขต Free Zone, ใบขนสินค้าขาเข้า/ขาออก, เลขที่ Invoice, Customs Status (Duty Paid/Bonded), และความถูกต้องของเอกสารควบคุมสินค้า';
      }

      const systemInstruction = `You are "LogiTrack AI - ${personaTitle}".
You are integrated directly into the LogiTrack warehouse inventory system.
Focus area: ${personaFocus}

Your duties:
1. Answer queries accurately based on the LIVE INVENTORY DATA and INVENTORY SYSTEM SUMMARY provided.
2. If the user asks about stock balance, specific Part Numbers, Serial Numbers, Locations (In-Base, Rig, Yard, Export), Customs status, or low stock, give factual details from the context.
3. If an ATTACHED FILE or pasted invoice/list is provided:
   - Analyze and cross-reference every part or serial number with the live inventory.
   - Clearly identify: (a) Items already in stock (with available qty and current location), (b) Items not found / missing in inventory, (c) Any discrepancies.
   - Suggest appropriate stock action (e.g. Check IN / Check OUT).
4. Provide structured, clean responses with markdown headings, tables, bullet points, or bold key numbers.
5. Provide actionable insights (ข้อสังเกตและข้อเสนอแนะ) tailored to your persona role.
6. Answer in Thai by default (or the language the user asked in), maintaining a helpful, polite, professional, and technically proficient tone.`;

      // Build conversation contents
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      // Include previous turns if available
      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-8)) {
          if (h.content) {
            contents.push({
              role: h.role === 'model' ? 'model' : 'user',
              parts: [{ text: h.content }],
            });
          }
        }
      }

      // Current prompt with inventory grounding
      const userPrompt = `${attachedFileContext ? attachedFileContext + '\n\n' : ''}${inventoryContextText}\n\n[USER QUERY]: ${message || 'ช่วยวิเคราะห์และสรุปข้อมูลตามไฟล์หรือข้อมูลที่แนบมานี้เทียบกับสต็อกสินค้า'}`;

      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }],
      });

      const genAI = getGenAI();
      const requestedModel = typeof model === 'string' && model.trim() ? model.trim() : 'gemini-3.5-flash';
      const allAllowedModels = [
        requestedModel,
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.1-pro-preview',
      ];
      const CANDIDATE_MODELS = Array.from(new Set(allAllowedModels));

      let responseText = '';
      let successfulModel = '';
      let lastError: any = null;

      for (const modelName of CANDIDATE_MODELS) {
        try {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              temperature: 0.2,
            },
          });
          if (response && response.text) {
            responseText = response.text;
            successfulModel = modelName;
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`[AI Chat] Model ${modelName} encountered an issue: ${err?.message || err}. Trying next fallback candidate...`);
        }
      }

      if (!responseText && lastError) {
        throw lastError;
      }

      res.json({
        success: true,
        reply: responseText || 'ขออภัย ไม่สามารถประมวลผลคำตอบได้ กรุณาลองใหม่อีกครั้ง',
        modelUsed: successfulModel || requestedModel,
        persona: rolePersona,
      });
    } catch (error: any) {
      console.error('Error generating AI response:', error);
      res.status(500).json({
        error: error?.message || 'เกิดข้อผิดพลาดในการประมวลผลคำตอบจาก AI',
      });
    }
  });

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
