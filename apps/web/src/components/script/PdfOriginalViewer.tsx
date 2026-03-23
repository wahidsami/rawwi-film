import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';
import { ensurePdfjsWorker } from '@/utils/pdfjsWorker';

type Props = {
  signedUrl: string;
  pageNumber: number;
  scale?: number;
  className?: string;
};

/**
 * Renders one page of the original PDF (visual fidelity vs extracted HTML).
 */
export function PdfOriginalViewer({ signedUrl, pageNumber, scale = 1.2, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        await ensurePdfjsWorker();
        const pdf = await pdfjsLib.getDocument({ url: signedUrl, withCredentials: false }).promise;
        const num = Math.min(Math.max(1, pageNumber), pdf.numPages);
        const page = await pdf.getPage(num);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setErr('Canvas unsupported');
          return;
        }
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'PDF load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedUrl, pageNumber, scale]);

  return (
    <div className={className}>
      {loading && (
        <div className="flex items-center justify-center py-16 text-text-muted gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      {err && <p className="text-sm text-error py-4 text-center">{err}</p>}
      <canvas ref={canvasRef} className="mx-auto shadow-lg border border-border bg-white" style={{ display: loading || err ? 'none' : 'block' }} />
    </div>
  );
}
