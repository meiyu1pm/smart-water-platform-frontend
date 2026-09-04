import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from, of, throwError, timer } from 'rxjs';
import { catchError, exhaustMap, filter, map, switchMap, take, timeout } from 'rxjs/operators';

import { ApiClient } from '../../core/services/api-client.service';
import { DataFileService } from '../../core/services/data-file.service';
import {
  DataFilePreview,
  DataFileSummary,
  DataFileUploadResult,
  WorkflowArtifact,
} from '../../core/models/api.models';

export interface TimeSeriesPoint {
  time: string;
  value: number;
}

export interface QuickTrialResultBase {
  kind: 'forecast' | 'anomaly' | 'dma-night-flow';
  task: string;
  algorithm: string;
  fileName: string;
  timeColumn: string;
  valueColumn: string;
  historyPoints: TimeSeriesPoint[];
  intervalMinutes: number;
  workflowId?: number;
  runId?: string;
}

export interface ForecastResult extends QuickTrialResultBase {
  kind: 'forecast';
  forecastPoints: TimeSeriesPoint[];
  lowerBand: TimeSeriesPoint[];
  upperBand: TimeSeriesPoint[];
  actualFuturePoints?: TimeSeriesPoint[];
  horizonSteps: number;
  seasonalitySteps: number;
  confidence: number;
}

export interface AnomalyResult extends QuickTrialResultBase {
  kind: 'anomaly';
  scorePoints: TimeSeriesPoint[];
  anomalyPoints: TimeSeriesPoint[];
  threshold: number;
  anomalyCount: number;
}

export interface DmaNightFlowResult extends QuickTrialResultBase {
  kind: 'dma-night-flow';
  nightlyPoints: TimeSeriesPoint[];
  candidatePoints: TimeSeriesPoint[];
  baseline: number;
  displayThreshold: number;
  notice: string;
}

export type QuickTrialResult = ForecastResult | AnomalyResult | DmaNightFlowResult;

export interface QuickTrialAlgorithmOption {
  id: string;
  name: string;
}

export interface QuickTrialScenarioOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultAlgorithm: string;
  algorithms: QuickTrialAlgorithmOption[];
  demoFileName: string;
  timeColumn: string;
  valueColumn: string;
}

export interface TempUploadResult {
  file: DataFileSummary;
  collectionId: number | null;
  versionId: number;
  preview: DataFilePreview;
}

const DEFAULT_INTERVAL_MINUTES = 15;

