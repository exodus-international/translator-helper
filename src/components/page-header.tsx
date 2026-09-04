import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  /** Buttons/dialogs shown to the right on desktop, wrapped below the title on mobile. */
  actions?: ReactNode;
  /** Filter rows rendered under the title row inside the header band. */
  children?: ReactNode;
}

export function PageHeader({ title, description, back, actions, children }: PageHeaderProps) {
  return (
    <div className="border-b bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {back && (
              <Link
                href={back.href}
                className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {back.label}
              </Link>
            )}
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
