import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/** Copy PDF.js worker to dist at a fixed path so production can load it (avoids dynamic import 404). */
function copyPdfWorkerPlugin() {
  return {
    name: "copy-pdf-worker",
    apply: "build",
    closeBundle() {
      let workerSrc: string;
      try {
        const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
        workerSrc = path.join(pdfjsRoot, "build", "pdf.worker.min.mjs");
      } catch {
        workerSrc = path.resolve(__dirname, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
      }
      const outDir = path.resolve(__dirname, "dist");
      const workerDest = path.join(outDir, "pdf.worker.mjs");
      if (fs.existsSync(workerSrc)) {
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(workerSrc, workerDest);
        console.log("[vite] Copied pdf.worker.mjs to dist for production.");
      } else {
        console.warn("[vite] pdf.worker.min.mjs not found at", workerSrc, "- PDF import may fail in production.");
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), copyPdfWorkerPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      PolicyMap: path.resolve(__dirname, "../../PolicyMap.json"),
    },
  },
  optimizeDeps: {
    include: ["mammoth", "pdfjs-dist"],
  },
});
