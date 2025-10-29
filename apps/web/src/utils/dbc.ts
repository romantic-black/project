const valTables: Record<string, Record<number, string>> = {
  VCU_Mode: {
    0: '初始化模式',
    1: '待机模式',
    2: '手动陆地模式',
    3: '手动水上模式',
    4: '自动陆地模式',
    5: '自动水上模式',
    6: '切换模式',
    15: '紧急模式',
  },
  VCU_CurrentGear: {
    0: 'N挡',
    1: 'D挡',
    2: 'R挡',
  },
  EEC1_EngTrqMode: {
    0: '低怠速/无请求',
    1: '加速踏板选择',
    2: '巡航控制',
    4: 'PTO调速器',
    5: 'ASR控制',
    6: '变速箱控制',
    7: 'ABS控制',
  },
};

export function getValTableText(tableName: string, value: number): string {
  const table = valTables[tableName];
  if (!table) return String(value);
  return table[value] || String(value);
}

