import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { DataFileService } from '../../core/services/data-file.service';
import { NotificationService } from '../../core/services/notification.service';
import { DataCollectionsPage } from './data-collections.page';

describe('DataCollectionsPage', () => {
  let createView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createView = vi.fn(() => of({ id: 1 }));
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
            createView,
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
});
