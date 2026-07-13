// Ambient type declarations for optional / peer dependencies that are imported
// by code paths guarded at runtime. Declaring them here lets `tsc --noEmit`
// succeed without forcing the packages into package.json.

declare module "@google/genai" {
  export class GoogleGenAI {
    constructor(opts: { apiKey: string });
    models: {
      generateContent(opts: any): Promise<{ text: string }>;
    };
  }
}

// Vite raw-text import for self-contained HTML templates (e.g. the embedded SOW form).
declare module "*.html?raw" {
  const content: string;
  export default content;
}
