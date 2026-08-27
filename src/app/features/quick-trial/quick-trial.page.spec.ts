import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { QuickTrialPage } from './quick-trial.page';
import { QuickTrialService } from './quick-trial.service';
import { DataFileService } from '../../core/services/data-file.service';

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
          demoFileName: 's01_leak_demo.csv',
          timeColumn: 'record_time',
          valueColumn: 'inlet_flow',
        },
      ],
      uploadTemporaryFile: vi.fn(),
      cleanupTemporaryFile: vi.fn().mockReturnValue(of(true)),
      executeQuickForecast: vi.fn().mockReturnValue(
        of({
          task: '时序预测',
          algorithm: 'auto',
          fileName: 's01_leak_demo.csv',
          timeColumn: 'record_time',
          valueColumn: 'inlet_flow',
          historyPoints: [{ time: '2026-01-01T00:00:00Z', value: 21.2 }],
          forecastPoints: [{ time: '2026-01-01T00:15:00Z', value: 22.0 }],
          lowerBand: [{ time: '2026-01-01T00:15:00Z', value: 20.5 }],
          upperBand: [{ time: '2026-01-01T00:15:00Z', value: 23.5 }],
          horizonSteps: 32,
          intervalMinutes: 15,
          seasonalitySteps: 24,
          confidence: 0.95,
        }),
      ),
    };

    dataFileSpy = {
      listCollections: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [QuickTrialPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: QuickTrialService, useValue: quickTrialSpy },
        { provide: DataFileService, useValue: dataFileSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickTrialPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes with default task timeseries-forecast and auto algorithm', () => {
    expect(component.selectedTaskId()).toBe('timeseries-forecast');
    expect(component.selectedAlgorithm()).toBe('auto');
    expect(fixture.nativeElement.textContent).toContain('智能水务');
    expect(fixture.nativeElement.textContent).toContain('时序预测');
  });

  it('toggles data selection drawer when clicked', () => {
    expect(component.drawerOpen()).toBe(false);
    component.toggleDataDrawer();
    expect(component.drawerOpen()).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.data-drawer-panel')).not.toBeNull();
  });

  it('executes quick forecast and renders metrics strip', async () => {
    vi.useFakeTimers();
    component.runQuickTrial();
    expect(component.running()).toBe(true);

    vi.advanceTimersByTime(1300);
    fixture.detectChanges();

    expect(component.running()).toBe(false);
    expect(component.result()).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.result-dashboard')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('时序预测 结果');
    vi.useRealTimers();
  });
});
