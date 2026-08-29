import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

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

export interface ForecastResult {
  task: string;
  algorithm: string;
  fileName: string;
  timeColumn: string;
  valueColumn: string;
  historyPoints: TimeSeriesPoint[];
  forecastPoints: TimeSeriesPoint[];
  lowerBand: TimeSeriesPoint[];
  upperBand: TimeSeriesPoint[];
  actualFuturePoints?: TimeSeriesPoint[];
  horizonSteps: number;
  intervalMinutes: number;
  seasonalitySteps: number;
  confidence: number;
  workflowId?: number;
  runId?: string;
}

export interface QuickTrialScenarioOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultAlgorithm: string;
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

export function parseDateMs(raw: unknown): number {
  if (!raw) return NaN;
  if (typeof raw === 'number') return raw;
  const str = String(raw).trim();
  const isoLike = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const t = Date.parse(isoLike);
  if (!isNaN(t)) return t;
  const t2 = Date.parse(str);
  return isNaN(t2) ? NaN : t2;
}

export function formatDateStr(timestampMs: number, templateStr: string): string {
  const d = new Date(timestampMs);
  if (templateStr.includes(' ') && !templateStr.includes('T')) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    const s = pad(d.getSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }
  return d.toISOString();
}

/**
 * 完整解析 CSV 文本为全量数据行，保证时序调窗使用全量历史数据
 */
