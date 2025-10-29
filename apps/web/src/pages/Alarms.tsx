import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';

interface AlarmItem {
  name: string;
  value: number;
  level: string;
  category: string;
}

export default function Alarms() {
  const { messages } = useTelemetryStore();

  const alarms = useMemo(() => {
    const items: AlarmItem[] = [];

    const addAlarm = (name: string, value: number | undefined, level: string, category: string) => {
      if (value !== undefined && value !== 0) {
        items.push({ name, value, level, category });
      }
    };

    const getAlarmLevel = (value: number): string => {
      if (value === 0) return 'normal';
      if (value === 1) return 'warning';
      if (value === 2 || value === 3) return 'danger';
      return 'warning';
    };

    // J1939_DLCC1 报警（原有）
    const dlcc1 = messages.get('J1939_DLCC1');
    if (dlcc1) {
      addAlarm('OBD 故障指示', dlcc1.values.DLCC1_OBDMalfuncIndicatorLamp, 'warning', '发动机系统');
      addAlarm('红色停车灯', dlcc1.values.DLCC1_EngRedStopLamp, 'danger', '发动机系统');
      addAlarm('油压低警告', dlcc1.values.DLCC1_EngOilPresLowLamp, 'warning', '发动机系统');
      addAlarm('冷却液温度高', dlcc1.values.DLCC1_EngCoolantTempHighLamp, 'warning', '发动机系统');
      addAlarm('冷却液液位低', dlcc1.values.DLCC1_EngCoolantLvlLowLamp, 'warning', '发动机系统');
      addAlarm('黄色警告灯', dlcc1.values.DLCC1_EngAmberWarnLamp, 'warning', '发动机系统');
      addAlarm('制动活动', dlcc1.values.DLCC1_BrkActiveLamp, 'info', '发动机系统');
    }

    // 电池系统报警 (VCU_BatteryAlarm)
    const batteryAlarm = messages.get('VCU_BatteryAlarm');
    if (batteryAlarm) {
      const v = batteryAlarm.values;
      addAlarm('电池包总电压过高', v.Bat_TotalVoltageHigh, getAlarmLevel(v.Bat_TotalVoltageHigh), '电池系统');
      addAlarm('电池包总电压过低', v.Bat_TotalVoltageLow, getAlarmLevel(v.Bat_TotalVoltageLow), '电池系统');
      addAlarm('单体过压', v.Bat_CellOvervoltage, getAlarmLevel(v.Bat_CellOvervoltage), '电池系统');
      addAlarm('单体欠压', v.Bat_CellUndervoltage, getAlarmLevel(v.Bat_CellUndervoltage), '电池系统');
      addAlarm('放电高温', v.Bat_DischargeHighTemp, getAlarmLevel(v.Bat_DischargeHighTemp), '电池系统');
      addAlarm('放电低温', v.Bat_DischargeLowTemp, getAlarmLevel(v.Bat_DischargeLowTemp), '电池系统');
      addAlarm('充电高温', v.Bat_ChargeHighTemp, getAlarmLevel(v.Bat_ChargeHighTemp), '电池系统');
      addAlarm('充电低温', v.Bat_ChargeLowTemp, getAlarmLevel(v.Bat_ChargeLowTemp), '电池系统');
      addAlarm('放电过流', v.Bat_DischargeOvercurrent, getAlarmLevel(v.Bat_DischargeOvercurrent), '电池系统');
      addAlarm('充电过流', v.Bat_ChargeOvercurrent, getAlarmLevel(v.Bat_ChargeOvercurrent), '电池系统');
      addAlarm('SOC过低', v.Bat_SOCLow, getAlarmLevel(v.Bat_SOCLow), '电池系统');
      addAlarm('压差过大', v.Bat_VoltageDiffHigh, getAlarmLevel(v.Bat_VoltageDiffHigh), '电池系统');
      addAlarm('温差过高', v.Bat_TempDiffHigh, getAlarmLevel(v.Bat_TempDiffHigh), '电池系统');
      addAlarm('绝缘故障', v.Bat_InsulationFault, getAlarmLevel(v.Bat_InsulationFault), '电池系统');
      if (v.Bat_VehicleCANFault === 1) addAlarm('整车CAN故障', v.Bat_VehicleCANFault, 'danger', '电池系统');
      if (v.Bat_ChargeCANFault === 1) addAlarm('充电CAN故障', v.Bat_ChargeCANFault, 'danger', '电池系统');
      if (v.Bat_InternalCANFault === 1) addAlarm('内部CAN故障', v.Bat_InternalCANFault, 'danger', '电池系统');
      if (v.Bat_TotalVoltageDetectFault === 1) addAlarm('总电压检测故障', v.Bat_TotalVoltageDetectFault, 'danger', '电池系统');
      if (v.Bat_HighVoltageInterlockFault === 1) addAlarm('高压互锁故障', v.Bat_HighVoltageInterlockFault, 'danger', '电池系统');
      if (v.Bat_CC2DetectFault === 1) addAlarm('CC2检测故障', v.Bat_CC2DetectFault, 'danger', '电池系统');
      if (v.Bat_ChargerSocketHighTemp === 1) addAlarm('充电座高温', v.Bat_ChargerSocketHighTemp, 'danger', '电池系统');
      if (v.Bat_VoltageSensorDetectFault === 1) addAlarm('电压传感器故障', v.Bat_VoltageSensorDetectFault, 'danger', '电池系统');
      if (v.Bat_TempSensorDetectFault === 1) addAlarm('温度传感器故障', v.Bat_TempSensorDetectFault, 'danger', '电池系统');
      if (v.Bat_CurrentSensorDetectFault === 1) addAlarm('电流传感器故障', v.Bat_CurrentSensorDetectFault, 'danger', '电池系统');
      if (v.Bat_ThermalManageFault === 1) addAlarm('热管理系统故障', v.Bat_ThermalManageFault, 'danger', '电池系统');
      if (v.Bat_MainNegRelayStickFault === 1) addAlarm('主负继电器粘连', v.Bat_MainNegRelayStickFault, 'danger', '电池系统');
      if (v.Bat_MainPosRelayStickFault === 1) addAlarm('主正继电器粘连', v.Bat_MainPosRelayStickFault, 'danger', '电池系统');
      if (v.Bat_PrechargeTimeout === 1) addAlarm('预充超时', v.Bat_PrechargeTimeout, 'danger', '电池系统');
    }

    // 液压系统报警 (VCU_HydraulicAlarm)
    const hydraulicAlarm = messages.get('VCU_HydraulicAlarm');
    if (hydraulicAlarm && hydraulicAlarm.values.Hyd_InverterFaultStatus !== 0) {
      addAlarm('逆变器故障', hydraulicAlarm.values.Hyd_InverterFaultStatus, 'danger', '液压系统');
    }

    // 轮毂电机系统M1报警 (VCU_MotorM1Alarm)
    const motorM1Alarm = messages.get('VCU_MotorM1Alarm');
    if (motorM1Alarm) {
      const v = motorM1Alarm.values;
      if (v.M1_SoftwareOvercurrent === 1) addAlarm('M1软件过流', v.M1_SoftwareOvercurrent, 'danger', '轮毂电机M1');
      if (v.M1_BusOvervoltage === 1) addAlarm('M1母线过压', v.M1_BusOvervoltage, 'danger', '轮毂电机M1');
      if (v.M1_BusUndervoltage === 1) addAlarm('M1母线欠压', v.M1_BusUndervoltage, 'danger', '轮毂电机M1');
      if (v.M1_OverSpeed === 1) addAlarm('M1超速', v.M1_OverSpeed, 'danger', '轮毂电机M1');
      if (v.M1_MotorOverTemp === 1) addAlarm('M1电机过温', v.M1_MotorOverTemp, 'danger', '轮毂电机M1');
      if (v.M1_ControllerOverTemp === 1) addAlarm('M1控制器过温', v.M1_ControllerOverTemp, 'danger', '轮毂电机M1');
      if (v.M1_MotorStall === 1) addAlarm('M1电机堵转', v.M1_MotorStall, 'danger', '轮毂电机M1');
      if (v.M1_MotorOpenCircuit === 1) addAlarm('M1电机开路', v.M1_MotorOpenCircuit, 'danger', '轮毂电机M1');
      if (v.M1_HardwareOvercurrent === 1) addAlarm('M1硬件过流', v.M1_HardwareOvercurrent, 'danger', '轮毂电机M1');
      if (v.M1_HardwareDriverFault === 1) addAlarm('M1硬件驱动故障', v.M1_HardwareDriverFault, 'danger', '轮毂电机M1');
      if (v.M1_CANCommInterrupt === 1) addAlarm('M1 CAN通讯中断', v.M1_CANCommInterrupt, 'danger', '轮毂电机M1');
      if (v.M1_ResolverFault === 1) addAlarm('M1电机旋变故障', v.M1_ResolverFault, 'danger', '轮毂电机M1');
      if (v.M1_CurrentSensorFault === 1) addAlarm('M1电流传感器故障', v.M1_CurrentSensorFault, 'danger', '轮毂电机M1');
      if (v.M1_PowerDerating === 1) addAlarm('M1功率降额保护', v.M1_PowerDerating, 'warning', '轮毂电机M1');
      if (v.M1_CooperativeFault === 1) addAlarm('M1协同故障', v.M1_CooperativeFault, 'danger', '轮毂电机M1');
      if (v.M1_FaultCode !== 0) addAlarm('M1故障码', v.M1_FaultCode, 'danger', '轮毂电机M1');
      if (v.M1_FaultLevel !== 0) {
        const level = v.M1_FaultLevel === 1 ? 'warning' : 'danger';
        addAlarm('M1故障等级', v.M1_FaultLevel, level, '轮毂电机M1');
      }
    }

    // 轮毂电机系统M2报警 (VCU_MotorM2Alarm)
    const motorM2Alarm = messages.get('VCU_MotorM2Alarm');
    if (motorM2Alarm) {
      const v = motorM2Alarm.values;
      if (v.M2_SoftwareOvercurrent === 1) addAlarm('M2软件过流', v.M2_SoftwareOvercurrent, 'danger', '轮毂电机M2');
      if (v.M2_BusOvervoltage === 1) addAlarm('M2母线过压', v.M2_BusOvervoltage, 'danger', '轮毂电机M2');
      if (v.M2_BusUndervoltage === 1) addAlarm('M2母线欠压', v.M2_BusUndervoltage, 'danger', '轮毂电机M2');
      if (v.M2_OverSpeed === 1) addAlarm('M2超速', v.M2_OverSpeed, 'danger', '轮毂电机M2');
      if (v.M2_MotorOverTemp === 1) addAlarm('M2电机过温', v.M2_MotorOverTemp, 'danger', '轮毂电机M2');
      if (v.M2_ControllerOverTemp === 1) addAlarm('M2控制器过温', v.M2_ControllerOverTemp, 'danger', '轮毂电机M2');
      if (v.M2_MotorStall === 1) addAlarm('M2电机堵转', v.M2_MotorStall, 'danger', '轮毂电机M2');
      if (v.M2_MotorOpenCircuit === 1) addAlarm('M2电机开路', v.M2_MotorOpenCircuit, 'danger', '轮毂电机M2');
      if (v.M2_HardwareOvercurrent === 1) addAlarm('M2硬件过流', v.M2_HardwareOvercurrent, 'danger', '轮毂电机M2');
      if (v.M2_HardwareDriverFault === 1) addAlarm('M2硬件驱动故障', v.M2_HardwareDriverFault, 'danger', '轮毂电机M2');
      if (v.M2_CANCommInterrupt === 1) addAlarm('M2 CAN通讯中断', v.M2_CANCommInterrupt, 'danger', '轮毂电机M2');
      if (v.M2_ResolverFault === 1) addAlarm('M2电机旋变故障', v.M2_ResolverFault, 'danger', '轮毂电机M2');
      if (v.M2_CurrentSensorFault === 1) addAlarm('M2电流传感器故障', v.M2_CurrentSensorFault, 'danger', '轮毂电机M2');
      if (v.M2_PowerDerating === 1) addAlarm('M2功率降额保护', v.M2_PowerDerating, 'warning', '轮毂电机M2');
      if (v.M2_CooperativeFault === 1) addAlarm('M2协同故障', v.M2_CooperativeFault, 'danger', '轮毂电机M2');
      if (v.M2_FaultCode !== 0) addAlarm('M2故障码', v.M2_FaultCode, 'danger', '轮毂电机M2');
      if (v.M2_FaultLevel !== 0) {
        const level = v.M2_FaultLevel === 1 ? 'warning' : 'danger';
        addAlarm('M2故障等级', v.M2_FaultLevel, level, '轮毂电机M2');
      }
    }

    // 散热系统报警 (VCU_CoolingAlarm)
    const coolingAlarm = messages.get('VCU_CoolingAlarm');
    if (coolingAlarm) {
      const v = coolingAlarm.values;
      if (v.Cool_WaterRad1HighVoltFanFault === 1) addAlarm('水散1#高压风扇故障', v.Cool_WaterRad1HighVoltFanFault, 'danger', '散热系统');
      if (v.Cool_InterCooler2HighVoltFanFault === 1) addAlarm('中冷2#高压风扇故障', v.Cool_InterCooler2HighVoltFanFault, 'danger', '散热系统');
      if (v.Cool_EngineWaterRadLevelAlarm === 1) addAlarm('发动机水散液位报警', v.Cool_EngineWaterRadLevelAlarm, 'warning', '散热系统');
      if (v.Cool_EngineBayFanFault === 1) addAlarm('机舱风扇故障', v.Cool_EngineBayFanFault, 'warning', '散热系统');
      if (v.Cool_EngineFaultLevel !== 0) {
        const level = v.Cool_EngineFaultLevel === 1 ? 'warning' : v.Cool_EngineFaultLevel === 2 ? 'warning' : 'danger';
        addAlarm('发动机故障等级', v.Cool_EngineFaultLevel, level, '散热系统');
      }
      if (v.Cool_WaterRad1DriverFaultType !== 0) addAlarm('水散1#驱动器故障', v.Cool_WaterRad1DriverFaultType, 'danger', '散热系统');
      if (v.Cool_InterCooler2DriverFaultType !== 0) addAlarm('中冷2#驱动器故障', v.Cool_InterCooler2DriverFaultType, 'danger', '散热系统');
      if (v.Cool_MotorWaterRadHighVoltFanFault === 1) addAlarm('电机水散高压风扇故障', v.Cool_MotorWaterRadHighVoltFanFault, 'danger', '散热系统');
      if (v.Cool_MotorWaterRadLevelAlarm === 1) addAlarm('电机水散液位报警', v.Cool_MotorWaterRadLevelAlarm, 'warning', '散热系统');
      if (v.Cool_GeneratorPumpFault === 1) addAlarm('发电机水泵故障', v.Cool_GeneratorPumpFault, 'danger', '散热系统');
      if (v.Cool_Bridge12PumpFault === 1) addAlarm('1桥和2桥水泵故障', v.Cool_Bridge12PumpFault, 'danger', '散热系统');
      if (v.Cool_MotorFaultLevel !== 0) {
        const level = v.Cool_MotorFaultLevel === 1 ? 'warning' : v.Cool_MotorFaultLevel === 2 ? 'warning' : 'danger';
        addAlarm('电机故障等级', v.Cool_MotorFaultLevel, level, '散热系统');
      }
      if (v.Cool_MotorWaterRadDriverFaultType !== 0) addAlarm('电机水散驱动器故障', v.Cool_MotorWaterRadDriverFaultType, 'danger', '散热系统');
    }

    // ISG电机报警 (VCU_ISGAlarm)
    const isgAlarm = messages.get('VCU_ISGAlarm');
    if (isgAlarm) {
      const v = isgAlarm.values;
      if (v.ISG_FaultLevel !== 0) {
        const level = v.ISG_FaultLevel === 1 ? 'warning' : v.ISG_FaultLevel === 2 ? 'warning' : 'danger';
        addAlarm('ISG故障等级', v.ISG_FaultLevel, level, 'ISG电机');
      }
      if (v.ISG_IGBTFault === 1) addAlarm('ISG IGBT故障', v.ISG_IGBTFault, 'danger', 'ISG电机');
      if (v.ISG_Overvoltage === 1) addAlarm('ISG过压', v.ISG_Overvoltage, 'danger', 'ISG电机');
      if (v.ISG_Undervoltage === 1) addAlarm('ISG欠压', v.ISG_Undervoltage, 'danger', 'ISG电机');
      if (v.ISG_MotorOverSpeed === 1) addAlarm('ISG电机过速', v.ISG_MotorOverSpeed, 'danger', 'ISG电机');
      if (v.ISG_MCUOverTemp === 1) addAlarm('ISG MCU过温', v.ISG_MCUOverTemp, 'danger', 'ISG电机');
      if (v.ISG_CANCommFault === 1) addAlarm('ISG CAN通讯故障', v.ISG_CANCommFault, 'danger', 'ISG电机');
      if (v.ISG_SystemLeakageFault === 1) addAlarm('ISG系统漏电', v.ISG_SystemLeakageFault, 'danger', 'ISG电机');
      if (v.ISG_SelfTestFault === 1) addAlarm('ISG自检故障', v.ISG_SelfTestFault, 'danger', 'ISG电机');
      if (v.ISG_12VOvervoltage === 1) addAlarm('ISG 12V过压', v.ISG_12VOvervoltage, 'danger', 'ISG电机');
      if (v.ISG_12VUndervoltage === 1) addAlarm('ISG 12V欠压', v.ISG_12VUndervoltage, 'danger', 'ISG电机');
      if (v.ISG_MotorStall === 1) addAlarm('ISG电机堵转', v.ISG_MotorStall, 'danger', 'ISG电机');
      if (v.ISG_ResolverAngleFault === 1) addAlarm('ISG旋变角度故障', v.ISG_ResolverAngleFault, 'danger', 'ISG电机');
      if (v.ISG_PhaseCurrentOvercurrent === 1) addAlarm('ISG相电流过流', v.ISG_PhaseCurrentOvercurrent, 'danger', 'ISG电机');
      if (v.ISG_InverterFault === 1) addAlarm('ISG逆变器故障', v.ISG_InverterFault, 'danger', 'ISG电机');
      if (v.ISG_HardwareBusOvercurrent === 1) addAlarm('ISG硬件母线过流', v.ISG_HardwareBusOvercurrent, 'danger', 'ISG电机');
      if (v.ISG_HardwareBusOvervoltage === 1) addAlarm('ISG硬件母线过压', v.ISG_HardwareBusOvervoltage, 'danger', 'ISG电机');
      if (v.ISG_MotorTempAlarm === 1) addAlarm('ISG电机温度报警', v.ISG_MotorTempAlarm, 'warning', 'ISG电机');
      if (v.ISG_UDCLowerLimitAlarm === 1) addAlarm('ISG UDC下限报警', v.ISG_UDCLowerLimitAlarm, 'warning', 'ISG电机');
      if (v.ISG_UDCUpperLimitAlarm === 1) addAlarm('ISG UDC上限报警', v.ISG_UDCUpperLimitAlarm, 'warning', 'ISG电机');
    }

    return items;
  }, [messages]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'danger':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getLevelText = (level: string) => {
    switch (level) {
      case 'danger':
        return '危险';
      case 'warning':
        return '警告';
      case 'info':
        return '信息';
      default:
        return '未知';
    }
  };

  // 按类别分组报警
  const alarmsByCategory = useMemo(() => {
    const grouped: Record<string, AlarmItem[]> = {};
    alarms.forEach((alarm) => {
      if (!grouped[alarm.category]) {
        grouped[alarm.category] = [];
      }
      grouped[alarm.category].push(alarm);
    });
    return grouped;
  }, [alarms]);

  const categories = Object.keys(alarmsByCategory);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">告警状态</h2>

        {alarms.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
            暂无告警数据
          </div>
        ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{category}</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {alarmsByCategory[category].map((alarm, idx) => (
            <div
              key={idx}
                    className={`px-4 py-3 border-l-4 ${getLevelColor(alarm.level)}`}
            >
              <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{alarm.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                          状态值: {alarm.value}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getLevelColor(alarm.level)}`}>
                  {getLevelText(alarm.level)}
                </div>
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

