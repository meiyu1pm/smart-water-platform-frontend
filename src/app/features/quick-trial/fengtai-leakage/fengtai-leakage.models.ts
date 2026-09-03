export interface FengtaiWindow {
  start_date: string;
  end_date: string;
  label?: string;
  interval_minutes?: number;
  full_resolution_points?: number;
  chart_points?: number;
}

export interface FengtaiPreset {
  id: string;
  label: string;
  start?: string;
  end?: string;
  start_date?: string;
  end_date?: string;
}

export interface FengtaiLeakageManifest {
  scenario_id?: string;
  scenario_name?: string;
  community?: string;
  source_label?: string;
  scenario?: { id: string; name: string; type?: string; dataset_name?: string };
  data_sources?: Array<{
    code: string;
    name: string;
    interval_minutes?: number;
    provenance?: { kind?: string; [key: string]: unknown };
    [key: string]: unknown;
  }>;
  import_summary?: Record<string, unknown>;
  mapping_summary?: Record<string, unknown>;
  default_window?: { start?: string; end?: string; start_date?: string; end_date?: string };
  date_ranges?:
    | Record<
        string,
        { start?: string; end?: string; start_date?: string; end_date?: string; label?: string }
      >
    | Array<{
        start?: string;
        end?: string;
        start_date?: string;
        end_date?: string;
        label?: string;
      }>;
  counts?: Record<string, number>;
  topology_summary?: Record<string, unknown>;
  presets?: Record<string, Partial<FengtaiPreset>> | FengtaiPreset[];
  available_windows?: FengtaiWindow[];
  default_preset?: string;
  [key: string]: unknown;
}

export interface FengtaiTopologyNode {
  id: string;
  name?: string;
  type?: 'valve' | 'hydrant' | 'meter' | 'junction' | string;
  x: number;
  y: number;
  elevation_m?: number;
  [key: string]: unknown;
}

export interface FengtaiTopologyPipe {
  id?: string;
  source: string;
  target: string;
  risk?: number | string;
  name?: string;
  [key: string]: unknown;
}

export interface FengtaiTopology {
  nodes?: FengtaiTopologyNode[];
  pipes?: FengtaiTopologyPipe[];
  links?: FengtaiTopologyPipe[];
  [key: string]: unknown;
}

export type FengtaiLayerAssetType = 'node' | 'pipe' | 'valve';
export type FengtaiLayerValueKind = 'observed' | 'cleaned' | 'estimated' | 'derived' | 'synthetic';

export interface FengtaiNetworkTimeline {
  interval_minutes: number;
  frame_count: number;
  default_layer: string;
  endpoint: string;
}

export interface FengtaiNetworkLayer {
  code: string;
  name: string;
  unit: string;
  asset_type: FengtaiLayerAssetType;
  value_kind: FengtaiLayerValueKind;
  asset_ids: string[];
  values: Array<Array<number | null>>;
  min: number | null;
  max: number | null;
  available_after_stage?: string | number;
  availability_reason?: string;
  provenance?: string | Record<string, unknown>;
}

export interface FengtaiNetworkFrames {
  analysis_id: string;
  start_date: string;
  end_date: string;
  interval_minutes: number;
  timestamps: string[];
  default_timestamp: string;
  default_layer: string;
  layers: FengtaiNetworkLayer[];
}

export type FengtaiAssetType = 'node' | 'pipe' | 'valve' | 'hydrant' | 'meter';
export interface AssetSelection {
  type: FengtaiAssetType;
  id: string;
  name: string;
}
export interface FengtaiAssetDetail {
  asset: {
    asset_id: string;
    asset_type: FengtaiAssetType;
    name?: string;
    [key: string]: unknown;
  };
  connections: { node_ids: string[]; pipe_ids: string[] };
  measurement?: {
    scope: 'direct' | 'community_reference';
    source_label: string;
    point_name: string;
    metrics: Array<{ code: string; name: string; unit: string }>;
    series: {
      timestamps: string[];
      flow: Array<number | null>;
      pressure: Array<number | null>;
    };
  };
  analysis_window: FengtaiWindow & {
    interval_minutes: number;
    full_resolution_points: number;
    series_points: number;
  };
  state_series?: {
    timestamps: string[];
    metrics: Array<{
      code: string;
      name: string;
      unit: string;
      value_kind: FengtaiLayerValueKind;
      values: Array<number | null>;
      confidence_values?: Array<number | null>;
    }>;
  };
  calculation?: {
    status: 'computed' | 'unavailable';
    evidence_scope: string;
    method: string;
    confidence: number;
  };
  [key: string]: unknown;
}

export interface FengtaiRawTopologyResponse {
  network?: {
    nodes?: Array<{
      node_id: string;
      name?: string;
      node_type?: string;
      x: number;
      y: number;
      [key: string]: unknown;
    }>;
    pipes?: Array<{
      pipe_id: string;
      name?: string;
      start_node_id: string;
      end_node_id: string;
      [key: string]: unknown;
    }>;
    valves?: Array<{
      asset_id: string;
      name?: string;
      node_id?: string;
      x: number;
      y: number;
      [key: string]: unknown;
    }>;
    hydrants?: Array<{
      asset_id: string;
      name?: string;
      node_id?: string;
      x: number;
      y: number;
      [key: string]: unknown;
    }>;
  };
  geojson?: unknown;
}

export interface FengtaiStage {
  code?: string;
  id?: string;
  name?: string;
  title?: string;
  purpose?: string;
  result?: string;
  status?: string;
  [key: string]: unknown;
}

export interface FengtaiCandidate {
  id?: string;
  name?: string;
  pipe_id?: string;
  score?: number;
  risk?: string;
  reason?: string;
  evidence?: Record<string, unknown> | string[];
  peak_at?: string;
  [key: string]: unknown;
}

export interface FengtaiAnalysis {
  analysis_id?: string;
  window?: FengtaiWindow;
  stages?: FengtaiStage[];
  summary?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  series?: Record<string, unknown>;
  anomalies?: unknown[];
  night_flow?: Record<string, unknown>;
  water_balance?: Record<string, unknown>;
  candidates?: FengtaiCandidate[];
  recommendation?: Record<string, unknown> | string;
  limitations?: string[];
  network_timeline?: FengtaiNetworkTimeline;
  [key: string]: unknown;
}

export interface FengtaiAnalyzeRequest {
  start_date: string;
  end_date: string;
  preset: string;
}
