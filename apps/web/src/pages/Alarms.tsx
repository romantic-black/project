import { useMemo } from 'react';
import { useTelemetryStore } from '../stores/telemetry';

export default function Alarms() {
  const { messages } = useTelemetryStore();

  const alarms = useMemo(() => {
    const dlcc1 = messages.get('J1939_DLCC1');
    if (!dlcc1) return [];

    const items: Array<{ name: string; value: number; level: string }> = [];

    const addAlarm = (name: string, value: number | undefined, level: string) => {
      if (value !== undefined) {
        items.push({ name, value, level });
      }
    };

    addAlarm('OBD 故障指示', dlcc1.values.DLCC1_OBDMalfuncIndicatorLamp, 'warning');
    addAlarm('红色停车灯', dlcc1.values.DLCC1_EngRedStopLamp, 'danger');
    addAlarm('油压低警告', dlcc1.values.DLCC1_EngOilPresLowLamp, 'warning');
    addAlarm('冷却液温度高', dlcc1.values.DLCC1_EngCoolantTempHighLamp, 'warning');
    addAlarm('冷却液液位低', dlcc1.values.DLCC1_EngCoolantLvlLowLamp, 'warning');
    addAlarm('黄色警告灯', dlcc1.values.DLCC1_EngAmberWarnLamp, 'warning');
    addAlarm('制动活动', dlcc1.values.DLCC1_BrkActiveLamp, 'info');

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

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-bold text-gray-900 py-4">告警状态</h2>

      <div className="space-y-4">
        {alarms.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
            暂无告警数据
          </div>
        ) : (
          alarms.map((alarm, idx) => (
            <div
              key={idx}
              className={`bg-white p-4 rounded-lg shadow border-l-4 ${getLevelColor(alarm.level)}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{alarm.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    状态值: {alarm.value} | 级别: {getLevelText(alarm.level)}
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getLevelColor(alarm.level)}`}>
                  {getLevelText(alarm.level)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

