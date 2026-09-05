import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * `default` = light gray (untuk card/section berlatar putih)
   * `dark` = subtle white overlay (untuk header/card berlatar dashboard brand dark #2C473E)
   */
  variant?: 'default' | 'dark';
}

const Skeleton = ({
  className,
  variant = 'default',
  ...props
}: SkeletonProps) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md',
        variant === 'dark' ? 'bg-white/5 border border-white/10' : 'bg-gray-200',
        className
      )}
      {...props}
    />
  );
};

export { Skeleton };
