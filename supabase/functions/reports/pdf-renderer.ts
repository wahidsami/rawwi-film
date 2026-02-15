/**
 * PDF Renderer Service
 * 
 * Renders HTML template to PDF using Puppeteer (Deno-compatible headless browser)
 */

import puppeteer from "https://deno.land/x/puppeteer@16.2.0/mod.ts";

export interface TemplateData {
  // Cover page
  scriptTitle: string;
  clientName: string;
  formattedDate: string;
  
  // Stats
  stats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  
  // Labels (i18n)
  labels: {
    reportTitle: string;
    client: string;
    date: string;
    executiveSummary: string;
    critical: string;
    high: string;
    medium: string;
    low: string;
    findingsDetails: string;
    issues: string;
    confidence: string;
    source: string;
    lines: string;
    status: string;
  };
  
  // Layout
  lang: 'en' | 'ar';
  dir: 'ltr' | 'rtl';
  
  // Dynamic content
  findingsHtml: string; // Pre-rendered findings cards HTML
}

/**
 * Renders a PDF from an HTML template with data injection
 * 
 * @param templatePath - Absolute path to the HTML template file
 * @param data - Template data to inject
 * @returns PDF as Uint8Array
 */
export async function renderPdfFromTemplate(
  templatePath: string,
  data: TemplateData
): Promise<Uint8Array> {
  // 1. Read template
  const template = await Deno.readTextFile(templatePath);
  
  // 2. Replace simple placeholders ({{key}})
  let html = template;
  
  // Replace flat properties
  const flatReplacements: Record<string, string> = {
    lang: data.lang,
    dir: data.dir,
    scriptTitle: data.scriptTitle,
    clientName: data.clientName,
    formattedDate: data.formattedDate,
    generationTimestamp: new Date().toLocaleString(),
  };
  
  Object.entries(flatReplacements).forEach(([key, val]) => {
    html = html.split(`{{${key}}}`).join(val);
  });
  
  // Replace nested objects (stats.critical, labels.reportTitle, etc.)
  // Stats
  Object.entries(data.stats).forEach(([key, val]) => {
    html = html.split(`{{stats.${key}}}`).join(String(val));
  });
  
  // Labels
  Object.entries(data.labels).forEach(([key, val]) => {
    html = html.split(`{{labels.${key}}}`).join(val);
  });
  
  // Replace dynamic HTML blocks
  // The template should have {{#each groupedFindings}}...{{/each}}
  // We'll replace this entire block with our pre-rendered HTML
  const loopRegex = /{{#each groupedFindings}}[\s\S]*?{{\/each}}/m;
  html = html.replace(loopRegex, data.findingsHtml);
  
  // 3. Launch browser and render PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set content and wait for network to be idle (fonts, etc.)
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // Generate PDF with A4 format and background graphics
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });
    
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
