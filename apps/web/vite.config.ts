import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Emit pdf.js worker as .js so every CDN/nginx maps application/javascript (some stacks
        // still serve .mjs as octet-stream). New hash busts browsers that cached a bad immutable response.
        assetFileNames(info) {
          const names = "names" in info && Array.isArray((info as { names?: string[] }).names)
            ? ((info as { names: string[] }).names ?? [])
            : [];
          const name = "name" in info ? String((info as { name?: string }).name ?? "") : "";
          const blob = [...names, name].join(" ");
          if (/pdf\.worker/i.test(blob)) {
            return "assets/pdf.worker-[hash].js";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
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
