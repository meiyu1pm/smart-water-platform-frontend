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
  templateUrl: './data-file-inspector-dialog.component.html',
  styleUrl: './data-file-inspector-dialog.component.scss',
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
