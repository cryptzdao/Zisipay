import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRDisplayProps {
  value: string;
  size?: number;
}

/**
 * Renders a crisp QR code for the given string value.
 * Uses qrcode (pure-JS) to draw onto a <canvas> element.
 * The outer wrapper clips to a rounded square with a white background
 * so it displays correctly on any surface.
 */
export function QRDisplay({ value, size = 176 }: QRDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;

    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      color: {
        dark:  '#0d1f3c',  // Zisipay navy — dark modules
        light: '#ffffff',  // white background
      },
      errorCorrectionLevel: 'M',
    }, (err) => {
      if (err) console.error('[QRDisplay] render error:', err);
    });
  }, [value, size]);

  if (!value) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 16,
          background: 'var(--surface-muted)',
          border: '2px dashed var(--border-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        No address
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#ffffff',
        boxShadow: '0 4px 24px rgba(13,31,60,0.12)',
        border: '2px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: size, height: size }} />
    </div>
  );
}
