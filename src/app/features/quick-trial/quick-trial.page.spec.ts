import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { QuickTrialPage } from './quick-trial.page';
import { QuickTrialService } from './quick-trial.service';
import { DataFileService } from '../../core/services/data-file.service';
import { AuthService } from '../../core/services/auth.service';
import { LoginDialogService } from '../login/login-dialog.component';

describe('QuickTrialPage', () => {
  let component: QuickTrialPage;
  let fixture: ComponentFixture<QuickTrialPage>;
  let quickTrialSpy: any;
  let dataFileSpy: any;

  beforeEach(async () => {
    quickTrialSpy = {
      availableScenarios: [
        {
          id: 'timeseries-forecast',
          name: '时序预测',
          icon: '📈',
          description: '测试时序预测',
          defaultAlgorithm: 'auto',
          algorithms: [{ id: 'auto', name: 'auto（智能推荐）' }],
          demoFileName: 's01_leak_demo.csv',
          timeColumn: 'record_time',
          valueColumn: 'inlet_flow',
        },
      ],
      algorithmsForTask: vi.fn().mockReturnValue([{ id: 'auto', name: 'auto（智能推荐）' }]),
      parseTimeSeriesPoints: vi.fn().mockReturnValue([
        { time: '2026-01-01 00:00:00', value: 21.2 },
        { time: '2026-01-01 00:15:00', value: 21.8 },
      ]),
      uploadTemporaryFile: vi.fn(),
      cleanupTemporaryFile: vi.fn().mockReturnValue(of(true)),
      executeQuickForecast: vi.fn().mockReturnValue(
        of({
          kind: 'forecast',
          task: '时序预测',
          algorithm: 'auto',
          fileName: 's01_leak_demo.csv',
          timeColumn: 'record_time',
          valueColumn: 'inlet_flow',
          historyPoints: [{ time: '2026-01-01 00:00:00', value: 21.2 }],
          forecastPoints: [{ time: '2026-01-01 00:15:00', value: 22.0 }],
          lowerBand: [{ time: '2026-01-01 00:15:00', value: 20.5 }],
          upperBand: [{ time: '2026-01-01 00:15:00', value: 23.5 }],
          horizonSteps: 32,
          intervalMinutes: 15,
          seasonalitySteps: 24,
          confidence: 0.95,
          workflowId: 42,
        }),
      ),
      executeEphemeralWorkflow: vi.fn().mockReturnValue(
        of({
          kind: 'forecast',
          task: '时序预测',
          algorithm: 'Auto (Seasonal Naive)',
          fileName: 's01_leak_demo.csv',
          timeColumn: 'record_time',
          valueColumn: 'inlet_flow',
          historyPoints: [{ time: '2026-01-01 00:00:00', value: 21.2 }],
          forecastPoints: [{ time: '2026-01-01 00:15:00', value: 22.0 }],
          lowerBand: [{ time: '2026-01-01 00:15:00', value: 20.5 }],
          upperBand: [{ time: '2026-01-01 00:15:00', value: 23.5 }],
          horizonSteps: 32,
          intervalMinutes: 15,
          seasonalitySteps: 96,
          confidence: 0.95,
          workflowId: 42,
        }),
      ),
    };

    dataFileSpy = {
      listCollections: vi.fn().mockReturnValue(of([])),
      listFiles: vi.fn().mockReturnValue(of([])),
      getPublicQuickTrialDemo: vi.fn().mockReturnValue(
        of({
          file: {
            id: 9,
            name: '示例小区_2024-01.csv',
            file_kind: 'demo',
            format: 'csv',
            status: 'active',
            version_count: 1,
            current_version_id: 3,
            size_bytes: 10,
            created_at: '',
            updated_at: '',
          },
          version: { id: 3 },
          preview: {
            file_format: 'csv',
            schema: [
              {
                name: 'record_time',
                inferred_type: 'datetime',
                nullable: false,
                sample_values: [],
                warnings: [],
              },
              {
                name: 'inlet_flow',
                inferred_type: 'number',
                nullable: false,
                sample_values: [],
                warnings: [],
              },
            ],
            sample_rows: [
              { record_time: '2026-01-01 00:00:00', inlet_flow: 21.2 },
              { record_time: '2026-01-01 00:15:00', inlet_flow: 21.8 },
            ],
            truncated: false,
            row_count: 50,
          },
          content_url: '/api/v1/public/quick-trial/demo-file/content',
        }),
      ),
      downloadPublicQuickTrialDemo: vi
        .fn()
        .mockReturnValue(of(new Blob(['record_time,inlet_flow\n2026-01-01 00:00:00,21.2\n']))),
      getPreview: vi.fn().mockReturnValue(
        of({
          file_version_id: 3,
          columns: [
            { name: 'record_time', inferred_type: 'datetime', non_null_count: 50, null_count: 0 },
            { name: 'inlet_flow', inferred_type: 'number', non_null_count: 50, null_count: 0 },
          ],
          rows: [
            { record_time: '2026-01-01 00:00:00', inlet_flow: 21.2 },
            { record_time: '2026-01-01 00:15:00', inlet_flow: 21.8 },
          ],
          total_rows: 50,
          truncated: false,
          preview_limit: 50,
        }),
      ),
      downloadFileVersion: vi
        .fn()
        .mockReturnValue(
          of(
            new Blob([
              'record_time,inlet_flow\n2026-01-01 00:00:00,21.2\n2026-01-01 00:15:00,21.8\n',
            ]),
          ),
        ),
    };

    await TestBed.configureTestingModule({
      imports: [QuickTrialPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: QuickTrialService, useValue: quickTrialSpy },
        { provide: DataFileService, useValue: dataFileSpy },
        { provide: AuthService, useValue: { isAuthenticated: () => true } },
        {
          provide: LoginDialogService,
          useValue: { requireLogin: vi.fn().mockReturnValue(of(true)) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickTrialPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes with default task timeseries-forecast and auto algorithm', () => {
    expect(component.selectedTaskId()).toBe('timeseries-forecast');
    expect(component.selectedAlgorithm()).toBe('auto');
    expect(fixture.nativeElement.textContent).toContain('智慧水务');
    expect(fixture.nativeElement.textContent).toContain('时序预测');
  });

  it('loads platform demo metadata, preview, and content through the public facade', () => {
    expect(dataFileSpy.getPublicQuickTrialDemo).toHaveBeenCalledOnce();
    expect(dataFileSpy.downloadPublicQuickTrialDemo).toHaveBeenCalledWith(
      '/api/v1/public/quick-trial/demo-file/content',
    );
    expect(component.demoSampleRows()).toHaveLength(2);
  });

  it('toggles the data drawer while keeping demo preview public', () => {
    expect(component.drawerOpen()).toBe(false);
    component.toggleDataDrawer();
    expect(component.drawerOpen()).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.data-drawer-panel')).not.toBeNull();
    expect(component.demoSampleRows()).toHaveLength(2);
  });

  it('updates selected columns and allows tuning horizon steps', () => {
    component.onViewSelectionChange({
      file_version_id: 3,
      output_mode: 'timeseries',
      time_column: '时间',
      value_column: '流量(m³/h)',
    });
    expect(component.selectedTimeCol()).toBe('时间');
    expect(component.selectedValueCol()).toBe('流量(m³/h)');

    component.setHorizonSteps(96);
    expect(component.horizonSteps()).toBe(96);
    expect(component.dataInputDisplay()).toContain('预测 96点');
  });

  it('clamps Chronos-2 horizon to the backend-supported maximum', () => {
    component.setHorizonSteps(192);
    expect(component.horizonSteps()).toBe(192);

    component.onAlgorithmChange('chronos2');
    expect(component.maxHorizonSteps()).toBe(96);
    expect(component.horizonSteps()).toBe(96);
  });

  it('executes quick forecast with configured horizon and renders metrics strip', async () => {
    vi.useFakeTimers();
    component.runQuickTrial();

    vi.advanceTimersByTime(100);
    fixture.detectChanges();

    expect(component.running()).toBe(false);
    expect(component.result()).not.toBeNull();
    expect(component.result()?.algorithm).toContain('Seasonal Naive');
    expect(component.result()?.workflowId).toBe(42);
    expect(fixture.nativeElement.querySelector('.result-dashboard')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('时序预测 结果');
    vi.useRealTimers();
  });

  it('resumes the requested run exactly once after contextual login', () => {
    const authenticated = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    (TestBed.inject(AuthService) as unknown as { isAuthenticated: () => boolean }).isAuthenticated =
      authenticated;

    component.runQuickTrial();

    expect(TestBed.inject(LoginDialogService).requireLogin).toHaveBeenCalledOnce();
    expect(quickTrialSpy.executeEphemeralWorkflow).toHaveBeenCalledOnce();
  });
});
