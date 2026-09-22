'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * C1-T10 — Kanvas tanda tangan web (mouse/sentuh).
 * Raster PNG via canvas.toDataURL (web murni — tanpa dep native, beda dengan
 * mobile yang butuh jalur raster khusus). Guard 50KB di sisi klien + server.
 */
interface SignaturePadProps {
  onChange: (pngBase64: string | null) => void;
  height?: number;
}

export function SignaturePad({ onChange, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  const pos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) {
      onChange(null);
      return;
    }
    const url = canvas.toDataURL('image/png');
    onChange(url.split(',')[1] ?? null);
  }, [onChange]);

  // Skala DPR agar coretan tajam di HP (360px) maupun desktop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const w = canvas.clientWidth || 300;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a1a';
    }
  }, [height]);

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white touch-none cursor-crosshair"
        onPointerDown={(e) => {
          drawing.current = true;
          hasInk.current = true;
          setEmpty(false);
          const ctx = canvasRef.current?.getContext('2d');
          const p = pos(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x / (window.devicePixelRatio || 1), p.y / (window.devicePixelRatio || 1));
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current?.getContext('2d');
          const p = pos(e);
          const dpr = window.devicePixelRatio || 1;
          ctx?.lineTo(p.x / dpr, p.y / dpr);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          emit();
        }}
        onPointerLeave={() => {
          if (drawing.current) {
            drawing.current = false;
            emit();
          }
        }}
        aria-label="Kanvas tanda tangan"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-bold rounded-lg"
          onClick={() => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) {
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.restore();
            }
            hasInk.current = false;
            setEmpty(true);
            onChange(null);
          }}>
          Hapus
        </Button>
      </div>
      {empty ? <p className="text-xs text-slate-400">Coret tanda tangan di atas (mouse/jari).</p> : null}
    </div>
  );
}
