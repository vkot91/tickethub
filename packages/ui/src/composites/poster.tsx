import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { hueFromSeed } from '../lib/format';

interface PosterProps extends HTMLAttributes<HTMLDivElement> {
  seed: string;
  src?: string | null;
}

/** Show artwork, with the design's striped placeholder when there is no poster yet. */
export function Poster({ seed, src, className, children, ...props }: PosterProps) {
  const hue = hueFromSeed(seed);

  const background = src
    ? { backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {
        backgroundImage: `repeating-linear-gradient(115deg, hsl(${hue} 45% 22%) 0 14px, hsl(${hue} 40% 16%) 14px 28px)`,
      };

  return (
    <div
      className={cn('relative overflow-hidden bg-deep', className)}
      style={background}
      {...props}
    >
      {children}
    </div>
  );
}
