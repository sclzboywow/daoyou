import { cn } from '@shared/lib/cn';
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * MapSatellite 变体定义
 */
const mapSatelliteVariants = cva(
  'absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 cursor-pointer',
  {
    variants: {
      selected: {
        true: 'z-30 scale-125',
        false: 'z-10 hover:scale-110',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

const satelliteMarkerVariants = cva('h-3 w-3 rotate-45 border', {
  variants: {
    selected: {
      true: 'bg-crimson border-bgpaper',
      false: 'bg-ink/60 border-bgpaper hover:border-crimson',
    },
  },
  defaultVariants: {
    selected: false,
  },
});

const satelliteLabelVariants = cva(
  'absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-[10px] leading-4',
  {
    variants: {
      selected: {
        true: 'z-40 border border-crimson bg-bgpaper text-crimson',
        false: 'border border-ink/5 bg-background/80 text-ink/85 shadow-none',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

export interface MapSatelliteProps extends VariantProps<
  typeof mapSatelliteVariants
> {
  id: string;
  name: string;
  x: number;
  y: number;
  onClick?: (id: string) => void;
}

/**
 * 地图卫星节点组件
 */
export function MapSatellite({
  id,
  name,
  x,
  y,
  selected = false,
  onClick,
}: MapSatelliteProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(id);
  };

  return (
    <div
      className={cn(mapSatelliteVariants({ selected }))}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={handleClick}
    >
      {/* Satellite Icon */}
      <div className={cn(satelliteMarkerVariants({ selected }))} />

      <div className={cn(satelliteLabelVariants({ selected }))}>
        {name}
      </div>
    </div>
  );
}
