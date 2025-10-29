import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface ChartContainerProps {
  option: EChartsOption;
  height?: string;
  className?: string;
}

const MAX_DATA_POINTS = 500;

function downsampleData(data: [number, number][], maxPoints: number): [number, number][] {
  if (data.length <= maxPoints) {
    return data;
  }

  const step = Math.ceil(data.length / maxPoints);
  const result: [number, number][] = [];
  
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }
  
  if (result.length > 0 && result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }
  
  return result;
}

function optimizeChartOption(option: EChartsOption): EChartsOption {
  const optimized = { ...option };
  
  if (optimized.series && Array.isArray(optimized.series)) {
    optimized.series = optimized.series.map((series: any) => {
      if (series.type === 'line' && Array.isArray(series.data)) {
        return {
          ...series,
          smooth: false,
          animation: false,
          data: downsampleData(series.data, MAX_DATA_POINTS),
        };
      }
      return {
        ...series,
        animation: false,
      };
    });
  }
  
  return {
    ...optimized,
    animation: false,
  };
}

export function ChartContainer({ option, height = '400px', className }: ChartContainerProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const optionRef = useRef<EChartsOption | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
      const optimizedOption = optimizeChartOption(option);
      optionRef.current = optimizedOption;
      chartInstanceRef.current.setOption(optimizedOption, true);
    } else {
      const optimizedOption = optimizeChartOption(option);
      optionRef.current = optimizedOption;
      chartInstanceRef.current.setOption(optimizedOption, false);
    }

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [option]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  return (
    <div
      ref={chartRef}
      className={className}
      style={{ width: '100%', height }}
    />
  );
}

