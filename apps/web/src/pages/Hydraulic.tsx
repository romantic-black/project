import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';
import { SignalCard } from '../components/SignalCard';
import { ChartContainer } from '../components/ChartContainer';
import * as echarts from 'echarts';

export default function Hydraulic() {
  const { getSignal } = useTelemetryStore();

  // Legacy signals
  const angle = getSignal('Hyd_SteerWhlAngle');
  const sprayPump = getSignal('Hyd_SprayPumpSts');
  const sealingPlate = getSignal('Hyd_SealingPlateSts');
  const sternWing = getSignal('Hyd_SternWingSts');
  const antenna = getSignal('Hyd_LodgingAntennaSts');
  const reverseBucket = getSignal('Hyd_ReverseBucketSts');
  const mainTrack = getSignal('Hyd_MainTrackSts');
  const subTrack = getSignal('Hyd_SubTrackSts');

  // New hydraulic system signals
  // Mode
  const mode = getSignal('Hyd_Mode');
  
  // System pressure
  const systemPressure = getSignal('Hyd_SystemPressure');
  
  // Position data
  const zqd = getSignal('Hyd_ZQD');
  const zqx = getSignal('Hyd_ZQX');
  const yqd = getSignal('Hyd_YQD');
  const yqx = getSignal('Hyd_YQX');
  const zhd = getSignal('Hyd_ZHD');
  const zhx = getSignal('Hyd_ZHX');
  const yhd = getSignal('Hyd_YHD');
  const yhx = getSignal('Hyd_YHX');
  
  // Angle data
  const tailFlapAngle = getSignal('Hyd_TailFlapAngle');
  const steeringRudderAngle = getSignal('Hyd_SteeringRudderAngle');
  
  // Control switches
  const heightAdjust = getSignal('Hyd_HeightAdjust');
  const leftFrontLargeCylExtend = getSignal('Hyd_LeftFrontLargeCylExtend');
  const leftFrontLargeCylRetract = getSignal('Hyd_LeftFrontLargeCylRetract');
  const leftRearLargeCylExtend = getSignal('Hyd_LeftRearLargeCylExtend');
  const leftRearLargeCylRetract = getSignal('Hyd_LeftRearLargeCylRetract');
  const leftFrontSmallCylExtend = getSignal('Hyd_LeftFrontSmallCylExtend');
  const leftFrontSmallCylRetract = getSignal('Hyd_LeftFrontSmallCylRetract');
  const leftRearSmallCylExtend = getSignal('Hyd_LeftRearSmallCylExtend');
  const leftRearSmallCylRetract = getSignal('Hyd_LeftRearSmallCylRetract');
  const rightFrontLargeCylExtend = getSignal('Hyd_RightFrontLargeCylExtend');
  const rightFrontLargeCylRetract = getSignal('Hyd_RightFrontLargeCylRetract');
  const rightRearLargeCylExtend = getSignal('Hyd_RightRearLargeCylExtend');
  const rightRearLargeCylRetract = getSignal('Hyd_RightRearLargeCylRetract');
  const rightFrontSmallCylExtend = getSignal('Hyd_RightFrontSmallCylExtend');
  const rightFrontSmallCylRetract = getSignal('Hyd_RightFrontSmallCylRetract');
  const rightRearSmallCylExtend = getSignal('Hyd_RightRearSmallCylExtend');
  const rightRearSmallCylRetract = getSignal('Hyd_RightRearSmallCylRetract');
  const dumpBucketExtend = getSignal('Hyd_DumpBucketExtend');
  const dumpBucketRetract = getSignal('Hyd_DumpBucketRetract');
  const dumpBucketLockExtend = getSignal('Hyd_DumpBucketLockExtend');
  const dumpBucketLockRetract = getSignal('Hyd_DumpBucketLockRetract');
  const wheelCavityFlipDeploy = getSignal('Hyd_WheelCavityFlipDeploy');
  const wheelCavityFlipRetract = getSignal('Hyd_WheelCavityFlipRetract');
  const tailFlapRetract = getSignal('Hyd_TailFlapRetract');
  const tailFlapDeploy = getSignal('Hyd_TailFlapDeploy');

  const modeNames: Record<number, string> = {
    1: '水上模式',
    2: '陆上模式',
    3: '岸滩模式',
    4: '越壕',
  };

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

  const pressureGaugeOption: echarts.EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: 'gauge',
          min: 0,
          max: 65535,
          splitNumber: 10,
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
          detail: {
            valueAnimation: true,
            formatter: '{value} Bar',
            color: 'inherit',
          },
          data: [
            {
              value: systemPressure || 0,
              name: '系统压力',
            },
          ],
        },
      ],
    }),
    [systemPressure]
  );

  const angleChartOption: echarts.EChartsOption = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['尾翼板角度', '转向舵角度'],
      },
      xAxis: {
        type: 'category',
        data: ['当前值'],
      },
      yAxis: {
        type: 'value',
        name: '角度 (°)',
      },
      series: [
        {
          name: '尾翼板角度',
          type: 'bar',
          data: [tailFlapAngle || 0],
          itemStyle: { color: '#5470C6' },
        },
        {
          name: '转向舵角度',
          type: 'bar',
          data: [steeringRudderAngle || 0],
          itemStyle: { color: '#91CC75' },
        },
      ],
    }),
    [tailFlapAngle, steeringRudderAngle]
  );

  const renderSwitchStatus = (label: string, value: number | undefined) => {
    return (
      <div className="bg-white p-3 rounded-lg shadow">
        <div className="text-xs text-gray-500 mb-1">{label}</div>
        <div className={`text-sm font-semibold ${value === 1 ? 'text-green-600' : 'text-gray-400'}`}>
          {value === 1 ? '有效' : value === 0 ? '无效' : '--'}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">液压系统</h2>

      {/* Mode and System Pressure */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">运行模式</h3>
          <div className="text-3xl font-bold text-blue-600">
            {mode !== undefined ? modeNames[mode] || `模式${mode}` : '--'}
          </div>
        </div>
        <SignalCard label="系统压力" value={systemPressure} unit="Bar" />
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <ChartContainer option={angleGaugeOption} height="300px" />
        <ChartContainer option={pressureGaugeOption} height="300px" />
      </div>

      {/* Angles */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">角度信息</h3>
        <ChartContainer option={angleChartOption} height="300px" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <SignalCard label="尾翼板角度" value={tailFlapAngle} unit="°" />
          <SignalCard label="转向舵角度" value={steeringRudderAngle} unit="°" />
        </div>
      </div>

      {/* Position Data */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">位置数据</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
          <SignalCard label="ZQD" value={zqd} unit="mm" />
          <SignalCard label="ZQX" value={zqx} unit="mm" />
          <SignalCard label="YQD" value={yqd} unit="mm" />
          <SignalCard label="YQX" value={yqx} unit="mm" />
          <SignalCard label="ZHD" value={zhd} unit="mm" />
          <SignalCard label="ZHX" value={zhx} unit="mm" />
          <SignalCard label="YHD" value={yhd} unit="mm" />
          <SignalCard label="YHX" value={yhx} unit="mm" />
        </div>
      </div>

      {/* Control Switches */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">控制开关状态</h3>
        
        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">基础控制</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('调高开关', heightAdjust)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">左前大缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', leftFrontLargeCylExtend)}
            {renderSwitchStatus('缩', leftFrontLargeCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">左前小缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', leftFrontSmallCylExtend)}
            {renderSwitchStatus('缩', leftFrontSmallCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">左后大缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', leftRearLargeCylExtend)}
            {renderSwitchStatus('缩', leftRearLargeCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">左后小缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', leftRearSmallCylExtend)}
            {renderSwitchStatus('缩', leftRearSmallCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">右前大缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', rightFrontLargeCylExtend)}
            {renderSwitchStatus('缩', rightFrontLargeCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">右前小缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', rightFrontSmallCylExtend)}
            {renderSwitchStatus('缩', rightFrontSmallCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">右后大缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', rightRearLargeCylExtend)}
            {renderSwitchStatus('缩', rightRearLargeCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">右后小缸</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', rightRearSmallCylExtend)}
            {renderSwitchStatus('缩', rightRearSmallCylRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">倒车斗</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('伸', dumpBucketExtend)}
            {renderSwitchStatus('缩', dumpBucketRetract)}
            {renderSwitchStatus('锁止伸', dumpBucketLockExtend)}
            {renderSwitchStatus('锁止缩', dumpBucketLockRetract)}
          </div>
        </div>

        <div className="mb-4">
          <h4 className="text-md font-medium text-gray-700 mb-2">其他控制</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {renderSwitchStatus('轮穴翻板放', wheelCavityFlipDeploy)}
            {renderSwitchStatus('轮穴翻板收', wheelCavityFlipRetract)}
            {renderSwitchStatus('尾翼板收', tailFlapRetract)}
            {renderSwitchStatus('尾翼板放', tailFlapDeploy)}
          </div>
        </div>
      </div>

      {/* Legacy Status (if exists) */}
      {(sprayPump !== undefined || sealingPlate !== undefined || sternWing !== undefined ||
        antenna !== undefined || reverseBucket !== undefined || mainTrack !== undefined ||
        subTrack !== undefined) && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">其他状态</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      )}
    </div>
  );
}

