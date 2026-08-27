import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataFileInputNodeComponent } from './data-file-input-node.component';
import { NodeRendererRegistry } from './node-renderer-registry';

describe('DataFileInputNodeComponent', () => {
  let fixture: ComponentFixture<DataFileInputNodeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DataFileInputNodeComponent] });
    fixture = TestBed.createComponent(DataFileInputNodeComponent);
  });

  it('renders injected file metadata without making a request', () => {
    fixture.componentRef.setInput('data', {
      label: '数据文件',
      fileName: 'flow.csv',
      version: 'v2',
      outputMode: 'timeseries',
      columnSummary: 'time → flow',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('flow.csv');
    expect(fixture.nativeElement.textContent).toContain('timeseries');
    expect(fixture.nativeElement.querySelector('[data-testid="node"]')).not.toBeNull();
  });

  it('filters output socket to single port based on outputMode', () => {
    fixture.componentRef.setInput('data', {
      outputMode: 'timeseries',
      outputs: {
        table: { label: '表格', socket: {} },
        series: { label: '时序', socket: {} },
      },
    });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const outputs = component.getOutputs();
    expect(outputs.length).toBe(1);
    expect(outputs[0].key).toBe('series');

    fixture.componentRef.setInput('data', {
      outputMode: 'table',
      outputs: {
        table: { label: '表格', socket: {} },
        series: { label: '时序', socket: {} },
      },
    });
    fixture.detectChanges();
    const tableOutputs = component.getOutputs();
    expect(tableOutputs.length).toBe(1);
    expect(tableOutputs[0].key).toBe('table');
  });

  it('renders table preview when outputMode is table and sample data exists', () => {
    fixture.componentRef.setInput('data', {
      fileName: 'test.csv',
      outputMode: 'table',
      data: {
        selectedColumns: ['colA', 'colB'],
        sampleRows: [{ colA: '1', colB: '2' }],
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.table-preview')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('colA');
  });

  it('renders ECharts timeseries preview when outputMode is timeseries', () => {
    fixture.componentRef.setInput('data', {
      fileName: 'stream.csv',
      outputMode: 'timeseries',
      data: {
        valueColumn: 'pressure',
        timeColumn: 'record_time',
        sampleRows: [
          { record_time: '2026-01-01T00:00:00Z', pressure: 10 },
          { record_time: '2026-01-01T00:15:00Z', pressure: 20 },
        ],
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.series-preview')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.chart-host')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.resize-handle')).not.toBeNull();
  });

  it('uses the dedicated renderer while unknown keys fall back to generic rendering', () => {
    const registry = TestBed.inject(NodeRendererRegistry);
    expect(registry.resolve('data-file-input')).toBe(DataFileInputNodeComponent);
    expect(registry.resolve('unknown-node')).toBeNull();
  });
});
