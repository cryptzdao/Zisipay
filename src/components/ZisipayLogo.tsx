import React from 'react';

/**
 * Zisipay logo — pixel-faithful SVG recreation from the reference image.
 *
 * The mark is a bold Z letterform split diagonally into two arrow-shapes:
 *  • Top half  — cyan  (#28B4C8), left-pointing  arrow (← top bar of Z)
 *  • Bottom half — navy (#1A3E8C), right-pointing arrow (→ bottom bar of Z)
 *
 * A thin white diagonal gap separates the two halves.
 * The inner Z negative space (white) is cut out via SVG even-odd fill.
 *
 * ViewBox: 0 0 100 100 — all coordinates in that space.
 * The optional "icon" variant wraps the mark in a white rounded-rect
 * (matching the App Store icon style in the reference image).
 */

interface ZisipayLogoProps {
  size?: number;
  variant?: 'default' | 'icon' | 'reversed';
  className?: string;
}

export function ZisipayLogo({ size = 32, variant = 'default', className }: ZisipayLogoProps) {
  const showBg = variant === 'icon';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Zisipay logo"
    >
      {/* Rounded white background — icon variant only */}
      {showBg && (
        <rect x="0" y="0" width="100" height="100" rx="22" ry="22" fill="#ffffff" />
      )}

      {/*
        ── CYAN TOP HALF ──────────────────────────────────────────────
        Shape: top bar of Z (left-to-right, y≈8–26) PLUS
               left-pointing arrowhead protruding from the left end
               MINUS inner white Z cutout (even-odd fill rule).

        Outer boundary — clockwise:
          Start at top-right corner of bar → across top → arrowhead tip
          → back along bottom of arrowhead → diagonal slash down-right
          → close.

        Inner Z cutout (counter-clockwise hole via even-odd):
          The white triangular notch inside the Z.
      */}
      <path
        fillRule="evenodd"
        fill="#28B4C8"
        d={`
          M 88,8
          L 88,26
          L 36,26
          L 62,48
          L 55,48
          L 27,26
          L 14,26
          L 5,17
          L 14,8
          Z

          M 42,26
          L 55,26
          L 62,32
          L 49,32
          Z
        `}
      />

      {/*
        ── NAVY BOTTOM HALF ───────────────────────────────────────────
        Shape: diagonal slash continuing from gap + bottom bar of Z
               PLUS right-pointing arrowhead from the right end
               MINUS inner white Z cutout.

        Outer boundary — clockwise:
          Start where diagonal re-enters after gap → across bottom bar
          → arrowhead tip → back → close.
      */}
      <path
        fillRule="evenodd"
        fill="#1A3E8C"
        d={`
          M 38,52
          L 45,52
          L 73,74
          L 86,74
          L 95,83
          L 86,92
          L 12,92
          L 12,74
          L 51,74
          Z

          M 48,68
          L 61,68
          L 73,74
          L 60,74
          Z
        `}
      />
    </svg>
  );
}

/** Wordmark: icon + "Zisi" + bold "pay" in cyan */
export function ZisipayWordmark({ size = 32 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ZisipayLogo size={size} variant="icon" />
      <span style={{
        fontWeight: 700,
        fontSize: size * 0.72,
        letterSpacing: '-0.02em',
        color: '#0d1f3c',
        lineHeight: 1,
      }}>
        Zisi<span style={{ color: '#28B4C8' }}>pay</span>
      </span>
    </span>
  );
}
