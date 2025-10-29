import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { ChartContainer } from '../components/ChartContainer';
import { getValTableText } from '../utils/dbc';
import * as echarts from 'echarts';
import { useSignalHistory } from '../hooks/useSignalHistory';
import { combineHistoryWithLatest } from '../utils/chart';

export default function Engine() {
  const { getSignal, messages } = useTelemetryStore();

  const torque = getSignal('EEC1_ActEngPcntTrq');
  const speed = getSignal('EEC1_EngSpeed');
  const load = getSignal('EEC2_EngPcntLoadatCurSpd');
  const throttle = getSignal('EEC2_AccPdlPosition');
  const torqueHistory = useSignalHistory('EEC1_ActEngPcntTrq');
  const speedHistory = useSignalHistory('EEC1_EngSpeed');
  const loadHistory = useSignalHistory('EEC2_EngPcntLoadatCurSpd');
  const throttleHistory = useSignalHistory('EEC2_AccPdlPosition');
  const trqMode = getSignal('EEC1_EngTrqMode');
  const starterMode = getSignal('EEC1_EngStarterMode');
  const demandTrq = getSignal('EEC1_DemandPcntTrq');
  const driverTrq = getSignal('EEC1_DriverDemandPcntTrq');

  const eec1Timestamp = messages.get('J1939_EEC1')?.timestamp;
  const eec2Timestamp = messages.get('J1939_EEC2')?.timestamp;

  const chartOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['扭矩', '转速', '负载', '油门'],
      },
      xAxis: {
        type: 'time',
      },
      yAxis: [
        {
          type: 'value',
          name: '扭矩/负载/油门 (%)',
          position: 'left',
        },
        {
          type: 'value',
          name: '转速 (rpm)',
          position: 'right',
        },
      ],
      series: [
        {
          name: '扭矩',
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.15 },
          data: combineHistoryWithLatest(torqueHistory, eec1Timestamp, torque ?? undefined),
          yAxisIndex: 0,
        },
        {
          name: '转速',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: combineHistoryWithLatest(speedHistory, eec1Timestamp, speed ?? undefined),
          yAxisIndex: 1,
        },
        {
          name: '负载',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: combineHistoryWithLatest(loadHistory, eec2Timestamp, load ?? undefined),
          yAxisIndex: 0,
        },
        {
          name: '油门',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: combineHistoryWithLatest(throttleHistory, eec2Timestamp, throttle ?? undefined),
          yAxisIndex: 0,
        },
      ],
    }),
    [
      eec1Timestamp,
      eec2Timestamp,
      load,
      loadHistory,
      speed,
      speedHistory,
      throttle,
      throttleHistory,
      torque,
      torqueHistory,
    ]
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">发动机信息</h2>

      <div className="mb-6">
        <ChartContainer option={chartOption} height="400px" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SignalCard label="实际扭矩" value={torque} unit="%" />
        <SignalCard label="需求扭矩" value={demandTrq} unit="%" />
        <SignalCard label="驾驶员扭矩" value={driverTrq} unit="%" />
        <SignalCard label="最大可用扭矩" value={getSignal('EEC2_EngMaxAvailPcntTrq')} unit="%" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">扭矩模式</div>
          <div className="text-lg font-semibold">
            {trqMode !== undefined ? getValTableText('EEC1_EngTrqMode', trqMode) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">启动器模式</div>
          <div className="text-lg font-semibold">
            {starterMode !== undefined ? String(starterMode) : '--'}
          </div>
        </div>
      </div>
    </div>
  );
}

