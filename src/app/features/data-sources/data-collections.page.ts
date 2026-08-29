import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { EMPTY, Observable, Subscription, interval, of } from 'rxjs';
import { exhaustMap } from 'rxjs/operators';

import {
  DataCollectionSummary,
  DataFileSummary,
  DataFileViewCreate,
  DataFileViewSelection,
} from '../../core/models/api.models';
import {
  DataFileExplorerFolder,
  DataFileExplorerItem,
  DataFileExplorerResponse,
} from '../../core/models/data-file-explorer.models';
import { AuthService } from '../../core/services/auth.service';
import { DataFileService } from '../../core/services/data-file.service';
import { NotificationService } from '../../core/services/notification.service';
import { DataFilePreviewDialogComponent } from './data-file-preview-dialog.component';

type ExplorerEntry = DataFileExplorerItem & {
  file?: DataFileSummary | null;
  collection?: DataFileExplorerFolder | null;
};
type MenuState = { x: number; y: number; entry: ExplorerEntry | null };

/** File-resource manager for heterogeneous data files. */
@Component({
  selector: 'app-data-collections-page',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    DataFilePreviewDialogComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">数据中心</p>
        <h1>数据文件</h1>
        <p>像管理文件一样组织数据资源；双击文件可打开只读预览。</p>
      </div>
      <div class="actions">
        <button mat-stroked-button type="button" (click)="loadExplorer()">刷新</button>
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

    <section class="stat-grid" aria-label="数据文件统计">
      <mat-card
        ><span>数据集</span><strong>{{ collections().length }}</strong></mat-card
      >
      <mat-card
        ><span>当前目录文件</span><strong>{{ visibleFiles().length }}</strong></mat-card
      >
      <mat-card
        ><span>当前容量</span><strong>{{ formatBytes(totalBytes()) }}</strong></mat-card
      >
      <mat-card
        ><span>已选择</span><strong>{{ selectedIds().size }}</strong></mat-card
      >
    </section>

    @if (showCreate() && canCreateCollection()) {
      <mat-card class="create-card"
        ><h2>新建数据集</h2>
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
        </div></mat-card
      >
    }

    <mat-card class="explorer-card" (contextmenu)="openBlankMenu($event)">
      <div class="explorer-toolbar">
        <div class="toolbar-copy">
          <strong>文件资源管理器</strong
          ><small>{{
            selectedIds().size
              ? '已选择 ' + selectedIds().size + ' 项'
              : '单击选择 · Ctrl/Shift 多选 · Ctrl+C/V 复制'
          }}</small>
        </div>
        <mat-form-field appearance="outline" class="search-field"
          ><mat-label>搜索当前目录</mat-label
          ><input matInput [ngModel]="search()" (ngModelChange)="searchChanged($event)"
        /></mat-form-field>
      </div>
      <div class="explorer-layout" cdkDropListGroup>
        <nav class="side-nav" aria-label="数据文件目录">
          <button
            class="nav-entry root"
            [class.active]="currentParentId() === null"
            type="button"
            (click)="navigate(null)"
          >
            ⌂ <span>根目录</span>
          </button>
          <button
            class="nav-entry unassigned"
            [class.active]="currentParentId() === UNASSIGNED"
            type="button"
            cdkDropList
            [cdkDropListData]="UNASSIGNED"
            (cdkDropListDropped)="dropToFolder($event, UNASSIGNED)"
            (click)="navigate(UNASSIGNED)"
          >
            ▱ <span>无归属</span>
          </button>
          <div class="nav-caption">数据集</div>
          @for (folder of rootFolders(); track folder.id) {
            <button
              class="nav-entry"
              [class.active]="currentParentId() === folder.id"
              [attr.title]="folder.description || folder.name"
              type="button"
              cdkDropList
              [cdkDropListData]="folder.id"
              (cdkDropListDropped)="dropToFolder($event, folder.id)"
              (click)="navigate(folder.id)"
            >
              <span class="folder-icon">▰</span><span>{{ folder.name }}</span
              ><small>{{ folder.file_count }}</small>
            </button>
          }
          @if (!rootFolders().length) {
            <p class="nav-empty">暂无数据集</p>
          }
        </nav>

        <main class="file-pane" aria-label="文件内容">
          <div class="breadcrumbs">
            @for (crumb of breadcrumbs(); track crumb.id ?? 'root') {
              <button type="button" (click)="navigate(crumb.id)">{{ crumb.name }}</button
              ><span>/</span>
            }
          </div>
          <div class="pane-toolbar">
            <span>{{
              currentParentId() === UNASSIGNED
                ? '无归属文件'
                : currentParentId() === null
                  ? '根目录'
                  : currentFolderName()
            }}</span>
            <span class="selection-actions">
              @if (selectedIds().size) {
                <button type="button" (click)="clearSelection()">取消选择</button>
              }
              @if (canUploadFile()) {
                <label class="upload-button"
                  >上传文件<input type="file" (change)="uploadIntoCurrent($event)"
                /></label>
              }
            </span>
          </div>
          <input
            #contextUploadPicker
            class="visually-hidden"
            type="file"
            aria-label="上传文件"
            (change)="uploadIntoCurrent($event)"
          />
          @if (currentParentId() !== null && total() > pageSize()) {
            <div class="pagination" aria-label="文件分页">
              <button type="button" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">
                上一页
              </button>
              <span>第 {{ page() }} / {{ totalPages() }} 页 · 共 {{ total() }} 项</span>
              <button
                type="button"
                [disabled]="page() >= totalPages()"
                (click)="goToPage(page() + 1)"
              >
                下一页
              </button>
            </div>
          }
          @if (loading()) {
            <p class="state">正在读取资源…</p>
          } @else if (errorMessage()) {
            <p class="state error" role="alert">{{ errorMessage() }}</p>
          } @else {
            <div
              class="file-grid"
              cdkDropList
              [cdkDropListData]="currentParentId()"
              (cdkDropListDropped)="dropToCurrent($event)"
              (click)="clearSelection()"
              (contextmenu)="openBlankMenu($event)"
              role="listbox"
              aria-label="当前目录文件"
            >
              @for (entry of filteredEntries(); track entry.kind + ':' + entry.id) {
                <article
                  class="file-tile"
                  [class.selected]="isSelected(entry)"
                  [class.folder-tile]="isFolder(entry)"
                  role="option"
                  [attr.aria-selected]="isSelected(entry)"
                  tabindex="0"
                  cdkDrag
                  [cdkDragData]="entry"
                  (cdkDragStarted)="dragStarted($event)"
                  (pointerdown)="rememberDragModifier($event)"
                  (click)="selectEntry(entry, $event)"
                  (dblclick)="activateEntry(entry)"
                  (contextmenu)="openEntryMenu($event, entry)"
                >
                  <div class="tile-icon" aria-hidden="true">
                    {{ isFolder(entry) ? '▰' : fileIcon(entry) }}
                  </div>
                  <strong>{{ entry.name }}</strong>
                  @if (isFolder(entry)) {
                    <small
                      >{{ entry.file_count ?? entry.collection?.file_count ?? 0 }} 个文件</small
                    >
                  } @else {
                    <small
                      >{{ (entry.file?.format || entry.format || '未知').toUpperCase() }} ·
                      {{ formatBytes(entry.file?.size_bytes ?? entry.size_bytes ?? 0) }}</small
                    >
                  }
                  <ng-template cdkDragPreview
                    ><span class="drag-preview">{{ dragPreviewLabel(entry) }}</span></ng-template
                  >
                </article>
              } @empty {
                <div class="blank-state">
                  <span>⌁</span>
                  <p>此目录为空</p>
                  <small>可将文件拖入这里，或在空白处右键粘贴。</small>
                </div>
              }
            </div>
          }
        </main>
      </div>
    </mat-card>

    @if (menu(); as menuState) {
      <div
        class="context-menu"
        [style.left.px]="menuState.x"
        [style.top.px]="menuState.y"
        (click)="$event.stopPropagation()"
      >
        @if (!menuState.entry) {
          @if (canCreateCollection()) {
            <button type="button" (click)="startCreateCollection()">新建数据集</button>
          }
          @if (canUploadFile()) {
            <button type="button" (click)="openUploadPicker()">上传文件</button>
          }
          <button type="button" (click)="loadExplorer(); menu.set(null)">刷新</button>
        }
        @if (menuState.entry && isFolder(menuState.entry)) {
          <button type="button" (click)="activateEntry(menuState.entry)">打开数据集</button>
        }
        @if (menuState.entry && isFolder(menuState.entry) && canDeleteEntry(menuState.entry)) {
          <button type="button" class="danger" (click)="deleteFolder(menuState.entry)">
            删除数据集
          </button>
        }
        @if (menuState.entry && !isFolder(menuState.entry)) {
          <button type="button" (click)="activateEntry(menuState.entry)">预览文件</button>
        }
        @if (menuState.entry && selectedIds().size && canCopyEntry(menuState.entry)) {
          <button type="button" (click)="copySelectionToClipboard()">复制</button>
        }
        @if (menuState.entry && selectedIds().size && canMoveEntry(menuState.entry)) {
          <span class="menu-label">移动到…</span>
          @for (folder of moveTargets(); track folder.id) {
            <button type="button" (click)="moveSelectionTo(folder.id)">
              移动到 {{ folder.name }}
            </button>
          }
        }
        @if (
          menuState.entry &&
          selectedIds().size &&
          currentParentId() !== null &&
          currentParentId() !== UNASSIGNED &&
          canMoveEntry(menuState.entry)
        ) {
          <button type="button" (click)="removeFromCollection()">移出数据集</button>
        }
        @if (
          menuState.entry && isFolder(menuState.entry) && canWriteFiles() && clipboard().length
        ) {
          <button type="button" (click)="pasteIntoEntry(menuState.entry)">粘贴到此处</button>
        }
        @if (!menuState.entry && canWriteFiles() && clipboard().length) {
          <button type="button" (click)="pasteIntoCurrent()">粘贴到此处</button>
        }
        @if (menuState.entry && canDeleteEntry(menuState.entry) && selectedDeletableCount()) {
          <button type="button" class="danger" (click)="deleteSelection()">删除所选</button>
        }
        @if (!menuState.entry && !clipboard().length) {
          <span class="menu-hint">没有可粘贴的文件</span>
        }
      </div>
    }
    @if (previewFile(); as file) {
      <app-data-file-preview-dialog [file]="file" (close)="previewFile.set(null)" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .page-head,
    .actions,
    .explorer-toolbar,
    .pane-toolbar,
    .create-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-head,
    .explorer-toolbar {
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
    h1 {
      margin: 0 0 6px;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
    }
    .page-head p:not(.eyebrow) {
      margin: 0;
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
      padding: 15px;
    }
    .stat-grid span {
      color: #64748b;
      font-size: 12px;
    }
    .stat-grid strong {
      color: #0f172a;
      font-size: 22px;
    }
    .create-card,
    .explorer-card {
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
    .explorer-toolbar {
      padding-bottom: 14px;
      border-bottom: 1px solid #e2e8f0;
    }
    .toolbar-copy {
      display: grid;
      gap: 3px;
    }
    .toolbar-copy small {
      color: #64748b;
      font-size: 11px;
    }
    .search-field {
      width: min(280px, 100%);
    }
    .explorer-layout {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      min-height: 460px;
    }
    .side-nav {
      padding: 14px 12px 14px 0;
      border-right: 1px solid #e2e8f0;
    }
    .nav-entry {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 36px;
      padding: 7px 10px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #334155;
      text-align: left;
      cursor: pointer;
    }
    .nav-entry span:nth-child(2) {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .nav-entry small {
      color: #94a3b8;
    }
    .nav-entry:hover,
    .nav-entry.active {
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 600;
    }
    .nav-caption {
      margin: 18px 10px 7px;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 700;
    }
    .nav-empty {
      padding: 8px 10px;
      color: #94a3b8;
      font-size: 12px;
    }
    .folder-icon {
      color: #0284c7;
    }
    .file-pane {
      min-width: 0;
      padding: 14px 0 0 18px;
    }
    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 24px;
      color: #94a3b8;
      font-size: 12px;
    }
    .breadcrumbs button {
      border: 0;
      padding: 0;
      background: transparent;
      color: #0369a1;
      cursor: pointer;
    }
    .pane-toolbar {
      justify-content: space-between;
      margin: 14px 0;
      color: #334155;
      font-size: 13px;
      font-weight: 600;
    }
    .selection-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .selection-actions button {
      border: 0;
      background: transparent;
      color: #64748b;
      cursor: pointer;
    }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin: 0 0 10px;
      color: #64748b;
      font-size: 12px;
    }
    .pagination button {
      padding: 4px 9px;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      background: #fff;
      color: #334155;
      cursor: pointer;
    }
    .pagination button:disabled {
      cursor: default;
      opacity: 0.45;
    }
    .upload-button {
      position: relative;
      display: inline-flex;
      padding: 5px 9px;
      border: 1px solid #93c5fd;
      border-radius: 6px;
      color: #0369a1;
      font-size: 12px;
      cursor: pointer;
    }
    .upload-button input {
      position: absolute;
      inset: 0;
      width: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .visually-hidden {
      position: fixed;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .file-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
      min-height: 350px;
      align-content: start;
      padding: 4px;
      border-radius: 8px;
    }
    .file-tile {
      display: grid;
      gap: 7px;
      min-width: 0;
      min-height: 115px;
      padding: 13px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 9px;
      background: #fff;
      cursor: pointer;
      user-select: none;
    }
    .file-tile:hover {
      border-color: #93c5fd;
      background: #f8fbff;
    }
    .file-tile.selected {
      border-color: #0284c7;
      background: #e0f2fe;
      box-shadow: 0 0 0 1px #0284c7;
    }
    .tile-icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: #eff6ff;
      color: #0284c7;
      font-size: 22px;
    }
    .folder-tile .tile-icon {
      background: #fef3c7;
      color: #d97706;
    }
    .file-tile strong,
    .file-tile small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-tile small {
      color: #64748b;
      font-size: 11px;
    }
    .drag-preview {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 6px;
      background: #0369a1;
      color: #fff;
      font-size: 12px;
    }
    .blank-state,
    .state {
      grid-column: 1 / -1;
      padding: 55px 20px;
      color: #64748b;
      text-align: center;
    }
    .blank-state span {
      color: #93c5fd;
      font-size: 36px;
    }
    .blank-state p {
      margin: 5px 0;
    }
    .blank-state small {
      font-size: 11px;
    }
    .state.error {
      color: #b91c1c;
    }
    .context-menu {
      position: fixed;
      z-index: 1100;
      display: grid;
      min-width: 150px;
      padding: 5px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 10px 28px rgb(15 23 42 / 18%);
    }
    .context-menu button {
      border: 0;
      border-radius: 5px;
      padding: 8px 10px;
      background: transparent;
      color: #334155;
      text-align: left;
      cursor: pointer;
    }
    .context-menu button:hover {
      background: #f1f5f9;
    }
    .context-menu .menu-label {
      padding: 7px 10px 3px;
      color: #94a3b8;
      font-size: 11px;
    }
    .context-menu .danger {
      color: #b91c1c;
    }
    .menu-hint {
      padding: 8px 10px;
      color: #94a3b8;
      font-size: 12px;
    }
    @media (max-width: 760px) {
      .stat-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .explorer-layout {
        grid-template-columns: 1fr;
      }
      .side-nav {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 10px 0;
        border-right: 0;
        border-bottom: 1px solid #e2e8f0;
      }
      .nav-caption,
      .nav-empty {
        display: none;
      }
      .nav-entry {
        flex: 0 0 auto;
        width: auto;
        white-space: nowrap;
      }
      .nav-entry small {
        display: none;
      }
      .file-pane {
        padding-left: 0;
      }
    }
    @media (max-width: 560px) {
      .page-head,
      .explorer-toolbar,
      .create-row {
        align-items: stretch;
        flex-direction: column;
      }
      .actions {
        justify-content: flex-start;
      }
      .search-field {
        width: 100%;
      }
      .explorer-card,
      .create-card {
        padding: 12px;
      }
      .file-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class DataCollectionsPage {
  readonly UNASSIGNED = -1;
  private readonly service = inject(DataFileService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly subscriptions = new Subscription();

  readonly collections = signal<DataCollectionSummary[]>([]);
  readonly filesByCollection = signal(new Map<number, DataFileSummary[]>());
  readonly unassignedFiles = signal<DataFileSummary[]>([]);
  readonly selectedFile = signal<DataFileSummary | null>(null);
  readonly explorerItems = signal<ExplorerEntry[]>([]);
  readonly currentParentId = signal<number | null>(null);
  readonly breadcrumbs = signal<Array<{ id: number | null; name: string }>>([
    { id: null, name: '根目录' },
  ]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly selectedIds = signal<Set<number>>(new Set());
  readonly clipboard = signal<number[]>([]);
  readonly previewFile = signal<DataFileSummary | null>(null);
  readonly menu = signal<MenuState | null>(null);
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly total = signal(0);
  readonly showCreate = signal(false);
  readonly creating = signal(false);
  newName = '';
  newDescription = '';
  private anchorIndex = -1;
  private dragCopyModifier = false;
  private explorerRequest?: Subscription;
  private explorerGeneration = 0;
  @ViewChild('contextUploadPicker') private contextUploadPicker?: ElementRef<HTMLInputElement>;

  readonly rootFolders = computed(() => this.collections());
  readonly visibleFiles = computed(() =>
    this.filteredEntries()
      .filter((entry) => !this.isFolder(entry))
      .map((entry) => entry.file)
      .filter((file): file is DataFileSummary => !!file),
  );
  readonly filteredCollections = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.collections().filter(
      (item) => !term || `${item.name} ${item.description || ''}`.toLowerCase().includes(term),
    );
  });
  readonly totalBytes = computed(() =>
    this.visibleFiles().reduce((sum, file) => sum + (file.size_bytes || 0), 0),
  );
  readonly filteredEntries = computed(() => {
    const term = this.search().trim().toLowerCase();
    return this.explorerItems().filter((entry) => !term || entry.name.toLowerCase().includes(term));
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly moveTargets = computed(() =>
    this.collections().filter((folder) => folder.id !== this.currentParentId()),
  );

  constructor() {
    this.loadExplorer();
    this.subscriptions.add(
      interval(10000)
        .pipe(exhaustMap(() => this.refreshExplorer()))
        .subscribe(),
    );
  }
  ngOnDestroy(): void {
    this.explorerRequest?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  canCreateCollection(): boolean {
    return this.auth.hasPermission('data_collection:write');
  }
  canUploadFile(): boolean {
    return this.auth.hasPermission('data_file:write');
  }
  canWriteFiles(): boolean {
    return this.auth.hasPermission('data_file:write');
  }
  canDeleteFile(): boolean {
    return this.auth.hasPermission('data_file:delete');
  }
  canDeleteCollection(): boolean {
    return this.auth.hasPermission('data_collection:delete');
  }
  canManageCollection(): boolean {
    return this.canWriteFiles();
  }
  canCreateView(): boolean {
    return this.auth.hasPermission('data_view:write');
  }

  loadExplorer(parentId: number | null = this.currentParentId(), quiet = false): void {
    const listExplorer = (
      this.service as unknown as {
        listExplorer?: (
          id: number | null,
          collectionId?: number | null,
          options?: {
            query?: string;
            page?: number;
            page_size?: number;
            sort?: 'name' | 'updated_at' | 'created_at' | 'size_bytes' | 'file_kind';
            order?: 'asc' | 'desc';
          },
        ) => Observable<DataFileExplorerResponse>;
      }
    ).listExplorer;
    if (!listExplorer) {
      this.loadLegacyCollections();
      return;
    }
    const generation = ++this.explorerGeneration;
    this.explorerRequest?.unsubscribe();
    if (!quiet) {
      this.loading.set(true);
      this.errorMessage.set('');
    }
    this.explorerRequest = listExplorer
      .call(this.service, parentId, undefined, {
        query: this.search().trim() || undefined,
        page: this.page(),
        page_size: this.pageSize(),
        sort: 'updated_at',
        order: 'desc',
      })
      .subscribe({
        next: (response) => {
          if (generation !== this.explorerGeneration) return;
          this.applyExplorer(response || {}, parentId);
          this.updatePagination(response || {}, parentId);
          this.loading.set(false);
        },
        error: (error) => {
          if (generation !== this.explorerGeneration) return;
          this.loading.set(false);
          this.errorMessage.set('无法读取文件资源，请稍后重试。');
          this.notifications.error(error, '文件资源读取失败。');
        },
      });
  }
  navigate(parentId: number | null): void {
    this.search.set('');
    this.page.set(1);
    this.selectedIds.set(new Set());
    this.menu.set(null);
    this.loadExplorer(parentId);
  }
  searchChanged(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.loadExplorer(this.currentParentId());
  }
  goToPage(nextPage: number): void {
    const page = Math.min(Math.max(1, Math.trunc(nextPage)), this.totalPages());
    if (page === this.page()) return;
    this.page.set(page);
    this.loadExplorer(this.currentParentId());
  }
  currentFolderName(): string {
    return (
      this.collections().find((folder) => folder.id === this.currentParentId())?.name || '数据集'
    );
  }

  selectEntry(entry: ExplorerEntry, event: MouseEvent): void {
    event.stopPropagation();
    this.menu.set(null);
    const entries = this.filteredEntries();
    const index = entries.indexOf(entry);
    const next = new Set(
      event.shiftKey && this.anchorIndex >= 0
        ? this.selectedIds()
        : event.ctrlKey || event.metaKey
          ? this.selectedIds()
          : [],
    );
    if (event.shiftKey && this.anchorIndex >= 0) {
      const [from, to] = [Math.min(this.anchorIndex, index), Math.max(this.anchorIndex, index)];
      for (let i = from; i <= to; i++) {
        const id = this.entrySelectionId(entries[i]);
        if (id !== null) next.add(id);
      }
    } else {
      const id = this.entrySelectionId(entry);
      if (id !== null) {
        if (event.ctrlKey || event.metaKey) {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else next.add(id);
      }
    }
    this.anchorIndex = index;
    this.selectedIds.set(next);
    this.selectedFile.set(this.fileFromEntry(entry));
  }
  activateEntry(entry: ExplorerEntry): void {
    this.menu.set(null);
    if (this.isFolder(entry)) this.navigate(entry.id);
    else {
      const file = this.fileFromEntry(entry);
      if (file) this.previewFile.set(file);
    }
  }
  isSelected(entry: ExplorerEntry): boolean {
    const id = this.entrySelectionId(entry);
    return id !== null && this.selectedIds().has(id);
  }
  dragPreviewLabel(entry: ExplorerEntry): string {
    const id = this.entrySelectionId(entry);
    const count = id !== null && this.selectedIds().has(id) ? this.selectedIds().size : 1;
    return `${this.dragCopyModifier ? '复制' : '移动'} ${count} 个文件`;
  }
  isFolder(entry: ExplorerEntry): boolean {
    return (
      entry.kind === 'folder' ||
      entry.kind === 'collection' ||
      entry.kind === 'unassigned' ||
      entry.type === 'folder' ||
      entry.resource_type === 'folder' ||
      !!entry.collection
    );
  }
  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.selectedFile.set(null);
  }
  fileIcon(entry: ExplorerEntry): string {
    const kind = entry.file?.file_kind || '';
    return kind === 'topology' ? '⌘' : kind === 'spatial' ? '◈' : kind === 'document' ? '▤' : '▧';
  }
  formatBytes(value: number): string {
    if (!value) return '0 B';
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  rememberDragModifier(event: PointerEvent): void {
    this.dragCopyModifier = event.ctrlKey || event.metaKey;
  }
  dragStarted(event: unknown): void {
    const native = (event as { event?: MouseEvent }).event;
    if (native) this.dragCopyModifier = native.ctrlKey || native.metaKey;
  }
  dropToCurrent(event: CdkDragDrop<number | null>): void {
    const entry = event.item?.data as ExplorerEntry;
    const id = entry ? this.entryFileId(entry) : null;
    if (id !== null) {
      const allowed = this.dragCopyModifier ? this.canCopyEntry(entry) : this.canMoveEntry(entry);
      if (allowed)
        this.performAction(
          this.actionIds(id, this.dragCopyModifier),
          this.currentParentId(),
          this.dragCopyModifier,
        );
    }
  }
  dropToFolder(event: CdkDragDrop<number>, targetId?: number): void {
    const entry = event.item?.data as ExplorerEntry;
    const id = entry ? this.entryFileId(entry) : null;
    const target = targetId ?? event.container.data;
    if (id !== null) {
      const allowed = this.dragCopyModifier ? this.canCopyEntry(entry) : this.canMoveEntry(entry);
      if (allowed)
        this.performAction(
          this.actionIds(id, this.dragCopyModifier),
          target === this.UNASSIGNED ? null : target,
          this.dragCopyModifier,
        );
    }
  }
  copySelectionToClipboard(): void {
    if (!this.canWriteFiles()) return;
    this.clipboard.set([...this.selectedIds()]);
    this.menu.set(null);
    this.notifications.success('已复制到内部剪贴板。');
  }
  startCreateCollection(): void {
    this.menu.set(null);
    if (this.canCreateCollection()) this.showCreate.set(true);
  }
  openUploadPicker(): void {
    this.menu.set(null);
    if (!this.canUploadFile()) return;
    this.contextUploadPicker?.nativeElement.click();
  }
  pasteIntoEntry(entry: ExplorerEntry): void {
    if (!this.isFolder(entry) || entry.id === null) return;
    const target = entry.id === this.UNASSIGNED ? this.UNASSIGNED : entry.id;
    this.pasteIntoTarget(target);
    this.menu.set(null);
  }
  pasteIntoCurrent(): void {
    const ids = this.clipboard();
    if (!ids.length || !this.canWriteFiles()) return;
    if (this.currentParentId() === null) {
      this.notifications.error('请先进入目标数据集目录，再粘贴文件。');
      this.menu.set(null);
      return;
    }
    this.pasteIntoTarget(this.currentParentId());
    this.menu.set(null);
  }
  private pasteIntoTarget(target: number | null): void {
    const ids = this.clipboard();
    if (!ids.length || !this.canWriteFiles() || target === null) return;
    this.performAction(ids, target === this.UNASSIGNED ? null : target, true);
  }
  moveSelectionTo(targetCollectionId: number): void {
    const ids = this.actionIdsFromSelection(false);
    if (!ids.length || !this.canWriteFiles()) return;
    const sourceCollectionId = this.currentParentId();
    if (
      !window.confirm(
        `确定将选中的 ${ids.length} 个文件移动到“${this.collections().find((item) => item.id === targetCollectionId)?.name || '目标数据集'}”？`,
      )
    )
      return;
    this.performAction(
      ids,
      targetCollectionId,
      false,
      sourceCollectionId !== null && sourceCollectionId > 0 ? sourceCollectionId : undefined,
    );
    this.menu.set(null);
  }
  removeFromCollection(): void {
    const sourceCollectionId = this.currentParentId();
    if (sourceCollectionId === null || sourceCollectionId <= 0) return;
    const ids = this.actionIdsFromSelection(false);
    if (!ids.length || !this.canWriteFiles()) return;
    if (!window.confirm(`确定将选中的 ${ids.length} 个文件移出“${this.currentFolderName()}”？`))
      return;
    this.performAction(ids, null, false, sourceCollectionId);
    this.menu.set(null);
  }
  deleteSelection(): void {
    const ids = [...this.selectedIds()].filter((id) => {
      const entry = this.explorerItems().find((item) => this.entryFileId(item) === id);
      return !!entry && this.canDeleteEntry(entry);
    });
    if (!ids.length || !this.canDeleteFile()) return;
    if (!window.confirm(`确定删除选中的 ${ids.length} 个文件？文件将移入回收站。`)) return;
    this.subscriptions.add(
      this.service.deleteFiles(ids).subscribe({
        next: () => {
          this.notifications.success('所选文件已移入回收站。');
          this.clearSelection();
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '批量删除失败。'),
      }),
    );
    this.menu.set(null);
  }
  selectedDeletableCount(): number {
    return [...this.selectedIds()].filter((id) => {
      const entry = this.explorerItems().find((item) => this.entryFileId(item) === id);
      return !!entry && this.canDeleteEntry(entry);
    }).length;
  }
  openEntryMenu(event: MouseEvent, entry: ExplorerEntry): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isSelected(entry)) this.selectEntry(entry, event);
    this.menu.set({
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 180),
      entry,
    });
  }
  openBlankMenu(event: MouseEvent): void {
    event.preventDefault();
    this.menu.set({
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 120),
      entry: null,
    });
  }
  @HostListener('document:click') closeMenu(): void {
    this.menu.set(null);
  }
  @HostListener('document:keydown', ['$event']) handleKeyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copySelectionToClipboard();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.pasteIntoCurrent();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      this.deleteSelection();
    } else if (event.key === 'Enter') {
      const ids = [...this.selectedIds()];
      if (ids.length !== 1) return;
      const entry = this.explorerItems().find((item) => this.entrySelectionId(item) === ids[0]);
      if (entry) {
        event.preventDefault();
        this.activateEntry(entry);
      }
    } else if (event.key === 'Escape') {
      if (this.menu()) {
        this.menu.set(null);
        return;
      }
      if (this.previewFile()) {
        this.previewFile.set(null);
        return;
      }
      this.clearSelection();
    }
  }

  // Kept for the established data-file-preview-panel/workflow and existing callers.
  onViewChange(view: DataFileViewSelection): void {
    if (!this.canCreateView()) return;
    const mapping =
      view.output_mode === 'table'
        ? { selected_columns: view.selected_columns || [] }
        : {
            time_column: view.time_column || '',
            value_column: view.value_column || '',
            ...(view.point_column ? { point_column: view.point_column } : {}),
          };
    const payload: DataFileViewCreate = { view_kind: view.output_mode, mapping };
    this.subscriptions.add(
      this.service.createView(view.file_version_id, payload).subscribe({
        next: () =>
          this.notifications.success(
            `${view.output_mode === 'table' ? '表格' : '时序'}数据视图已创建。`,
          ),
        error: (error) => this.notifications.error(error, '数据视图创建失败。'),
      }),
    );
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
            this.loadExplorer();
          },
          error: (error) => {
            this.creating.set(false);
            this.notifications.error(error, '数据集创建失败。');
          },
        }),
    );
  }
  uploadIntoCurrent(event: Event): void {
    const parentId = this.currentParentId();
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file)
      this.uploadFile(
        parentId !== null && parentId > 0
          ? ({ id: parentId, name: this.currentFolderName() } as DataCollectionSummary)
          : null,
        event,
      );
  }
  uploadFile(collection: DataCollectionSummary | null, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.canUploadFile()) return;
    this.subscriptions.add(
      this.service.uploadFile(collection?.id ?? null, file).subscribe({
        next: (result) => {
          this.notifications.success(
            result.task_id ? '文件已上传，正在解析。' : '文件上传已完成。',
          );
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '文件上传失败。'),
      }),
    );
  }
  deleteUnassignedFile(file: DataFileSummary, event?: Event): void {
    event?.stopPropagation();
    if (
      !this.canDeleteFile() ||
      !window.confirm(`确定删除无归属文件“${file.name}”？文件将移入回收站。`)
    )
      return;
    this.subscriptions.add(
      this.service.deleteFile(file.id).subscribe({
        next: () => {
          this.notifications.success('文件已移入回收站。');
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '删除文件失败。'),
      }),
    );
  }
  deleteCollection(collection: DataCollectionSummary, event?: Event): void {
    event?.stopPropagation();
    if (
      !this.canDeleteCollection() ||
      !window.confirm(`确定删除数据集“${collection.name}”？数据集将移入回收站。`)
    )
      return;
    this.subscriptions.add(
      this.service.deleteCollection(collection.id).subscribe({
        next: () => {
          this.notifications.success('数据集已移入回收站。');
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '删除数据集失败。'),
      }),
    );
  }
  deleteFolder(entry: ExplorerEntry): void {
    this.menu.set(null);
    if (!entry.id || entry.id <= 0 || !this.canDeleteCollection()) return;
    const folder = entry.collection || this.collections().find((item) => item.id === entry.id);
    if (folder) this.deleteCollection(folder);
  }
  removeFile(collection: DataCollectionSummary, file: DataFileSummary, event?: Event): void {
    event?.stopPropagation();
    if (
      !this.canManageCollection() ||
      !window.confirm(`确定将“${file.name}”移出数据集“${collection.name}”？原文件不会被删除。`)
    )
      return;
    this.subscriptions.add(
      this.service.removeFileFromCollection(collection.id, file.id).subscribe({
        next: () => {
          if (this.selectedFile()?.id === file.id) this.selectedFile.set(null);
          this.notifications.success('文件已移出数据集，原文件仍保留。');
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '移出文件失败。'),
      }),
    );
  }

  canMoveEntry(entry: ExplorerEntry): boolean {
    return (
      !this.isFolder(entry) &&
      this.canWriteFiles() &&
      entry.can_move !== false &&
      entry.file?.file_kind !== 'demo' &&
      entry.file_kind !== 'demo'
    );
  }
  canCopyEntry(entry: ExplorerEntry): boolean {
    if (this.isFolder(entry) || !this.canWriteFiles()) return false;
    // The platform demonstration file is immutable in place, but may be deep-copied.
    if (entry.file?.file_kind === 'demo' || entry.file_kind === 'demo') return true;
    return entry.can_copy !== false;
  }
  canDeleteEntry(entry: ExplorerEntry): boolean {
    if (this.isFolder(entry))
      return (
        (entry.can_delete ?? entry.collection?.can_delete) === true && this.canDeleteCollection()
      );
    return (
      this.canDeleteFile() &&
      entry.can_delete !== false &&
      entry.file?.file_kind !== 'demo' &&
      entry.file_kind !== 'demo'
    );
  }
  private actionIdsFromSelection(copy: boolean): number[] {
    return [...this.selectedIds()].filter((itemId) => {
      const entry = this.explorerItems().find((item) => this.entryFileId(item) === itemId);
      return !!entry && (copy ? this.canCopyEntry(entry) : this.canMoveEntry(entry));
    });
  }
  private performAction(
    ids: number[],
    target: number | null,
    copy: boolean,
    sourceCollectionId?: number,
  ): void {
    if (!this.canWriteFiles() || !ids.length) return;
    const operation = copy
      ? this.service.copyFiles(ids, target)
      : this.service.moveFiles(ids, target, sourceCollectionId);
    this.subscriptions.add(
      operation.subscribe({
        next: (result) => {
          const conflicts = result?.conflicts || [];
          if (conflicts.length)
            this.notifications.error(
              `${conflicts.length} 个文件存在名称冲突，目录已刷新。`,
              '操作未完全完成。',
            );
          else if (
            copy &&
            (['queued', 'pending', 'accepted'].includes((result?.status || '').toLowerCase()) ||
              !!result?.task_id)
          ) {
            const taskHint = result?.task_id ? `（任务 ${result.task_id}）` : '';
            this.notifications.success(`复制任务已排队，稍后刷新查看副本${taskHint}`);
          } else this.notifications.success(copy ? '文件已深拷贝。' : '文件已移动。');
          this.clearSelection();
          this.loadExplorer();
        },
        error: (error) => {
          this.notifications.error(error, copy ? '复制文件失败。' : '移动文件失败。');
          this.loadExplorer();
        },
      }),
    );
  }
  private actionIds(id: number, copy = false): number[] {
    const ids = this.selectedIds().has(id) ? [...this.selectedIds()] : [id];
    return ids.filter((itemId) => {
      const entry = this.explorerItems().find((item) => this.entryFileId(item) === itemId);
      return !!entry && (copy ? this.canCopyEntry(entry) : this.canMoveEntry(entry));
    });
  }
  private applyExplorer(response: DataFileExplorerResponse, parentId: number | null): void {
    const folders = response.folders || response.collections || [];
    const rootCollections = folders.filter(
      (folder) => folder.id !== null && folder.id !== undefined,
    );
    if (parentId === null || rootCollections.length)
      this.collections.set(
        rootCollections.map((folder) => ({
          ...folder,
          file_count: folder.file_count ?? 0,
          storage_bytes: folder.storage_bytes ?? 0,
          parse_issue_count: folder.parse_issue_count ?? 0,
        })),
      );
    this.currentParentId.set(parentId);
    const entries: ExplorerEntry[] = [];
    // `items` is the authoritative, paginated collection. Older responses may
    // only expose `files`; never append both, since `files` can be unpaginated.
    const rawItems: DataFileExplorerItem[] = Array.isArray(response.items)
      ? response.items
      : (response.files || []).map((file) => ({ ...file, kind: 'file' }));
    for (const item of rawItems) {
      const virtualUnassigned =
        item.kind === 'unassigned' || (item.id === null && item.type === 'folder');
      const kind = virtualUnassigned
        ? 'folder'
        : item.kind || item.type || item.resource_type || (item.collection ? 'folder' : 'file');
      if (parentId === null && kind !== 'folder' && kind !== 'collection') continue;
      entries.push({
        ...item,
        id: virtualUnassigned ? this.UNASSIGNED : item.id,
        kind,
        name:
          item.name ||
          item.file?.name ||
          item.collection?.name ||
          (virtualUnassigned ? '无归属' : ''),
        file: item.file || this.fileFromRawExplorerItem(item),
      });
    }
    for (const folder of rootCollections)
      if (!entries.some((entry) => this.isFolder(entry) && entry.id === folder.id))
        entries.push({ id: folder.id, name: folder.name, kind: 'folder', collection: folder });
    // The API keeps the root folder list complete while the root item list is
    // paginated. Keep the virtual unassigned folder visible even when sorting
    // puts it outside the first page; the left navigation remains available
    // as an alternate entry point.
    if (
      parentId === null &&
      !this.search().trim() &&
      !entries.some((entry) => entry.id === this.UNASSIGNED)
    ) {
      entries.unshift({ id: this.UNASSIGNED, name: '无归属文件', kind: 'unassigned' });
    }
    this.explorerItems.set(entries);
    this.breadcrumbs.set(
      response.breadcrumbs?.length
        ? response.breadcrumbs.map((crumb) => ({ id: crumb.id, name: crumb.name }))
        : [
            { id: null, name: '根目录' },
            ...(parentId !== null && parentId !== this.UNASSIGNED
              ? [{ id: parentId, name: this.currentFolderName() }]
              : parentId === this.UNASSIGNED
                ? [{ id: this.UNASSIGNED, name: '无归属' }]
                : []),
          ],
    );
    this.unassignedFiles.set(
      parentId === this.UNASSIGNED ? this.visibleFiles() : this.unassignedFiles(),
    );
  }
  private updatePagination(response: DataFileExplorerResponse, parentId: number | null): void {
    // Root navigation always keeps the complete folder list visible. Its file
    // pagination metadata must therefore not create empty root pages.
    if (parentId === null) {
      this.page.set(1);
      this.total.set(this.collections().length);
      return;
    }
    const pagination = response.pagination || {};
    const page = Number(pagination.page ?? response.page ?? this.page());
    const pageSize = Number(pagination.page_size ?? response.page_size ?? this.pageSize());
    const total = Number(
      pagination.total ??
        response.total ??
        (Array.isArray(response.items) ? response.items.length : (response.files || []).length),
    );
    if (Number.isFinite(page) && page > 0) this.page.set(Math.trunc(page));
    if (Number.isFinite(pageSize) && pageSize > 0) this.pageSize.set(Math.trunc(pageSize));
    this.total.set(Number.isFinite(total) && total >= 0 ? Math.trunc(total) : 0);
  }
  private refreshExplorer() {
    const listExplorer = (
      this.service as unknown as {
        listExplorer?: (
          id: number | null,
          collectionId?: number | null,
          options?: {
            query?: string;
            page?: number;
            page_size?: number;
            sort?: 'name' | 'updated_at' | 'created_at' | 'size_bytes' | 'file_kind';
            order?: 'asc' | 'desc';
          },
        ) => Observable<DataFileExplorerResponse>;
      }
    ).listExplorer;
    const parentId = this.currentParentId();
    if (!listExplorer) return EMPTY;
    this.loadExplorer(parentId, true);
    return of(null);
  }
  private loadLegacyCollections(): void {
    const list = (
      this.service as unknown as { listCollections?: () => Observable<DataCollectionSummary[]> }
    ).listCollections;
    if (!list) return;
    this.subscriptions.add(
      list.call(this.service).subscribe({
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
  private entryFileId(entry: ExplorerEntry | undefined): number | null {
    if (!entry || this.isFolder(entry)) return null;
    return entry.file?.id ?? entry.file_id ?? (entry.id && entry.id > 0 ? entry.id : null);
  }
  private entrySelectionId(entry: ExplorerEntry | undefined): number | null {
    if (!entry) return null;
    const fileId = this.entryFileId(entry);
    if (fileId !== null) return fileId;
    return this.isFolder(entry) && entry.id !== null && entry.id > 0 ? entry.id : null;
  }
  private fileFromEntry(entry: ExplorerEntry): DataFileSummary | null {
    if (entry.file) return entry.file;
    if (this.isFolder(entry)) return null;
    return {
      id: entry.file_id ?? entry.id ?? 0,
      name: entry.name,
      file_kind: 'other',
      format: entry.format || '',
      status: 'ready',
      version_count: 0,
      current_version_id: null,
      size_bytes: entry.size_bytes || 0,
      created_at: '',
      updated_at: entry.updated_at || '',
    };
  }
  private fileFromRawExplorerItem(item: DataFileExplorerItem): DataFileSummary | null {
    if (item.kind === 'file' || item.type === 'file' || item.resource_type === 'file') {
      return {
        id: item.file_id ?? item.id ?? 0,
        name: item.name,
        file_kind: (item.file_kind || 'other') as DataFileSummary['file_kind'],
        format: item.format || '',
        status: item.status || 'ready',
        version_count: item.version_count || 0,
        current_version_id: item.current_version_id ?? null,
        current_version: item.current_version,
        profile_status: item.profile_status as DataFileSummary['profile_status'],
        row_count: item.row_count,
        size_bytes: item.size_bytes || 0,
        parse_issue_count: item.parse_issue_count,
        created_at: item.created_at || '',
        updated_at: item.updated_at || '',
      };
    }
    return null;
  }
}
