import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { ChartContainer } from '../components/ChartContainer';
import * as echarts from 'echarts';
import { useSignalHistory } from '../hooks/useSignalHistory';

export default function ISG() {
  const { getSignal, messages } = useTelemetryStore();

  const voltage = getSignal('ISG_DCvoltage');
  const current = getSignal('ISG_DCcurrent');
  const voltageHistory = useSignalHistory('ISG_DCvoltage');
  const currentHistory = useSignalHistory('ISG_DCcurrent');
  const power = useMemo(() => {
    if (voltage !== undefined && current !== undefined) {
      return (voltage * current) / 1000;
    }
    return undefined;
  }, [voltage, current]);

  const powerHistory = useMemo(() => {
    const length = Math.min(voltageHistory.length, currentHistory.length);
    if (length === 0) {
      return [];
    }

    const voltageSlice = voltageHistory.slice(-length);
    const currentSlice = currentHistory.slice(-length);

    return voltageSlice.map((voltagePoint, index) => {
      const currentPoint = currentSlice[index];
      return {
        timestamp: Math.max(voltagePoint.timestamp, currentPoint.timestamp),
        value: (voltagePoint.value * currentPoint.value) / 1000,
      };
    });
  }, [currentHistory, voltageHistory]);

  const speed = getSignal('ISG_ActSpeed');
  const torque = getSignal('ISG_ActTrq');
  const speedHistory = useSignalHistory('ISG_ActSpeed');
  const torqueHistory = useSignalHistory('ISG_ActTrq');
  const maxTorque = getSignal('ISG_MaxTrq');
  const mode = getSignal('ISG_ActMode');
  const enabled = getSignal('ISG_ActEnSts');

  const isgInfo1Timestamp = messages.get('ISG_Info1')?.timestamp;
  const isgInfo2Timestamp = messages.get('ISG_Info2')?.timestamp;

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
          smooth: true,
          showSymbol: false,
          data: speedHistory.map((item) => [item.timestamp, item.value]),
          data: isgInfo1Timestamp ? [[isgInfo1Timestamp, speed ?? 0]] : [],
          yAxisIndex: 0,
        },
        {
          name: '扭矩',
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.15 },
          data: torqueHistory.map((item) => [item.timestamp, item.value]),
          data: isgInfo1Timestamp ? [[isgInfo1Timestamp, torque ?? 0]] : [],
          yAxisIndex: 1,
        },
      ],
    }),
    [speedHistory, torqueHistory]
    [speed, torque, isgInfo1Timestamp]
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
          smooth: true,
          showSymbol: false,
          data: voltageHistory.map((item) => [item.timestamp, item.value]),
          data: isgInfo2Timestamp ? [[isgInfo2Timestamp, voltage ?? 0]] : [],
          yAxisIndex: 0,
        },
        {
          name: '电流',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: currentHistory.map((item) => [item.timestamp, item.value]),
          data: isgInfo2Timestamp ? [[isgInfo2Timestamp, current ?? 0]] : [],
          yAxisIndex: 1,
        },
        {
          name: '功率',
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.15 },
          data: powerHistory.map((item) => [item.timestamp, item.value]),
          data: isgInfo2Timestamp ? [[isgInfo2Timestamp, power ?? 0]] : [],
          yAxisIndex: 1,
        },
      ],
    }),
    [currentHistory, powerHistory, voltageHistory]
    [voltage, current, power, isgInfo2Timestamp]
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

