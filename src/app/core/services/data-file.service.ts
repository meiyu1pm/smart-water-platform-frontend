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

  listFiles(collectionId: number): Observable<DataFileSummary[]> {
    return this.api.get<DataFileSummary[]>(`/api/v1/data-collections/${collectionId}/files`);
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

  uploadFile(collectionId: number, file: File, name?: string): Observable<DataFileUploadResult> {
    const form = new FormData();
    form.append('collection_id', String(collectionId));
    form.append('file', file, file.name);
    form.append('file_name', name?.trim() || file.name);
    return this.api.post<DataFileUploadResult, FormData>('/api/v1/data-files/uploads', form);
  }

  getPreview(versionId: number, limit = 50): Observable<DataFilePreview> {
    return this.api.get<DataFilePreview>(
      `/api/v1/data-file-versions/${encodeURIComponent(versionId)}/preview`,
      { max_rows: limit },
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
