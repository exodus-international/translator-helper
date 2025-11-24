import { cn } from '@/lib/utils';
import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string; // Name used to generate color
}

export interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

export interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string; // Name used to generate color
}

// Generate a consistent color from a string
function getColorFromString(str: string): { bg: string; text: string } {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Use HSL to generate a color with good saturation and lightness
  // Hue: 0-360 (use hash modulo 360)
  // Saturation: 60-80% for vibrant colors
  // Lightness: 40-50% for good contrast with white text
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash) % 15); // 65-80%
  const lightness = 45 + (Math.abs(hash) % 10); // 45-55%

  return {
    bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    text: '#ffffff', // White text for contrast
  };
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = 'md', name, children, ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-6 w-6 text-xs',
      md: 'h-8 w-8 text-xs',
      lg: 'h-10 w-10 text-sm',
    };

    // Generate color from name if provided, otherwise use default muted background
    const colorStyle = name && !src ? getColorFromString(name) : null;

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          !colorStyle && 'bg-muted',
          sizeClasses[size],
          className,
        )}
        style={colorStyle ? { backgroundColor: colorStyle.bg } : undefined}
        {...props}
      >
        {src && <img src={src} alt={alt} className="h-full w-full object-cover" />}
        {fallback && !src && (
          <span className="font-medium" style={colorStyle ? { color: colorStyle.text } : undefined}>
            {fallback}
          </span>
        )}
        {children}
      </div>
    );
  },
);
Avatar.displayName = 'Avatar';

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(({ className, ...props }, ref) => (
  <img ref={ref} className={cn('h-full w-full object-cover', className)} {...props} />
));
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, children, name, ...props }, ref) => {
    // Generate color from name if provided for text color
    const colorStyle = name ? getColorFromString(name) : null;

    return (
      <div
        ref={ref}
        className={cn(
          'flex h-full w-full items-center justify-center font-medium',
          !colorStyle && 'text-muted-foreground',
          className,
        )}
        style={colorStyle ? { color: colorStyle.text } : undefined}
        {...props}
      >
        {children}
      </div>
    );
  },
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarFallback, AvatarImage };
