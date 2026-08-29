import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { DataFileService } from '../../core/services/data-file.service';
import { ApiClient } from '../../core/services/api-client.service';
import { QuickTrialService } from './quick-trial.service';

describe('QuickTrialService', () => {
  it('uploads quick-trial files without choosing or mutating a collection', () => {
    const file = new File(['时间,流量\n2024-01-01 00:00:00,1'], 'trial.csv');
    const uploadUnassignedFile = vi.fn().mockReturnValue(
      of({ file: { id: 7, name: 'trial.csv' }, version: { id: 11 } }),
    );
    const getPreview = vi.fn().mockReturnValue(
      of({ file_version_id: 11, columns: [], rows: [], total_rows: 1, truncated: false, preview_limit: 50 }),
    );
    const listCollections = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        QuickTrialService,
        { provide: ApiClient, useValue: {} },
        {
          provide: DataFileService,
          useValue: { uploadUnassignedFile, getPreview, listCollections },
        },
      ],
    });

    const service = TestBed.inject(QuickTrialService);
    let result: { collectionId: number | null; versionId: number } | undefined;
    service.uploadTemporaryFile(file).subscribe((value) => {
      result = value;
    });

    expect(uploadUnassignedFile).toHaveBeenCalledWith(file, 'trial.csv');
    expect(listCollections).not.toHaveBeenCalled();
    expect(result).toMatchObject({ collectionId: null, versionId: 11 });
  });

  it('archives the temporary file even when it has no collection id', () => {
    const deleteFile = vi.fn().mockReturnValue(of({ file_id: 7, status: 'trashed' }));
    TestBed.configureTestingModule({
      providers: [
        QuickTrialService,
        { provide: ApiClient, useValue: {} },
        { provide: DataFileService, useValue: { deleteFile } },
      ],
    });

    TestBed.inject(QuickTrialService).cleanupTemporaryFile(null, 7).subscribe();

    expect(deleteFile).toHaveBeenCalledWith(7);
  });
});
