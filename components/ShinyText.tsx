import './ShinyText.css';
import { cn } from '@/lib/utils';

interface ShinyTextProps {
  text?: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
  children?: React.ReactNode;
}

const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  className = '',
  children
}) => {
  return (
    <span
      className={cn(
        "shiny-text-container relative inline-block",
        !disabled && "shiny-text-active",
        className
      )}
      style={{
        '--shimmer-duration': `${speed}s`
      } as React.CSSProperties}
    >
      {children || text}
    </span>
  );
};

export default ShinyText;