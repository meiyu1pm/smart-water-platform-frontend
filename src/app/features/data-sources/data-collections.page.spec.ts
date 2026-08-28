import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { DataFileService } from '../../core/services/data-file.service';
import { NotificationService } from '../../core/services/notification.service';
import { DataCollectionsPage } from './data-collections.page';

describe('DataCollectionsPage', () => {
  let createView: ReturnType<typeof vi.fn>;
  let deleteCollection: ReturnType<typeof vi.fn>;
  let removeFileFromCollection: ReturnType<typeof vi.fn>;
  let deleteFile: ReturnType<typeof vi.fn>;
  let uploadFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createView = vi.fn(() => of({ id: 1 }));
    deleteCollection = vi.fn(() => of({ collection_id: 1, status: 'trashed' }));
    removeFileFromCollection = vi.fn(() => of({ collection_id: 1, file_id: 2, removed: true }));
    deleteFile = vi.fn(() => of({ file_id: 7, status: 'trashed' }));
    uploadFile = vi.fn(() => of({ task_id: null }));
    TestBed.configureTestingModule({
      imports: [DataCollectionsPage],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        {
          provide: NotificationService,
          useValue: { success: () => undefined, error: () => undefined },
        },
        {
          provide: DataFileService,
          useValue: {
            listCollections: () =>
              of([
                {
                  id: 1,
                  name: 'DMA 数据',
                  description: '流量资料',
                  item_count: 2,
                  file_count: 2,
                  storage_bytes: 1024,
                  parse_issue_count: 0,
                  created_at: '',
                  updated_at: '',
                },
              ]),
            listFiles: () => of([]),
            listUnassignedFiles: () => of([]),
            createView,
            deleteCollection,
            removeFileFromCollection,
            deleteFile,
            uploadFile,
          },
        },
      ],
    });
  });

  it('loads collections and filters by name', () => {
    const fixture = TestBed.createComponent(DataCollectionsPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(page.collections()).toHaveLength(1);
    page.search.set('dma');
    expect(page.filteredCollections()).toHaveLength(1);
    page.search.set('不存在');
    expect(page.filteredCollections()).toHaveLength(0);
  });

  it('persists an applied column mapping as an immutable data view', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;

    page.onViewChange({
      file_version_id: 7,
      output_mode: 'timeseries',
      time_column: 'time',
      value_column: 'flow',
      point_column: 'point',
    });

    expect(createView).toHaveBeenCalledWith(7, {
      view_kind: 'timeseries',
      mapping: { time_column: 'time', value_column: 'flow', point_column: 'point' },
    });
  });

  it('requires confirmation and archives a collection without deleting its files directly', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const collection = page.collections()[0];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    page.deleteCollection(collection);

    expect(confirm).toHaveBeenCalledWith('确定删除数据集“DMA 数据”？数据集将移入回收站。');
    expect(deleteCollection).toHaveBeenCalledWith(1);
    expect(page.collections()).toHaveLength(1); // refresh is asynchronous in the mock
  });

  it('removes only the collection membership and clears an open preview', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const file = {
      id: 2,
      collection_id: 1,
      name: 'flow.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'active',
      version_count: 1,
      current_version_id: 3,
      size_bytes: 10,
      parse_issue_count: 0,
      created_at: '',
      updated_at: '',
    };
    page.filesByCollection.set(new Map([[1, [file]]]));
    page.selectedFile.set(file);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    page.removeFile(page.collections()[0], file);

    expect(confirm).toHaveBeenCalledWith(
      '确定将“flow.csv”移出数据集“DMA 数据”？原文件不会被删除。',
    );
    expect(removeFileFromCollection).toHaveBeenCalledWith(1, 2);
    expect(page.selectedFile()).toBeNull();
  });

  it('uploads a file without a collection and can archive it from the unassigned panel', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const file = {
      id: 7,
      name: 'orphan.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'active',
      version_count: 1,
      current_version_id: 8,
      size_bytes: 10,
      profile_status: 'ready',
      created_at: '',
      updated_at: '',
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    page.unassignedFiles.set([file]);

    page.uploadFile(null, {
      target: { files: [new File(['a,b'], 'orphan.csv')] },
    } as unknown as Event);
    page.deleteUnassignedFile(file);

    expect(uploadFile).toHaveBeenCalledWith(null, expect.any(File));
    expect(deleteFile).toHaveBeenCalledWith(7);
    expect(confirm).toHaveBeenCalledWith('确定删除无归属文件“orphan.csv”？文件将移入回收站。');
  });
});
