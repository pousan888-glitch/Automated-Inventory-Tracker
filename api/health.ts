export default function handler(_req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ 
    status: 'ok', 
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) 
  });
}
