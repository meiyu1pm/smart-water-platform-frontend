import {
  DataCollectionSummary,
  DataFileNormalizationSummary,
  DataFileSummary,
  DataFileTimeProfile,
} from './api.models';

/** A navigation entry returned by the file explorer API. */
export interface DataFileExplorerFolder extends DataCollectionSummary {
  parent_id?: number | null;
  kind?: 'folder' | 'collection' | string;
  can_delete?: boolean;
}

export interface DataFileExplorerItem {
  id: number | null;
  name: string;
  kind: 'file' | 'folder' | 'collection' | string;
  parent_id?: number | null;
  file?: DataFileSummary | null;
  collection?: DataFileExplorerFolder | null;
  file_id?: number | null;
  collection_id?: number | null;
  size_bytes?: number;
  format?: string;
  updated_at?: string;
  can_read?: boolean;
  can_write?: boolean;
  can_move?: boolean;
  can_copy?: boolean;
  can_delete?: boolean;
  resource_type?: string;
  type?: string;
  code?: string;
  file_kind?: string;
  status?: string;
  version_count?: number;
  current_version_id?: number | null;
  current_version?: DataFileSummary['current_version'];
  profile_status?: string | null;
  created_at?: string;
  row_count?: number | null;
  parse_issue_count?: number;
  quality_score?: number | null;
  quality_grade?: string | null;
  time_profile?: DataFileTimeProfile | null;
  normalization?: DataFileNormalizationSummary | null;
  file_count?: number;
}

export interface DataFileExplorerResponse {
  items?: DataFileExplorerItem[];
  files?: DataFileSummary[];
  folders?: DataFileExplorerFolder[];
  collections?: DataFileExplorerFolder[];
  pagination?: {
    page?: number;
    total?: number;
    page_size?: number;
  };
  /** Top-level pagination fields are retained for the current API response shape. */
  page?: number;
  total?: number;
  page_size?: number;
  location?: {
    kind: 'root' | 'collection' | 'unassigned' | string;
    collection_id?: number | null;
    name?: string;
  };
  current_parent_id?: number | null;
  breadcrumbs?: Array<{ id: number | null; name: string; kind?: string }>;
  permissions?: Record<string, boolean>;
}

export interface DataFileExplorerQuery {
  location?: 'root' | 'collection' | 'unassigned';
  collection_id?: number | null;
  query?: string | null;
  page?: number;
  page_size?: number;
  sort?: 'name' | 'updated_at' | 'created_at' | 'size_bytes' | 'file_kind';
  order?: 'asc' | 'desc';
}

export interface DataFileActionResult {
  moved?: number;
  copied?: number;
  deleted?: number;
  file_ids?: number[];
  task_id?: string | null;
  status?: string;
  request_id?: string;
  conflicts?: Array<{ file_id?: number; name?: string; reason?: string }>;
  refreshed?: boolean;
  [key: string]: unknown;
}
