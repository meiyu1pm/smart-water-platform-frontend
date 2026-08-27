import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EMPTY, Subscription, forkJoin, interval, of } from 'rxjs';
import { catchError, exhaustMap, tap } from 'rxjs/operators';

import {
  DataCollectionSummary,
  DataFileSummary,
  DataFileViewCreate,
  DataFileViewSelection,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { DataFileService } from '../../core/services/data-file.service';
import { NotificationService } from '../../core/services/notification.service';
import { DataFilePreviewPanelComponent } from './data-file-preview-panel.component';

/**
 * 管理异构数据集及其文件成员。传统数据资产仍由 /data-sources 页面和旧 API 管理。
 */
@Component({
  selector: 'app-data-collections-page',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    DataFilePreviewPanelComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">数据中心</p>
        <h1>数据集管理</h1>
        <p>将流量、压力、拓扑和设备资料集中组织；文件原件保持独立版本。</p>
      </div>
      <div class="actions">
        <button mat-stroked-button type="button" (click)="load()">刷新</button>
        @if (canCreateCollection()) {
          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="showCreate.set(!showCreate())"
          >
            新建数据集
          </button>
        }
      </div>
    </header>

    <section class="stat-grid" aria-label="数据集统计">
      <mat-card
        ><span>数据集</span><strong>{{ collections().length }}</strong></mat-card
      >
      <mat-card
        ><span>数据文件</span><strong>{{ totalFiles() }}</strong></mat-card
      >
      <mat-card
        ><span>存储容量</span><strong>{{ formatBytes(totalBytes()) }}</strong></mat-card
      >
      <mat-card
        ><span>解析问题</span
        ><strong [class.warning-number]="totalIssues() > 0">{{ totalIssues() }}</strong></mat-card
      >
    </section>

    @if (showCreate() && canCreateCollection()) {
      <mat-card class="create-card">
        <h2>新建数据集</h2>
        <div class="create-row">
          <mat-form-field appearance="outline"
            ><mat-label>名称</mat-label><input matInput [(ngModel)]="newName"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>说明（可选）</mat-label><input matInput [(ngModel)]="newDescription"
          /></mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!newName.trim() || creating()"
            (click)="createCollection()"
          >
            {{ creating() ? '正在创建…' : '创建' }}
          </button>
        </div>
      </mat-card>
    }

    <mat-card class="list-card">
      <div class="list-head">
        <div>
          <h2>数据集</h2>
          <p>展开数据集查看文件、版本和预览。</p>
        </div>
        <mat-form-field appearance="outline" class="search-field"
          ><mat-label>搜索数据集</mat-label
          ><input matInput [ngModel]="search()" (ngModelChange)="search.set($event)"
        /></mat-form-field>
      </div>

      @if (loading()) {
        <p class="state" aria-live="polite">正在读取数据集…</p>
      } @else if (errorMessage(); as error) {
        <p class="state error" role="alert">{{ error }}</p>
      } @else if (!filteredCollections().length) {
        <p class="state">暂无符合条件的数据集。可以先新建数据集，再上传文件。</p>
      } @else {
        <div class="collection-list">
          @for (collection of filteredCollections(); track collection.id) {
            <section class="collection-row">
              <div class="collection-header">
                <button
                  class="collection-summary"
                  type="button"
                  (click)="toggleCollection(collection)"
                >
                  <span class="expand-icon" aria-hidden="true">{{
                    isExpanded(collection.id) ? '⌄' : '›'
                  }}</span>
                  <span class="collection-info"
                    ><strong>{{ collection.name }}</strong
                    ><small>{{ collection.description || '未填写说明' }}</small></span
                  >
                  <span class="collection-meta"
                    ><span>{{ collection.file_count }} 个文件</span
                    ><span>{{ formatBytes(collection.storage_bytes) }}</span
                    ><span [class.issue-text]="collection.parse_issue_count > 0"
                      >{{ collection.parse_issue_count }} 个问题</span
                    ></span
                  >
                </button>
                @if (canDeleteCollection()) {
                  <button
                    mat-stroked-button
                    class="delete-button"
                    type="button"
                    (click)="deleteCollection(collection, $event)"
                  >
                    删除数据集
                  </button>
                }
              </div>
              @if (isExpanded(collection.id)) {
                <div class="file-list">
                  <div class="file-toolbar">
                    <span>文件成员</span>
                    @if (canUploadFile()) {
                      <label class="upload-button"
                        >上传文件<input type="file" (change)="uploadFile(collection, $event)"
                      /></label>
                    }
                  </div>
                  @if (filesLoading().has(collection.id)) {
                    <p class="inline-state">正在读取文件…</p>
                  } @else if (filesError().has(collection.id)) {
                    <p class="inline-state error">无法读取该数据集的文件。</p>
                  } @else if (!filesFor(collection.id).length) {
                    <p class="inline-state">该数据集还没有文件。</p>
                  } @else {
                    @for (file of filesFor(collection.id); track file.id) {
                      <div class="file-row">
                        <div class="file-icon" aria-hidden="true">
                          {{ file.file_kind === 'topology' ? '拓' : '文' }}
                        </div>
                        <div class="file-info">
                          <strong>{{ file.name }}</strong
                          ><small
                            >{{ file.format.toUpperCase() }} · {{ formatBytes(file.size_bytes) }} ·
                            {{ file.version_count }} 个版本</small
                          >
                        </div>
                        <span class="file-status" [class.ready]="file.status === 'ready'">{{
                          fileStatus(file)
                        }}</span>
                        <button mat-stroked-button type="button" (click)="openPreview(file)">
                          查看预览
                        </button>
                        @if (canManageCollection()) {
                          <button
                            mat-stroked-button
                            class="remove-button"
                            type="button"
                            (click)="removeFile(collection, file, $event)"
                          >
                            移出数据集
                          </button>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </section>
          }
        </div>
      }
    </mat-card>

    @if (selectedFile(); as file) {
      <app-data-file-preview-panel
        [fileVersionId]="file.current_version_id"
        [profileStatus]="file.profile_status || null"
        [canCreateView]="canCreateView()"
        (viewChange)="onViewChange($event)"
      />
      @if (!file.current_version_id) {
        <p class="state">该文件还没有可以预览的已完成版本。</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .page-head,
    .actions,
    .list-head,
    .collection-summary,
    .file-toolbar,
    .file-row,
    .create-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-head,
    .list-head {
      justify-content: space-between;
      gap: 20px;
    }
    .page-head {
      margin-bottom: 20px;
    }
    .eyebrow {
      margin: 0;
      color: #0f5f92;
      font-size: 12px;
      font-weight: 800;
    }
    h1,
    h2,
    p {
      margin-top: 0;
    }
    h1 {
      margin-bottom: 6px;
    }
    h2 {
      margin-bottom: 4px;
      font-size: 19px;
    }
    .page-head p:not(.eyebrow),
    .list-head p {
      margin-bottom: 0;
      color: #64748b;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .stat-grid mat-card {
      display: grid;
      gap: 7px;
      padding: 16px;
    }
    .stat-grid span {
      color: #64748b;
      font-size: 12px;
    }
    .stat-grid strong {
      color: #0f172a;
      font-size: 23px;
    }
    .warning-number,
    .issue-text {
      color: #b45309 !important;
    }
    .create-card,
    .list-card {
      padding: 18px;
      margin-bottom: 18px;
    }
    .create-row {
      align-items: flex-start;
    }
    .create-row mat-form-field {
      flex: 1;
      min-width: 0;
    }
    .search-field {
      width: min(280px, 100%);
    }
    .collection-list {
      display: grid;
      gap: 8px;
    }
    .collection-row {
      border: 1px solid #dbe4ef;
      border-radius: 10px;
      overflow: hidden;
    }
    .collection-header {
      display: flex;
      align-items: stretch;
      gap: 10px;
      background: #fff;
    }
    .collection-summary {
      flex: 1;
      min-width: 0;
      border: 0;
      background: #fff;
      padding: 13px 15px;
      text-align: left;
      cursor: pointer;
    }
    .delete-button {
      align-self: center;
      flex: 0 0 auto;
      margin-right: 12px;
      color: #b91c1c;
    }
    .collection-summary:hover,
    .collection-summary:focus-visible {
      background: #f8fbff;
      outline: 2px solid #93c5fd;
      outline-offset: -2px;
    }
    .expand-icon {
      width: 18px;
      color: #0f5f92;
      font-size: 20px;
    }
    .collection-info {
      display: grid;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .collection-info strong,
    .collection-info small,
    .file-info strong,
    .file-info small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .collection-info small,
    .file-info small {
      color: #64748b;
    }
    .collection-meta {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      color: #64748b;
      font-size: 12px;
    }
    .file-list {
      display: grid;
      gap: 8px;
      padding: 12px 15px 15px 48px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
    .file-toolbar {
      justify-content: space-between;
      color: #475569;
      font-size: 13px;
    }
    .upload-button {
      position: relative;
      display: inline-flex;
      padding: 7px 10px;
      border: 1px solid #93c5fd;
      border-radius: 7px;
      color: #0f5f92;
      cursor: pointer;
    }
    .upload-button input {
      position: absolute;
      inset: 0;
      width: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .file-row {
      min-width: 0;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
    }
    .file-icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 7px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 11px;
    }
    .file-info {
      display: grid;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .file-status {
      color: #64748b;
      font-size: 12px;
    }
    .file-status.ready {
      color: #15803d;
    }
    .state,
    .inline-state {
      padding: 24px;
      color: #64748b;
      text-align: center;
    }
    .state.error,
    .inline-state.error {
      color: #b45309;
    }
    .inline-state {
      padding: 14px;
    }
    @media (max-width: 900px) {
      .stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .collection-meta {
        max-width: 220px;
      }
    }
    @media (max-width: 640px) {
      .page-head,
      .list-head,
      .create-row {
        align-items: stretch;
        flex-direction: column;
      }
      .actions {
        justify-content: flex-start;
      }
      .stat-grid {
        grid-template-columns: 1fr 1fr;
      }
      .search-field {
        width: 100%;
      }
      .collection-summary {
        align-items: flex-start;
      }
      .collection-header {
        align-items: stretch;
        flex-direction: column;
        gap: 0;
      }
      .delete-button {
        align-self: flex-start;
        margin: 0 12px 10px 48px;
      }
      .collection-meta {
        display: none;
      }
      .file-list {
        padding-left: 12px;
      }
      .file-row {
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .file-row button {
        width: 100%;
      }
    }
  `,
})
export class DataCollectionsPage {
  private readonly service = inject(DataFileService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly subscriptions = new Subscription();

  readonly collections = signal<DataCollectionSummary[]>([]);
  readonly filesByCollection = signal(new Map<number, DataFileSummary[]>());
  readonly filesLoading = signal(new Set<number>());
  readonly filesError = signal(new Set<number>());
  readonly expanded = signal(new Set<number>());
  readonly selectedFile = signal<DataFileSummary | null>(null);
  readonly loading = signal(false);
  readonly creating = signal(false);
  readonly showCreate = signal(false);
  readonly errorMessage = signal('');
  readonly search = signal('');
  newName = '';
  newDescription = '';

  readonly filteredCollections = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.collections().filter(
      (item) => !term || `${item.name} ${item.description || ''}`.toLowerCase().includes(term),
    );
  });
  readonly totalFiles = computed(() =>
    this.collections().reduce((sum, item) => sum + item.file_count, 0),
  );
  readonly totalBytes = computed(() =>
    this.collections().reduce((sum, item) => sum + item.storage_bytes, 0),
  );
  readonly totalIssues = computed(() =>
    this.collections().reduce((sum, item) => sum + item.parse_issue_count, 0),
  );

  constructor() {
    this.load();
    this.subscriptions.add(
      interval(8000)
        .pipe(exhaustMap(() => this.refreshExpandedFiles()))
        .subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
  canCreateCollection(): boolean { return this.auth.hasPermission('data_collection:write'); }
  canDeleteCollection(): boolean { return this.auth.hasPermission('data_collection:delete'); }
  canManageCollection(): boolean { return this.auth.hasPermission('data_collection:write'); }
  canUploadFile(): boolean { return this.auth.hasPermission('data_file:write'); }
  canCreateView(): boolean { return this.auth.hasPermission('data_view:write'); }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.subscriptions.add(
      this.service.listCollections().subscribe({
        next: (items) => {
          this.collections.set(items || []);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('无法读取数据集，请稍后重试。');
        },
      }),
    );
  }

  toggleCollection(collection: DataCollectionSummary): void {
    const next = new Set(this.expanded());
    if (next.has(collection.id)) next.delete(collection.id);
    else {
      next.add(collection.id);
      if (!this.filesByCollection().has(collection.id)) this.loadFiles(collection.id);
    }
    this.expanded.set(next);
  }
  isExpanded(id: number): boolean {
    return this.expanded().has(id);
  }
  filesFor(id: number): DataFileSummary[] {
    return this.filesByCollection().get(id) || [];
  }

  createCollection(): void {
    if (!this.newName.trim() || !this.canCreateCollection()) return;
    this.creating.set(true);
    this.subscriptions.add(
      this.service
        .createCollection({
          name: this.newName.trim(),
          description: this.newDescription.trim() || null,
        })
        .subscribe({
          next: () => {
            this.notifications.success('数据集已创建。');
            this.newName = '';
            this.newDescription = '';
            this.showCreate.set(false);
            this.creating.set(false);
            this.load();
          },
          error: (error) => {
            this.creating.set(false);
            this.notifications.error(error, '数据集创建失败。');
          },
        }),
    );
  }

  uploadFile(collection: DataCollectionSummary, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.canUploadFile()) return;
    this.subscriptions.add(
      this.service.uploadFile(collection.id, file).subscribe({
        next: (result) => {
          this.notifications.success(result.task_id ? '文件已上传，正在解析。' : '文件上传已完成。');
          this.loadFiles(collection.id);
          this.load();
        },
        error: (error) => this.notifications.error(error, '文件上传失败。'),
      }),
    );
  }

  deleteCollection(collection: DataCollectionSummary, event?: Event): void {
    event?.stopPropagation();
    if (!this.canDeleteCollection()) return;
    if (!window.confirm(`确定删除数据集“${collection.name}”？数据集将移入回收站。`)) return;
    this.subscriptions.add(
      this.service.deleteCollection(collection.id).subscribe({
        next: () => {
          if (this.selectedFile() && this.filesByCollection().get(collection.id)?.some((file) => file.id === this.selectedFile()?.id)) {
            this.selectedFile.set(null);
          }
          const expanded = new Set(this.expanded());
          expanded.delete(collection.id);
          this.expanded.set(expanded);
          const files = new Map(this.filesByCollection());
          files.delete(collection.id);
          this.filesByCollection.set(files);
          this.notifications.success('数据集已移入回收站。');
          this.load();
        },
        error: (error) => this.notifications.error(error, '删除数据集失败。'),
      }),
    );
  }

  removeFile(collection: DataCollectionSummary, file: DataFileSummary, event?: Event): void {
    event?.stopPropagation();
    if (!this.canManageCollection()) return;
    if (!window.confirm(`确定将“${file.name}”移出数据集“${collection.name}”？原文件不会被删除。`)) return;
    this.subscriptions.add(
      this.service.removeFileFromCollection(collection.id, file.id).subscribe({
        next: () => {
          if (this.selectedFile()?.id === file.id) this.selectedFile.set(null);
          this.notifications.success('文件已移出数据集，原文件仍保留。');
          this.loadFiles(collection.id);
          this.load();
        },
        error: (error) => this.notifications.error(error, '移出文件失败。'),
      }),
    );
  }

  openPreview(file: DataFileSummary): void {
    this.selectedFile.set(file);
  }
  onViewChange(view: DataFileViewSelection): void {
    if (!this.canCreateView()) return;
    const mapping = view.output_mode === 'table'
      ? { selected_columns: view.selected_columns || [] }
      : {
          time_column: view.time_column || '',
          value_column: view.value_column || '',
          ...(view.point_column ? { point_column: view.point_column } : {}),
        };
    const payload: DataFileViewCreate = { view_kind: view.output_mode, mapping };
    this.subscriptions.add(
      this.service.createView(view.file_version_id, payload).subscribe({
        next: () => this.notifications.success(
          `${view.output_mode === 'table' ? '表格' : '时序'}数据视图已创建。`,
        ),
        error: (error) => this.notifications.error(error, '数据视图创建失败。'),
      }),
    );
  }

  fileStatus(file: DataFileSummary): string {
    if (file.profile_status === 'pending' || file.profile_status === 'running') return '解析中';
    if (file.profile_status === 'unsupported') return '格式不支持';
    if (file.profile_status === 'failed') return '解析失败';
    if (file.profile_status === 'ready') return '可用';
    if (file.parse_issue_count && file.parse_issue_count > 0) return '有解析问题';
    if (file.status === 'ready') return '可用';
    if (file.status === 'failed') return '解析失败';
    return '处理中';
  }
  formatBytes(value: number): string {
    if (!value) return '0 B';
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  private loadFiles(collectionId: number): void {
    const loading = new Set(this.filesLoading());
    loading.add(collectionId);
    this.filesLoading.set(loading);
    const errors = new Set(this.filesError());
    errors.delete(collectionId);
    this.filesError.set(errors);
    this.subscriptions.add(
      this.service.listFiles(collectionId).subscribe({
        next: (items) => {
          const map = new Map(this.filesByCollection());
          map.set(collectionId, items || []);
          this.filesByCollection.set(map);
          const selected = this.selectedFile();
          const refreshed = (items || []).find((item) => item.id === selected?.id);
          if (refreshed) this.selectedFile.set(refreshed);
          const next = new Set(this.filesLoading());
          next.delete(collectionId);
          this.filesLoading.set(next);
        },
        error: () => {
          const next = new Set(this.filesLoading());
          next.delete(collectionId);
          this.filesLoading.set(next);
          const failed = new Set(this.filesError());
          failed.add(collectionId);
          this.filesError.set(failed);
        },
      }),
    );
  }

  private refreshExpandedFiles() {
    const ids = [...this.expanded()];
    if (!ids.length) return EMPTY;
    return forkJoin(
      ids.map((id) => this.service.listFiles(id).pipe(catchError(() => of(null)))),
    ).pipe(
      tap((results) => {
        const map = new Map(this.filesByCollection());
        results.forEach((items, index) => {
          if (items) {
            map.set(ids[index], items);
            const selected = this.selectedFile();
            const refreshed = items.find((item) => item.id === selected?.id);
            if (refreshed) this.selectedFile.set(refreshed);
          }
        });
        this.filesByCollection.set(map);
      }),
    );
  }
}
