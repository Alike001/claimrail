"use client";

import { useState } from "react";

export function CopyButton({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <button type="button" onClick={() => void copy()} aria-live="polite">
      {copied ? "copied" : "copy"}
    </button>
  );
}
