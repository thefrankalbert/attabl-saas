import Image from 'next/image';
import { PhotoPlaceholder } from './PhotoPlaceholder';

export interface PhotoProps {
  src?: string | null;
  alt: string;
  kind?: 'food' | 'drink';
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export function Photo({
  src,
  alt,
  kind,
  fill,
  width,
  height,
  className = '',
  sizes,
  priority,
}: PhotoProps) {
  if (!src) return <PhotoPlaceholder kind={kind} className={className} />;

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes ?? '(max-width: 480px) 100vw, 480px'}
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 80}
      height={height ?? 80}
      className={`object-cover ${className}`}
    />
  );
}
