import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface ChartContainerProps {
  option: EChartsOption;
  height?: string;
  className?: string;
}

export function ChartContainer({ option, height = '400px', className }: ChartContainerProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    chartInstanceRef.current.setOption(option, true);

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [option]);

  return (
    <div
      ref={chartRef}
      className={className}
      style={{ width: '100%', height }}
    />
  );
}

