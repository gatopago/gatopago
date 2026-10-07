'use client';

import { useState } from 'react';

/** A code sample with its language and a copy button. */
export function CodeBlock({
  code,
  label,
  english: en,
}: {
  code: string;
  label: string;
  english: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="my-5 overflow-hidden border-2 border-text bg-[#0b0b0f] text-[#fff8f0] shadow-[5px_5px_0_var(--color-cat-700)]">
      <figcaption className="flex items-center justify-between border-b border-[rgb(255_248_240/.14)] py-1 pr-1 pl-4 font-mono text-[12px] text-[rgb(255_248_240/.7)]">
        {label}
        <button
          type="button"
          className="min-h-9 px-3 font-sans text-[12px] font-semibold text-[#fff8f0] hover:text-cat-500"
          onClick={() =>
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? (en ? 'Copied ✓' : 'Copiado ✓') : en ? 'Copy' : 'Copiar'}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
