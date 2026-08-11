import { type ImgHTMLAttributes } from 'react';
import { cn } from '../cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps extends ImgHTMLAttributes<HTMLImageElement> {
  name: string;
  size?: AvatarSize;
  src?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 45% 45%)`;
}

export function Avatar({
  name,
  size = 'md',
  src,
  className,
  alt,
  ...props
}: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = hashColor(name);

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? name}
        className={cn(
          'inline-block rounded-[var(--cn-radius-full)] object-cover',
          'ring-2 ring-[var(--cn-color-surface-base)]',
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--cn-radius-full)]',
        'font-medium text-white select-none',
        'ring-2 ring-[var(--cn-color-surface-base)]',
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: bgColor }}
    >
      {initials}
    </span>
  );
}
