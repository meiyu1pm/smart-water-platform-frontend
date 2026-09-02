export interface FengtaiWindow {
  start_date: string;
  end_date: string;
  label?: string;
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
  community?: string;
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
  [key: string]: unknown;
}

export interface FengtaiAnalyzeRequest {
  start_date: string;
  end_date: string;
  preset: string;
}

export interface FengtaiSimulationRequest {
  start_date: string;
  end_date: string;
  valve_id: string;
  pressure_reduction_percent: number;
  leakage_exponent: number;
}

export interface FengtaiSimulation {
  summary?: Record<string, unknown>;
  series?: Record<string, unknown>;
  recommendation?: Record<string, unknown> | string;
  [key: string]: unknown;
}
