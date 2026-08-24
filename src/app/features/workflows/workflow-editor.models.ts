/**
 * 架构边界：上游是工作流 API 与算子目录，下游是 Store、命令总线、序列化器和视图。
 * 本文件只定义 Graph 1.0 的领域类型；不拥有状态，不访问 HTTP、DOM、Rete 或 Dockview，也不负责销毁。
 */

export interface Port {
  key: string;
  label: string;
  data_type: string;
  semantic_type?: string | null;
  unit?: string | null;
  required?: boolean;
  cardinality?: 'one' | 'many' | string;
}

export interface Definition {
  node_code: string;
  version: string;
  node_name: string;
  description: string;
  category: string;
  runtime_type: string;
  input_ports: Port[];
  output_ports: Port[];
  parameter_schema?: { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  ui_schema?: Record<string, Record<string, unknown>>;
  default_params?: Record<string, unknown>;
  algorithm?: Record<string, unknown> | null;
  executor_type?: string;
  composite_workflow_version_id?: number | null;
  composite_interface?: Record<string, unknown> | null;
}

export interface EditorNode {
  id: string;
  node_code: string;
  node_version: string;
  parameters: Record<string, unknown>;
  x: number;
  y: number;
  collapsed: boolean;
  definition?: Definition;
}

export interface Edge {
  source: { node_id: string; port: string };
  target: { node_id: string; port: string };
}

export interface StoredBinding {
  dataset_asset_id: number;
  dataset_version_id: number;
  monitor_point_id?: number;
  metric_code?: string;
  value_source?: 'raw' | 'processed';
  start?: string | null;
  end?: string | null;
}

export interface Graph {
  contract_version: '1.0' | string;
  nodes: Array<Record<string, unknown>>;
  edges: Edge[];
  outputs: Array<{ node_id: string; port: string }>;
  bindings?: Record<string, StoredBinding>;
}

export interface ValidationIssue {
  code: string;
  message: string;
  node_id?: string;
  path?: string;
}

export type ValidationStatus = 'not_validated' | 'valid' | 'invalid';
export type AutosaveState = 'saved' | 'dirty' | 'saving' | 'offline' | 'conflict';

