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
  });

  it('uses the dedicated renderer while unknown keys fall back to generic rendering', () => {
    const registry = TestBed.inject(NodeRendererRegistry);
    expect(registry.resolve('data-file-input')).toBe(DataFileInputNodeComponent);
    expect(registry.resolve('unknown-node')).toBeNull();
  });
});
