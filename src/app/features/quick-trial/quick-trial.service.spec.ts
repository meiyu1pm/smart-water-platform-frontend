import {
  inferIntervalMinutes,
  maxHorizonForAlgorithm,
  normalizeTimeString,
  parseDateMs,
  parseCsvTextToRows,
  QuickTrialService,
} from './quick-trial.service';

describe('QuickTrialService time-window helpers', () => {
  it('interprets timezone-less source timestamps as UTC', () => {
    expect(parseDateMs('2026-01-01 00:00:00')).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(normalizeTimeString('2026-01-01 00:15:00')).toBe('2026-01-01T00:15:00.000Z');
  });

  it('normalizes and sorts time-series points before selecting a window', () => {
    const service = Object.create(QuickTrialService.prototype) as QuickTrialService;
    const points = service.parseTimeSeriesPoints(
      [
        { record_time: '2026-01-01 00:30:00', inlet_flow: '3.5' },
        { record_time: '2026-01-01 00:00:00', inlet_flow: 1 },
        { record_time: '2026-01-01 00:15:00', inlet_flow: 2 },
      ],
      'record_time',
      'inlet_flow',
    );

    expect(points.map((point) => point.time)).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:15:00.000Z',
      '2026-01-01T00:30:00.000Z',
    ]);
    expect(inferIntervalMinutes(points)).toBe(15);
  });

  it('uses a safe default interval when timestamps are invalid or repeated', () => {
    expect(inferIntervalMinutes([{ time: 'invalid', value: 1 }])).toBe(15);
    expect(
      inferIntervalMinutes([
        { time: '2026-01-01T00:00:00Z', value: 1 },
        { time: '2026-01-01T00:00:00Z', value: 2 },
      ]),
    ).toBe(15);
  });

  it('keeps the Chronos-2 horizon within its backend contract', () => {
    expect(maxHorizonForAlgorithm('chronos2')).toBe(96);
    expect(maxHorizonForAlgorithm('seasonal_naive')).toBe(192);
  });

  it('parses a large CSV without truncating the selectable source window', () => {
    const csv = [
      'time,value',
      ...Array.from({ length: 60_000 }, (_, index) => `${index},${index}`),
    ].join('\n');
    expect(parseCsvTextToRows(csv)).toHaveLength(60_000);
  });
});