export function parseCsvTextToRows(
  csvText: string,
  maxRows = 30000,
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
      icon: '📈',
      description: '基于水务时序历史趋势与周期性规律，精准外推预测未来供水量或流量走势。',
      defaultAlgorithm: 'auto',
      demoFileName: '示例小区_2024-01.csv',
      timeColumn: '时间',
      valueColumn: '流量(m³/h)_修复',
    },
    {
      id: 'anomaly-detection',
      name: '异常突变检测',
      icon: '🔍',
      description: '智能捕捉水质、水压突变点与离群波动，快速定位异常工况。',
      defaultAlgorithm: 'auto',
      demoFileName: '示例小区_2024-01.csv',
      timeColumn: '时间',
      valueColumn: '压力(MPa)_修复',
    },
    {
      id: 'dma-leakage',
      name: 'DMA分区漏损评估',
      icon: '💧',
      description: '结合水量平衡与最小夜间流量（MNF），智能评估管网漏损风险。',
      defaultAlgorithm: 'auto',
      demoFileName: '示例小区_2024-01.csv',
      timeColumn: '时间',
      valueColumn: '流量(m³/h)_修复',
    },
  ];

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
        points.push({ time: tStr, value: Number(num.toFixed(3)) });
      }
    }
    return points;
  }

  /**
   * 上传临时试用文件到平台
   */
  uploadTemporaryFile(file: File): Observable<TempUploadResult> {
    return this.dataFiles.uploadUnassignedFile(file, file.name).pipe(
      switchMap((uploadRes: DataFileUploadResult) => {
        const versionId = uploadRes.version.id;
        return this.dataFiles.getPreview(versionId).pipe(
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
    horizonSteps?: number;
  }): Observable<ForecastResult> {
    return from(this.runEphemeralWorkflowPipeline(params));
  }

  private async runEphemeralWorkflowPipeline(params: {
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
    horizonSteps?: number;
  }): Promise<ForecastResult> {
    const {
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
      horizonSteps: userHorizon,
    } = params;

    const horizon = Math.max(4, Math.min(userHorizon ?? 32, 192));
    const algoCode = algorithm === 'chronos2' ? 'chronos2_flow_forecast' : 'seasonal_naive';
    const algoName =
      algorithm === 'chronos2'
        ? 'Chronos-2 (深度学习大模型)'
        : algorithm === 'auto'
          ? 'Auto (Seasonal Naive)'
          : 'Seasonal Naive (季节性基准)';

    const algoParams: Record<string, unknown> =
      algoCode === 'chronos2_flow_forecast'
        ? { horizon, context_length: 288, value_source: 'processed' }
        : { season_length: 96, horizon };

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

    // 2. 组装标准双节点工作流图
    const inputNodeId = 'data_file_input_1';
    const algoNodeId = 'algo_forecast_1';
    const outputPort = algoCode === 'chronos2_flow_forecast' ? 'forecast' : 'result';

    const graph = {
      contract_version: '1.0',
      nodes: [
        {
          id: inputNodeId,
          node_code: 'data_file_input_v1',
          node_version: '1.0.0',
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
          target: { node_id: algoNodeId, port: 'series' },
        },
      ],
      outputs: [{ node_id: algoNodeId, port: outputPort }],
      bindings: {
        [inputNodeId]: {
          file_version_id: fileVersionId,
          data_view_id: viewId,
          output_mode: 'timeseries',
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
          description: '由快速试用中心自动创建并提交执行的即席时序预测工作流',
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
      ['queued', 'running', 'dispatched'].includes(status) &&
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
    let inputPayload: Record<string, unknown> = {};
    let algoPayload: Record<string, unknown> = {};

    try {
      const artifacts = await firstValueFrom(
        this.api.get<Array<WorkflowArtifact>>(
          `/api/v1/workflow-runs/${encodeURIComponent(runId)}/artifacts`,
        ),
      );

      const inputArtifactMeta = artifacts.find(
        (a) =>
          a.node_instance_id === inputNodeId ||
          a.port_key === 'series' ||
          a.node_code === 'data_file_input_v1',
      );
      const algoArtifactMeta = artifacts.find(
        (a) =>
          a.node_instance_id === algoNodeId ||
          a.node_code === algoCode ||
          a.port_key === outputPort,
      );

      if (inputArtifactMeta?.id) {
        const fullInput = await firstValueFrom(
          this.api.get<Record<string, unknown>>(
            `/api/v1/workflow-artifacts/${inputArtifactMeta.id}?full=true`,
          ),
        );
        inputPayload = (fullInput['payload'] || fullInput['preview'] || fullInput) as Record<
          string,
          unknown
        >;
      }

      if (algoArtifactMeta?.id) {
        const fullAlgo = await firstValueFrom(
          this.api.get<Record<string, unknown>>(
            `/api/v1/workflow-artifacts/${algoArtifactMeta.id}?full=true`,
          ),
        );
        algoPayload = (fullAlgo['payload'] || fullAlgo['preview'] || fullAlgo) as Record<
          string,
          unknown
        >;
      }
    } catch {
      // Fallback to sample rows if artifact fetch fails
    }

    // 提取原始全量时序点
    let fullPoints: TimeSeriesPoint[] = [];
    const historyRows = (inputPayload['rows'] ||
      (inputPayload['payload'] as any)?.rows) as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(historyRows) && historyRows.length > 0) {
      fullPoints = historyRows.map((r) => ({
        time: String(r['time']),
        value: Number(r['value']),
      }));
    } else {
      fullPoints = this.parseTimeSeriesPoints(sampleRows, timeColumn, valueColumn);
    }

    // 如果用户自定义了截取切片
    const s = Math.max(0, inputStartIndex ?? 0);
    const e = Math.min(fullPoints.length - 1, inputEndIndex ?? fullPoints.length - 1);
    const historyPoints = fullPoints.slice(s, e + 1);

    // 计算采样间隔
    let intervalMinutes = 15;
    if (historyPoints.length >= 2) {
      const t1 = parseDateMs(historyPoints[0].time);
      const t2 = parseDateMs(historyPoints[1].time);
      const diff = Math.abs(t2 - t1) / (60 * 1000);
      if (diff > 0 && diff <= 1440) {
        intervalMinutes = Math.round(diff);
      }
    }

    const lastTimestamp =
      historyPoints.length > 0
        ? parseDateMs(historyPoints[historyPoints.length - 1].time)
        : Date.now();
    const sampleTimeFormat = historyPoints[0]?.time || '2024-01-01 00:00:00';

    let forecastPoints: TimeSeriesPoint[] = [];
    let lowerBand: TimeSeriesPoint[] = [];
    let upperBand: TimeSeriesPoint[] = [];
    let seasonalitySteps = 96;

    if (algoCode === 'chronos2_flow_forecast') {
      const forecastRows = (algoPayload['rows'] ||
        (algoPayload['payload'] as any)?.rows ||
        []) as Array<Record<string, unknown>>;
      forecastPoints = forecastRows.map((r, idx) => ({
        time: formatDateStr(
          lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000,
          sampleTimeFormat,
        ),
        value: Number(Number(r['value']).toFixed(3)),
      }));
      lowerBand = forecastRows.map((r, idx) => ({
        time: formatDateStr(
          lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000,
          sampleTimeFormat,
        ),
        value: Number(Number(r['p10'] ?? r['value']).toFixed(3)),
      }));
      upperBand = forecastRows.map((r, idx) => ({
        time: formatDateStr(
          lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000,
          sampleTimeFormat,
        ),
        value: Number(Number(r['p90'] ?? r['value']).toFixed(3)),
      }));
    } else {
      const payloadData =
        ((algoPayload['payload'] as Record<string, unknown>) || algoPayload) as Record<
          string,
          unknown
        >;
      const values = (payloadData['values'] as number[]) || [];
      const lowers = (payloadData['lower'] as number[]) || [];
      const uppers = (payloadData['upper'] as number[]) || [];
      seasonalitySteps = Number((payloadData['metadata'] as any)?.season_length || 96);

      forecastPoints = values.map((val, idx) => ({
        time: formatDateStr(
          lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000,
          sampleTimeFormat,
        ),
        value: Number(Number(val).toFixed(3)),
      }));
      lowerBand = lowers.map((val, idx) => ({
        time: formatDateStr(
          lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000,
          sampleTimeFormat,
        ),
        value: Number(Number(val).toFixed(3)),
      }));
      upperBand = uppers.map((val, idx) => ({
        time: formatDateStr(
          lastTimestamp + (idx + 1) * intervalMinutes * 60 * 1000,
          sampleTimeFormat,
        ),
        value: Number(Number(val).toFixed(3)),
      }));
    }

    // 提取未来真实观测值 (Ground Truth):
    // 如果在输入结束点 e 之后，原始数据中仍有真实观测点，则提取与预测点对应的时间和真实值
    let actualFuturePoints: TimeSeriesPoint[] = [];
    if (e + 1 < fullPoints.length) {
      const futureCount = forecastPoints.length || horizon;
      actualFuturePoints = fullPoints.slice(e + 1, e + 1 + futureCount).map((p, idx) => ({
        time: forecastPoints[idx]?.time || p.time,
        value: Number(Number(p.value).toFixed(3)),
      }));
    }

    return {
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
}
