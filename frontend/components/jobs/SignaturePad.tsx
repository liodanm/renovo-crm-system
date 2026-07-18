'use client';

import { useRef, useState } from 'react';

interface SignaturePadProps {
  onCapture: (dataUrl: string) => void;
}

export function SignaturePad({ onCapture }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    lastPoint.current = getPoint(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const point = getPoint(e);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    setHasSignature(true);
  }

  function end() {
    drawing.current = false;
    if (hasSignature) {
      onCapture(canvasRef.current!.toDataURL('image/png'));
    }
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onCapture('');
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={500}
        height={200}
        // touch-none is essential on mobile — without it, the browser
        // intercepts the touch as a page-scroll gesture instead of
        // handing pointer events to the canvas.
        className="w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">Sign above</p>
        <button type="button" onClick={clear} className="text-xs font-medium text-slate-500 underline hover:text-slate-800">
          Clear
        </button>
      </div>
    </div>
  );
}
