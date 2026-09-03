import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import {
  DataFileGovernanceOperation,
  DataFileLineage,
  DataFilePreview,
  DataFileQualityReport,
  DataFileSummary,
  DataFileTimeProfile,
  DataFileVersionSummary,
  DatasetLineageTree,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { DataFileService } from '../../core/services/data-file.service';
import { DatasetLineageTreeComponent } from '../../shared/components/dataset-lineage-tree.component';

type InspectorTab = 'preview' | 'quality' | 'time' | 'versions';
type GovernanceOption = {
  id: string;
  label: string;
  description: string;
  operation: DataFileGovernanceOperation;
};

const GOVERNANCE_OPTIONS: GovernanceOption[] = [
  {
    id: 'deduplicate',
    label: '删除重复记录',
    description: '按完整记录去重，重复内容保留最后一条。',
    operation: { type: 'deduplicate', keep: 'last' },
  },
  {
    id: 'resample',
    label: '统一为 15 分钟间隔',
    description: '将时序重采样到固定 15 分钟时间轴。',
    operation: { type: 'resample', interval: '15min', method: 'mean' },
  },
  {
    id: 'repair_missing',
    label: '线性修复短缺口',
    description: '线性插值修复连续不超过 4 个时间点的缺失值。',
    operation: { type: 'repair_missing', method: 'linear', max_gap: 4 },
  },
  {
    id: 'flag_outliers',
    label: '标记 Hampel 离群点',
    description: '使用 7 点窗口和 3 倍阈值标记异常，不直接替换原值。',
    operation: { type: 'flag_outliers', method: 'hampel', window: 7, threshold: 3 },
  },
];

/**
 * 数据文件详情边界：汇集只读预览、版本质量、时间画像和文件版本血缘。
 * 上游由资源管理器打开；下游调用 DataFileService，并由 AuthService 控制写入口。
 * 本组件拥有弹窗内的查看版本和治理草稿；治理只创建不可变派生版本，不修改原始文件。
 */
@Component({
  selector: 'app-data-file-inspector-dialog',
  standalone: true,
  imports: [DatasetLineageTreeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" role="presentation" (click)="close.emit()">
      <section
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-file-inspector-title"
        (click)="$event.stopPropagation()"
      >
        <header class="dialog-header">
          <div>
            <p class="eyebrow">数据文件</p>
            <h2 id="data-file-inspector-title">{{ file?.name || '文件详情' }}</h2>
            @if (file; as currentFile) {
              <p class="file-meta">
                {{ (currentFile.format || '未知').toUpperCase() }} ·
                {{ formatBytes(currentFile.size_bytes) }} · {{ versionLabel(currentFile) }}
              </p>
            }
          </div>
          <div class="dialog-actions">
            @if (canGovern()) {
              <button class="governance-button" type="button" (click)="openGovernance()">
                数据治理
              </button>
            }
            <button type="button" class="close-button" aria-label="关闭详情" (click)="close.emit()">
              ×
            </button>
          </div>
        </header>

        <nav class="tabs" aria-label="文件详情栏目">
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              [class.active]="activeTab() === tab.id"
              [attr.aria-current]="activeTab() === tab.id ? 'page' : null"
              (click)="selectTab(tab.id)"
            >
              {{ tab.label }}
            </button>
          }
        </nav>

        <div class="content">
          @if (activeTab() === 'preview') {
            @if (previewLoading()) {
              <p class="state">正在读取前 50 行…</p>
            } @else if (previewError()) {
              <p class="state error" role="alert">{{ previewError() }}</p>
            } @else if (blockedPreviewMessage(); as message) {
              <p class="state">{{ message }}</p>
            } @else if (preview(); as value) {
              <div class="table-wrap" aria-label="文件数据预览">
                <table>
                  <thead>
                    <tr>
                      @for (column of value.columns; track column.name) {
                        <th>
                          {{ column.name }}<small>{{ column.inferred_type }}</small>
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of value.rows; track $index) {
                      <tr>
                        @for (column of value.columns; track column.name) {
                          <td>{{ displayValue(row[column.name]) }}</td>
                        }
                      </tr>
                    } @empty {
                      <tr>
                        <td class="empty">没有可预览的数据行。</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="hint">{{ previewSummary(value) }}</p>
            }
          }

          @if (activeTab() === 'quality') {
            @if (qualityLoading()) {
              <p class="state">正在读取质量报告…</p>
            } @else if (qualityError()) {
              <p class="state error" role="alert">{{ qualityError() }}</p>
            } @else if (qualityReport(); as report) {
              <section class="quality-overview">
                <span class="grade" [attr.data-grade]="report.grade">{{ report.grade }}</span>
                <div>
                  <strong>{{ report.score.toFixed(1) }} 分</strong><small>综合质量评分</small>
                </div>
                <time>{{ formatDateTime(report.created_at) }}</time>
              </section>
              <div class="dimension-grid">
                @for (dimension of entries(report.dimensions); track dimension[0]) {
                  <article>
                    <span>{{ metricLabel(dimension[0]) }}</span>
                    <strong>{{ formatMetric(dimension[1]) }}</strong>
                  </article>
                }
              </div>
              <div class="quality-columns">
                <section>
                  <h3>发现的问题</h3>
                  <ul>
                    @for (finding of report.findings; track $index) {
                      <li>{{ describeItem(finding) }}</li>
                    } @empty {
                      <li class="muted">未发现需要处理的问题。</li>
                    }
                  </ul>
                </section>
                <section>
                  <h3>治理建议</h3>
                  <ul>
                    @for (recommendation of report.recommendations; track $index) {
                      <li>{{ describeItem(recommendation) }}</li>
                    } @empty {
                      <li class="muted">当前版本没有治理建议。</li>
                    }
                  </ul>
                </section>
              </div>
            } @else {
              <p class="state">当前版本尚未生成质量报告。</p>
            }
          }

          @if (activeTab() === 'time') {
            @if (timeProfile(); as profile) {
              <section class="time-summary">
                <article>
                  <span>时间列</span
                  ><strong>{{ profile.selected_column || profile.time_column || '未识别' }}</strong>
                </article>
                <article>
                  <span>解析成功率</span
                  ><strong>{{
                    formatRate(profile.parse_ratio ?? profile.parse_success_rate)
                  }}</strong>
                </article>
                <article>
                  <span>主要采样间隔</span><strong>{{ intervalLabel(profile) }}</strong>
                </article>
                <article>
                  <span>时区</span
                  ><strong>{{
                    profile.timezone_assumption || profile.timezone || '未声明'
                  }}</strong>
                </article>
                <article>
                  <span>起始时间</span
                  ><strong>{{ profile.start_time || profile.time_start || '—' }}</strong>
                </article>
                <article>
                  <span>结束时间</span
                  ><strong>{{ profile.end_time || profile.time_end || '—' }}</strong>
                </article>
                <article>
                  <span>重复时间点</span
                  ><strong>{{
                    profile.duplicate_timestamp_count ?? profile.duplicate_count ?? '—'
                  }}</strong>
                </article>
                <article>
                  <span>缺失时间点</span
                  ><strong>{{
                    profile.missing_interval_count ?? profile.missing_count ?? '—'
                  }}</strong>
                </article>
              </section>
              @if (profile.requires_confirmation) {
                <p class="notice">时间列或时间格式存在歧义，需要确认后再执行时序治理。</p>
              }
              @if (normalizationStatus()) {
                <p class="normalization">时间规范化状态：{{ normalizationStatus() }}</p>
              }
              @if (preview()?.columns?.length) {
                <h3 class="fields-title">字段结构</h3>
                <div class="field-list">
                  @for (column of preview()!.columns; track column.name) {
                    <span
                      ><strong>{{ column.name }}</strong
                      ><small
                        >{{ column.inferred_type }}{{ column.nullable ? ' · 含空值' : '' }}</small
                      ></span
                    >
                  }
                </div>
              }
            } @else {
              <p class="state">当前文件未识别出时间列；非时序文件不会因此降低质量评分。</p>
            }
          }

          @if (activeTab() === 'versions') {
            @if (lineageLoading()) {
              <p class="state">正在读取版本血缘…</p>
            } @else if (lineageError()) {
              <p class="state error" role="alert">{{ lineageError() }}</p>
            } @else if (lineageChart(); as chart) {
              <app-dataset-lineage-tree
                [tree]="chart"
                [selectedVersionId]="selectedVersionId()"
                (versionSelected)="selectVersion($event)"
              />
              <div class="version-actions">
                <label>
                  查看版本
                  <select [value]="selectedVersionId()" (change)="versionChanged($event)">
                    @for (version of versions(); track version.id) {
                      <option [value]="version.id">
                        V{{ version.version_no
                        }}{{ version.id === file?.current_version_id ? ' · 当前' : '' }}
                      </option>
                    }
                  </select>
                </label>
                @if (selectedVersionId() !== file?.current_version_id && canManageVersions()) {
                  <button
                    type="button"
                    [disabled]="settingCurrent()"
                    (click)="makeSelectedCurrent()"
                  >
                    {{ settingCurrent() ? '切换中…' : '设为当前版本' }}
                  </button>
                }
              </div>
            } @else {
              <p class="state">当前文件还没有可展示的版本血缘。</p>
            }
          }
        </div>

        @if (governanceOpen()) {
          <div class="governance-backdrop" role="presentation" (click)="closeGovernance()">
            <section
              class="governance-panel"
              role="dialog"
              aria-modal="true"
              (click)="$event.stopPropagation()"
            >
              <header>
                <div>
                  <p class="eyebrow">生成新版本</p>
                  <h3>选择数据治理操作</h3>
                </div>
                <button type="button" aria-label="关闭治理向导" (click)="closeGovernance()">
                  ×
                </button>
              </header>
              <p class="governance-copy">操作按下列顺序执行；原始版本保持不变。</p>
              <div class="governance-options">
                @for (option of governanceOptions; track option.id) {
                  <label [class.selected]="selectedOperations().has(option.id)">
                    <input
                      type="checkbox"
                      [checked]="selectedOperations().has(option.id)"
                      (change)="toggleOperation(option.id)"
                    />
                    <span
                      ><strong>{{ option.label }}</strong
                      ><small>{{ option.description }}</small></span
                    >
                  </label>
                }
              </div>
              @if (governanceError()) {
                <p class="governance-error" role="alert">{{ governanceError() }}</p>
              }
              @if (governanceMessage()) {
                <p class="governance-success">{{ governanceMessage() }}</p>
              }
              <footer>
                <label class="current-choice"
                  ><input
                    type="checkbox"
                    [checked]="makeCurrent()"
                    (change)="makeCurrent.set(!makeCurrent())"
                  />
                  完成后作为当前版本</label
                >
                <div>
                  <button type="button" (click)="closeGovernance()">取消</button
                  ><button
                    class="primary"
                    type="button"
                    [disabled]="!selectedOperations().size || governanceRunning()"
                    (click)="submitGovernance()"
                  >
                    {{ governanceRunning() ? '正在提交…' : '开始治理' }}
                  </button>
                </div>
              </footer>
            </section>
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 1000;
    }
    .backdrop {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 18px;
      background: rgb(15 23 42 / 50%);
    }
    .dialog {
      position: relative;
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      width: min(1120px, 100%);
      height: min(800px, 94vh);
      overflow: hidden;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 26px 80px rgb(15 23 42 / 28%);
    }
    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 22px 12px;
    }
    .eyebrow {
      margin: 0 0 3px;
      color: #0369a1;
      font-size: 11px;
      font-weight: 800;
    }
    h2,
    h3 {
      margin: 0;
      color: #0f172a;
    }
    h2 {
      font-size: 20px;
    }
    h3 {
      font-size: 16px;
    }
    .file-meta {
      margin: 5px 0 0;
      color: #64748b;
      font-size: 12px;
    }
    .dialog-actions,
    .version-actions,
    footer,
    footer div {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    button,
    select {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #334155;
      cursor: pointer;
    }
    button {
      padding: 8px 13px;
    }
    button:disabled {
      cursor: default;
      opacity: 0.55;
    }
    .governance-button,
    button.primary {
      border-color: #0f6fad;
      background: #0f6fad;
      color: #fff;
      font-weight: 700;
    }
    .close-button {
      width: 34px;
      height: 34px;
      padding: 0;
      border: 0;
      background: #f1f5f9;
      font-size: 24px;
      line-height: 1;
    }
    .tabs {
      display: flex;
      gap: 18px;
      padding: 0 22px;
      border-bottom: 1px solid #e2e8f0;
    }
    .tabs button {
      padding: 10px 2px;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      color: #64748b;
    }
    .tabs button.active {
      border-bottom-color: #0f6fad;
      color: #0f5f92;
      font-weight: 700;
    }
    .content {
      min-height: 0;
      overflow: auto;
      padding: 18px 22px 22px;
    }
    .state,
    .empty {
      padding: 36px 12px;
      color: #64748b;
      text-align: center;
    }
    .state.error,
    .governance-error {
      color: #b91c1c;
    }
    .table-wrap {
      width: 100%;
      height: calc(min(800px, 94vh) - 210px);
      min-height: 280px;
      overflow: auto;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
    }
    table {
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      min-width: 140px;
      padding: 9px;
      border-bottom: 2px solid #cbd5e1;
      background: #f8fafc;
      text-align: left;
      white-space: nowrap;
    }
    th small {
      display: block;
      margin-top: 3px;
      color: #94a3b8;
      font-weight: 400;
    }
    td {
      max-width: 260px;
      padding: 8px 9px;
      border-bottom: 1px solid #f1f5f9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    tbody tr:nth-child(even) {
      background: #fafafa;
    }
    .hint {
      color: #64748b;
      font-size: 11px;
    }
    .quality-overview {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      border-radius: 12px;
      background: #f8fafc;
    }
    .quality-overview .grade {
      display: grid;
      place-items: center;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #dcfce7;
      color: #047857;
      font-size: 25px;
      font-weight: 800;
    }
    .quality-overview .grade[data-grade='C'],
    .quality-overview .grade[data-grade='D'] {
      background: #fef3c7;
      color: #b45309;
    }
    .quality-overview div {
      display: grid;
      gap: 2px;
    }
    .quality-overview strong {
      color: #0f172a;
      font-size: 21px;
    }
    .quality-overview small,
    .quality-overview time {
      color: #64748b;
      font-size: 12px;
    }
    .quality-overview time {
      margin-left: auto;
    }
    .dimension-grid,
    .time-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
      margin-top: 14px;
    }
    .dimension-grid article,
    .time-summary article {
      display: grid;
      gap: 6px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }
    .dimension-grid span,
    .time-summary span {
      color: #64748b;
      font-size: 12px;
    }
    .dimension-grid strong,
    .time-summary strong {
      color: #0f172a;
      font-size: 15px;
      overflow-wrap: anywhere;
    }
    .quality-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }
    .quality-columns section {
      padding: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }
    .quality-columns ul {
      margin: 10px 0 0;
      padding-left: 18px;
      color: #475569;
    }
    .quality-columns li {
      margin: 6px 0;
    }
    .muted {
      color: #94a3b8;
    }
    .notice {
      padding: 11px 13px;
      border-radius: 8px;
      background: #fff7ed;
      color: #9a3412;
    }
    .normalization {
      color: #475569;
    }
    .fields-title {
      margin-top: 20px;
    }
    .field-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    .field-list > span {
      display: grid;
      gap: 3px;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .field-list small {
      color: #64748b;
    }
    .version-actions {
      justify-content: flex-end;
      margin-top: 12px;
    }
    .version-actions label {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 12px;
    }
    select {
      min-width: 140px;
      padding: 7px 9px;
    }
    .governance-backdrop {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgb(15 23 42 / 36%);
    }
    .governance-panel {
      width: min(620px, 100%);
      max-height: 92%;
      overflow: auto;
      padding: 20px;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 18px 50px rgb(15 23 42 / 24%);
    }
    .governance-panel header,
    .governance-panel footer {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .governance-panel header > button {
      border: 0;
      background: #f1f5f9;
      font-size: 20px;
    }
    .governance-copy {
      color: #64748b;
      font-size: 13px;
    }
    .governance-options {
      display: grid;
      gap: 8px;
    }
    .governance-options label {
      display: flex;
      gap: 10px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      cursor: pointer;
    }
    .governance-options label.selected {
      border-color: #38bdf8;
      background: #f0f9ff;
    }
    .governance-options span {
      display: grid;
      gap: 3px;
    }
    .governance-options small {
      color: #64748b;
    }
    .governance-panel footer {
      align-items: center;
      margin-top: 18px;
    }
    .current-choice {
      color: #475569;
      font-size: 12px;
    }
    .governance-success {
      color: #047857;
    }
    @media (max-width: 700px) {
      .backdrop {
        padding: 6px;
      }
      .dialog {
        height: 98vh;
      }
      .quality-columns {
        grid-template-columns: 1fr;
      }
      .tabs {
        gap: 10px;
        overflow-x: auto;
      }
      .quality-overview time {
        display: none;
      }
      .governance-panel footer {
        align-items: stretch;
        flex-direction: column;
      }
    }
  `,
})
export class DataFileInspectorDialogComponent implements OnChanges, OnDestroy {
  private readonly service = inject(DataFileService);
  private readonly auth = inject(AuthService);
  private readonly requests = new Subscription();

  @Input() file: DataFileSummary | null = null;
  @Input() openGovernanceOnLoad = false;
  @Output() readonly close = new EventEmitter<void>();
  @Output() readonly changed = new EventEmitter<void>();

  readonly tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'preview', label: '数据预览' },
    { id: 'quality', label: '质量报告' },
    { id: 'time', label: '时间与字段' },
    { id: 'versions', label: '版本与血缘' },
  ];
  readonly governanceOptions = GOVERNANCE_OPTIONS;
  readonly activeTab = signal<InspectorTab>('preview');
  readonly selectedVersionId = signal<number | null>(null);
  readonly versions = signal<DataFileVersionSummary[]>([]);
  readonly lineage = signal<DataFileLineage | null>(null);
  readonly preview = signal<DataFilePreview | null>(null);
  readonly qualityReports = signal<DataFileQualityReport[]>([]);
  readonly previewLoading = signal(false);
  readonly qualityLoading = signal(false);
  readonly lineageLoading = signal(false);
  readonly previewError = signal('');
  readonly qualityError = signal('');
  readonly lineageError = signal('');
  readonly governanceOpen = signal(false);
  readonly selectedOperations = signal(new Set<string>());
  readonly makeCurrent = signal(true);
  readonly governanceRunning = signal(false);
  readonly governanceError = signal('');
  readonly governanceMessage = signal('');
  readonly settingCurrent = signal(false);

  readonly selectedVersion = computed(() =>
    this.versions().find((version) => version.id === this.selectedVersionId()),
  );
  readonly qualityReport = computed(() => this.qualityReports()[0] || null);
  readonly timeProfile = computed(
    () => this.selectedVersion()?.time_profile || this.file?.time_profile || null,
  );
  readonly normalizationStatus = computed(() => {
    const normalization = this.selectedVersion()?.normalization || this.file?.normalization;
    if (this.timeProfile()?.requires_confirmation) return '待确认时间列';
    if (!normalization || !Object.keys(normalization).length) return '未生成规范化表示';
    const format = normalization.format ? String(normalization.format).toUpperCase() : '标准格式';
    const timezone = normalization.timezone ? ` · ${normalization.timezone}` : '';
    return `已统一为 ${format}${timezone}`;
  });
  readonly lineageChart = computed<DatasetLineageTree | null>(() => {
    const tree = this.lineage();
    if (!tree) return null;
    const parentByChild = new Map(
      tree.edges.map((edge) => [edge.child_version_id, edge.parent_version_id]),
    );
    return {
      dataset_id: tree.file_id,
      current_version_id: tree.current_version_id,
      roots: [...tree.roots],
      nodes: tree.nodes.map((node) => ({
        version_id: node.version_id,
        parent_version_id: parentByChild.get(node.version_id) ?? null,
        version_code: node.version_code,
        version_kind: node.version_kind,
        operation_code: node.version_kind,
        operation_name: node.version_kind === 'original' ? '原始导入' : '数据治理',
        is_synthetic: false,
        record_count: node.row_count ?? 1,
        time_start: node.time_profile?.start_time || node.time_profile?.time_start || null,
        time_end: node.time_profile?.end_time || node.time_profile?.time_end || null,
        quality: null,
        created_by_task_id: node.created_by_task_id || null,
        workflow_run_id: null,
        version_note: null,
        created_at: node.created_at,
      })),
      edges: tree.edges.map((edge) => ({
        from: edge.parent_version_id,
        to: edge.child_version_id,
      })),
    };
  });

  ngOnChanges(changes: SimpleChanges): void {
    if ('file' in changes) this.loadFile();
    if (this.openGovernanceOnLoad && this.canGovern()) this.openGovernance();
  }

  ngOnDestroy(): void {
    this.requests.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.governanceOpen()) this.closeGovernance();
    else this.close.emit();
  }

  selectTab(tab: InspectorTab): void {
    this.activeTab.set(tab);
    if (tab === 'preview') this.loadPreview();
    if (tab === 'quality') this.loadQuality();
    if (tab === 'versions') this.loadLineage();
  }

  selectVersion(versionId: number): void {
    this.selectedVersionId.set(versionId);
    if (this.activeTab() === 'preview') this.loadPreview();
    if (this.activeTab() === 'quality') this.loadQuality();
  }

  versionChanged(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(value)) this.selectVersion(value);
  }

  openGovernance(): void {
    if (!this.canGovern()) return;
    this.selectedOperations.set(new Set());
    this.governanceError.set('');
    this.governanceMessage.set('');
    this.governanceOpen.set(true);
  }

  closeGovernance(): void {
    if (!this.governanceRunning()) this.governanceOpen.set(false);
  }

  toggleOperation(id: string): void {
    const selected = new Set(this.selectedOperations());
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    this.selectedOperations.set(selected);
  }

  submitGovernance(): void {
    const versionId = this.selectedVersionId();
    const selected = this.selectedOperations();
    const operations = GOVERNANCE_OPTIONS.filter((option) => selected.has(option.id)).map(
      (option) => option.operation,
    );
    if (!versionId || !operations.length) return;
    this.governanceRunning.set(true);
    this.governanceError.set('');
    this.requests.add(
      this.service.runGovernance(versionId, operations, this.makeCurrent()).subscribe({
        next: (result) => {
          this.governanceRunning.set(false);
          this.governanceMessage.set(`治理任务已创建（${result.task_id}），完成后会生成新版本。`);
          this.changed.emit();
        },
        error: () => {
          this.governanceRunning.set(false);
          this.governanceError.set('无法创建治理任务，请确认当前版本已完成分析后重试。');
        },
      }),
    );
  }

  makeSelectedCurrent(): void {
    const fileId = this.file?.id;
    const versionId = this.selectedVersionId();
    if (
      !fileId ||
      !versionId ||
      versionId === this.file?.current_version_id ||
      !this.canManageVersions()
    )
      return;
    this.settingCurrent.set(true);
    this.requests.add(
      this.service.setCurrentVersion(fileId, versionId).subscribe({
        next: () => {
          this.settingCurrent.set(false);
          if (this.file) this.file.current_version_id = versionId;
          this.changed.emit();
          this.loadLineage();
        },
        error: () => {
          this.settingCurrent.set(false);
          this.lineageError.set('无法切换当前版本，请稍后重试。');
        },
      }),
    );
  }

  canGovern(): boolean {
    const status = this.selectedVersion()?.profile_status || this.file?.profile_status;
    return !!this.selectedVersionId() && this.canManageVersions() && status === 'ready';
  }

  canManageVersions(): boolean {
    return (
      this.auth.hasPermission('data_file:write') &&
      this.file?.code !== 'builtin_demo_water_month' &&
      this.file?.can_write !== false
    );
  }

  displayValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  entries(value: Record<string, number>): Array<[string, number]> {
    return Object.entries(value || {});
  }

  metricLabel(key: string): string {
    const labels: Record<string, string> = {
      readability: '可读取性',
      completeness: '完整性',
      validity: '有效性',
      consistency: '一致性',
      uniqueness: '唯一性',
      row_uniqueness: '记录唯一性',
      timeliness: '时间质量',
      time_parse: '时间解析',
      timestamp_validity: '时间有效性',
      timestamp_uniqueness: '时间唯一性',
      timestamp_identification: '时间列识别',
      interval_regularity: '采样规律性',
      interval_consistency: '采样规律性',
    };
    return labels[key] || key.replaceAll('_', ' ');
  }

  formatMetric(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(1)} 分` : '—';
  }

  formatRate(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const normalized = value <= 1 ? value * 100 : value;
    return `${normalized.toFixed(2)}%`;
  }

  intervalLabel(profile: DataFileTimeProfile): string {
    if (profile.sampling_interval) return String(profile.sampling_interval);
    if (profile.interval_minutes != null) return `${profile.interval_minutes} 分钟`;
    if (profile.interval_seconds != null) return `${profile.interval_seconds} 秒`;
    if (profile.dominant_interval_seconds != null) {
      return profile.dominant_interval_seconds % 60 === 0
        ? `${profile.dominant_interval_seconds / 60} 分钟`
        : `${profile.dominant_interval_seconds} 秒`;
    }
    return '未识别';
  }

  describeItem(item: Record<string, unknown> | string): string {
    if (typeof item === 'string') return item;
    const code = typeof item['code'] === 'string' ? item['code'] : '';
    const count = typeof item['count'] === 'number' ? `（${item['count']}）` : '';
    const labels: Record<string, string> = {
      MISSING_VALUES: '存在缺失值',
      DUPLICATE_ROWS: '存在重复记录',
      DUPLICATE_TIMESTAMPS: '存在重复时间点',
      MISSING_INTERVALS: '时间轴存在缺口',
      IRREGULAR_INTERVALS: '采样间隔不一致',
      TIME_COLUMN_REQUIRES_CONFIRMATION: '时间列或时间格式需要确认',
      review_missing_values: '检查并修复缺失值',
      deduplicate: '删除重复记录或时间点',
      resample_or_repair_missing: '重采样或修复时间缺口',
      review_sampling_interval: '检查并统一采样间隔',
      confirm_time_column: '确认时间列及其日期格式',
    };
    if (code && labels[code]) return `${labels[code]}${count}`;
    for (const key of ['message', 'description', 'title', 'code']) {
      if (typeof item[key] === 'string' && item[key]) return String(item[key]);
    }
    return JSON.stringify(item);
  }

  formatBytes(value: number): string {
    if (!value) return '0 B';
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString('zh-CN', { hour12: false })
      : value;
  }

  versionLabel(file: DataFileSummary): string {
    const versionNo = file.current_version?.version_no;
    return versionNo
      ? `V${versionNo}`
      : file.version_count
        ? `${file.version_count} 个版本`
        : '暂无版本';
  }

  previewSummary(value: DataFilePreview): string {
    return value.truncated
      ? `仅显示前 ${Math.min(value.preview_limit || 50, 50)} 行，文件内容未被修改。`
      : `共 ${value.total_rows ?? value.rows.length} 行`;
  }

  blockedPreviewMessage(): string {
    const status = this.selectedVersion()?.profile_status || this.file?.profile_status || '';
    if (status === 'pending' || status === 'running') return '文件正在分析，完成后即可预览。';
    if (status === 'failed') return '文件分析失败，暂时无法预览。';
    if (status === 'unsupported') return '该文件格式暂不支持结构化预览。';
    if (!this.selectedVersionId()) return '该文件还没有可预览版本。';
    return '';
  }

  private loadFile(): void {
    const file = this.file;
    this.activeTab.set('preview');
    this.selectedVersionId.set(file?.current_version_id || file?.current_version?.id || null);
    this.versions.set(file?.current_version ? [file.current_version] : []);
    this.lineage.set(null);
    this.qualityReports.set([]);
    this.preview.set(null);
    if (!file) return;
    this.requests.add(
      this.service.listFileVersions(file.id).subscribe({
        next: (versions) => this.versions.set(versions),
        error: () => undefined,
      }),
    );
    this.loadPreview();
    this.loadLineage();
  }

  private loadPreview(): void {
    const versionId = this.selectedVersionId();
    this.preview.set(null);
    this.previewError.set('');
    if (!versionId || this.blockedPreviewMessage()) return;
    this.previewLoading.set(true);
    this.requests.add(
      this.service.getPreview(versionId, 50).subscribe({
        next: (preview) => {
          this.preview.set({ ...preview, rows: (preview.rows || []).slice(0, 50) });
          this.previewLoading.set(false);
        },
        error: () => {
          this.previewLoading.set(false);
          this.previewError.set('无法读取文件预览，请稍后重试。');
        },
      }),
    );
  }

  private loadQuality(): void {
    const versionId = this.selectedVersionId();
    this.qualityReports.set([]);
    this.qualityError.set('');
    if (!versionId) return;
    this.qualityLoading.set(true);
    this.requests.add(
      this.service.listQualityReports(versionId).subscribe({
        next: (reports) => {
          this.qualityReports.set(reports);
          this.qualityLoading.set(false);
        },
        error: () => {
          this.qualityLoading.set(false);
          this.qualityError.set('无法读取质量报告，请稍后重试。');
        },
      }),
    );
  }

  private loadLineage(): void {
    const fileId = this.file?.id;
    this.lineageError.set('');
    if (!fileId) return;
    this.lineageLoading.set(true);
    this.requests.add(
      this.service.getFileLineage(fileId).subscribe({
        next: (lineage) => {
          this.lineage.set(lineage);
          this.lineageLoading.set(false);
        },
        error: () => {
          this.lineageLoading.set(false);
          this.lineageError.set('无法读取版本血缘，请稍后重试。');
        },
      }),
    );
  }
}
