export function RailMark({ compact = false }: { readonly compact?: boolean }) {
  return (
    <span className="rail-mark" aria-hidden="true" data-compact={compact}>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
