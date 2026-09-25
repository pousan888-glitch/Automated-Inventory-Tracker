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
      const { message, history = [], inventorySummary, inventoryItems = [], attachedFile } = req.body;

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

      // Build conversation contents
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      // Include previous turns if available
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

      // Current prompt with inventory grounding
      const userPrompt = `${attachedFileContext ? attachedFileContext + '\n\n' : ''}${inventoryContextText}\n\n[USER QUERY]: ${message || 'ช่วยวิเคราะห์และสรุปข้อมูลตามไฟล์หรือข้อมูลที่แนบมานี้เทียบกับสต็อกสินค้า'}`;

      contents.push({
        role: 'user',
        parts: [{ text: userPrompt }],
      });

      const genAI = getGenAI();
      const CANDIDATE_MODELS = [
        'gemini-3.5-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
      ];

      let responseText = '';
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
