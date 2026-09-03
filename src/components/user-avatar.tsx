'use client';

import { Avatar, AvatarFallback, type AvatarSize } from '@/components/ui/avatar';
import { getInitials } from '@/lib/format';
import { gravatarUrl } from '@/lib/gravatar';
import { useEffect, useRef, useState } from 'react';

/** Rendered size of each avatar; Gravatar is asked for twice this, for retina screens. */
const AVATAR_PIXELS: Record<AvatarSize, number> = { xs: 20, sm: 24, md: 32, lg: 40, xl: 64, '2xl': 96 };

interface UserAvatarProps {
  name: string | null | undefined;
  /** Uploaded picture. Without one we try Gravatar, and failing that, initials. */
  image?: string | null;
  /** Address to look up on Gravatar when there is no uploaded picture. */
  email?: string | null;
  size?: AvatarSize;
  className?: string;
  title?: string;
  /** Load straight away rather than when scrolled into view. For the one avatar a page is about. */
  eager?: boolean;
}

/**
 * A person, everywhere: their picture when they have one, their Gravatar when
 * they don't, and otherwise their initials on a colour derived from their name.
 * Every avatar in the app goes through here, so a newly uploaded picture shows
 * up in all of them.
 *
 * The image is a plain `<img>` rather than Radix's `AvatarImage` on purpose.
 * Radix renders nothing until its own preload resolves, which means the server
 * sends the initials and the browser swaps in the picture after hydration —
 * a visible flash on every page load. Here the picture is in the HTML, so a
 * cached one paints immediately and the initials underneath are never seen.
 */
export function UserAvatar({ name, image, email, size = 'md', className, title, eager }: UserAvatarProps) {
  const displayName = name || undefined;
  const src = image || gravatarUrl(email, AVATAR_PIXELS[size] * 2);

  // Remembering *which* source failed means a new one gets its own chance
  // without an effect to reset the flag.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Because the picture is in the server-rendered HTML, a Gravatar miss can
  // 404 before React hydrates — and an error that has already happened never
  // reaches `onError`. An image that has finished with no width failed; one
  // that has not picked a source yet is merely waiting to be scrolled into
  // view, and must be left alone.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) setFailedSrc(src);
  }, [src]);

  return (
    <Avatar size={size} name={displayName} className={className} title={title ?? displayName}>
      <AvatarFallback name={displayName}>{getInitials(name)}</AvatarFallback>
      {src && src !== failedSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- see the note above; next/image can't serve arbitrary avatar hosts here
        <img
          ref={imgRef}
          src={src}
          alt={displayName ?? 'Avatar'}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          // Gravatar has no business knowing which document the reader is on.
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      )}
    </Avatar>
  );
}
