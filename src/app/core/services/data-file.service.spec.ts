import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ApiClient } from './api-client.service';
import { DataFileService } from './data-file.service';

describe('DataFileService', () => {
  it('uses the additive collection and bounded preview endpoints', () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    TestBed.configureTestingModule({
      providers: [
        DataFileService,
        {
          provide: ApiClient,
          useValue: {
            get: (path: string) => {
              calls.push({ method: 'GET', path });
              return of([]);
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
    service.listCollections().subscribe();
    service.listFiles(4).subscribe();
    service.listFileVersions(9).subscribe();
    service.getPreview(7, 25).subscribe();
    service
      .createView(7, {
        file_version_id: 7,
        output_mode: 'table',
        selected_columns: ['flow'],
      })
      .subscribe();
    service.getView(31).subscribe();

    expect(calls).toEqual([
      { method: 'GET', path: '/api/v1/data-collections' },
      { method: 'GET', path: '/api/v1/data-collections/4/files' },
      { method: 'GET', path: '/api/v1/data-files/9/versions' },
      { method: 'GET', path: '/api/v1/data-file-versions/7/preview' },
      {
        method: 'POST',
        path: '/api/v1/data-file-versions/7/views',
        body: { file_version_id: 7, output_mode: 'table', selected_columns: ['flow'] },
      },
      { method: 'GET', path: '/api/v1/data-views/31' },
    ]);
  });
});
