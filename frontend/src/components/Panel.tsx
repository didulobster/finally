/** Titled region of the terminal grid. */
import type { ReactNode } from "react";

interface Props {
  title: string;
  aside?: ReactNode;
  className?: string;
  testId?: string;
  children: ReactNode;
}

export function Panel({ title, aside, className = "", testId, children, ...data }: Props & Record<`data-${string}`, string | undefined>) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col bg-panel ${className}`} aria-label={title} data-testid={testId} {...data}>
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="font-semibold text-muted">{title}</h2>
        {aside}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
