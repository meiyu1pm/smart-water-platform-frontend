import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { DataFileService } from '../../core/services/data-file.service';
import { DataFileInspectorDialogComponent } from './data-file-inspector-dialog.component';

describe('DataFileInspectorDialogComponent', () => {
  it('shows version quality and submits a governance plan without DataView controls', () => {
    const runGovernance = vi.fn(() =>
      of({
        request_id: 'request-1',
        task_id: 'task-1',
        status: 'queued',
        parent_version_id: 3,
        make_current: true,
      }),
    );
    TestBed.configureTestingModule({
      imports: [DataFileInspectorDialogComponent],
      providers: [
        { provide: AuthService, useValue: { hasPermission: () => true } },
        {
          provide: DataFileService,
          useValue: {
            listFileVersions: () =>
              of([
                {
                  id: 3,
                  file_id: 7,
                  version_no: 1,
                  version_code: 'file_v1',
                  status: 'ready',
                  sha256: 'hash',
                  size_bytes: 12,
                  row_count: 8,
                  profile_status: 'ready',
                  quality_score: 96.4,
                  quality_grade: 'A',
                  created_at: '2026-09-03T00:00:00Z',
                },
              ]),
            getPreview: () =>
              of({
                file_version_id: 3,
                columns: [],
                rows: [],
                total_rows: 0,
                truncated: false,
                preview_limit: 50,
              }),
            getFileLineage: () =>
              of({ file_id: 7, current_version_id: 3, roots: [3], nodes: [], edges: [] }),
            listQualityReports: () =>
              of([
                {
                  report_id: 1,
                  version_id: 3,
                  report_kind: 'profile',
                  score: 96.4,
                  grade: 'A',
                  dimensions: { completeness: 98 },
                  findings: [],
                  recommendations: ['统一时间戳'],
                  created_at: '2026-09-03T00:00:00Z',
                },
              ]),
            runGovernance,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DataFileInspectorDialogComponent);
    fixture.componentRef.setInput('file', {
      id: 7,
      name: 'flow.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'ready',
      version_count: 1,
      current_version_id: 3,
      profile_status: 'ready',
      size_bytes: 12,
      created_at: '',
      updated_at: '',
    });
    fixture.detectChanges();

    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('质量报告'))?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('96.4 分');
    expect(fixture.nativeElement.textContent).toContain('完整性');

    buttons.find((button) => button.textContent?.includes('数据治理'))?.click();
    fixture.detectChanges();
    const governanceCheckbox = fixture.nativeElement.querySelector(
      '.governance-options input',
    ) as HTMLInputElement;
    governanceCheckbox.click();
    fixture.detectChanges();
    const start = (
      [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]
    ).find((button) => button.textContent?.includes('开始治理'));
    start?.click();
    expect(runGovernance).toHaveBeenCalledWith(
      3,
      [expect.objectContaining({ type: 'deduplicate' })],
      true,
    );
    expect(fixture.nativeElement.querySelector('.mode-switch')).toBeNull();
  });

  it('keeps governance and current-version writes hidden without data-file write permission', () => {
    const setCurrentVersion = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      imports: [DataFileInspectorDialogComponent],
      providers: [
        { provide: AuthService, useValue: { hasPermission: () => false } },
        {
          provide: DataFileService,
          useValue: {
            listFileVersions: () =>
              of([
                { id: 4, file_id: 7, version_no: 2, profile_status: 'ready' },
                { id: 3, file_id: 7, version_no: 1, profile_status: 'ready' },
              ]),
            getPreview: () =>
              of({ columns: [], rows: [], total_rows: 0, truncated: false, preview_limit: 50 }),
            getFileLineage: () =>
              of({ file_id: 7, current_version_id: 4, roots: [3], nodes: [], edges: [] }),
            setCurrentVersion,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(DataFileInspectorDialogComponent);
    fixture.componentRef.setInput('file', {
      id: 7,
      name: 'flow.csv',
      file_kind: 'table',
      format: 'csv',
      status: 'ready',
      version_count: 2,
      current_version_id: 4,
      profile_status: 'ready',
      size_bytes: 12,
      created_at: '',
      updated_at: '',
    });
    fixture.detectChanges();
    fixture.componentInstance.selectVersion(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('数据治理');
    expect(fixture.componentInstance.canManageVersions()).toBe(false);
    fixture.componentInstance.makeSelectedCurrent();
    expect(setCurrentVersion).not.toHaveBeenCalled();
  });
});
