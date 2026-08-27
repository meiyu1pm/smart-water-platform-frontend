import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { DataFileService } from '../../core/services/data-file.service';
import { DataFilePreviewPanelComponent } from './data-file-preview-panel.component';

describe('DataFilePreviewPanelComponent', () => {
  const preview = {
    file_version_id: 1,
    columns: [
      { name: 'time', inferred_type: 'datetime', nullable: false, sample_values: [], warnings: [] },
      { name: 'flow', inferred_type: 'number', nullable: false, sample_values: [], warnings: [] },
    ],
    rows: [{ time: '2026-08-26T00:00:00Z', flow: 12 }],
    total_rows: 1,
    truncated: false,
    preview_limit: 50,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DataFilePreviewPanelComponent],
      providers: [
        provideNoopAnimations(),
        { provide: DataFileService, useValue: { getPreview: () => of(preview) } },
      ],
    });
  });

  it('loads a bounded preview and emits a table view', () => {
    const fixture = TestBed.createComponent(DataFilePreviewPanelComponent);
    fixture.componentRef.setInput('fileVersionId', 1);
    const emitted: unknown[] = [];
    fixture.componentInstance.viewChange.subscribe((value) => emitted.push(value));
    fixture.detectChanges();

    expect(fixture.componentInstance.preview()?.rows).toHaveLength(1);
    fixture.componentInstance.selectColumn('flow');
    fixture.componentInstance.apply();
    expect(emitted).toEqual([
      { file_version_id: 1, output_mode: 'table', selected_columns: ['time'] },
    ]);
  });

  it('requires both time and value columns for timeseries output', () => {
    const fixture = TestBed.createComponent(DataFilePreviewPanelComponent);
    fixture.componentRef.setInput('fileVersionId', 1);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.setMode('timeseries');
    component.activeRole.set('time');
    component.selectColumn('time');
    expect(component.canApply()).toBe(false);
    component.activeRole.set('value');
    component.selectColumn('flow');
    expect(component.canApply()).toBe(true);
  });

  it('does not request or apply a view before asynchronous profiling is ready', () => {
    const getPreview = vi.fn(() => of(preview));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DataFilePreviewPanelComponent],
      providers: [{ provide: DataFileService, useValue: { getPreview } }],
    });
    const fixture = TestBed.createComponent(DataFilePreviewPanelComponent);
    fixture.componentRef.setInput('fileVersionId', 1);
    fixture.componentRef.setInput('profileStatus', 'pending');
    fixture.detectChanges();
    expect(getPreview).not.toHaveBeenCalled();
    expect(fixture.componentInstance.canApply()).toBe(false);
    expect(fixture.componentInstance.profileStateMessage()).toContain('正在解析');
  });

  it('disables view creation without data-view permission', () => {
    const fixture = TestBed.createComponent(DataFilePreviewPanelComponent);
    fixture.componentRef.setInput('fileVersionId', 1);
    fixture.componentRef.setInput('canCreateView', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.canApply()).toBe(false);
  });

  it('echoes existing binding correctly and emits previewLoaded', () => {
    const fixture = TestBed.createComponent(DataFilePreviewPanelComponent);
    fixture.componentRef.setInput('fileVersionId', 1);
    fixture.componentRef.setInput('initialBinding', {
      output_mode: 'timeseries',
      time_column: 'time',
      value_column: 'flow',
    });
    let loadedEvent: any = null;
    fixture.componentInstance.previewLoaded.subscribe((e) => (loadedEvent = e));
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.outputMode()).toBe('timeseries');
    expect(comp.timeColumn()).toBe('time');
    expect(comp.valueColumn()).toBe('flow');
    expect(loadedEvent).not.toBeNull();
    expect(loadedEvent.sampleRows.length).toBe(1);
  });
});