export function parseDateMs(raw: unknown): number {
  if (!raw) return NaN;
  if (typeof raw === 'number') return raw;
  const str = String(raw).trim();
  if (!str) return NaN;
  const isoLike = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  // Backend timestamps are normalized as UTC. Treat timezone-less CSV values
  // the same way instead of letting the browser's local timezone shift them.
  const withUtc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`;
  const t = Date.parse(withUtc);
  if (!isNaN(t)) return t;
  const t2 = Date.parse(str);
  return isNaN(t2) ? NaN : t2;
}

export function formatDateStr(timestampMs: number, templateStr: string): string {
  const d = new Date(timestampMs);
  if (templateStr.includes(' ') && !templateStr.includes('T')) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const Y = d.getUTCFullYear();
    const M = pad(d.getUTCMonth() + 1);
    const D = pad(d.getUTCDate());
    const h = pad(d.getUTCHours());
    const m = pad(d.getUTCMinutes());
    const s = pad(d.getUTCSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }
  return d.toISOString();
}

export function normalizeTimeString(raw: unknown): string | null {
  const timestamp = parseDateMs(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function inferIntervalMinutes(points: TimeSeriesPoint[]): number {
  const intervals = points
    .map((point, index) => {
      if (index === 0) return NaN;
      const current = parseDateMs(point.time);
      const previous = parseDateMs(points[index - 1].time);
      return (current - previous) / (60 * 1000);
    })
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 1440)
    .sort((left, right) => left - right);
  if (!intervals.length) return DEFAULT_INTERVAL_MINUTES;
  const middle = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;
  return Math.max(1, Math.round(median));
}

export function maxHorizonForAlgorithm(algorithm: string): number {
  return algorithm === 'chronos2' ? 96 : 192;
}

/**
 * 完整解析 CSV 文本为全量数据行，保证时序调窗使用全量历史数据
 */
export function parseCsvTextToRows(
  csvText: string,
  maxRows = 100000,
): Array<Record<string, unknown>> {
  if (!csvText || !csvText.trim()) return [];
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"(.*)"$/, '$1'));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"(.*)"$/, '$1'));
    return values;
  };

  const headers = parseLine(lines[0]);
  const rows: Array<Record<string, unknown>> = [];
  const limit = Math.min(lines.length, maxRows + 1);

  for (let i = 1; i < limit; i++) {
    const vals = parseLine(lines[i]);
    if (vals.length < headers.length) continue;
    const row: Record<string, unknown> = {};
    for (let h = 0; h < headers.length; h++) {
      const col = headers[h];
      const v = vals[h];
      const num = Number(v);
      row[col] = v !== '' && !isNaN(num) && isFinite(num) ? num : v;
    }
    rows.push(row);
  }
  return rows;
}

@Injectable({ providedIn: 'root' })
export class QuickTrialService {
  private readonly api = inject(ApiClient);
  private readonly dataFiles = inject(DataFileService);

  readonly availableScenarios: QuickTrialScenarioOption[] = [
    {
      id: 'timeseries-forecast',
      name: '时序预测',
      icon: 'chart',
      description: '基于水务时序历史趋势与周期性规律，精准外推预测未来供水量或流量走势。',
      defaultAlgorithm: 'auto',
      algorithms: [
        { id: 'auto', name: 'auto（智能推荐）' },
        { id: 'seasonal_naive', name: 'seasonal_naive（季节性基准）' },
        { id: 'chronos2', name: 'chronos2（深度学习时序模型）' },
      ],
      demoFileName: '示例小区_2024-01.csv',
      timeColumn: '时间',
      valueColumn: '流量(m³/h)_修复',
    },
    {
      id: 'anomaly-detection',
      name: '异常突变检测',
      icon: 'search',
      description: '智能捕捉水质、水压突变点与离群波动，快速定位异常工况。',
      defaultAlgorithm: 'hampel',
      algorithms: [{ id: 'hampel', name: 'Hampel（稳健离群检测）' }],
      demoFileName: '示例小区_2024-01.csv',
      timeColumn: '时间',
      valueColumn: '压力(MPa)_修复',
    },
    {
      id: 'dma-leakage',
      name: 'DMA夜间流量初筛',
      icon: 'droplet',
      description: '基于总表最小夜间流量筛查持续高流量日期，结果仅作为漏损核查线索。',
      defaultAlgorithm: 'minimum_night_flow',
      algorithms: [{ id: 'minimum_night_flow', name: 'MNF（最小夜间流量）' }],
      demoFileName: '示例小区_2024-01.csv',
      timeColumn: '时间',
      valueColumn: '流量(m³/h)_修复',
    },
  ];

  algorithmsForTask(taskId: string): QuickTrialAlgorithmOption[] {
    return this.availableScenarios.find((item) => item.id === taskId)?.algorithms || [];
  }

  /**
   * 从样本行中提取有效时序点
   */
  parseTimeSeriesPoints(
    sampleRows: Array<Record<string, unknown>>,
    timeColumn: string,
    valueColumn: string,
  ): TimeSeriesPoint[] {
    const points: TimeSeriesPoint[] = [];
    for (const r of sampleRows) {
      const rawTime = r[timeColumn] ?? r['record_time'] ?? r['时间'] ?? r['time'] ?? '';
      const tStr = String(rawTime).trim();
      const rawV = r[valueColumn] ?? Object.values(r).find((v) => typeof v === 'number');
      const num = typeof rawV === 'number' ? rawV : parseFloat(String(rawV));

      if (tStr && !isNaN(num) && !isNaN(parseDateMs(tStr))) {
        const normalizedTime = normalizeTimeString(tStr);
        if (normalizedTime) {
          points.push({ time: normalizedTime, value: Number(num.toFixed(3)) });
        }
      }
    }
    return points.sort((left, right) => parseDateMs(left.time) - parseDateMs(right.time));
  }

  /**
   * 上传临时试用文件到平台
   */
  uploadTemporaryFile(file: File): Observable<TempUploadResult> {
    return this.dataFiles.uploadUnassignedFile(file, file.name).pipe(
      switchMap((uploadRes: DataFileUploadResult) => {
        const versionId = uploadRes.version.id;
        return this.waitForPreview(versionId).pipe(
          map((preview) => ({
            file: uploadRes.file,
            collectionId: null,
            versionId,
            preview,
          })),
        );
      }),
    );
  }

  /** Wait for the asynchronous profile task before requesting a preview. */
  private waitForPreview(versionId: number): Observable<DataFilePreview> {
    return timer(0, 1000).pipe(
      // Do not cancel a slow status request every second. This matters for
      // large files whose profile worker can take longer than one poll tick.
      exhaustMap(() =>
        this.dataFiles.getFileVersion(versionId).pipe(
          catchError((error: unknown) =>
            this.isTransientPreviewError(error) ? of(null) : throwError(() => error),
          ),
          switchMap((version) => {
            if (!version) return of(null);
            const status = String(version.profile_status || version.status || '').toLowerCase();
            if (status === 'failed') {
              return throwError(() => new Error('文件结构解析失败，无法预览该文件。'));
            }
            if (status === 'unsupported') {
              return throwError(() => new Error('该文件格式暂不支持结构化预览。'));
            }
            if (status !== 'ready') return of(null);
            return this.dataFiles.getPreview(versionId).pipe(
              // A profile can become ready just before the preview endpoint sees
              // it; keep polling for that short transition instead of failing.
              catchError((error: unknown) =>
                this.isTransientPreviewError(error) ? of(null) : throwError(() => error),
              ),
            );
          }),
        ),
      ),
      filter((preview): preview is DataFilePreview => preview !== null),
      take(1),
      timeout({ first: 60_000 }),
    );
  }

  /**
   * 运行完成后清理临时文件
   */
  cleanupTemporaryFile(_collectionId: number | null, fileId: number): Observable<boolean> {
    if (!fileId) return of(true);
    return this.dataFiles.deleteFile(fileId).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  /**
   * 方案 B：创建即席工作流并在后端调度 Celery/GPU 算子真实运行
   */
  executeEphemeralWorkflow(params: {
    taskId: string;
    task: string;
    algorithm: string;
    fileName: string;
    fileVersionId: number;
    timeColumn: string;
    valueColumn: string;
    pointColumn?: string;
    sampleRows: Array<Record<string, unknown>>;
    inputStartIndex?: number;
    inputEndIndex?: number;
    inputStartTime?: string;
    inputEndTime?: string;
    horizonSteps?: number;
  }): Observable<QuickTrialResult> {
    return from(this.runEphemeralWorkflowPipeline(params));
  }

  private async runEphemeralWorkflowPipeline(params: {
    taskId: string;
    task: string;
    algorithm: string;
    fileName: string;
    fileVersionId: number;
    timeColumn: string;
    valueColumn: string;
    pointColumn?: string;
    sampleRows: Array<Record<string, unknown>>;
    inputStartIndex?: number;
    inputEndIndex?: number;
    inputStartTime?: string;
    inputEndTime?: string;
    horizonSteps?: number;
  }): Promise<QuickTrialResult> {
    const {
      taskId,
      task,
      algorithm,
      fileName,
      fileVersionId,
      timeColumn,
      valueColumn,
      pointColumn,
      sampleRows,
      inputStartIndex,
      inputEndIndex,
      inputStartTime,
      inputEndTime,
      horizonSteps: userHorizon,
    } = params;

    const isForecast = taskId === 'timeseries-forecast';
    const isAnomaly = taskId === 'anomaly-detection';
    const algoCode = isAnomaly
      ? 'hampel'
      : taskId === 'dma-leakage'
        ? 's01_minimum_night_flow_v1'
        : algorithm === 'chronos2'
          ? 'chronos2_flow_forecast'
          : 'seasonal_naive';
    const horizon = Math.max(4, Math.min(userHorizon ?? 32, maxHorizonForAlgorithm(algorithm)));
    const algoName = isAnomaly
      ? 'Hampel（稳健离群检测）'
      : taskId === 'dma-leakage'
        ? 'MNF（最小夜间流量）'
        : algorithm === 'chronos2'
          ? 'Chronos-2 (深度学习大模型)'
          : algorithm === 'auto'
            ? 'Auto (Seasonal Naive)'
            : 'Seasonal Naive (季节性基准)';

    const algoParams: Record<string, unknown> = isAnomaly
      ? { window: 9, threshold: 4.5 }
      : taskId === 'dma-leakage'
        ? { night_start_hour: 2, night_end_hour: 4, min_nights: 7 }
        : algoCode === 'chronos2_flow_forecast'
          ? { horizon, context_length: 288, value_source: 'processed' }
          : { season_length: 96, horizon };

    // Resolve the selected window before creating the immutable run. The
    // backend filters after timestamp sorting, so row indexes never leak the
    // rest of the file into the algorithm context.
    const sourcePoints = this.parseTimeSeriesPoints(sampleRows, timeColumn, valueColumn);
    const sourceStart = Math.max(0, inputStartIndex ?? 0);
    const sourceEnd = Math.min(
      Math.max(0, sourcePoints.length - 1),
      inputEndIndex ?? Math.max(0, sourcePoints.length - 1),
    );
    const selectedStart = normalizeTimeString(inputStartTime || sourcePoints[sourceStart]?.time);
    const selectedEnd = normalizeTimeString(inputEndTime || sourcePoints[sourceEnd]?.time);
    if (!selectedStart || !selectedEnd || parseDateMs(selectedStart) > parseDateMs(selectedEnd)) {
      throw new Error('无法确定有效的输入时间窗口，请先选择至少四个连续时序点。');
    }
    const timeRange = { start: selectedStart, end: selectedEnd };

    // 1. 创建即席数据视图
    const viewRes = await firstValueFrom(
      this.dataFiles.createView(fileVersionId, {
        name: `即席时序视图_${Date.now()}`,
        view_kind: 'timeseries',
        mapping: {
          time_column: timeColumn,
          value_column: valueColumn,
          ...(pointColumn ? { point_column: pointColumn } : {}),
          semantic_type: 'measurement',
          unit: 'm3/h',
        },
      }),
    );
    const viewId = viewRes.id;

    // 2. 按任务组装真实的双节点工作流图。
    const inputNodeId = 'data_file_input_1';
    const algoNodeId = isForecast
      ? 'algo_forecast_1'
      : isAnomaly
        ? 'algo_anomaly_1'
        : 'algo_night_flow_1';
    const algoVersion = taskId === 'dma-leakage' ? '1.0.0' : '1.0.0';
    const inputPort = taskId === 'dma-leakage' ? 'net_inflow' : 'series';
    const outputPort =
      taskId === 'dma-leakage'
        ? 'night_flow_excess'
        : algoCode === 'chronos2_flow_forecast'
          ? 'forecast'
          : 'result';

    const graph = {
      contract_version: '1.0',
      nodes: [
        {
          id: inputNodeId,
          node_code: 'data_file_input_v1',
          node_version: algoVersion,
          parameters: {
            output_mode: 'timeseries',
            binding_key: inputNodeId,
          },
          ui: { position: { x: 120, y: 220 } },
        },
        {
          id: algoNodeId,
          node_code: algoCode,
          node_version: '1.0.0',
          parameters: algoParams,
          ui: { position: { x: 480, y: 220 } },
        },
      ],
      edges: [
        {
          source: { node_id: inputNodeId, port: 'series' },
          target: { node_id: algoNodeId, port: inputPort },
        },
      ],
      outputs: [{ node_id: algoNodeId, port: outputPort }],
      bindings: {
        [inputNodeId]: {
          file_version_id: fileVersionId,
          data_view_id: viewId,
          output_mode: 'timeseries',
          time_range: timeRange,
        },
      },
    };

    // 3. 创建即席工作流草稿
    const wfCode = `wf_quick_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const createWfRes = await firstValueFrom(
      this.api.post<{ id: number; draft_revision: number }, Record<string, unknown>>(
        '/api/v1/workflows',
        {
          workflow_code: wfCode,
          workflow_name: `快速试用_${task}_${algoCode}`,
          description: `由快速试用中心创建的${task}真实算法工作流`,
          visibility: 'private',
          graph,
        },
      ),
    );
    const workflowId = createWfRes.id;

    // 4. 校验并发布工作流版本
    const pubRes = await firstValueFrom(
      this.api.post<{ id: number; version: number }, Record<string, never>>(
        `/api/v1/workflows/${workflowId}/publish`,
        {},
      ),
    );
    const publishedVersionId = pubRes.id;

    // 5. 提交执行工作流运行实例 (Celery / GPU Worker)
    const runRes = await firstValueFrom(
      this.api.post<{ run_id: string; task_id?: string }, Record<string, unknown>>(
        `/api/v1/workflow-versions/${publishedVersionId}/runs`,
        {
          input_bindings: {
            [inputNodeId]: {
              file_version_id: fileVersionId,
              data_view_id: viewId,
              output_mode: 'timeseries',
              time_range: timeRange,
            },
          },
          parameter_overrides: {},
        },
      ),
    );
    const runId = runRes.run_id;

    // 6. 异步轮询任务执行状态
    let status = 'queued';
    let runData: any = null;
    const startTime = Date.now();

    while (
      ['pending', 'queued', 'running', 'dispatched'].includes(status) &&
      Date.now() - startTime < 45000
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      runData = await firstValueFrom(
        this.api.get<any>(`/api/v1/workflow-runs/${encodeURIComponent(runId)}`),
      );
      status = runData?.status || 'failed';
    }

    if (status !== 'success') {
      throw new Error(
        runData?.error_message ||
          runData?.message ||
          `工作流算法执行未能完成 (当前状态: ${status})`,
      );
    }

    // 7. 拉取工作流产物 (Workflow Artifacts) 并读取完整 Payload
    const artifacts = await firstValueFrom(
      this.api.get<Array<WorkflowArtifact>>(
        `/api/v1/workflow-runs/${encodeURIComponent(runId)}/artifacts`,
      ),
    );
    if (!Array.isArray(artifacts)) {
      throw new Error('工作流未返回可读取的产物清单。');
    }
    const inputArtifactMeta = artifacts.find(
      (artifact) => artifact.node_instance_id === inputNodeId && artifact.port_key === 'series',
    );
    const algoArtifactMeta = artifacts.find(
      (artifact) => artifact.node_instance_id === algoNodeId && artifact.port_key === outputPort,
    );
    if (!inputArtifactMeta?.id || !algoArtifactMeta?.id) {
      throw new Error('工作流产物不完整，无法确定输入或预测结果。');
    }
    const fullInput = await firstValueFrom(
      this.api.get<Record<string, unknown>>(
        `/api/v1/workflow-artifacts/${inputArtifactMeta.id}?full=true`,
      ),
    );
    const fullAlgo = await firstValueFrom(
      this.api.get<Record<string, unknown>>(
        `/api/v1/workflow-artifacts/${algoArtifactMeta.id}?full=true`,
      ),
    );
    const inputPayload = this.requireArtifactPayload(fullInput, '输入时序');
    const algoPayload = this.requireArtifactPayload(fullAlgo, `${task}结果`);

    const historyRows = inputPayload['rows'];
    const artifactPoints = this.parseArtifactPoints(historyRows, '输入时序');
    const selectedStartMs = parseDateMs(selectedStart);
    const selectedEndMs = parseDateMs(selectedEnd);
    const historyPoints = artifactPoints.filter((point) => {
      const timestamp = parseDateMs(point.time);
      return timestamp >= selectedStartMs && timestamp <= selectedEndMs;
    });
    if (historyPoints.length === 0) {
      throw new Error('工作流返回的输入时序不在已选择的时间窗口内。');
    }

    const intervalMinutes = inferIntervalMinutes(historyPoints);
    const lastTimestamp = parseDateMs(historyPoints[historyPoints.length - 1].time);

    if (isAnomaly) {
      const payloadData = ((algoPayload['payload'] as Record<string, unknown>) ||
        algoPayload) as Record<string, unknown>;
      const scores = Array.isArray(payloadData['scores']) ? payloadData['scores'] : [];
      const labels = Array.isArray(payloadData['labels']) ? payloadData['labels'] : [];
      if (scores.length !== historyPoints.length || labels.length !== historyPoints.length) {
        throw new Error('Hampel结果长度与输入时序不一致。');
      }
      const scorePoints = historyPoints.map((point, index) => ({
        time: point.time,
        value: this.requireFiniteNumber(scores[index], 'Hampel异常分数'),
      }));
      const anomalyPoints = historyPoints.filter((_, index) => Number(labels[index]) === 1);
      return {
        kind: 'anomaly',
        task,
        algorithm: algoName,
        fileName,
        timeColumn,
        valueColumn,
        historyPoints,
        intervalMinutes,
        scorePoints,
        anomalyPoints,
        threshold: Number(payloadData['threshold'] || 4.5),
        anomalyCount: anomalyPoints.length,
        workflowId,
        runId,
      };
    }

    if (taskId === 'dma-leakage') {
      const nightlyPoints = this.parseArtifactPoints(algoPayload['rows'], '最小夜间流量');
      const values = nightlyPoints.map((point) => point.value).sort((left, right) => left - right);
      const middle = Math.floor(values.length / 2);
      const baseline =
        values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      const deviations = values
        .map((value) => Math.abs(value - baseline))
        .sort((left, right) => left - right);
      const deviationMiddle = Math.floor(deviations.length / 2);
      const mad =
        deviations.length % 2
          ? deviations[deviationMiddle]
          : (deviations[deviationMiddle - 1] + deviations[deviationMiddle]) / 2;
      const displayThreshold = Number((baseline + Math.max(0.01, 3 * 1.4826 * mad)).toFixed(3));
      const candidatePoints = nightlyPoints.filter((point) => point.value > displayThreshold);
      return {
        kind: 'dma-night-flow',
        task,
        algorithm: algoName,
        fileName,
        timeColumn,
        valueColumn,
        historyPoints,
        intervalMinutes,
        nightlyPoints,
        candidatePoints,
        baseline: Number(baseline.toFixed(3)),
        displayThreshold,
        notice:
          '当前快速试用仅分析总表夜间流量，未扣除合法夜间用水，不等同于完整水量平衡或确认漏损。',
        workflowId,
        runId,
      };
    }

    let forecastPoints: TimeSeriesPoint[] = [];
    let lowerBand: TimeSeriesPoint[] = [];
    let upperBand: TimeSeriesPoint[] = [];
    let seasonalitySteps = 96;

    if (algoCode === 'chronos2_flow_forecast') {
      const forecastRows = this.requireRows(algoPayload['rows'], 'Chronos-2 预测结果');
      forecastPoints = forecastRows.map((row) => ({
        time: this.requireTime(row['time'], 'Chronos-2 预测结果'),
        value: this.requireFiniteNumber(row['value'], 'Chronos-2 预测值'),
      }));
      lowerBand = forecastRows.map((row) => ({
        time: this.requireTime(row['time'], 'Chronos-2 预测结果'),
        value: this.requireFiniteNumber(row['p10'] ?? row['value'], 'Chronos-2 P10'),
      }));
      upperBand = forecastRows.map((row) => ({
        time: this.requireTime(row['time'], 'Chronos-2 预测结果'),
        value: this.requireFiniteNumber(row['p90'] ?? row['value'], 'Chronos-2 P90'),
      }));
    } else {
      const payloadData = ((algoPayload['payload'] as Record<string, unknown>) ||
        algoPayload) as Record<string, unknown>;
      const values = (payloadData['values'] as number[]) || [];
      const lowers = (payloadData['lower'] as number[]) || [];
      const uppers = (payloadData['upper'] as number[]) || [];
      if (!values.length) throw new Error('季节性基准未返回预测值。');
      seasonalitySteps = Number((payloadData['metadata'] as any)?.season_length || 96);

      forecastPoints = values.map((val, idx) => ({
        time: new Date(lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000).toISOString(),
        value: this.requireFiniteNumber(val, '季节性基准预测值'),
      }));
      lowerBand = lowers.map((val, idx) => ({
        time:
          forecastPoints[idx]?.time ||
          new Date(lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000).toISOString(),
        value: this.requireFiniteNumber(val, '季节性基准下界'),
      }));
      upperBand = uppers.map((val, idx) => ({
        time:
          forecastPoints[idx]?.time ||
          new Date(lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000).toISOString(),
        value: this.requireFiniteNumber(val, '季节性基准上界'),
      }));
    }

    // 提取未来真实观测值 (Ground Truth):
    // Match by the actual timestamp instead of replacing it with the forecast
    // timestamp. A shifted green line must remain visible as a real mismatch.
    const sourceByTimestamp = new Map(
      sourcePoints.map((point) => [parseDateMs(point.time), point] as const),
    );
    const actualFuturePoints = forecastPoints.flatMap((point) => {
      const timestamp = parseDateMs(point.time);
      const actual = sourceByTimestamp.get(timestamp);
      return timestamp > selectedEndMs && actual ? [{ ...actual }] : [];
    });

    return {
      kind: 'forecast',
      task,
      algorithm: algoName,
      fileName,
      timeColumn,
      valueColumn,
      historyPoints,
      forecastPoints,
      lowerBand,
      upperBand,
      actualFuturePoints,
      horizonSteps: forecastPoints.length || horizon,
      intervalMinutes,
      seasonalitySteps,
      confidence: 0.95,
      workflowId,
      runId,
    };
  }

  private requireArtifactPayload(
    artifact: Record<string, unknown>,
    label: string,
  ): Record<string, unknown> {
    const payload = artifact['payload'];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`${label}产物缺少完整 payload。`);
    }
    return payload as Record<string, unknown>;
  }

  private isTransientPreviewError(error: unknown): boolean {
    const status = Number((error as { status?: unknown } | null)?.status);
    return status === 0 || status === 404 || status === 409 || status === 429 || status >= 500;
  }

  private requireRows(value: unknown, label: string): Array<Record<string, unknown>> {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    ) {
      throw new Error(`${label}产物缺少有效行数据。`);
    }
    return value as Array<Record<string, unknown>>;
  }

  private parseArtifactPoints(value: unknown, label: string): TimeSeriesPoint[] {
    return this.requireRows(value, label)
      .map((row) => ({
        time: this.requireTime(row['time'], label),
        value: this.requireFiniteNumber(row['value'], `${label}数值`),
      }))
      .sort((left, right) => parseDateMs(left.time) - parseDateMs(right.time));
  }

  private requireTime(value: unknown, label: string): string {
    const time = normalizeTimeString(value);
    if (!time) throw new Error(`${label}包含无法解析的时间戳。`);
    return time;
  }

  private requireFiniteNumber(value: unknown, label: string): number {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${label}包含无效数值。`);
    return Number(number.toFixed(3));
  }
}
