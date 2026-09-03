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
import { EMPTY, Observable, Subscription, forkJoin, interval, of } from 'rxjs';
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
import { DataFileInspectorDialogComponent } from './data-file-inspector-dialog.component';

type ExplorerEntry = DataFileExplorerItem & {
  file?: DataFileSummary | null;
  collection?: DataFileExplorerFolder | null;
};
type MenuState = { x: number; y: number; entry: ExplorerEntry | null };
type EditingResource =
  { kind: 'collection'; id: number } | { kind: 'file'; id: number; collectionId: number };

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
    DataFileInspectorDialogComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">数据中心</p>
        <h1>数据集管理</h1>
        <p>管理数据集，并在进入数据集后查看和整理其中的文件。</p>
      </div>
    </header>

    @if (currentParentId() === null) {
      <section class="stat-grid" aria-label="数据集统计">
        <mat-card class="stat-card">
          <span>数据集</span>
          <strong>{{ statsCollections().length }}</strong>
          <small class="stat-monthly">+{{ newDatasetsThisMonth() }} 本月新增</small>
        </mat-card>
        <mat-card class="stat-card">
          <span>数据文件</span>
          <strong>{{ totalDatasetFiles() }}</strong>
          <small class="stat-monthly"
            >+{{ monthlyNewFiles() === null ? '—' : monthlyNewFiles() }} 本月新增</small
          >
        </mat-card>
        <mat-card class="stat-card">
          <span>存储用量</span>
          <strong>{{ formatBytes(totalDatasetStorage()) }}</strong>
          <small>数据集文件总容量</small>
        </mat-card>
      </section>
    }

    @if (showCreate() && canCreateCollection()) {
      <div class="dialog-backdrop" role="presentation" (click)="closeCreate()">
        <section
          class="create-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <div>
              <p class="eyebrow">数据中心</p>
              <h2 id="create-dialog-title">新建数据集</h2>
              <p>先创建一个数据集，再决定现在上传文件还是稍后整理。</p>
            </div>
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭"
              [disabled]="creating()"
              (click)="closeCreate()"
            >
              ×
            </button>
          </div>

          <div class="create-dialog-body">
            <div class="create-basic">
              <mat-form-field appearance="outline">
                <mat-label>数据集名称</mat-label>
                <input matInput [(ngModel)]="newName" placeholder="例如：2024年夏季水质数据" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>说明或简介（可选）</mat-label>
                <textarea
                  matInput
                  rows="5"
                  [(ngModel)]="newDescription"
                  placeholder="简单描述这组数据的来源或用途"
                ></textarea>
              </mat-form-field>
            </div>

            <div class="create-choice">
              <div class="choice-label">接下来要做什么？</div>
              <button
                type="button"
                class="choice-card"
                [class.selected]="createMode() === 'upload'"
                [disabled]="!canUploadFile()"
                (click)="createMode.set('upload')"
              >
                <span class="choice-radio" aria-hidden="true"></span>
                <span>
                  <strong>立即上传文件</strong>
                  <small>{{
                    canUploadFile()
                      ? '创建数据集后，马上选择一个文件上传。'
                      : '当前账号没有上传文件权限。'
                  }}</small>
                </span>
              </button>
              @if (createMode() === 'upload') {
                <label class="dialog-file-picker">
                  <span>{{ createFile()?.name || '选择要上传的文件' }}</span>
                  <small>支持的数据文件格式与文件管理中的上传保持一致。</small>
                  <input type="file" (change)="chooseCreateFile($event)" />
                </label>
              }
              <button
                type="button"
                class="choice-card"
                [class.selected]="createMode() === 'directory'"
                (click)="createMode.set('directory')"
              >
                <span class="choice-radio" aria-hidden="true"></span>
                <span>
                  <strong>仅创建一个目录</strong>
                  <small>先建立数据集目录，之后在目录管理中上传文件。</small>
                </span>
              </button>
            </div>
          </div>

          <div class="dialog-footer">
            <span class="dialog-hint">
              @if (createMode() === 'upload' && !createFile()) {
                请选择文件后再创建
              } @else {
                创建后可以继续在目录中管理文件
              }
            </span>
            <div class="dialog-actions">
              <button mat-button type="button" [disabled]="creating()" (click)="closeCreate()">
                取消
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="!canSubmitCreate()"
                (click)="createCollection()"
              >
                {{ creating() ? '正在创建…' : '创建数据集' }}
              </button>
            </div>
          </div>
        </section>
      </div>
    }

    @if (editingResource(); as resource) {
      <div class="dialog-backdrop" role="presentation" (click)="closeEditor()">
        <section
          class="create-dialog edit-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <div>
              <p class="eyebrow">数据管理</p>
              <h2 id="edit-dialog-title">
                编辑{{ resource.kind === 'collection' ? '数据集' : '数据表' }}
              </h2>
              <p>
                修改后会同步更新列表中的名称{{ resource.kind === 'collection' ? '和简介' : '' }}。
              </p>
            </div>
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭"
              [disabled]="editingSaving()"
              (click)="closeEditor()"
            >
              ×
            </button>
          </div>
          <div class="edit-dialog-body">
            <mat-form-field appearance="outline">
              <mat-label>{{
                resource.kind === 'collection' ? '数据集名称' : '数据表名称'
              }}</mat-label>
              <input matInput [(ngModel)]="editName" />
            </mat-form-field>
            @if (resource.kind === 'collection') {
              <mat-form-field appearance="outline">
                <mat-label>说明或简介（可选）</mat-label>
                <textarea matInput rows="5" [(ngModel)]="editDescription"></textarea>
              </mat-form-field>
            }
          </div>
          <div class="dialog-footer">
            <span class="dialog-hint">{{ editingSaving() ? '正在保存…' : '名称不能为空' }}</span>
            <div class="dialog-actions">
              <button mat-button type="button" [disabled]="editingSaving()" (click)="closeEditor()">
                取消
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="!canSubmitEdit()"
                (click)="saveEdit()"
              >
                {{ editingSaving() ? '保存中…' : '保存修改' }}
              </button>
            </div>
          </div>
        </section>
      </div>
    }

    @if (uploadCollectionTarget(); as collection) {
      <div class="dialog-backdrop" role="presentation" (click)="closeUploadDialog()">
        <section
          class="create-dialog upload-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-dialog-title"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <div>
              <p class="eyebrow">数据中心</p>
              <h2 id="upload-dialog-title">新增数据表</h2>
              <p>上传一个文件，将它添加到当前数据集。</p>
            </div>
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭"
              [disabled]="uploadingToCollection()"
              (click)="closeUploadDialog()"
            >
              ×
            </button>
          </div>
          <div class="upload-dialog-body">
            <div class="upload-target">
              <span>目标数据集</span>
              <strong>{{ collection.name }}</strong>
              @if (collection.description?.trim()) {
                <small>{{ collection.description }}</small>
              }
            </div>
            <label class="dialog-file-picker">
              <span>
                {{
                  uploadSelectedFiles().length
                    ? '已选择 ' + uploadSelectedFiles().length + ' 个文件'
                    : '选择要上传的文件'
                }}
              </span>
              <small>
                {{
                  uploadSelectedFiles().length
                    ? uploadFileNames()
                    : '可一次选择多个文件，文件上传后会作为该数据集中的数据表。'
                }}
              </small>
              <input type="file" multiple (change)="chooseUploadFiles($event)" />
            </label>
          </div>
          <div class="dialog-footer">
            <span class="dialog-hint">
              {{ uploadingToCollection() ? '正在上传…' : '请选择一个或多个文件后上传' }}
            </span>
            <div class="dialog-actions">
              <button
                mat-button
                type="button"
                [disabled]="uploadingToCollection()"
                (click)="closeUploadDialog()"
              >
                取消
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="!canSubmitUpload()"
                (click)="submitUpload()"
              >
                {{ uploadingToCollection() ? '上传中…' : '开始上传' }}
              </button>
            </div>
          </div>
        </section>
      </div>
    }

    <mat-card class="explorer-card" (contextmenu)="openBlankMenu($event)">
      @if (currentParentId() === null) {
        <div class="dataset-table-view">
          <div class="dataset-table-toolbar">
            <mat-form-field appearance="outline" class="dataset-table-search">
              <mat-label>搜索</mat-label>
              <input
                matInput
                [ngModel]="search()"
                (ngModelChange)="searchChanged($event)"
                placeholder="搜索"
              />
            </mat-form-field>
            <div class="dataset-table-actions">
              <button mat-stroked-button type="button" (click)="loadExplorer()">刷新</button>
              @if (managementMode()) {
                <button
                  mat-stroked-button
                  class="management-delete-button"
                  type="button"
                  [disabled]="!selectedManagementCount()"
                  (click)="deleteManagedSelection()"
                >
                  删除选中{{
                    selectedManagementCount() ? '（' + selectedManagementCount() + '）' : ''
                  }}
                </button>
                <button mat-button type="button" (click)="toggleManagementMode()">完成</button>
              } @else if (canManageDataResources()) {
                <button mat-stroked-button type="button" (click)="toggleManagementMode()">
                  管理
                </button>
              }
              @if (canCreateCollection()) {
                <button mat-flat-button color="primary" type="button" (click)="openCreate()">
                  新建数据集
                </button>
              }
            </div>
          </div>

          @if (loading()) {
            <p class="dataset-table-state">正在读取数据集…</p>
          } @else if (errorMessage()) {
            <p class="dataset-table-state error" role="alert">{{ errorMessage() }}</p>
          } @else {
            <div class="dataset-table" role="table" aria-label="数据集列表">
              <div class="dataset-table-head" role="row">
                <span role="columnheader">数据集</span>
                <span role="columnheader">文件数 / 大小</span>
                <span role="columnheader">更新时间</span>
                <span role="columnheader">操作</span>
              </div>
              @for (dataset of filteredCollections(); track dataset.id) {
                <div
                  class="dataset-table-row"
                  [class.expanded]="isDatasetExpanded(dataset.id)"
                  [attr.aria-expanded]="isDatasetExpanded(dataset.id)"
                  role="row"
                  tabindex="0"
                  (click)="toggleDataset(dataset.id)"
                  (keydown.enter)="toggleDataset(dataset.id)"
                  (keydown.space)="$event.preventDefault(); toggleDataset(dataset.id)"
                >
                  <div class="dataset-table-name" role="cell">
                    @if (managementMode()) {
                      <input
                        class="management-checkbox"
                        type="checkbox"
                        [checked]="isCollectionSelected(dataset.id)"
                        [disabled]="!canDeleteFile()"
                        aria-label="选择该数据集中的全部数据表"
                        (click)="$event.stopPropagation()"
                        (change)="toggleCollectionSelection(dataset.id)"
                      />
                    }
                    <span class="dataset-type-icon folder-glyph" aria-hidden="true"></span>
                    <span class="dataset-table-copy">
                      <strong>{{ dataset.name }}</strong>
                      @if (dataset.description?.trim()) {
                        <small>{{ dataset.description }}</small>
                      }
                    </span>
                  </div>
                  <span class="dataset-table-metrics" role="cell"
                    >{{ dataset.file_count }} 个文件 /
                    {{ formatBytes(dataset.storage_bytes) }}</span
                  >
                  <span class="dataset-table-updated" role="cell">
                    {{ formatRelativeTime(dataset.updated_at) }}
                  </span>
                  <span class="dataset-table-operation" role="cell">
                    @if (managementMode() && canCreateCollection()) {
                      <button
                        mat-button
                        type="button"
                        (click)="$event.stopPropagation(); openCollectionEditor(dataset)"
                      >
                        编辑
                      </button>
                    }
                    @if (managementMode() && canDeleteCollection()) {
                      <button
                        mat-button
                        class="management-danger-text"
                        type="button"
                        (click)="$event.stopPropagation(); deleteManagedCollection(dataset)"
                      >
                        删除数据集
                      </button>
                    }
                    <button
                      mat-flat-button
                      color="primary"
                      type="button"
                      (click)="$event.stopPropagation(); openUploadDialog(dataset)"
                    >
                      新增数据表
                    </button>
                    <span
                      class="dataset-expand-indicator"
                      [class.expanded]="isDatasetExpanded(dataset.id)"
                      aria-hidden="true"
                    ></span>
                  </span>
                </div>
                @if (isDatasetExpanded(dataset.id)) {
                  <div class="dataset-expanded-panel" role="region">
                    @if (expandedFileLoading().has(dataset.id)) {
                      <p class="dataset-expanded-state">正在读取数据表…</p>
                    } @else if (expandedFileErrors().get(dataset.id); as message) {
                      <p class="dataset-expanded-state error" role="alert">{{ message }}</p>
                    } @else {
                      <div
                        class="dataset-files-table"
                        role="table"
                        [attr.aria-label]="dataset.name + ' 中的数据表'"
                      >
                        <div class="dataset-files-head" role="row">
                          <span class="dataset-files-heading" role="columnheader">
                            数据表
                            @if (managementMode()) {
                              <label class="table-select-all">
                                <input
                                  class="management-checkbox"
                                  type="checkbox"
                                  [checked]="areAllTablesSelected(dataset.id)"
                                  [indeterminate]="areSomeTablesSelected(dataset.id)"
                                  [disabled]="
                                    !filesForDataset(dataset.id).length || !canDeleteFile()
                                  "
                                  aria-label="全选该数据集的数据表"
                                  (click)="$event.stopPropagation()"
                                  (change)="toggleAllTables(dataset.id)"
                                />
                                <span>全选</span>
                              </label>
                            }
                          </span>
                          <span role="columnheader">大小</span>
                          <span role="columnheader">更新时间</span>
                          <span role="columnheader">数据</span>
                        </div>
                        @for (file of filesForDataset(dataset.id); track file.id) {
                          <div class="dataset-file-row" role="row">
                            <div class="dataset-file-name" role="cell">
                              @if (managementMode()) {
                                <input
                                  class="management-checkbox"
                                  type="checkbox"
                                  [checked]="isTableSelected(file.id)"
                                  [disabled]="!canDeleteFile()"
                                  aria-label="选择数据表"
                                  (click)="$event.stopPropagation()"
                                  (change)="toggleTableSelection(file.id)"
                                />
                              }
                              <span class="dataset-file-icon file-glyph" aria-hidden="true"></span>
                              <span class="dataset-file-copy">
                                <strong>{{ file.name }}</strong>
                                <small>
                                  {{ fileVersionLabel(file) }} · {{ fileAnalysisLabel(file) }}
                                </small>
                              </span>
                            </div>
                            <span role="cell">{{ formatBytes(file.size_bytes) }}</span>
                            <span role="cell">{{ formatRelativeTime(file.updated_at) }}</span>
                            <span class="dataset-file-preview" role="cell">
                              @if (managementMode() && canWriteFiles()) {
                                <button
                                  mat-button
                                  type="button"
                                  (click)="
                                    $event.stopPropagation(); openFileEditor(dataset.id, file)
                                  "
                                >
                                  编辑
                                </button>
                              }
                              @if (!managementMode() && canGovernFile(file)) {
                                <button
                                  mat-button
                                  type="button"
                                  (click)="$event.stopPropagation(); inspectFile(file, true)"
                                >
                                  治理
                                </button>
                              }
                              <button
                                mat-stroked-button
                                type="button"
                                (click)="$event.stopPropagation(); inspectFile(file)"
                              >
                                查看详情
                              </button>
                            </span>
                          </div>
                        } @empty {
                          <p class="dataset-expanded-state">该数据集暂时没有数据表。</p>
                        }
                      </div>
                    }
                  </div>
                }
              } @empty {
                <div class="dataset-table-empty">
                  <span class="empty-symbol" aria-hidden="true"></span>
                  <strong>{{ search().trim() ? '没有找到匹配的数据集' : '暂无数据集' }}</strong>
                  <small>{{
                    search().trim() ? '请尝试其他搜索词。' : '点击上方“新建数据集”开始使用。'
                  }}</small>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="explorer-toolbar">
          <div class="toolbar-copy">
            <strong>文件资源管理器</strong
            ><small>{{
              selectedIds().size
                ? '已选择 ' + selectedIds().size + ' 项'
                : '单击选择 · Ctrl/Shift 多选 · Ctrl+C/V 复制'
            }}</small>
          </div>
          <div class="explorer-toolbar-actions">
            <button mat-stroked-button type="button" (click)="loadExplorer()">刷新</button>
            @if (canCreateCollection()) {
              <button mat-flat-button color="primary" type="button" (click)="openCreate()">
                新建数据集
              </button>
            }
          </div>
        </div>
        <div class="explorer-layout" cdkDropListGroup>
          <nav class="side-nav" aria-label="数据文件目录">
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
                <span class="folder-icon folder-glyph" aria-hidden="true"></span
                ><span>{{ folder.name }}</span
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
              <span class="pane-directory-title">{{
                currentParentId() === UNASSIGNED
                  ? '无归属文件'
                  : currentParentId() === null
                    ? '数据集'
                    : currentFolderName()
              }}</span>
              <div class="pane-toolbar-actions">
                <mat-form-field appearance="outline" class="search-field"
                  ><mat-label>搜索</mat-label
                  ><input
                    matInput
                    [ngModel]="search()"
                    (ngModelChange)="searchChanged($event)"
                    placeholder="搜索"
                  />
                </mat-form-field>
                <span class="selection-actions">
                  @if (selectedIds().size) {
                    <button type="button" (click)="clearSelection()">取消选择</button>
                  }
                  @if (
                    selectedIds().size === 1 && selectedFile() && canGovernFile(selectedFile()!)
                  ) {
                    <button type="button" (click)="inspectFile(selectedFile()!, true)">
                      数据治理
                    </button>
                  }
                  @if (canUploadFile() && currentParentId() !== null) {
                    <label class="upload-button"
                      >上传文件<input type="file" (change)="uploadIntoCurrent($event)"
                    /></label>
                  }
                </span>
              </div>
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
                      @if (isFolder(entry)) {
                        <span class="folder-glyph"></span>
                      } @else {
                        <span class="file-glyph"></span>
                      }
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
                      @if (entry.file; as file) {
                        <span
                          class="file-quality"
                          [attr.data-grade]="
                            file.current_version?.quality_grade || file.quality_grade || ''
                          "
                        >
                          {{ fileVersionLabel(file) }} · {{ fileAnalysisLabel(file) }}
                        </span>
                      }
                    }
                    <ng-template cdkDragPreview
                      ><span class="drag-preview">{{ dragPreviewLabel(entry) }}</span></ng-template
                    >
                  </article>
                } @empty {
                  <div class="blank-state">
                    <span class="empty-symbol" aria-hidden="true"></span>
                    <p>此目录为空</p>
                    <small>可将文件拖入这里，或在空白处右键粘贴。</small>
                  </div>
                }
              </div>
            }
          </main>
        </div>
      }
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
          @if (canUploadFile() && currentParentId() === UNASSIGNED) {
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
          <button type="button" (click)="activateEntry(menuState.entry)">查看详情</button>
          @if (canGovernFile(fileFromMenuEntry(menuState.entry))) {
            <button type="button" (click)="inspectMenuFile(menuState.entry)">数据治理</button>
          }
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
      <app-data-file-inspector-dialog
        [file]="file"
        [openGovernanceOnLoad]="inspectGovernance()"
        (changed)="inspectorChanged()"
        (close)="closeInspector()"
      />
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
    .pane-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-head,
    .explorer-toolbar {
      justify-content: space-between;
      gap: 20px;
    }
    .explorer-toolbar-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex: 0 0 auto;
    }
    .page-head {
      margin-bottom: 20px;
    }
    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
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
      color: var(--sw-text-muted);
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .stat-card {
      display: grid;
      gap: 7px;
      padding: 15px;
    }
    .stat-grid span {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .stat-grid strong {
      color: var(--sw-text-primary);
      font-size: 22px;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.025em;
    }
    .stat-card small {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .stat-card small.stat-monthly::first-letter {
      color: var(--sw-color-success);
    }
    .explorer-card {
      padding: 18px;
      margin-bottom: 18px;
    }
    .dataset-table-view {
      min-width: 0;
    }
    .dataset-table-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--sw-border);
    }
    .dataset-table-search {
      width: min(300px, 100%);
    }
    .dataset-table-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dataset-table {
      overflow-x: auto;
    }
    .dataset-table-head,
    .dataset-table-row {
      display: grid;
      grid-template-columns: minmax(300px, 2fr) 170px 140px 300px;
      align-items: center;
      gap: 20px;
      min-width: 970px;
    }
    .dataset-table-head {
      min-height: 48px;
      padding: 0 12px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      font-size: 12px;
      font-weight: 750;
    }
    .dataset-table-row {
      min-height: 86px;
      padding: 12px;
      border-top: 1px solid var(--sw-border);
      color: var(--sw-text-secondary);
      font-size: 13px;
      cursor: pointer;
      outline: none;
    }
    .dataset-table-row:hover {
      background: var(--sw-color-primary-faint);
    }
    .dataset-table-row:focus-visible {
      box-shadow: inset 0 0 0 2px var(--sw-focus);
    }
    .dataset-table-row.expanded {
      background: var(--sw-color-primary-faint);
    }
    .dataset-table-name {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .dataset-type-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary);
      font-size: 20px;
    }
    .dataset-table-copy {
      display: grid;
      gap: 5px;
      min-width: 0;
    }
    .dataset-table-copy strong {
      overflow: hidden;
      color: var(--sw-text-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 15px;
    }
    .dataset-table-copy small {
      overflow: hidden;
      color: var(--sw-text-muted);
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
    }
    .dataset-table-metrics {
      color: var(--sw-text-secondary);
      font-weight: 650;
    }
    .dataset-table-updated {
      color: var(--sw-text-muted);
    }
    .dataset-table-operation {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 8px;
    }
    .dataset-table-operation button {
      white-space: nowrap;
    }
    .management-checkbox {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--sw-color-primary);
      cursor: pointer;
    }
    .management-checkbox:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    .management-delete-button:not(:disabled) {
      border-color: color-mix(in srgb, var(--sw-color-danger) 28%, var(--sw-border));
      color: var(--sw-color-danger);
    }
    .management-danger-text {
      color: var(--sw-color-danger);
    }
    .dataset-expand-indicator {
      width: 14px;
      color: var(--sw-text-muted);
      font-size: 15px;
      text-align: center;
    }
    .dataset-table-state,
    .dataset-table-empty {
      display: grid;
      place-items: center;
      min-height: 260px;
      margin: 0;
      color: var(--sw-text-muted);
      text-align: center;
    }
    .dataset-table-empty {
      gap: 8px;
    }
    .dataset-table-empty span {
      color: var(--sw-color-primary);
      font-size: 42px;
    }
    .dataset-table-empty strong {
      color: var(--sw-text-primary);
      font-size: 17px;
    }
    .dataset-table-empty small {
      font-size: 13px;
    }
    .dataset-expanded-panel {
      min-width: 970px;
      padding: 0 0 16px;
      border-top: 1px solid var(--sw-border);
      background: var(--sw-color-primary-faint);
    }
    .dataset-files-table {
      max-height: 260px;
      overflow-x: auto;
      overflow-y: auto;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
    }
    .dataset-files-head,
    .dataset-file-row {
      display: grid;
      grid-template-columns: minmax(300px, 2fr) 170px 140px 300px;
      align-items: center;
      gap: 20px;
      min-width: 970px;
    }
    .dataset-files-head {
      position: sticky;
      top: 0;
      z-index: 1;
      min-height: 42px;
      padding: 0 12px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
      font-size: 12px;
      font-weight: 750;
    }
    .dataset-files-heading,
    .table-select-all {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .table-select-all {
      color: var(--sw-color-primary);
      font-size: 11px;
      font-weight: 650;
      cursor: pointer;
    }
    .dataset-file-row {
      min-height: 58px;
      padding: 8px 12px;
      border-top: 1px solid var(--sw-border);
      color: var(--sw-text-secondary);
      font-size: 12px;
    }
    .dataset-file-name {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .dataset-file-copy {
      display: grid;
      min-width: 0;
      gap: 2px;
    }
    .dataset-file-copy small {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .dataset-file-name strong {
      overflow: hidden;
      color: var(--sw-text-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dataset-file-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary);
      font-size: 12px;
    }
    .dataset-file-preview {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 6px;
    }
    .dataset-expanded-state {
      margin: 0;
      padding: 30px 14px;
      color: var(--sw-text-muted);
      font-size: 13px;
      text-align: center;
    }
    .dataset-expanded-state.error {
      color: var(--sw-color-danger);
    }

    .dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgb(15 23 42 / 44%);
    }
    .create-dialog {
      width: min(780px, 100%);
      max-height: min(720px, calc(100vh - 40px));
      overflow: auto;
      border: 1px solid #dbe4ef;
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 24px 70px rgb(15 23 42 / 24%);
    }
    .dialog-header,
    .dialog-footer {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
    }
    .dialog-header {
      padding: 24px 26px 18px;
      border-bottom: 1px solid #e2e8f0;
    }
    .dialog-header h2 {
      margin: 4px 0 6px;
      font-size: 21px;
    }
    .dialog-header p:not(.eyebrow) {
      margin: 0;
      color: #64748b;
      font-size: 13px;
    }
    .dialog-close {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #64748b;
      font-size: 25px;
      line-height: 1;
      cursor: pointer;
    }
    .dialog-close:hover {
      background: #f1f5f9;
      color: #0f172a;
    }
    .create-dialog-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 1fr);
      gap: 28px;
      padding: 24px 26px;
    }
    .edit-dialog {
      width: min(520px, 100%);
    }
    .edit-dialog-body {
      display: grid;
      gap: 8px;
      padding: 24px 26px 10px;
    }
    .edit-dialog-body mat-form-field {
      width: 100%;
    }
    .upload-dialog {
      width: min(560px, 100%);
    }
    .upload-dialog-body {
      display: grid;
      gap: 16px;
      padding: 24px 26px 10px;
    }
    .upload-target {
      display: grid;
      gap: 5px;
      padding: 14px 16px;
      border-radius: 10px;
      background: #f8fafc;
    }
    .upload-target span,
    .upload-target small {
      color: #64748b;
      font-size: 12px;
    }
    .upload-target strong {
      overflow: hidden;
      color: #1e3a5f;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 15px;
    }
    .create-basic,
    .create-choice {
      display: grid;
      align-content: start;
      gap: 12px;
    }
    .create-basic mat-form-field {
      width: 100%;
    }
    .choice-label {
      color: #334155;
      font-size: 13px;
      font-weight: 750;
    }
    .choice-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
      padding: 15px;
      border: 1px solid #dbe4ef;
      border-radius: 12px;
      background: #fff;
      color: #0f172a;
      text-align: left;
      cursor: pointer;
    }
    .choice-card:hover,
    .choice-card.selected {
      border-color: #0284c7;
      background: #f0f9ff;
    }
    .choice-radio {
      flex: 0 0 auto;
      width: 17px;
      height: 17px;
      margin-top: 1px;
      border: 2px solid #94a3b8;
      border-radius: 50%;
      background: #fff;
    }
    .choice-card.selected .choice-radio {
      border: 5px solid #0284c7;
    }
    .choice-card strong,
    .choice-card small {
      display: block;
    }
    .choice-card strong {
      margin-bottom: 5px;
      font-size: 14px;
    }
    .choice-card small,
    .dialog-file-picker small {
      color: #64748b;
      font-size: 12px;
      line-height: 1.5;
    }
    .dialog-file-picker {
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border: 1px dashed #7dd3fc;
      border-radius: 10px;
      background: #f8fdff;
      color: #0369a1;
      font-size: 13px;
      cursor: pointer;
    }
    .dialog-file-picker input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .dialog-footer {
      align-items: center;
      padding: 16px 26px 20px;
      border-top: 1px solid #e2e8f0;
    }
    .dialog-hint {
      color: #64748b;
      font-size: 12px;
    }
    .dialog-actions {
      display: flex;
      align-items: center;
      gap: 8px;
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
      width: min(190px, 100%);
      font-size: 12px;
    }
    .search-field input {
      font-size: 12px;
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
    .pane-directory-title {
      min-width: 0;
    }
    .pane-toolbar-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      min-width: 0;
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
    .file-quality {
      align-self: flex-start;
      padding: 3px 7px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #475569;
      font-size: 10px;
      font-weight: 700;
    }
    .file-quality[data-grade='A'],
    .file-quality[data-grade='B'] {
      background: #dcfce7;
      color: #047857;
    }
    .file-quality[data-grade='C'],
    .file-quality[data-grade='D'] {
      background: #fef3c7;
      color: #b45309;
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
      font-size: 44px;
    }
    .blank-state p {
      margin: 8px 0;
      color: #334155;
      font-size: 18px;
      font-weight: 650;
    }
    .blank-state small {
      font-size: 13px;
      line-height: 1.6;
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

    /* Stable hierarchy and state feedback for the file-manager workspace. */
    .stat-card {
      position: relative;
      overflow: hidden;
      background: linear-gradient(145deg, var(--sw-surface) 58%, var(--sw-color-primary-faint));
    }
    .stat-card::before,
    .dataset-table-row.expanded::before {
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--sw-color-secondary);
      content: '';
    }
    .dataset-table-row {
      position: relative;
    }
    .dataset-table-row.expanded::before {
      background: var(--sw-color-primary);
    }
    .folder-glyph {
      position: relative;
      display: inline-block;
      width: 20px;
      height: 14px;
      border-radius: 3px;
      background: currentColor;
    }
    .folder-glyph::before {
      position: absolute;
      top: -4px;
      left: 2px;
      width: 8px;
      height: 5px;
      border-radius: 3px 3px 0 0;
      background: currentColor;
      content: '';
    }
    .dataset-type-icon.folder-glyph {
      width: 42px;
      height: 42px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-primary-soft);
    }
    .dataset-type-icon.folder-glyph::before {
      top: 13px;
      left: 11px;
      width: 20px;
      height: 14px;
      border-radius: 3px;
      background: var(--sw-color-primary);
      box-shadow: 0 -4px 0 -1px var(--sw-color-primary);
    }
    .file-glyph {
      position: relative;
      display: inline-block;
      width: 15px;
      height: 19px;
      border: 1.5px solid currentColor;
      border-radius: 3px;
    }
    .file-glyph::before,
    .file-glyph::after {
      position: absolute;
      right: 3px;
      left: 3px;
      height: 1.5px;
      background: currentColor;
      content: '';
    }
    .file-glyph::before {
      top: 7px;
    }
    .file-glyph::after {
      top: 11px;
    }
    .dataset-file-icon.file-glyph {
      width: 30px;
      height: 30px;
      border: 0;
    }
    .dataset-file-icon.file-glyph::before {
      top: 7px;
      right: 8px;
      left: 8px;
      height: 16px;
      border: 1.5px solid var(--sw-color-primary);
      border-radius: 3px;
      background: transparent;
    }
    .dataset-file-icon.file-glyph::after {
      top: 12px;
      right: 11px;
      left: 11px;
      box-shadow: 0 4px 0 var(--sw-color-primary);
    }
    .dataset-expand-indicator {
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--sw-surface-muted);
    }
    .dataset-expand-indicator::before {
      position: absolute;
      top: 10px;
      left: 11px;
      width: 6px;
      height: 6px;
      border-right: 1.5px solid var(--sw-text-secondary);
      border-bottom: 1.5px solid var(--sw-text-secondary);
      transform: rotate(45deg);
      content: '';
    }
    .dataset-expand-indicator.expanded::before {
      top: 12px;
      transform: rotate(225deg);
    }
    .empty-symbol {
      display: block;
      width: 52px;
      height: 38px;
      margin: 0 auto 12px;
      border: 2px solid var(--sw-border-strong);
      border-radius: var(--sw-radius-sm);
      background: linear-gradient(
        var(--sw-surface) 30%,
        var(--sw-color-primary-soft) 31% 35%,
        var(--sw-surface) 36% 62%,
        var(--sw-color-primary-soft) 63% 67%,
        var(--sw-surface) 68%
      );
    }
    .dialog-backdrop {
      backdrop-filter: blur(3px);
    }
    .create-dialog,
    .context-menu {
      border-color: var(--sw-border);
      background: var(--sw-surface-raised);
      box-shadow: var(--sw-shadow-lg);
    }
    .explorer-layout {
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      overflow: hidden;
    }
    .side-nav {
      padding: 14px 10px;
      background: var(--sw-surface-sunken);
    }
    .nav-entry {
      min-height: 40px;
      border: 1px solid transparent;
    }
    .nav-entry.active {
      border-color: color-mix(in srgb, var(--sw-color-primary) 28%, var(--sw-border));
      background: var(--sw-color-primary-soft);
    }
    .file-pane {
      padding: 16px 18px 18px;
    }
    .file-tile {
      position: relative;
      min-height: 128px;
      padding: 14px;
      border-radius: var(--sw-radius-md);
    }
    .file-tile.selected {
      border-color: var(--sw-color-accent);
      background: var(--sw-color-accent-soft);
      box-shadow: 0 0 0 1px var(--sw-color-accent);
    }
    .file-tile.selected::after {
      position: absolute;
      top: 9px;
      right: 9px;
      width: 8px;
      height: 8px;
      border: 2px solid var(--sw-surface);
      border-radius: 50%;
      background: var(--sw-color-accent);
      content: '';
    }
    .file-grid.cdk-drop-list-dragging,
    .nav-entry.cdk-drop-list-receiving {
      background: var(--sw-color-primary-faint);
      box-shadow: inset 0 0 0 2px var(--sw-color-primary);
    }
    .dialog-close:focus-visible,
    .choice-card:focus-visible,
    .context-menu button:focus-visible,
    .pagination button:focus-visible,
    .selection-actions button:focus-visible,
    .upload-button:focus-within,
    .breadcrumbs button:focus-visible,
    .nav-entry:focus-visible,
    .file-tile:focus-visible {
      outline: 2px solid var(--sw-focus);
      outline-offset: 2px;
    }
    @media (max-width: 760px) {
      .explorer-layout {
        grid-template-columns: 1fr;
      }
      .side-nav {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 10px 0;
        border-right: 0;
        border-bottom: 1px solid var(--sw-border);
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
        padding: 14px;
      }
    }
    @media (max-width: 560px) {
      .page-head,
      .explorer-toolbar,
      .pane-toolbar,
      .dataset-table-toolbar {
        align-items: stretch;
        flex-direction: column;
      }
      .actions {
        justify-content: flex-start;
      }
      .search-field {
        width: 100%;
      }
      .explorer-toolbar-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .dataset-table-search {
        width: 100%;
      }
      .dataset-table-actions {
        justify-content: flex-start;
      }
      .pane-toolbar-actions {
        width: 100%;
        align-items: stretch;
        flex-direction: column;
        gap: 8px;
      }
      .selection-actions {
        justify-content: flex-end;
      }
      .explorer-card {
        padding: 12px;
      }
      .file-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 700px) {
      .create-dialog-body {
        grid-template-columns: 1fr;
        gap: 20px;
      }
      .dialog-header,
      .dialog-footer,
      .create-dialog-body {
        padding-left: 18px;
        padding-right: 18px;
      }
      .dialog-footer {
        align-items: flex-start;
        flex-direction: column;
      }
      .dialog-actions {
        width: 100%;
        justify-content: flex-end;
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
  readonly statsCollections = signal<DataCollectionSummary[]>([]);
  readonly monthlyNewFiles = signal<number | null>(null);
  readonly filesByCollection = signal(new Map<number, DataFileSummary[]>());
  readonly expandedDatasetIds = signal<Set<number>>(new Set());
  readonly expandedFileLoading = signal<Set<number>>(new Set());
  readonly expandedFileErrors = signal(new Map<number, string>());
  readonly managementMode = signal(false);
  readonly selectedCollectionIds = signal<Set<number>>(new Set());
  readonly selectedTableIds = signal<Set<number>>(new Set());
  readonly editingResource = signal<EditingResource | null>(null);
  readonly editingSaving = signal(false);
  readonly uploadCollectionTarget = signal<DataCollectionSummary | null>(null);
  readonly uploadSelectedFiles = signal<File[]>([]);
  readonly uploadingToCollection = signal(false);
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
  readonly inspectGovernance = signal(false);
  readonly menu = signal<MenuState | null>(null);
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly total = signal(0);
  readonly showCreate = signal(false);
  readonly creating = signal(false);
  readonly createMode = signal<'upload' | 'directory'>('upload');
  readonly createFile = signal<File | null>(null);
  newName = '';
  newDescription = '';
  editName = '';
  editDescription = '';
  private anchorIndex = -1;
  private dragCopyModifier = false;
  private explorerRequest?: Subscription;
  private monthlyFileStatsRequest?: Subscription;
  private monthlyFileStatsSignature = '';
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
  readonly newDatasetsThisMonth = computed(
    () =>
      this.statsCollections().filter((dataset) => this.isCurrentMonth(dataset.created_at)).length,
  );
  readonly totalDatasetFiles = computed(() =>
    this.statsCollections().reduce((total, dataset) => total + (dataset.file_count || 0), 0),
  );
  readonly totalDatasetStorage = computed(() =>
    this.statsCollections().reduce((total, dataset) => total + (dataset.storage_bytes || 0), 0),
  );
  readonly selectedManagementCount = computed(() => this.selectedTableIds().size);

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
    this.monthlyFileStatsRequest?.unsubscribe();
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
      if (file) this.inspectFile(file);
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
  fileVersionLabel(file: DataFileSummary): string {
    const versionNo = file.current_version?.version_no;
    return versionNo
      ? `V${versionNo}`
      : file.version_count
        ? `${file.version_count} 个版本`
        : '待生成版本';
  }
  fileAnalysisLabel(file: DataFileSummary): string {
    const profileStatus = file.current_version?.profile_status || file.profile_status || '';
    const normalizationStatus =
      file.current_version?.normalization?.status || file.normalization?.status || '';
    const timeProfile = file.current_version?.time_profile || file.time_profile;
    if (profileStatus === 'pending' || profileStatus === 'running') return '正在分析';
    if (profileStatus === 'failed') return '分析失败';
    if (profileStatus === 'unsupported') return '不支持自动分析';
    if (normalizationStatus === 'needs_confirmation' || timeProfile?.requires_confirmation)
      return '待确认时间列';
    const grade = file.current_version?.quality_grade || file.quality_grade;
    const score = file.current_version?.quality_score ?? file.quality_score;
    if (grade && score != null) return `${grade} · ${score.toFixed(1)} 分`;
    return profileStatus === 'ready' ? '待评分' : '等待分析';
  }
  canGovernFile(file: DataFileSummary | null): boolean {
    if (
      !file ||
      file.code === 'builtin_demo_water_month' ||
      !this.canWriteFiles() ||
      file.can_write === false
    )
      return false;
    const status = file.current_version?.profile_status || file.profile_status;
    return !!(file.current_version_id || file.current_version?.id) && status === 'ready';
  }
  inspectFile(file: DataFileSummary, governance = false): void {
    this.menu.set(null);
    this.inspectGovernance.set(governance);
    this.previewFile.set(file);
  }
  closeInspector(): void {
    this.previewFile.set(null);
    this.inspectGovernance.set(false);
  }
  inspectorChanged(): void {
    this.loadExplorer(this.currentParentId(), true);
  }
  fileFromMenuEntry(entry: ExplorerEntry): DataFileSummary | null {
    return this.fileFromEntry(entry);
  }
  inspectMenuFile(entry: ExplorerEntry): void {
    const file = this.fileFromEntry(entry);
    if (file) this.inspectFile(file, true);
  }
  isDatasetExpanded(datasetId: number): boolean {
    return this.expandedDatasetIds().has(datasetId);
  }
  filesForDataset(datasetId: number): DataFileSummary[] {
    return this.filesByCollection().get(datasetId) || [];
  }
  toggleDataset(datasetId: number): void {
    const next = new Set(this.expandedDatasetIds());
    if (next.has(datasetId)) {
      next.delete(datasetId);
      this.expandedDatasetIds.set(next);
      return;
    }

    next.add(datasetId);
    this.expandedDatasetIds.set(next);
    this.loadDatasetFiles(datasetId);
  }
  canManageDataResources(): boolean {
    return this.canCreateCollection() || this.canDeleteCollection() || this.canWriteFiles();
  }
  toggleManagementMode(): void {
    if (!this.managementMode() && !this.canManageDataResources()) return;
    const next = !this.managementMode();
    this.managementMode.set(next);
    if (!next) this.clearManagementSelection();
  }
  isCollectionSelected(collectionId: number): boolean {
    return this.selectedCollectionIds().has(collectionId);
  }
  toggleCollectionSelection(collectionId: number): void {
    if (!this.canDeleteFile()) return;
    const next = new Set(this.selectedCollectionIds());
    const files = this.filesByCollection().get(collectionId);
    if (next.has(collectionId)) {
      next.delete(collectionId);
      const selectedTables = new Set(this.selectedTableIds());
      for (const file of files || []) selectedTables.delete(file.id);
      this.selectedTableIds.set(selectedTables);
    } else {
      next.add(collectionId);
      this.selectedCollectionIds.set(next);
      const expanded = new Set(this.expandedDatasetIds());
      expanded.add(collectionId);
      this.expandedDatasetIds.set(expanded);
      if (files) {
        const selectedTables = new Set(this.selectedTableIds());
        for (const file of files) selectedTables.add(file.id);
        this.selectedTableIds.set(selectedTables);
      } else if (!this.expandedFileLoading().has(collectionId)) {
        this.loadDatasetFiles(collectionId);
      }
    }
    this.selectedCollectionIds.set(next);
    this.selectedCollectionIds.set(next);
  }
  isTableSelected(fileId: number): boolean {
    return this.selectedTableIds().has(fileId);
  }
  areAllTablesSelected(collectionId: number): boolean {
    const files = this.filesByCollection().get(collectionId) || [];
    return files.length > 0 && files.every((file) => this.selectedTableIds().has(file.id));
  }
  areSomeTablesSelected(collectionId: number): boolean {
    const files = this.filesByCollection().get(collectionId) || [];
    const selectedCount = files.filter((file) => this.selectedTableIds().has(file.id)).length;
    return selectedCount > 0 && selectedCount < files.length;
  }
  toggleAllTables(collectionId: number): void {
    if (!this.canDeleteFile()) return;
    const files = this.filesByCollection().get(collectionId) || [];
    const next = new Set(this.selectedTableIds());
    if (this.areAllTablesSelected(collectionId)) {
      for (const file of files) next.delete(file.id);
    } else {
      for (const file of files) next.add(file.id);
    }
    this.selectedTableIds.set(next);
    // Selecting all tables is intentionally independent from the dataset checkbox.
    const selectedCollections = new Set(this.selectedCollectionIds());
    selectedCollections.delete(collectionId);
    this.selectedCollectionIds.set(selectedCollections);
  }
  toggleTableSelection(fileId: number): void {
    if (!this.canDeleteFile()) return;
    const next = new Set(this.selectedTableIds());
    if (next.has(fileId)) next.delete(fileId);
    else next.add(fileId);
    this.selectedTableIds.set(next);
    const selectedCollections = new Set(this.selectedCollectionIds());
    for (const collectionId of selectedCollections) {
      const files = this.filesByCollection().get(collectionId) || [];
      if (files.some((file) => !next.has(file.id))) selectedCollections.delete(collectionId);
    }
    this.selectedCollectionIds.set(selectedCollections);
  }
  clearManagementSelection(): void {
    this.selectedCollectionIds.set(new Set());
    this.selectedTableIds.set(new Set());
  }
  deleteManagedSelection(): void {
    const selectedTableIds = [...this.selectedTableIds()].filter((id) =>
      this.isSelectedTableDeletable(id),
    );
    if (!selectedTableIds.length) return;
    if (
      !window.confirm(`确定删除选中的 ${selectedTableIds.length} 张数据表？数据集本身不会被删除。`)
    )
      return;
    this.subscriptions.add(
      this.service.deleteFiles(selectedTableIds).subscribe({
        next: () => {
          this.notifications.success('选中的数据表已移入回收站。');
          this.clearManagementSelection();
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '批量删除失败。'),
      }),
    );
  }
  deleteManagedCollection(collection: DataCollectionSummary): void {
    if (!this.canDeleteCollection()) return;
    if (!window.confirm(`确定删除数据集“${collection.name}”？数据集及其数据表将移入回收站。`))
      return;
    this.subscriptions.add(
      this.service.deleteCollection(collection.id).subscribe({
        next: () => {
          this.clearManagementSelection();
          this.notifications.success('数据集已移入回收站。');
          this.loadExplorer();
        },
        error: (error) => this.notifications.error(error, '数据集删除失败。'),
      }),
    );
  }
  openCollectionEditor(collection: DataCollectionSummary): void {
    if (!this.canCreateCollection()) return;
    this.editName = collection.name;
    this.editDescription = collection.description || '';
    this.editingResource.set({ kind: 'collection', id: collection.id });
  }
  openFileEditor(collectionId: number, file: DataFileSummary): void {
    if (!this.canWriteFiles()) return;
    this.editName = file.name;
    this.editDescription = '';
    this.editingResource.set({ kind: 'file', id: file.id, collectionId });
  }
  closeEditor(): void {
    if (this.editingSaving()) return;
    this.editingResource.set(null);
  }
  canSubmitEdit(): boolean {
    return !!this.editName.trim() && !this.editingSaving() && !!this.editingResource();
  }
  saveEdit(): void {
    const resource = this.editingResource();
    const name = this.editName.trim();
    if (!resource || !name || this.editingSaving()) return;
    this.editingSaving.set(true);

    if (resource.kind === 'collection') {
      this.subscriptions.add(
        this.service
          .updateCollection(resource.id, {
            name,
            description: this.editDescription.trim() || null,
          })
          .subscribe({
            next: (updated) => {
              this.collections.update((items) =>
                items.map((item) => (item.id === resource.id ? { ...item, ...updated } : item)),
              );
              this.statsCollections.update((items) =>
                items.map((item) => (item.id === resource.id ? { ...item, ...updated } : item)),
              );
              this.editingSaving.set(false);
              this.editingResource.set(null);
              this.notifications.success('数据集信息已更新。');
              this.loadExplorer();
            },
            error: (error) => {
              this.editingSaving.set(false);
              this.notifications.error(error, '数据集信息更新失败。');
            },
          }),
      );
      return;
    }

    this.subscriptions.add(
      this.service.renameFile(resource.id, name).subscribe({
        next: (updated) => {
          const nextFiles = new Map(this.filesByCollection());
          const files = nextFiles.get(resource.collectionId) || [];
          nextFiles.set(
            resource.collectionId,
            files.map((file) => (file.id === resource.id ? { ...file, ...updated } : file)),
          );
          this.filesByCollection.set(nextFiles);
          if (this.previewFile()?.id === resource.id) {
            this.previewFile.set({ ...this.previewFile()!, ...updated });
          }
          this.editingSaving.set(false);
          this.editingResource.set(null);
          this.notifications.success('数据表名称已更新。');
          this.loadExplorer(resource.collectionId);
        },
        error: (error) => {
          this.editingSaving.set(false);
          this.notifications.error(error, '数据表名称更新失败。');
        },
      }),
    );
  }
  private isSelectedTableDeletable(fileId: number): boolean {
    return (
      this.canDeleteFile() &&
      [...this.filesByCollection().values()].some((files) =>
        files.some((file) => file.id === fileId),
      )
    );
  }
  private loadDatasetFiles(datasetId: number, quiet = false): void {
    const listFiles = (
      this.service as unknown as {
        listFiles?: (collectionId: number) => Observable<DataFileSummary[]>;
      }
    ).listFiles;
    if (!listFiles) {
      const errors = new Map(this.expandedFileErrors());
      errors.set(datasetId, '暂时无法读取该数据集的数据表。');
      this.expandedFileErrors.set(errors);
      return;
    }

    if (!quiet) {
      const loading = new Set(this.expandedFileLoading());
      loading.add(datasetId);
      this.expandedFileLoading.set(loading);
      const errors = new Map(this.expandedFileErrors());
      errors.delete(datasetId);
      this.expandedFileErrors.set(errors);
    }
    this.subscriptions.add(
      listFiles.call(this.service, datasetId).subscribe({
        next: (files) => {
          const nextFiles = new Map(this.filesByCollection());
          nextFiles.set(datasetId, files || []);
          this.filesByCollection.set(nextFiles);
          if (this.selectedCollectionIds().has(datasetId)) {
            const selectedTables = new Set(this.selectedTableIds());
            for (const file of files || []) selectedTables.add(file.id);
            this.selectedTableIds.set(selectedTables);
          }
          if (!quiet) {
            const nextLoading = new Set(this.expandedFileLoading());
            nextLoading.delete(datasetId);
            this.expandedFileLoading.set(nextLoading);
          }
        },
        error: () => {
          if (!quiet) {
            const nextLoading = new Set(this.expandedFileLoading());
            nextLoading.delete(datasetId);
            this.expandedFileLoading.set(nextLoading);
            const nextErrors = new Map(this.expandedFileErrors());
            nextErrors.set(datasetId, '无法读取数据表，请稍后重试。');
            this.expandedFileErrors.set(nextErrors);
          }
        },
      }),
    );
  }
  formatRelativeTime(value: string | null): string {
    if (!value) return '暂无更新时间';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '更新时间未知';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (elapsedSeconds < 60) return '刚刚';
    if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} 分钟前`;
    if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} 小时前`;
    if (elapsedSeconds < 604800) return `${Math.floor(elapsedSeconds / 86400)} 天前`;
    if (elapsedSeconds < 2592000) return `${Math.floor(elapsedSeconds / 604800)} 周前`;
    if (elapsedSeconds < 31536000) return `${Math.floor(elapsedSeconds / 2592000)} 个月前`;
    return `${Math.floor(elapsedSeconds / 31536000)} 年前`;
  }
  private isCurrentMonth(value: string | null | undefined): boolean {
    if (!value) return false;
    const date = new Date(value);
    const now = new Date();
    return (
      Number.isFinite(date.getTime()) &&
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }
  private refreshMonthlyFileStats(datasets: DataCollectionSummary[]): void {
    const signature = datasets
      .map((dataset) => `${dataset.id}:${dataset.file_count}:${dataset.updated_at}`)
      .join('|');
    if (signature === this.monthlyFileStatsSignature) return;
    this.monthlyFileStatsSignature = signature;
    this.monthlyFileStatsRequest?.unsubscribe();
    if (!datasets.length) {
      this.monthlyNewFiles.set(0);
      return;
    }
    const listFiles = (
      this.service as unknown as {
        listFiles?: (collectionId: number) => Observable<DataFileSummary[]>;
      }
    ).listFiles;
    if (!listFiles) {
      this.monthlyNewFiles.set(null);
      return;
    }
    this.monthlyNewFiles.set(null);
    this.monthlyFileStatsRequest = forkJoin(
      datasets.map((dataset) => listFiles.call(this.service, dataset.id)),
    ).subscribe({
      next: (fileGroups) => {
        this.monthlyNewFiles.set(
          fileGroups.flat().filter((file) => this.isCurrentMonth(file.created_at)).length,
        );
      },
      error: () => this.monthlyNewFiles.set(null),
    });
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
  openCreate(): void {
    this.menu.set(null);
    if (!this.canCreateCollection()) return;
    this.newName = '';
    this.newDescription = '';
    this.createMode.set(this.canUploadFile() ? 'upload' : 'directory');
    this.createFile.set(null);
    this.showCreate.set(true);
  }
  openUploadDialog(collection: DataCollectionSummary): void {
    this.menu.set(null);
    if (!this.canUploadFile()) return;
    this.uploadCollectionTarget.set(collection);
    this.uploadSelectedFiles.set([]);
  }
  closeUploadDialog(): void {
    if (this.uploadingToCollection()) return;
    this.uploadCollectionTarget.set(null);
    this.uploadSelectedFiles.set([]);
  }
  chooseUploadFiles(event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    this.uploadSelectedFiles.set(files);
  }
  uploadFileNames(): string {
    const names = this.uploadSelectedFiles().map((file) => file.name);
    const label = names.join('、');
    return label.length > 180 ? `${label.slice(0, 177)}…` : label;
  }
  canSubmitUpload(): boolean {
    return (
      this.canUploadFile() &&
      !!this.uploadCollectionTarget() &&
      this.uploadSelectedFiles().length > 0 &&
      !this.uploadingToCollection()
    );
  }
  submitUpload(): void {
    const collection = this.uploadCollectionTarget();
    const files = this.uploadSelectedFiles();
    if (!collection || !files.length || !this.canUploadFile() || this.uploadingToCollection())
      return;
    this.uploadingToCollection.set(true);
    this.subscriptions.add(
      forkJoin(files.map((file) => this.service.uploadFile(collection.id, file))).subscribe({
        next: (results) => {
          this.uploadingToCollection.set(false);
          this.closeUploadDialog();
          this.notifications.success(
            results.some((result) => !!result.task_id)
              ? `已上传 ${files.length} 张数据表，正在解析。`
              : `已上传 ${files.length} 张数据表。`,
          );
          this.loadExplorer();
          if (this.isDatasetExpanded(collection.id)) this.loadDatasetFiles(collection.id);
        },
        error: (error) => {
          this.uploadingToCollection.set(false);
          this.notifications.error(error, '数据表上传失败。');
        },
      }),
    );
  }
  closeCreate(): void {
    if (this.creating()) return;
    this.showCreate.set(false);
    this.createFile.set(null);
  }
  chooseCreateFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.createFile.set(file);
  }
  canSubmitCreate(): boolean {
    return (
      !!this.newName.trim() &&
      !this.creating() &&
      this.canCreateCollection() &&
      (this.createMode() === 'directory' || (this.canUploadFile() && !!this.createFile()))
    );
  }
  startCreateCollection(): void {
    this.openCreate();
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
    if (event.key === 'Escape' && this.showCreate()) {
      event.preventDefault();
      this.closeCreate();
      return;
    }
    if (event.key === 'Escape' && this.editingResource()) {
      event.preventDefault();
      this.closeEditor();
      return;
    }
    if (event.key === 'Escape' && this.uploadCollectionTarget()) {
      event.preventDefault();
      this.closeUploadDialog();
      return;
    }
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
    if (!this.canSubmitCreate()) return;
    const name = this.newName.trim();
    const description = this.newDescription.trim() || null;
    const mode = this.createMode();
    const file = this.createFile();
    this.creating.set(true);
    this.subscriptions.add(
      this.service.createCollection({ name, description }).subscribe({
        next: (collection) => {
          if (mode !== 'upload' || !file) {
            this.finishCreate('数据集已创建。');
            return;
          }
          this.subscriptions.add(
            this.service.uploadFile(collection.id, file).subscribe({
              next: (result) => {
                this.finishCreate(
                  result.task_id ? '数据集已创建，文件正在解析。' : '数据集和文件已创建。',
                );
              },
              error: (error) => {
                this.resetCreateForm();
                this.creating.set(false);
                this.loadExplorer();
                this.notifications.error(error, '数据集已创建，但文件上传失败。');
              },
            }),
          );
        },
        error: (error) => {
          this.creating.set(false);
          this.notifications.error(error, '数据集创建失败。');
        },
      }),
    );
  }
  private finishCreate(message: string): void {
    this.notifications.success(message);
    this.resetCreateForm();
    this.creating.set(false);
    // Keep the user on the current page; a newly created dataset will appear
    // in the current list after the refresh instead of opening the old folder view.
    this.loadExplorer();
  }
  private resetCreateForm(): void {
    this.newName = '';
    this.newDescription = '';
    this.createFile.set(null);
    this.showCreate.set(false);
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
    const normalizedCollections = rootCollections.map((folder) => ({
      ...folder,
      file_count: folder.file_count ?? 0,
      storage_bytes: folder.storage_bytes ?? 0,
      parse_issue_count: folder.parse_issue_count ?? 0,
    }));
    if (parentId === null || rootCollections.length) {
      this.collections.set(normalizedCollections);
      if (parentId === null && !this.search().trim()) {
        this.statsCollections.set(normalizedCollections);
        this.refreshMonthlyFileStats(normalizedCollections);
      }
    }
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
      if (virtualUnassigned) continue;
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
    this.explorerItems.set(entries);
    if (this.selectedIds().size === 1) {
      const selectedId = [...this.selectedIds()][0];
      const selectedEntry = entries.find((entry) => this.entryFileId(entry) === selectedId);
      this.selectedFile.set(selectedEntry ? this.fileFromEntry(selectedEntry) : null);
    }
    this.breadcrumbs.set(
      response.breadcrumbs?.length
        ? response.breadcrumbs.map((crumb) => ({
            id: crumb.id,
            name: crumb.id === null ? '数据集' : crumb.name,
          }))
        : [
            { id: null, name: '数据集' },
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
    if (parentId === null) {
      for (const datasetId of this.expandedDatasetIds()) this.loadDatasetFiles(datasetId, true);
    }
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
          this.statsCollections.set(items || []);
          this.refreshMonthlyFileStats(items || []);
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
        code: item.code,
        name: item.name,
        file_kind: (item.file_kind || 'other') as DataFileSummary['file_kind'],
        format: item.format || '',
        status: item.status || 'ready',
        version_count: item.version_count || 0,
        current_version_id: item.current_version_id ?? item.current_version?.id ?? null,
        current_version: item.current_version,
        profile_status: item.profile_status as DataFileSummary['profile_status'],
        quality_score: item.quality_score,
        quality_grade: item.quality_grade,
        time_profile: item.time_profile,
        normalization: item.normalization,
        row_count: item.row_count,
        size_bytes: item.size_bytes || 0,
        parse_issue_count: item.parse_issue_count,
        can_read: item.can_read,
        can_write: item.can_write,
        can_move: item.can_move,
        can_copy: item.can_copy,
        can_delete: item.can_delete,
        created_at: item.created_at || '',
        updated_at: item.updated_at || '',
      };
    }
    return null;
  }
}
