// src/components/InlineLoader.tsx

export default function InlineLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="cfm-inline-loader">
      <div className="cfm-inline-loader-ring" />
      <div className="cfm-inline-loader-text">{label}</div>
    </div>
  );
}