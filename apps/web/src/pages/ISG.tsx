import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { ChartContainer } from '../components/ChartContainer';
import * as echarts from 'echarts';

export default function ISG() {
  const { getSignal } = useTelemetryStore();

  const voltage = getSignal('ISG_DCvoltage');
  const current = getSignal('ISG_DCcurrent');
  const power = useMemo(() => {
    if (voltage !== undefined && current !== undefined) {
      return (voltage * current) / 1000;
    }
    return undefined;
  }, [voltage, current]);

  const speed = getSignal('ISG_ActSpeed');
  const torque = getSignal('ISG_ActTrq');
  const maxTorque = getSignal('ISG_MaxTrq');
  const mode = getSignal('ISG_ActMode');
  const enabled = getSignal('ISG_ActEnSts');

  const chartOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['转速', '扭矩'],
      },
      xAxis: {
        type: 'time',
      },
      yAxis: [
        {
          type: 'value',
          name: '转速 (rpm)',
          position: 'left',
        },
        {
          type: 'value',
          name: '扭矩 (Nm)',
          position: 'right',
        },
      ],
      series: [
        {
          name: '转速',
          type: 'line',
          data: [{ time: Date.now(), value: speed || 0 }],
          yAxisIndex: 0,
        },
        {
          name: '扭矩',
          type: 'line',
          data: [{ time: Date.now(), value: torque || 0 }],
          yAxisIndex: 1,
        },
      ],
    }),
    [speed, torque]
  );

  const powerChartOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['电压', '电流', '功率'],
      },
      xAxis: {
        type: 'time',
      },
      yAxis: [
        {
          type: 'value',
          name: '电压 (V)',
          position: 'left',
        },
        {
          type: 'value',
          name: '电流/功率',
          position: 'right',
        },
      ],
      series: [
        {
          name: '电压',
          type: 'line',
          data: [{ time: Date.now(), value: voltage || 0 }],
          yAxisIndex: 0,
        },
        {
          name: '电流',
          type: 'line',
          data: [{ time: Date.now(), value: current || 0 }],
          yAxisIndex: 1,
        },
        {
          name: '功率',
          type: 'line',
          data: [{ time: Date.now(), value: power || 0 }],
          yAxisIndex: 1,
        },
      ],
    }),
    [voltage, current, power]
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">ISG 信息</h2>

      <div className="mb-6">
        <ChartContainer option={powerChartOption} height="300px" />
      </div>

      <div className="mb-6">
        <ChartContainer option={chartOption} height="300px" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SignalCard label="电压" value={voltage} unit="V" />
        <SignalCard label="电流" value={current} unit="A" />
        <SignalCard label="功率" value={power} unit="kW" />
        <SignalCard label="最大扭矩" value={maxTorque} unit="Nm" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">工作模式</div>
          <div className="text-lg font-semibold">
            {mode !== undefined ? String(mode) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">使能状态</div>
          <div className={`text-lg font-semibold ${enabled ? 'text-green-600' : 'text-gray-600'}`}>
            {enabled !== undefined ? (enabled ? '启用' : '未启用') : '--'}
          </div>
        </div>
      </div>
    </div>
  );
}

