import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { ChartContainer } from '../components/ChartContainer';
import * as echarts from 'echarts';

export default function Hydraulic() {
  const { getSignal } = useTelemetryStore();

  const angle = getSignal('Hyd_SteerWhlAngle');
  const sprayPump = getSignal('Hyd_SprayPumpSts');
  const sealingPlate = getSignal('Hyd_SealingPlateSts');
  const sternWing = getSignal('Hyd_SternWingSts');
  const antenna = getSignal('Hyd_LodgingAntennaSts');
  const reverseBucket = getSignal('Hyd_ReverseBucketSts');
  const mainTrack = getSignal('Hyd_MainTrackSts');
  const subTrack = getSignal('Hyd_SubTrackSts');

  const angleGaugeOption: echarts.EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: -25,
          max: 25,
          splitNumber: 10,
          axisLine: {
            lineStyle: {
              width: 10,
              color: [[1, '#5470C6']],
            },
          },
          pointer: {
            itemStyle: {
              color: 'inherit',
            },
          },
          detail: {
            valueAnimation: true,
            formatter: '{value}°',
            color: 'inherit',
          },
          data: [
            {
              value: angle || 0,
              name: '转向角度',
            },
          ],
        },
      ],
    }),
    [angle]
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">液压系统</h2>

      <div className="mb-6">
        <ChartContainer option={angleGaugeOption} height="300px" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SignalCard label="转向角度" value={angle} unit="deg" />

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">喷水泵状态</div>
          <div className="text-lg font-semibold">
            {sprayPump !== undefined ? String(sprayPump) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">密封板状态</div>
          <div className="text-lg font-semibold">
            {sealingPlate !== undefined ? String(sealingPlate) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">船尾翼状态</div>
          <div className="text-lg font-semibold">
            {sternWing !== undefined ? String(sternWing) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">桅杆天线状态</div>
          <div className="text-lg font-semibold">
            {antenna !== undefined ? String(antenna) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">反转斗状态</div>
          <div className="text-lg font-semibold">
            {reverseBucket !== undefined ? String(reverseBucket) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">主履带状态</div>
          <div className="text-lg font-semibold">
            {mainTrack !== undefined ? String(mainTrack) : '--'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 mb-2">副履带状态</div>
          <div className="text-lg font-semibold">
            {subTrack !== undefined ? String(subTrack) : '--'}
          </div>
        </div>
      </div>
    </div>
  );
}

