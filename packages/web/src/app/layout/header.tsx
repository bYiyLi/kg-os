import { PRODUCT_NAME } from "@kgos/sdk";

export function AppBrand() {
  return (
    <header className="sidebar-brand">
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true" fill="none">
        <path
          d="M24 3.5 44.5 24 24 44.5 3.5 24 24 3.5Z"
          stroke="currentColor"
          strokeWidth="4.4"
          strokeLinejoin="round"
        />
        <path d="m24 14-7 10 7 10 7-10-7-10Z" fill="currentColor" opacity=".95" />
        <circle cx="24" cy="24" r="2.7" fill="var(--color-sidebar)" />
      </svg>
      <h1>{PRODUCT_NAME}</h1>
    </header>
  );
}
