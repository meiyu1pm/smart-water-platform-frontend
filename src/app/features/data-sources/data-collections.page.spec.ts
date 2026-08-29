import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of } from 'rxjs';

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
  let copyFiles: ReturnType<typeof vi.fn>;
  let successMessages: string[];

  beforeEach(() => {
    createView = vi.fn(() => of({ id: 1 }));
    deleteCollection = vi.fn(() => of({ collection_id: 1, status: 'trashed' }));
    removeFileFromCollection = vi.fn(() => of({ collection_id: 1, file_id: 2, removed: true }));
    deleteFile = vi.fn(() => of({ file_id: 7, status: 'trashed' }));
    uploadFile = vi.fn(() => of({ task_id: null }));
    copyFiles = vi.fn(() => of({ status: 'queued', task_id: 'copy-task-1' }));
    successMessages = [];
    TestBed.configureTestingModule({
      imports: [DataCollectionsPage],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: { hasPermission: () => true } },
        {
          provide: NotificationService,
          useValue: {
            success: (message: string) => successMessages.push(message),
            error: () => undefined,
          },
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
            copyFiles,
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

  it('maps only folder entries at root and keeps the paginated items page', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const applyExplorer = (
      page as unknown as {
        applyExplorer: (response: unknown, parentId: number | null) => void;
      }
    ).applyExplorer;
    const folder = {
      id: 4,
      name: '压力数据',
      file_count: 6,
      storage_bytes: 20,
      parse_issue_count: 0,
      description: null,
      created_at: '',
      updated_at: '',
      can_delete: true,
      kind: 'collection',
    };
    const file = {
      id: 11,
      name: 'page-1.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'ready',
      version_count: 1,
      current_version_id: 3,
      size_bytes: 10,
      created_at: '',
      updated_at: '',
      can_move: true,
      can_copy: true,
      can_delete: true,
    };
    applyExplorer.call(page, { items: [folder, file], folders: [folder], files: [file] }, null);
    expect(page.explorerItems().every((entry) => page.isFolder(entry))).toBe(true);
    expect(page.explorerItems().some((entry) => entry.name === 'page-1.csv')).toBe(false);
    expect(page.rootFolders()[0].file_count).toBe(6);

    applyExplorer.call(
      page,
      {
        items: [file],
        files: [file, { ...file, id: 12, name: 'unpaged-extra.csv' }],
      },
      4,
    );
    expect(page.explorerItems().map((entry) => entry.name)).toEqual(['page-1.csv']);
  });

  it('queries the current directory and ignores an older explorer response', () => {
    const firstResponse$ = new Subject<any>();
    const searchResponse$ = new Subject<any>();
    const listExplorer = vi
      .fn()
      .mockReturnValueOnce(firstResponse$)
      .mockReturnValueOnce(searchResponse$);
    TestBed.overrideProvider(DataFileService, { useValue: { listExplorer } });

    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    page.currentParentId.set(4);
    page.searchChanged('flow');
    expect(listExplorer).toHaveBeenNthCalledWith(
      2,
      4,
      undefined,
      expect.objectContaining({ query: 'flow', page: 1, page_size: 50 }),
    );

    searchResponse$.next({
      items: [{ id: 2, name: 'flow.csv', kind: 'file' }],
      pagination: { page: 1, total: 51, page_size: 50 },
    });
    expect(page.explorerItems().map((entry) => entry.name)).toEqual(['flow.csv']);
    expect(page.total()).toBe(51);
    expect(page.totalPages()).toBe(2);

    firstResponse$.next({ items: [{ id: 99, name: 'stale.csv', kind: 'file' }] });
    expect(page.explorerItems().map((entry) => entry.name)).toEqual(['flow.csv']);
  });

  it('reports a queued deep-copy task instead of claiming the copy completed', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const file = {
      id: 7,
      name: 'demo.csv',
      file_kind: 'demo',
      format: 'csv',
      status: 'ready',
      version_count: 1,
      current_version_id: 3,
      size_bytes: 10,
      created_at: '',
      updated_at: '',
      can_copy: true,
    };
    page.explorerItems.set([{ id: 7, name: 'demo.csv', kind: 'file', file }]);
    page.selectedIds.set(new Set([7]));
    (
      page as unknown as {
        performAction: (ids: number[], target: number | null, copy: boolean) => void;
      }
    ).performAction([7], 1, true);
    expect(copyFiles).toHaveBeenCalledWith([7], 1);
    expect(successMessages.at(-1)).toContain('复制任务已排队，稍后刷新查看副本');
    expect(successMessages.at(-1)).toContain('copy-task-1');
  });

  it('does not paste into the root and closes transient UI before selection', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    page.clipboard.set([7]);
    page.currentParentId.set(null);
    expect(() => page.pasteIntoCurrent()).not.toThrow();

    page.selectedIds.set(new Set([7]));
    page.menu.set({ x: 0, y: 0, entry: null });
    page.handleKeyboard(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(page.menu()).toBeNull();
    expect(page.selectedIds().size).toBe(1);

    page.previewFile.set({
      id: 7,
      name: 'flow.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'ready',
      version_count: 1,
      current_version_id: null,
      size_bytes: 0,
      created_at: '',
      updated_at: '',
    });
    page.handleKeyboard(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(page.previewFile()).toBeNull();
    expect(page.selectedIds().size).toBe(1);
    page.handleKeyboard(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(page.selectedIds().size).toBe(0);
  });

  it('labels a drag preview with the selected file count and copy mode', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const file = {
      id: 7,
      name: 'flow.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'ready',
      version_count: 1,
      current_version_id: null,
      size_bytes: 1,
      created_at: '',
      updated_at: '',
    };
    const secondFile = { ...file, id: 8, name: 'pressure.csv' };
    page.explorerItems.set([
      { id: 7, name: file.name, kind: 'file', file },
      { id: 8, name: secondFile.name, kind: 'file', file: secondFile },
    ]);
    page.selectedIds.set(new Set([7, 8]));
    const state = page as unknown as { dragCopyModifier: boolean };
    state.dragCopyModifier = false;
    expect(page.dragPreviewLabel(page.explorerItems()[0])).toBe('移动 2 个文件');
    state.dragCopyModifier = true;
    expect(page.dragPreviewLabel(page.explorerItems()[0])).toBe('复制 2 个文件');
    page.selectedIds.set(new Set([8]));
    state.dragCopyModifier = false;
    expect(page.dragPreviewLabel(page.explorerItems()[0])).toBe('移动 1 个文件');
  });

  it('opens exactly one selected file or folder with Enter, excluding form fields', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const file = { id: 7, name: 'flow.csv', kind: 'file' } as any;
    const folder = { id: 4, name: '压力数据', kind: 'folder' } as any;
    page.explorerItems.set([file, folder]);
    const activate = vi.spyOn(page, 'activateEntry').mockImplementation(() => undefined);

    page.selectedIds.set(new Set([7]));
    page.handleKeyboard(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(activate).toHaveBeenCalledWith(file);

    activate.mockClear();
    page.selectedIds.set(new Set([4]));
    page.handleKeyboard(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(activate).toHaveBeenCalledWith(folder);

    activate.mockClear();
    page.selectedIds.set(new Set([7, 4]));
    page.handleKeyboard(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(activate).not.toHaveBeenCalled();

    const inputEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(inputEvent, 'target', { value: document.createElement('input') });
    page.selectedIds.set(new Set([7]));
    page.handleKeyboard(inputEvent);
    expect(activate).not.toHaveBeenCalled();
  });

  it('targets a folder when pasting from its context menu', () => {
    const page = TestBed.createComponent(DataCollectionsPage).componentInstance;
    const performAction = vi
      .spyOn(page as any, 'performAction')
      .mockImplementation(() => undefined);
    page.clipboard.set([7, 8]);
    page.pasteIntoEntry({ id: 4, name: 'DMA', kind: 'folder' });
    expect(performAction).toHaveBeenCalledWith([7, 8], 4, true);
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
