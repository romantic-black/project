import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { ChartContainer } from '../components/ChartContainer';
import * as echarts from 'echarts';
import { useSignalHistory } from '../hooks/useSignalHistory';

export default function VCU() {
  const { getSignal, messages } = useTelemetryStore();

  const angSpeed = getSignal('VCU_VehAngSpeed');
  const brkPres = getSignal('VCU_BrkPres');
  const angSpeedHistory = useSignalHistory('VCU_VehAngSpeed');
  const brkPresHistory = useSignalHistory('VCU_BrkPres');
  const parking = getSignal('VCU_ParkingSts');
  const modeSwitchFlag = getSignal('VCU_ModeSwitchingFlag');
  const modeSwitchAvail = getSignal('VCU_ModeSwitchAvailFlag');
  const odo = getSignal('VCU_OdoMeter');

  const vcuInfo1Timestamp = messages.get('VCU_Info1')?.timestamp;

  const chartOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['角速度', '制动压力'],
      },
      xAxis: {
        type: 'time',
      },
      yAxis: [
        {
          type: 'value',
          name: '角速度 (deg/s)',
          position: 'left',
        },
        {
          type: 'value',
          name: '制动压力 (MPa)',
          position: 'right',
        },
      ],
      animation: false,
      series: [
        {
          name: '角速度',
          type: 'line',
          smooth: false,
          showSymbol: false,
          data: [
            ...angSpeedHistory.map((item) => [item.timestamp, item.value]),
            ...(vcuInfo1Timestamp ? [[vcuInfo1Timestamp, angSpeed ?? 0]] : []),
          ],
          yAxisIndex: 0,
        },
        {
          name: '制动压力',
          type: 'line',
          smooth: false,
          showSymbol: false,
          areaStyle: { opacity: 0.15 },
          data: [
            ...brkPresHistory.map((item) => [item.timestamp, item.value]),
            ...(vcuInfo1Timestamp ? [[vcuInfo1Timestamp, brkPres ?? 0]] : []),
          ],
          yAxisIndex: 1,
        },
      ],
    }),
    [angSpeedHistory, brkPresHistory, angSpeed, brkPres, vcuInfo1Timestamp]
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">VCU 信息</h2>

      <div className="mb-6">
        <ChartContainer option={chartOption} height="400px" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <SignalCard label="角速度" value={angSpeed} unit="deg/s" />
        <SignalCard label="制动压力" value={brkPres} unit="Mpa" />
        <SignalCard label="里程" value={odo} unit="km" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">驻车状态</div>
          <div className={`text-lg font-semibold ${parking ? 'text-green-600' : 'text-gray-600'}`}>
            {parking !== undefined ? (parking ? '已驻车' : '未驻车') : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">模式切换中</div>
          <div className={`text-lg font-semibold ${modeSwitchFlag ? 'text-yellow-600' : 'text-gray-600'}`}>
            {modeSwitchFlag !== undefined ? (modeSwitchFlag ? '是' : '否') : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">模式切换可用</div>
          <div className={`text-lg font-semibold ${modeSwitchAvail ? 'text-green-600' : 'text-gray-600'}`}>
            {modeSwitchAvail !== undefined ? (modeSwitchAvail ? '是' : '否') : '--'}
          </div>
        </div>
      </div>
    </div>
  );
}

