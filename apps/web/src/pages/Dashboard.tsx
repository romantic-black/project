import { useEffect, useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { StatusBadge } from '../components/StatusBadge';
import { HeartbeatIndicator } from '../components/HeartbeatIndicator';
import { ChartContainer } from '../components/ChartContainer';
import { getValTableText } from '../utils/dbc';
import * as echarts from 'echarts';

export default function Dashboard() {
  const { messages, getSignal } = useTelemetryStore();

  const speed = getSignal('VCU_VehSpeed');
  const speedHistory = useMemo(() => {
    const msg = messages.get('VCU_Info1');
    if (!msg) return [];
    return [{ time: new Date(msg.timestamp), value: speed || 0 }];
  }, [speed, messages]);

  const rpm = getSignal('EEC1_EngSpeed');
  const soc = getSignal('VCU_BatSOC');
  const fuel = getSignal('VCU_FeulSts');
  const gear = getSignal('VCU_CurrentGear');
  const mode = getSignal('VCU_Mode');
  const errLevel = getSignal('VCU_ErrLevel');
  const connected = useTelemetryStore((s) => s.connected);

  const speedGaugeOption: echarts.EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 200,
          splitNumber: 8,
          axisLine: {
            lineStyle: {
              width: 10,
              color: [[1, '#91CC75']],
            },
          },
          pointer: {
            itemStyle: {
              color: 'inherit',
            },
          },
          axisTick: {
            distance: -30,
            length: 8,
            lineStyle: {
              color: '#fff',
              width: 2,
            },
          },
          splitLine: {
            distance: -30,
            length: 30,
            lineStyle: {
              color: '#fff',
              width: 4,
            },
          },
          axisLabel: {
            color: '#999',
            distance: 40,
            fontSize: 12,
          },
          detail: {
            valueAnimation: true,
            formatter: '{value} km/h',
            color: 'inherit',
          },
          data: [
            {
              value: speed || 0,
              name: '车速',
            },
          ],
        },
      ],
    }),
    [speed]
  );

  const rpmGaugeOption: echarts.EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 8000,
          splitNumber: 8,
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
            formatter: '{value} rpm',
            color: 'inherit',
          },
          data: [
            {
              value: rpm || 0,
              name: '转速',
            },
          ],
        },
      ],
    }),
    [rpm]
  );

  const socGaugeOption: echarts.EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 100,
          radius: '75%',
          startAngle: 200,
          endAngle: -20,
          pointer: {
            show: false,
          },
          detail: {
            show: false,
          },
          data: [{ value: soc || 0, name: 'SOC' }],
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [soc ? soc / 100 : 0, '#5470C6'],
                [1, '#EEEEEE'],
              ],
            },
          },
          axisLabel: {
            distance: -50,
            fontSize: 12,
          },
        },
      ],
    }),
    [soc]
  );

  const fuelGaugeOption: echarts.EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 100,
          radius: '75%',
          startAngle: 200,
          endAngle: -20,
          pointer: {
            show: false,
          },
          detail: {
            show: false,
          },
          data: [{ value: fuel || 0, name: '燃料' }],
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [fuel ? fuel / 100 : 0, '#91CC75'],
                [1, '#EEEEEE'],
              ],
            },
          },
          axisLabel: {
            distance: -50,
            fontSize: 12,
          },
        },
      ],
    }),
    [fuel]
  );

  const errLevelVariant =
    errLevel === undefined
      ? 'default'
      : errLevel === 0
      ? 'success'
      : errLevel === 1
      ? 'warning'
      : 'danger';

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="py-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">仪表盘</h2>
        <HeartbeatIndicator />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">车速</h3>
          <ChartContainer option={speedGaugeOption} height="300px" />
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">转速</h3>
          <ChartContainer option={rpmGaugeOption} height="300px" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-semibold mb-2">SOC</h3>
          <ChartContainer option={socGaugeOption} height="200px" />
          <div className="text-center mt-2 text-lg font-bold">
            {soc?.toFixed(1) || '--'}%
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-semibold mb-2">燃料</h3>
          <ChartContainer option={fuelGaugeOption} height="200px" />
          <div className="text-center mt-2 text-lg font-bold">
            {fuel?.toFixed(1) || '--'}%
          </div>
        </div>

        <StatusBadge
          label="当前挡位"
          value={gear !== undefined ? getValTableText('VCU_CurrentGear', gear) : '--'}
          variant="default"
        />

        <StatusBadge
          label="工作模式"
          value={mode !== undefined ? getValTableText('VCU_Mode', mode) : '--'}
          variant="default"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusBadge
          label="故障等级"
          value={
            errLevel === undefined
              ? '--'
              : errLevel === 0
              ? '正常'
              : `Level ${errLevel}`
          }
          variant={errLevelVariant}
        />

        <SignalCard label="制动压力" value={getSignal('VCU_BrkPres')} unit="Mpa" />
        <SignalCard label="角速度" value={getSignal('VCU_VehAngSpeed')} unit="deg/s" />
      </div>
    </div>
  );
}

