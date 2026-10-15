import type { ReactNode } from "react";

const shapes = {
  branch: (
    <>
      <circle cx="6" cy="4.5" r="2" />
      <circle cx="6" cy="19.5" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M6 6.5v11M6 12c0-4 12-1 12-5" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.7" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 10A8.5 8.5 0 1 0 21 14" />
      <path d="m20.5 4 .2 6-6-.3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 9 9m-4-4-3 3m5-1-3 3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9a2.5 2.5 0 0 1 5 1c0 1.8-2.6 2.1-2.6 4m0 3v.1" />
    </>
  ),
  eye: (
    <>
      <path d="M2.2 12s3.6-5.5 9.8-5.5 9.8 5.5 9.8 5.5-3.6 5.5-9.8 5.5S2.2 12 2.2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M9.9 6.8a13 13 0 0 1 2.1-.3c6.2 0 9.8 5.5 9.8 5.5a14 14 0 0 1-3.5 3.6M6.3 7.5A15 15 0 0 0 2.2 12s3.6 5.5 9.8 5.5c1 0 1.9-.1 2.8-.4" />
      <path d="m3 3 18 18" />
    </>
  ),
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  moon: <path d="M20.6 15.4A8.7 8.7 0 0 1 8.6 3.4 8.8 8.8 0 1 0 20.6 15.4Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  pointer: <path d="M5 2.5 19 12l-6.5 1-3 7L5 2.5Z" />,
  graph: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="m10.8 6.3-4.7 9.8M13.2 6.3l4.7 9.8M7 18h10" />
    </>
  ),
  fit: (
    <path d="M9 4H5a1 1 0 0 0-1 1v4m11-5h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m11-5v4a1 1 0 0 1-1 1h-4" />
  ),
  map: <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16" />,
  more: (
    <>
      <circle cx="5" cy="12" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="m5 5 14 14M19 5 5 19" />
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof shapes;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}
