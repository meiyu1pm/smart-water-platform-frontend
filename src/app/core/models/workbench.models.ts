/**
 * 工作台（Workbench）相关 DTO 模型。
 *
 * 当前后端 /api/v1/portal/summary 返回的字段不足以支撑原型工作台的全部统计卡。
 * 此处定义扩展后的预期契约，待后端实现后替换 PortalSummary 的调用。
 *
 * 后端需求参考：
 *   GET /api/v1/portal/workbench  （或扩展现有 /api/v1/portal/summary）
 */

/** 工作台统计卡数据 */
export interface WorkbenchStats {
  /** 今日任务总数 */
  today_tasks: number;
  /** 较昨日变化百分比（正数为增长） */
  today_tasks_delta_pct: number | null;
  /** 运行中任务数 */
  running_tasks: number;
  /** 预计 30 分钟内完成的任务数 */
  running_eta_count: number | null;
  /** 本周算法调用次数 */
  algorithm_calls_week: number;
  /** 较上周变化百分比 */
  algorithm_calls_delta_pct: number | null;
  /** 异常任务数（失败/超时） */
  abnormal_tasks: number;
  /** 较昨日变化量（正数为增加，负数为减少） */
  abnormal_tasks_delta: number | null;
}

/** 快捷入口定义 */
export interface QuickEntry {
  code: string;
  name: string;
  description: string;
  route: string;
  /** 图标名（Angular Material icon） */
  icon: string;
  /** 主题色，用于卡片左侧色条 */
  color: 'primary' | 'success' | 'warning' | 'info' | 'purple' | 'teal';
  /** 是否需要后端接口（false = 前端已有页面可跳转） */
  requiresBackend: boolean;
}

/** 工作台最近任务（扩展自 PortalSummary.recent_tasks，增加名称和负责人） */
export interface WorkbenchRecentTask {
  task_id: string;
  /** 任务显示名称（后端需补充，当前可用 task_type 替代） */
  task_name: string;
  task_type: string;
  /** 任务类型显示名 */
  task_type_label: string;
  status: string;
  progress: number;
  /** 负责人显示名（后端需补充，当前可用 created_by 替代） */
  owner_name: string | null;
  owner_avatar_text: string | null;
  started_at: string | null;
  trace_id: string;
}

/** 工作台完整响应 */
export interface WorkbenchSummary {
  stats: WorkbenchStats;
  recent_tasks: WorkbenchRecentTask[];
  /** 当前工作区信息（待后端实现） */
  workspace?: {
    id: string;
    name: string;
    quota_used_pct: number;
  } | null;
}

// ---------------------------------------------------------------------------
// 数据处理四件套 DTO（清洗/修复/增强/标注）
// 待后端实现后启用，统一三段式：配置 → 运行 → 结果
// ---------------------------------------------------------------------------

export type DataModuleCode = 'cleaning' | 'repair' | 'augmentation' | 'annotation';

export interface DataModuleConfig {
  id: number;
  module_code: DataModuleCode;
  config_name: string;
  dataset_version_id: number;
  parameters: Record<string, unknown>;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface DataModuleRun {
  run_id: string;
  config_id: number;
  task_id: string;
  status: string;
  progress: number;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface DataModuleResult {
  result_id: string;
  run_id: string;
  config_id: number;
  output_dataset_version_id: number | null;
  summary: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API Key 管理 DTO（待后端实现）
// ---------------------------------------------------------------------------

export interface ApiKey {
  key_id: string;
  name: string;
  /** 密钥前缀（仅创建时返回完整值，列表中只显示前缀） */
  key_prefix: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}
