// Vite raw-text import for self-contained HTML templates (e.g. the embedded SOW form).
declare module "*.html?raw" {
  const content: string;
  export default content;
}

/** Application release version injected by Vite from package.json. */
declare const __APP_VERSION__: string;
