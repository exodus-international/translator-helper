import { getDocumentTypeConfig } from '@/constants/document-type';
import { cn } from '@/lib/utils';
import { DocumentType } from '@prisma/client';

/**
 * Visual identifier for a document's content type. Renders nothing for
 * untyped documents so callers can drop it in without a null check.
 */
export function DocumentTypeBadge({
  type,
  className,
  iconOnly = false,
}: {
  type: DocumentType | null | undefined;
  className?: string;
  iconOnly?: boolean;
}) {
  if (!type) return null;

  const config = getDocumentTypeConfig(type);
  const Icon = config.icon;

  if (iconOnly) {
    return <Icon className={cn('h-3.5 w-3.5 shrink-0', config.color.textClass, className)} aria-label={config.name} />;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.625rem] font-medium leading-3 whitespace-nowrap',
        config.color.badgeClass,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {config.name}
    </span>
  );
}
