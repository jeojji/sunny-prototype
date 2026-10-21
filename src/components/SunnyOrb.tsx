import { useId } from 'react';
import type { OrbMode } from '../conversation/useSunny';

interface Props {
  mode?: OrbMode;
  size?: number;
  /** Decorative by default; pass a label when the orb conveys status on its own. */
  label?: string;
}

/** Sunny's identity: an abstract warm orb. Breathes when idle, orbits when thinking, glows when speaking. */
export function SunnyOrb({ mode = 'idle', size = 40, label }: Props) {
  const id = useId().replace(/:/g, '');
  return (
    <span
      className="orb"
      data-mode={mode}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <radialGradient id={`core-${id}`} cx="38%" cy="34%" r="72%">
            <stop offset="0" stopColor="#FFD3A1" />
            <stop offset="0.45" stopColor="#F98A35" />
            <stop offset="1" stopColor="#D4560E" />
          </radialGradient>
          <radialGradient id={`halo-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0.55" stopColor="#F98A35" stopOpacity="0.35" />
            <stop offset="1" stopColor="#F98A35" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="orb-halo" cx="50" cy="50" r="50" fill={`url(#halo-${id})`} />
        <circle className="orb-core" cx="50" cy="50" r="30" fill={`url(#core-${id})`} />
        <circle className="orb-ring" cx="50" cy="50" r="40" fill="none" stroke="#F98A35" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42 210" />
        <ellipse cx="41" cy="38" rx="9" ry="5.5" fill="#fff" opacity="0.35" transform="rotate(-25 41 38)" />
      </svg>
    </span>
  );
}
