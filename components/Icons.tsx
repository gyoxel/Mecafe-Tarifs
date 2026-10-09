import { fold } from "@/lib/format";

type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** Œil : la barre oblique se « dessine » quand `off` est vrai. */
export function EyeIcon({ off = false, size = 20, className }: IconProps & { off?: boolean }) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path className="eye-slash" d="M4 4l16 16" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: off ? 0 : 1 }} />
    </svg>
  );
}

export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function GridIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
    </svg>
  );
}

export function ListIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  );
}

export function ChevronIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function PinIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function TagIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 12.6V4.5A1.5 1.5 0 0 1 4.5 3h8.1a1.5 1.5 0 0 1 1.06.44l6.9 6.9a1.5 1.5 0 0 1 0 2.12l-8.1 8.1a1.5 1.5 0 0 1-2.12 0l-6.9-6.9A1.5 1.5 0 0 1 3 12.6Z" />
      <circle cx="8" cy="8" r="1.4" />
    </svg>
  );
}

export function LogoutIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

export function LockIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="5" y="11" width="14" height="9" rx="2.2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/* ── Icônes de catégories ─────────────────────────────────────────── */
const CATEGORY_PATHS: [RegExp, React.ReactNode][] = [
  [
    /capsule/,
    <>
      <path d="M7 9h10l-1.6 9.2a2 2 0 0 1-2 1.8h-2.8a2 2 0 0 1-2-1.8Z" />
      <path d="M5.5 9h13M9 6h6" />
    </>,
  ],
  [
    /dosette/,
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="4" />
    </>,
  ],
  [
    /sirop/,
    <>
      <path d="M10 3h4v3.5l1.6 2.2a3 3 0 0 1 .6 1.8V19a2 2 0 0 1-2 2H9.8a2 2 0 0 1-2-2v-8.5a3 3 0 0 1 .6-1.8L10 6.5Z" />
      <path d="M7.8 13h8.4" />
    </>,
  ],
  [
    /sauce/,
    <>
      <path d="M9 7h6l1 3v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9Z" />
      <path d="M11 7V4.5a1 1 0 0 1 2 0V7M12 13.5c-1 1.2-1.4 2-1.4 2.6a1.4 1.4 0 0 0 2.8 0c0-.6-.4-1.4-1.4-2.6Z" />
    </>,
  ],
  [
    /chocolat|boisson/,
    <>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-.6.9.6 1.6 0 2.5M12.5 3.5c-.6.9.6 1.6 0 2.5" />
    </>,
  ],
  [
    /machine/,
    <>
      <rect x="5" y="3" width="14" height="5" rx="1.5" />
      <path d="M6 8v12h12V8M9 11h6l-.6 3.5h-4.8ZM9 20h6M12 14.5v1.5" />
    </>,
  ],
  [
    /accessoire/,
    <>
      <path d="M6.5 17.5 14 10M14 10a3.5 3.5 0 1 0 2.5-6 3.5 3.5 0 0 0-2.5 6Z" />
      <path d="M4.5 19.5l2-2" />
    </>,
  ],
  [
    /cafe/,
    <>
      <ellipse cx="12" cy="12" rx="5.5" ry="8" transform="rotate(35 12 12)" />
      <path d="M8.6 16.6c2.4-1.6 1.6-4.4 3.4-6.2s3.5-1.6 3.5-1.6" />
    </>,
  ],
];

export function CategoryIcon({ category, size = 18, className }: IconProps & { category: string }) {
  const key = fold(category);
  const paths = CATEGORY_PATHS.find(([re]) => re.test(key))?.[1];
  if (!paths) return <GridIcon size={size} className={className} />;
  return (
    <svg {...base(size)} className={className}>
      {paths}
    </svg>
  );
}
