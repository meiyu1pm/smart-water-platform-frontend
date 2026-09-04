import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ApiClient } from './api-client.service';
import { DataFileService } from './data-file.service';

describe('DataFileService', () => {
  it('uses explorer location queries and idempotent batch action endpoints', () => {
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    TestBed.configureTestingModule({
      providers: [
        DataFileService,
        {
          provide: ApiClient,
          useValue: {
            get: (path: string, query?: unknown) => {
              calls.push({ method: 'GET', path, body: query });
              return of({});
            },
            post: (path: string, body: unknown) => {
              calls.push({ method: 'POST', path, body });
              return of({});
            },
          },
        },
      ],
    });
    const service = TestBed.inject(DataFileService);
    service.listExplorer('root').subscribe();
    service.listExplorer('collection', 4, { query: 'flow', page: 2 }).subscribe();
    service.listExplorer('unassigned').subscribe();
    service.moveFiles([1, 2], null).subscribe();
    service.copyFiles([1], 4).subscribe();
    service.deleteFiles([2]).subscribe();
    service.moveFiles([3], null, 4).subscribe();
    expect(calls[0]).toEqual({
      method: 'GET',
      path: '/api/v1/data-file-explorer',
      body: { location: 'root' },
    });
    expect(calls[1]).toEqual({
      method: 'GET',
      path: '/api/v1/data-file-explorer',
      body: { location: 'collection', collection_id: 4, query: 'flow', page: 2 },
    });
    expect(calls[2]).toEqual({
      method: 'GET',
      path: '/api/v1/data-file-explorer',
      body: { location: 'unassigned' },
    });
    expect(calls[3]).toMatchObject({
      method: 'POST',
      path: '/api/v1/data-file-actions/move',
      body: { file_ids: [1, 2], target_collection_id: null, request_id: expect.any(String) },
    });
    expect(calls[4]).toMatchObject({
      method: 'POST',
      path: '/api/v1/data-file-actions/copy',
      body: { file_ids: [1], target_collection_id: 4, request_id: expect.any(String) },
    });
    expect(calls[5]).toEqual({
      method: 'POST',
      path: '/api/v1/data-file-actions/delete',
      body: { file_ids: [2], request_id: expect.any(String) },
    });
    expect(calls[6]).toMatchObject({
      method: 'POST',
      path: '/api/v1/data-file-actions/move',
      body: {
        file_ids: [3],
        target_collection_id: null,
        source_collection_id: 4,
        request_id: expect.any(String),
      },
    });
  });

  it('uses the additive collection and bounded preview endpoints', () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    TestBed.configureTestingModule({
      providers: [
        DataFileService,
        {
          provide: ApiClient,
          useValue: {
            get: (path: string, query?: Record<string, unknown>) => {
              calls.push({ method: 'GET', path, ...(query ? { body: query } : {}) });
              return of([]);
            },
            post: (path: string, body: unknown) => {
              calls.push({ method: 'POST', path, body });
              return of({});
            },
            delete: (path: string) => {
              calls.push({ method: 'DELETE', path });
              return of({});
            },
          },
        },
      ],
    });
    const service = TestBed.inject(DataFileService);
    service.listCollections().subscribe();
    service.deleteCollection(4).subscribe();
    service.listFiles(4).subscribe();
    service.listUnassignedFiles().subscribe();
    service.getBuiltinDemo().subscribe();
    service.uploadUnassignedFile(new File(['time,value\n2024-01-01,1'], 'trial.csv')).subscribe();
    service.deleteFile(12).subscribe();
    service.removeFileFromCollection(4, 9).subscribe();
    service.deleteFile(9).subscribe();
    service.listFileVersions(9).subscribe();
    service.getFileVersion(7).subscribe();
    service.getPreview(7, 25).subscribe();
    service
      .createView(7, {
        view_kind: 'table',
        mapping: { selected_columns: ['flow'] },
      })
      .subscribe();
    service.getView(31).subscribe();

    expect(calls).toEqual([
      { method: 'GET', path: '/api/v1/data-collections' },
      { method: 'DELETE', path: '/api/v1/data-collections/4' },
      { method: 'GET', path: '/api/v1/data-collections/4/files' },
      { method: 'GET', path: '/api/v1/data-files', body: { unassigned: true } },
      { method: 'GET', path: '/api/v1/data-files/builtin-demo' },
      { method: 'POST', path: '/api/v1/data-files/uploads', body: expect.any(FormData) },
      { method: 'DELETE', path: '/api/v1/data-files/12' },
      { method: 'DELETE', path: '/api/v1/data-collections/4/files/9' },
      { method: 'DELETE', path: '/api/v1/data-files/9' },
      { method: 'GET', path: '/api/v1/data-files/9/versions' },
      { method: 'GET', path: '/api/v1/data-file-versions/7' },
      { method: 'GET', path: '/api/v1/data-file-versions/7/preview', body: { max_rows: 25 } },
      {
        method: 'POST',
        path: '/api/v1/data-file-versions/7/views',
        body: { view_kind: 'table', mapping: { selected_columns: ['flow'] } },
      },
      { method: 'GET', path: '/api/v1/data-views/31' },
    ]);
  });

  it('omits the collection binding when uploading an unassigned file', () => {
    let submitted: FormData | undefined;
    TestBed.configureTestingModule({
      providers: [
        DataFileService,
        {
          provide: ApiClient,
          useValue: {
            post: (_path: string, body: FormData) => {
              submitted = body;
              return of({});
            },
          },
        },
      ],
    });
    const service = TestBed.inject(DataFileService);
    const file = new File(['a,b'], 'orphan.csv', { type: 'text/csv' });

    service.uploadFile(null, file).subscribe();

    expect(submitted?.has('collection_id')).toBe(false);
    expect((submitted?.get('file') as File | null)?.name).toBe('orphan.csv');
  });
});
