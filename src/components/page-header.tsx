import { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons/dialogs shown to the right on desktop, wrapped below the title on mobile. */
  actions?: ReactNode;
  /** Filter rows rendered under the title row inside the header band. */
  children?: ReactNode;
}

export function PageHeader({ title, description, actions, children }: PageHeaderProps) {
  return (
    // The rule continues the one under the topbar and the sidebar brand row, so
    // the header band reads as its own stripe rather than floating on the page.
    <div className="border-b bg-background">
      <div className="px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
            {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}
