// @google/genai is an optional peer dependency used only by the AIThinkingModal
// feature. It's intentionally NOT declared in package.json because the AI flow is
// experimental and gated by a missing-API-KEY guard below. We declare a minimal
// ambient module here so TypeScript can resolve the import without a node_modules
// entry; if the package is installed, its real types take precedence.
// @ts-ignore — optional runtime dependency
import { GoogleGenAI } from "@google/genai";

const API_KEY = (process.env.API_KEY || '').trim();

export const generateThinkingResponse = async (prompt: string, context?: string) => {
  if (!API_KEY) {
    throw new Error("Gemini API Key is not configured. Please check your environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const fullPrompt = context 
    ? `Context for current opportunity:\n${context}\n\nUser query: ${prompt}` 
    : prompt;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: fullPrompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 }
      },
    });

    return response.text;
  } catch (error: any) {
    console.error("Gemini AI Error:", error);
    throw new Error(error.message || "Failed to generate AI response.");
  }
};
