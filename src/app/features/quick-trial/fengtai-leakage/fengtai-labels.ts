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
  combined_risk_score: '综合风险评分',
  quality_score_after: '治理后质量评分',
  persistent_anomaly_events: '持续异常事件',
  inspection_priority_count: '优先复核管段',
  mean_minimum_night_flow_m3h: '平均最小夜间流量',
  unaccounted_ratio_proxy: '未计量水量占比',
  rows: '原始记录数',
  points: '治理后有效点数',
  expected_points: '规则化应有点数',
  flow_completeness_percent: '流量完整率',
  pressure_completeness_percent: '压力完整率',
  timestamp_regularity_percent: '时间间隔规则率',
  score: '综合质量评分',
  remaining_missing_points: '剩余流量缺失点',
  remaining_pressure_missing_points: '剩余压力缺失点',
  record_count: '有效记录数',
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

export function fengtaiMetricValue(key: string, value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fengtaiValue(value);
  if (key === 'unaccounted_ratio' || key === 'unaccounted_ratio_proxy') {
    return `${(value * 100).toFixed(2)}%`;
  }
  if (key.endsWith('_percent')) return `${value.toFixed(2)}%`;
  if (key === 'combined_risk_score' || key === 'quality_score_after' || key === 'score') {
    return `${value.toFixed(2)} 分`;
  }
  if (key === 'mean_minimum_night_flow_m3h') return `${value.toFixed(2)} m³/h`;
  if (key === 'inspection_priority_count') return `${value} 条`;
  if (key === 'persistent_anomaly_events') return `${value} 个`;
  if (
    [
      'rows',
      'points',
      'expected_points',
      'record_count',
      'remaining_missing_points',
      'remaining_pressure_missing_points',
    ].includes(key)
  ) {
    return `${value} 点`;
  }
  return fengtaiValue(value);
}
