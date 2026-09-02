const labels: Record<string, string> = {
  data_coverage: '数据覆盖率',
  valid_ratio: '有效数据占比',
  repaired_points: '修复记录数',
  anomaly_count: '异常时段数',
  candidate_count: '候选管段数',
  risk_level: '综合风险等级',
  missing_rate: '缺失率',
  outlier_rate: '异常值比例',
  continuity_rate: '连续性',
  quality_score: '质量评分',
  total_points: '记录数',
  valid_points: '有效记录数',
  master_volume_m3: '总表供水量',
  household_consumption_proxy_m3: '住户用水估算',
  unaccounted_volume_proxy_m3: '未计量水量估算',
  unaccounted_ratio: '未计量水量占比',
  total_master_volume_m3: '总表供水量',
  total_household_consumption_proxy_m3: '住户用水估算',
  total_unaccounted_volume_proxy_m3: '未计量水量估算',
  pressure_reduction_percent: '压力下调比例',
  baseline_leakage_proxy_m3d: '调节前漏损估算',
  adjusted_leakage_proxy_m3d: '调节后漏损估算',
  affected_pipe_ids: '关联管段数',
  service_pressure_warning: '供水压力提示',
  valve_id: '调节阀门',
};

export function fengtaiLabel(key: string): string {
  return labels[key] ?? '分析指标';
}

export function fengtaiValue(value: unknown): string {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '—';
  if (value && typeof value === 'object') return '详见说明';
  return '—';
}
