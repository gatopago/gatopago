import type { HTMLAttributes, ReactNode } from 'react';

export default function Screen({
  children,
  withPrimaryNav = false,
  className = '',
  ...props
}: {
  children: ReactNode;

  withPrimaryNav?: boolean;
  className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  return (
    <>
      {/* Outside the frame: its entrance animation would move a fixed element with it. */}
      <div className="status-bar-veil" aria-hidden="true" />
      <main
        id="main-content"
        {...props}
        className={`app-frame relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-(--frame-x) pt-[calc(env(safe-area-inset-top)_+_var(--frame-top))] ${withPrimaryNav ? 'pb-[calc(env(safe-area-inset-bottom)_+_6.5rem)]' : 'pb-[calc(env(safe-area-inset-bottom)_+_2rem)]'} animate-fade-up${className ? ` ${className}` : ''}`}
      >
        {children}
      </main>
    </>
  );
}
