import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  DataCollectionSummary,
  DataFilePreview,
  DataFileSummary,
  DataFileUploadResult,
  DataFileVersionSummary,
  DataFileView,
  DataFileViewCreate,
} from '../models/api.models';
import {
  DataFileActionResult,
  DataFileExplorerQuery,
  DataFileExplorerResponse,
} from '../models/data-file-explorer.models';
import { ApiClient } from './api-client.service';

/**
 * 统一封装异构数据集和文件 API。
 * 旧 /datasets 与 /data-sources 接口不经过此服务，保证历史工作流选择器继续使用旧契约。
 */
@Injectable({ providedIn: 'root' })
export class DataFileService {
  private readonly api = inject(ApiClient);

  listCollections(): Observable<DataCollectionSummary[]> {
    return this.api.get<DataCollectionSummary[]>('/api/v1/data-collections');
  }

  createCollection(body: {
    name: string;
    description?: string | null;
  }): Observable<DataCollectionSummary> {
    return this.api.post<DataCollectionSummary, typeof body>('/api/v1/data-collections', body);
  }

  deleteCollection(
    collectionId: number,
  ): Observable<{ collection_id: number; status: string; recycle_item_id?: number }> {
    return this.api.delete<{ collection_id: number; status: string; recycle_item_id?: number }>(
      `/api/v1/data-collections/${collectionId}`,
    );
  }

  listFiles(collectionId: number): Observable<DataFileSummary[]> {
    return this.api.get<DataFileSummary[]>(`/api/v1/data-collections/${collectionId}/files`);
  }

  /** Files that are not currently attached to an active data collection. */
  listUnassignedFiles(): Observable<DataFileSummary[]> {
    return this.api.get<DataFileSummary[]>('/api/v1/data-files', { unassigned: true });
  }

  /** Read the file-explorer view. `parentId` is null for the platform root. */
  listExplorer(
    parentId: number | null | 'root' | 'collection' | 'unassigned' | DataFileExplorerQuery = null,
    collectionId?: number | null,
    options?: DataFileExplorerQuery,
  ): Observable<DataFileExplorerResponse> {
    const supplied: DataFileExplorerQuery =
      parentId !== null && typeof parentId === 'object' ? parentId : options || {};
    const location =
      supplied.location ||
      (parentId === -1 || parentId === 'unassigned'
        ? 'unassigned'
        : parentId === null || parentId === 'root'
          ? 'root'
          : 'collection');
    const resolvedCollectionId =
      supplied.collection_id ??
      (typeof parentId === 'number' && parentId > 0 ? parentId : collectionId);
    return this.api.get<DataFileExplorerResponse>('/api/v1/data-file-explorer', {
      location,
      ...(resolvedCollectionId ? { collection_id: resolvedCollectionId } : {}),
      ...(supplied.query ? { query: supplied.query } : {}),
      ...(supplied.page ? { page: supplied.page } : {}),
      ...(supplied.page_size ? { page_size: supplied.page_size } : {}),
      ...(supplied.sort ? { sort: supplied.sort } : {}),
      ...(supplied.order ? { order: supplied.order } : {}),
    });
  }

  /** Alias used by consumers that describe the endpoint as a tree query. */
  getExplorer(
    parentId: number | null | 'root' | 'collection' | 'unassigned' | DataFileExplorerQuery = null,
    collectionId?: number | null,
    options?: DataFileExplorerQuery,
  ): Observable<DataFileExplorerResponse> {
    return this.listExplorer(parentId, collectionId, options);
  }

  moveFiles(
    fileIds: number[],
    targetCollectionId: number | null,
    sourceCollectionId?: number | null,
  ): Observable<DataFileActionResult> {
    return this.api.post<
      DataFileActionResult,
      {
        file_ids: number[];
        target_collection_id: number | null;
        source_collection_id?: number | null;
        request_id: string;
      }
    >('/api/v1/data-file-actions/move', {
      file_ids: fileIds,
      target_collection_id: targetCollectionId,
      ...(sourceCollectionId !== undefined ? { source_collection_id: sourceCollectionId } : {}),
      request_id: this.requestId(),
    });
  }

