import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DataFileService } from '../../core/services/data-file.service';
import { DataFilePreviewDialogComponent } from './data-file-preview-dialog.component';

describe('DataFilePreviewDialogComponent', () => {
  it('requests at most 50 rows and renders metadata without mapping controls', () => {
    const getPreview = vi.fn(() =>
      of({
        file_version_id: 3,
        columns: [
          {
            name: 'time',
            inferred_type: 'datetime',
            nullable: false,
            sample_values: [],
            warnings: [],
          },
        ],
        rows: [{ time: '2026-08-29' }],
        total_rows: 80,
        truncated: true,
        preview_limit: 50,
      }),
    );
    TestBed.configureTestingModule({
      imports: [DataFilePreviewDialogComponent],
      providers: [{ provide: DataFileService, useValue: { getPreview } }],
    });
    const fixture = TestBed.createComponent(DataFilePreviewDialogComponent);
    fixture.componentRef.setInput('file', {
      id: 7,
      name: 'flow.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'ready',
      version_count: 1,
      current_version_id: 3,
      size_bytes: 1024,
      created_at: '',
      updated_at: '',
    });
    fixture.detectChanges();
    expect(getPreview).toHaveBeenCalledWith(3, 50);
    expect(fixture.nativeElement.textContent).toContain('flow.csv');
    expect(fixture.nativeElement.textContent).toContain('仅显示前 50 行');
    expect(fixture.nativeElement.querySelector('.mode-switch')).toBeNull();
  });

  it('emits close when the close button is pressed', () => {
    TestBed.configureTestingModule({
      imports: [DataFilePreviewDialogComponent],
      providers: [{ provide: DataFileService, useValue: { getPreview: () => of(null) } }],
    });
    const fixture = TestBed.createComponent(DataFilePreviewDialogComponent);
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.close').click();
    expect(closed).toHaveBeenCalledOnce();
  });
});