  copyFiles(
    fileIds: number[],
    targetCollectionId: number | null,
  ): Observable<DataFileActionResult> {
    return this.api.post<
      DataFileActionResult,
      { file_ids: number[]; target_collection_id: number | null; request_id: string }
    >('/api/v1/data-file-actions/copy', {
      file_ids: fileIds,
      target_collection_id: targetCollectionId,
      request_id: this.requestId(),
    });
  }

  deleteFiles(fileIds: number[]): Observable<DataFileActionResult> {
    return this.api.post<DataFileActionResult, { file_ids: number[]; request_id: string }>(
      '/api/v1/data-file-actions/delete',
      { file_ids: fileIds, request_id: this.requestId() },
    );
  }

  private requestId(): string {
    return (
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
  }

  getBuiltinDemo(): Observable<{ file: DataFileSummary; version: DataFileVersionSummary }> {
    return this.api.get<{ file: DataFileSummary; version: DataFileVersionSummary }>(
      '/api/v1/data-files/builtin-demo',
    );
  }

  removeFileFromCollection(
    collectionId: number,
    fileId: number,
  ): Observable<{ collection_id: number; file_id: number; removed: boolean }> {
    return this.api.delete<{ collection_id: number; file_id: number; removed: boolean }>(
      `/api/v1/data-collections/${collectionId}/files/${fileId}`,
    );
  }

  /** Archive a logical file and its versions through the existing recycle-bin flow. */
  deleteFile(
    fileId: number,
  ): Observable<{ file_id: number; status: string; recycle_item_id?: number }> {
    return this.api.delete<{ file_id: number; status: string; recycle_item_id?: number }>(
      `/api/v1/data-files/${fileId}`,
    );
  }

  getFile(fileId: number): Observable<DataFileSummary> {
    return this.api.get<DataFileSummary>(`/api/v1/data-files/${fileId}`);
  }

  listFileVersions(fileId: number): Observable<DataFileVersionSummary[]> {
    return this.api.get<DataFileVersionSummary[]>(`/api/v1/data-files/${fileId}/versions`);
  }

  getFileVersion(versionId: number): Observable<DataFileVersionSummary> {
    return this.api.get<DataFileVersionSummary>(`/api/v1/data-file-versions/${versionId}`);
  }

  uploadFile(
    collectionId: number | null,
    file: File,
    name?: string,
  ): Observable<DataFileUploadResult> {
    const form = new FormData();
    if (collectionId !== null) {
      form.append('collection_id', String(collectionId));
    }
    form.append('file', file, file.name);
    form.append('file_name', name?.trim() || file.name);
    return this.api.post<DataFileUploadResult, FormData>('/api/v1/data-files/uploads', form);
  }

  uploadUnassignedFile(file: File, name?: string): Observable<DataFileUploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('file_name', name?.trim() || file.name);
    form.append('file_kind', 'quick_trial');
    form.append('description', '快速试用临时文件');
    return this.api.post<DataFileUploadResult, FormData>('/api/v1/data-files/uploads', form);
  }

  getPreview(versionId: number, limit = 50): Observable<DataFilePreview> {
    return this.api.get<DataFilePreview>(
      `/api/v1/data-file-versions/${encodeURIComponent(versionId)}/preview`,
      { max_rows: limit },
    );
  }

  downloadFileVersion(versionId: number): Observable<Blob> {
    return this.api.download(
      `/api/v1/data-file-versions/${encodeURIComponent(versionId)}/download`,
    );
  }

  createView(versionId: number, view: DataFileViewCreate): Observable<DataFileView> {
    return this.api.post<DataFileView, DataFileViewCreate>(
      `/api/v1/data-file-versions/${versionId}/views`,
      view,
    );
  }

  getView(viewId: number): Observable<DataFileView> {
    return this.api.get<DataFileView>(`/api/v1/data-views/${viewId}`);
  }
}
