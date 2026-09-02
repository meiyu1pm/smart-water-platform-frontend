import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  DataAssetSelection,
  DataCollectionSummary,
  DataFilePreview,
  DataFileSummary,
  DataFileVersionSummary,
  DataFileViewCreate,
  DataFileViewSelection,
  ModelVersionSummary,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { DataFileService } from '../../core/services/data-file.service';
import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';
import { DataFilePreviewPanelComponent } from '../data-sources/data-file-preview-panel.component';
import { OperatorNameService } from '../../core/services/operator-name.service';
import {
  OperatorParameterFormComponent,
  ParameterSchema,
} from '../../shared/components/operator-parameter-form.component';
import type { Definition, EditorNode } from './workflow-editor.models';
import { WorkflowEditorStore } from './workflow-editor-store';
import { WorkflowEditorFacade } from './workflow-editor-facade';
import { ReteWorkflowAdapter } from './rete-workflow-adapter';

export interface SelectedRuntimeBinding {
  id: string;
  label: string;
  selection: DataAssetSelection | null;
  wholeAsset: boolean;
}


@Component({
  selector: 'app-operator-catalog-panel',
  imports: [FormsModule],
  template: `
    <section class="panel-content catalog-panel">
      <header class="panel-heading">
        <div>
          <span>算子目录</span>
          <h2>可用节点</h2>
        </div>
        <small>{{ store.definitions().length }}</small>
      </header>
      <label class="search">搜索<input [(ngModel)]="search" placeholder="名称或编码" /></label>
      <p class="help">点击添加，或拖入画布。</p>
      <div class="catalog-groups">
        @for (group of groups(); track group.category) {
          <section class="catalog-group">
            <button class="group-heading" type="button" (click)="toggle(group.category)">
              <span
                ><b>{{ group.label }}</b
                ><small>{{ group.items.length }}</small></span
              >
              <span>{{ isOpen(group.category) ? '−' : '+' }}</span>
            </button>
            @if (isOpen(group.category)) {
              <div class="catalog-items">
                @for (item of group.items; track item.node_code) {
                  <button
                    class="catalog-item"
                    draggable="true"
                    (dragstart)="onCatalogDragStart($event, item)"
                    (click)="addNode(item)"
                  >
                    <i [class.gpu]="item.runtime_type === 'builtin_gpu'"></i>
                    <span
                      ><b>{{ operatorNames.displayName(item.node_code, item.node_name) }}</b
                      ><small>{{ item.node_code }}</small></span
                    >
                  </button>
                }
              </div>
            }
          </section>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .panel-content {
      height: 100%;
      overflow: auto;
      padding: 14px;
      background: var(--sw-surface);
      color: var(--sw-text-primary);
    }
    .panel-heading,
    .group-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .panel-heading span {
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
    }
    h2 {
      margin: 2px 0 0;
      font-size: 18px;
    }
    .search {
      display: grid;
      gap: 5px;
      margin-top: 12px;
      font-size: 12px;
    }
    .search input {
      width: 100%;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      padding: 9px 10px;
      background: var(--sw-surface-raised);
      color: inherit;
    }
    .help {
      margin: 6px 0 10px;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .catalog-group {
      border-top: 1px solid var(--sw-border);
      padding-top: 7px;
    }
    .group-heading {
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 8px 2px;
      text-align: left;
    }
    .group-heading small {
      margin-left: 7px;
      color: var(--sw-text-muted);
    }
    .catalog-items {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 6px;
      padding-bottom: 8px;
    }
    .catalog-item {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr);
      align-items: center;
      gap: 7px;
      min-height: 50px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
      color: inherit;
      padding: 7px 9px;
      text-align: left;
      cursor: grab;
    }
    .catalog-item:hover {
      border-color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-sm);
    }
    .catalog-item i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sw-color-success);
    }
    .catalog-item i.gpu {
      background: #8b5cf6;
    }
    .catalog-item b,
    .catalog-item small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .catalog-item b {
      font-size: 12px;
    }
    .catalog-item small {
      margin-top: 3px;
      color: var(--sw-text-muted);
      font-size: 10px;
    }
  `,
})
export class OperatorCatalogPanelComponent {
  readonly store = inject(WorkflowEditorStore);
  readonly facade = inject(WorkflowEditorFacade);
  readonly adapter = inject(ReteWorkflowAdapter);
  readonly operatorNames = inject(OperatorNameService);
  search = '';
  private readonly openCategories = new Set([
    'data_source',
    'transform',
    'algorithm',
    'control',
    'output',
    'composite',
  ]);
  private readonly labels: Record<string, string> = {
    data_source: '数据源',
    transform: '数据转换',
    algorithm: '算法',
    control: '控制',
    output: '输出',
    composite: '复合算子',
  };

  groups(): Array<{ category: string; label: string; items: Definition[] }> {
    const term = this.search.trim().toLowerCase();
    const groups = new Map<string, Definition[]>();
    for (const item of this.store.definitions().filter((definition) => definition.is_default !== false)) {
      if (term && !this.operatorNames.matches(item.node_code, item.node_name, term)) continue;
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return ['data_source', 'transform', 'algorithm', 'control', 'output', 'composite']
      .filter((category) => groups.has(category))
      .map((category) => ({
        category,
        label: this.labels[category] ?? category,
        items: groups.get(category) ?? [],
      }));
  }

  isOpen(category: string): boolean {
    return Boolean(this.search.trim()) || this.openCategories.has(category);
  }
  toggle(category: string): void {
    if (this.openCategories.has(category)) this.openCategories.delete(category);
    else this.openCategories.add(category);
  }
  onCatalogDragStart(event: DragEvent, definition: Definition): void { event.dataTransfer?.setData('application/x-node-code', definition.node_code); }
  addNode(definition: Definition): void { const node = this.facade.addNode(definition); void this.adapter.addNode(node); }
}

@Component({
  selector: 'app-workflow-canvas-panel',
  imports: [MatButtonModule],
  template: `
    <section class="canvas-shell">
      <div
        #editorHost
        class="rete-host"
        (dragover)="allowDrop($event)"
        (drop)="onCanvasDrop($event)"
      ></div>
      @if (!store.nodes().length) {
        <div class="canvas-empty">从算子目录添加节点。</div>
      }
      <div class="canvas-tools">
        <button mat-stroked-button (click)="adapter.fitView()">适应画布</button>
        <button mat-stroked-button (click)="facade.undo()" [disabled]="store.historyIndex() <= 0">
          撤销
        </button>
        <button
          mat-stroked-button
          (click)="facade.redo()"
          [disabled]="store.historyIndex() >= store.history().length - 1"
        >
          重做
        </button>
      </div>
    </section>
  `,
  styles: `
    :host,
    .canvas-shell,
    .rete-host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .canvas-shell {
      position: relative;
      overflow: hidden;
      background: var(--sw-canvas-bg);
    }
    .rete-host {
      background-image:
        linear-gradient(var(--sw-border) 1px, transparent 1px),
        linear-gradient(90deg, var(--sw-border) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .canvas-empty {
      position: absolute;
      inset: 50% auto auto 50%;
      translate: -50% -50%;
      color: var(--sw-text-muted);
      pointer-events: none;
    }
    .canvas-tools {
      position: absolute;
      left: 12px;
      bottom: 12px;
      display: flex;
      gap: 7px;
      padding: 5px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: color-mix(in srgb, var(--sw-surface) 92%, transparent);
      box-shadow: var(--sw-shadow-sm);
      z-index: var(--sw-z-toolbar);
    }
    :host ::ng-deep [data-testid='node'].selected {
      outline: 3px solid var(--sw-node-selected);
      outline-offset: 3px;
      border-radius: 10px;
      box-shadow:
        0 0 0 6px color-mix(in srgb, var(--sw-node-selected) 18%, transparent),
        0 8px 20px color-mix(in srgb, var(--sw-node-selected) 28%, transparent);
    }
    :host ::ng-deep [data-testid='node'].selected [data-testid='input'],
    :host ::ng-deep [data-testid='node'].selected [data-testid='output'],
    :host ::ng-deep [data-testid='node'].selected [data-testid='socket'] {
      outline: none !important;
      box-shadow: none !important;
    }
  `,
})
export class WorkflowCanvasPanelComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(WorkflowEditorStore);
  readonly facade = inject(WorkflowEditorFacade);
  readonly adapter = inject(ReteWorkflowAdapter);
  @ViewChild('editorHost', { static: true }) private editorHost!: ElementRef<HTMLDivElement>;
  private resizeObserver?: ResizeObserver;
  private viewMounted = false;

  constructor() {
    effect(() => {
      const nodes = this.store.nodes();
      const edges = this.store.edges();
      if (this.viewMounted) {
        void this.adapter.sync({ nodes, edges });
      }
    });
  }

  ngAfterViewInit(): void {
    const host = this.editorHost.nativeElement;
    this.viewMounted = true;
    void this.adapter
      .mount(
        host,
        { nodes: this.store.nodes(), edges: this.store.edges() },
        {
          editable: true,
          onNodePicked: (id) => this.facade.notifyNodePicked(id),
        },
      )
      .then(() => {
        if (this.store.nodes().length > 0) {
          void this.adapter.fitView();
        }
      });
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.adapter.refresh());
      this.resizeObserver.observe(host);
    }
  }

  ngOnDestroy(): void {
    this.viewMounted = false;
    this.resizeObserver?.disconnect();
    this.adapter.unmount(this.editorHost.nativeElement);
  }

  allowDrop(event: DragEvent): void { event.preventDefault(); }
  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const definition = this.store.defaultDefinitionByCode().get(event.dataTransfer?.getData('application/x-node-code') || '');
    if (definition) void this.addNode(definition);
  }
  addNode(definition: Definition): void {
    const node = this.facade.addNode(definition);
    void this.adapter.addNode(node);
  }
}

@Component({
  selector: 'app-node-inspector-panel',
  imports: [
    FormsModule,
    MatButtonModule,
    RouterLink,
    DataAssetPickerComponent,
    DataFilePreviewPanelComponent,
    OperatorParameterFormComponent,
  ],
  template: `
    <section class="panel-content">
      @if (store.selectedNode(); as node) {
        <header>
          <span>节点属性</span>
          <h2>{{ operatorNames.displayName(node.node_code, node.definition?.node_name) }}</h2>
        </header>
        <small>{{ node.node_code }} · {{ node.node_version }}</small>
        <p>{{ node.definition?.description }}</p>
        <details class="version-control" (toggle)="loadNodeVersions(node, $event)">
          <summary>高级：使用版本</summary>
          <p class="muted">默认情况下新节点使用推荐版本；已有节点始终固定在这里显示的精确版本。</p>
          <select [ngModel]="node.node_version" (ngModelChange)="changeNodeVersion(node, $event)">
            @for (version of facade.versionsForNode(node); track version.version) {
              <option [value]="version.version">{{ version.version }}{{ version.is_default ? ' · 默认' : '' }}</option>
            }
          </select>
        </details>
        <h3>端口</h3>
        <div class="ports">
          @for (port of node.definition?.input_ports || []; track port.key) {
            <span class="input"
              >← {{ port.label }}
              <small>{{ port.data_type }}{{ port.unit ? ' · ' + port.unit : '' }}</small></span
            >
          }
          @for (port of node.definition?.output_ports || []; track port.key) {
            <span class="output"
              >{{ port.label }} →
              <small>{{ port.data_type }}{{ port.unit ? ' · ' + port.unit : '' }}</small></span
            >
          }
        </div>

        @if (requiresModel(node)) {
          <section class="model-binding-section">
            <h3>🤖 算法模型绑定 (Model Binding)</h3>
            <p class="help-tip">
              该算子需要指定模型权重以执行推理。你可以使用系统默认模型或选择已训练的专属模型。
            </p>

            @if (loadingModels()) {
              <small class="muted">正在加载可用模型…</small>
            } @else {
              <div class="model-select-group">
                <label class="model-option">
                  <input
                    type="radio"
                    name="model_choice_{{ node.id }}"
                    [checked]="!selectedModelId(node)"
                    (change)="onModelChoiceChange(node, '')"
                  />
                  <div class="option-content">
                    <span class="option-title"><b>使用算子默认模型</b> (推荐)</span>
                    <small class="muted">使用该算子当前活跃发布版本绑定的默认模型权重</small>
                  </div>
                </label>

                <label class="model-option">
                  <input
                    type="radio"
                    name="model_choice_{{ node.id }}"
                    [checked]="!!selectedModelId(node)"
                    (change)="
                      onModelChoiceChange(
                        node,
                        availableModels()[0]?.model_version_id || '__none__'
                      )
                    "
                  />
                  <div class="option-content">
                    <span class="option-title"><b>指定专属训练模型</b></span>
                    @if (availableModels().length > 0) {
                      <select
                        class="model-picker-select"
                        [ngModel]="selectedModelId(node)"
                        (ngModelChange)="onModelSelect(node, $event)"
                      >
                        <option value="" disabled>-- 请选择模型版本 --</option>
                        @for (m of availableModels(); track m.model_version_id) {
                          <option [value]="m.model_version_id">
                            {{ m.version }} {{ m.is_default ? '★ 默认' : '' }} ·
                            {{
                              m.training_dataset?.monitor_point_name ||
                                m.training_dataset?.monitor_point_code ||
                                '点位#' + m.training_dataset?.monitor_point_id ||
                                '模型'
                            }}
                          </option>
                        }
                      </select>
                    } @else {
                      <div class="no-models-tip">
                        <small class="warning-text">当前暂无可用的训练模型。</small>
                        <a
                          class="text-link"
                          [routerLink]="['/operators']"
                          [queryParams]="{ kind: 'algorithm', tab: 'training' }"
                        >
                          前往算子中心训练新模型 ↗
                        </a>
                      </div>
                    }
                  </div>
                </label>
              </div>
            }
          </section>
        }

        @if (node.node_code !== 'data_file_input_v1') {
          <h3>参数</h3>
          <app-operator-parameter-form
            [schema]="node.definition?.parameter_schema || {}"
            [uiSchema]="node.definition?.ui_schema || {}"
            [model]="node.parameters"
            (parametersChange)="facade.setParameters(node.id, $event)"
            (validityChange)="facade.setParameterValidity(node.id, $event)"
          />
        }
        @if (dataFileNode(); as dataNode) {
          <section class="runtime-binding data-file-binding">
            <header class="section-subhead">
              <h3>📁 绑定数据文件版本</h3>
              <small class="subhead-tip">指定该节点读取的数据集文件版本及输出列视图</small>
            </header>

            <div class="data-file-form-grid">
              <div class="form-group">
                <label class="form-label">
                  <span class="label-text">1. 所属数据集</span>
                  <select
                    class="form-select"
                    [ngModel]="selectedCollectionId()"
                    (ngModelChange)="onCollectionChange($event)"
                  >
                    <option [ngValue]="null">-- 请选择数据集 --</option>
                    @for (collection of dataCollections(); track collection.id) {
                      <option [ngValue]="collection.id">{{ collection.name }}</option>
                    }
                  </select>
                </label>
              </div>

              <div class="form-group">
                <label class="form-label">
                  <span class="label-text">2. 数据文件</span>
                  <select
                    class="form-select"
                    [ngModel]="selectedFileId()"
                    (ngModelChange)="onFileChange($event)"
                    [disabled]="!dataFiles().length"
                  >
                    <option [ngValue]="null">-- 请选择文件 --</option>
                    @for (file of dataFiles(); track file.id) {
                      <option [ngValue]="file.id">{{ file.name }}</option>
                    }
                  </select>
                </label>
              </div>

              <div class="form-group">
                <label class="form-label">
                  <span class="label-text">3. 文件版本</span>
                  <select
                    class="form-select"
                    [ngModel]="selectedFileVersionId()"
                    (ngModelChange)="onVersionChange($event)"
                    [disabled]="!dataFileVersions().length"
                  >
                    <option [ngValue]="null">-- 请选择版本 --</option>
                    @for (version of dataFileVersions(); track version.id) {
                      <option [ngValue]="version.id">
                        {{ version.version_code || ('v' + version.version_no) }} · {{ version.profile_status || version.status }}
                      </option>
                    }
                  </select>
                </label>
              </div>
            </div>

            @if (selectedFileVersionId()) {
              <app-data-file-preview-panel
                [fileVersionId]="selectedFileVersionId()"
                [profileStatus]="selectedDataFileVersion()?.profile_status || null"
                [initialBinding]="currentDataFileBinding()"
                (viewChange)="onDataFileViewChange($event)"
                (previewLoaded)="onDataFilePreviewLoaded($event)"
              />
            }
            @if (dataFileBindingSummary(); as bindingSummary) {
              <div class="frozen-binding-card" aria-live="polite">
                <div class="card-title">
                  <b>当前生效视图</b>
                  <span class="mode-tag">{{ bindingSummary.outputMode }}</span>
                </div>
                <div class="card-detail">
                  <span>📄 {{ bindingSummary.fileName || '数据文件' }} ({{ bindingSummary.version || ('版本 #' + bindingSummary.fileVersionId) }})</span>
                  <small class="view-detail">{{ bindingSummary.viewSummary || '已保存视图' }}</small>
                </div>
              </div>
            }
          </section>
        }
        @if (selectedDataBinding(); as binding) {
          <section class="runtime-binding">
            <h3>运行数据绑定</h3>
            <p>
              {{
                binding.wholeAsset
                  ? '选择该数据节点使用的完整数据版本。'
                  : '选择该数据节点使用的点位与指标通道。'
              }}
            </p>
            <app-data-asset-picker
              [selection]="binding.selection"
              [channelRequired]="!binding.wholeAsset"
              (selectionChange)="facade.setBinding(binding.id, $event)"
            />
          </section>
        }
        <div class="outputs">
          <b>工作流输出</b>
          @for (port of node.definition?.output_ports || []; track port.key) {
            <label
              ><input
                type="checkbox"
                [checked]="facade.isOutputPort(node.id, port.key)"
                (change)="facade.toggleOutputPort(node.id, port.key)"
              />{{ port.label || port.key }}</label
            >
          }
        </div>
        <button mat-stroked-button color="warn" (click)="removeNode(node.id)">移除节点</button>
      } @else {
        <div class="empty">在画布中选择节点以查看属性。</div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }
    .panel-content {
      height: 100%;
      overflow: auto;
      padding: 15px;
      background: var(--sw-surface);
      color: var(--sw-text-primary);
    }
    header span {
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
    }
    h2 {
      margin: 3px 0 5px;
      font-size: 18px;
    }
    h3 {
      margin: 18px 0 8px;
      font-size: 14px;
    }
    p,
    small {
      color: var(--sw-text-muted);
    }
    .ports {
      display: grid;
      gap: 5px;
    }
    .ports span {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-radius: var(--sw-radius-sm);
      font-size: 12px;
    }
    .ports .input {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .ports .output {
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
    }
    .model-binding-section {
      margin-top: 18px;
      padding: 12px;
      background: var(--sw-surface-raised, #f8fafc);
      border: 1px solid var(--sw-border, #e2e8f0);
      border-radius: var(--sw-radius-md, 8px);
    }
    .model-binding-section h3 {
      margin: 0 0 4px;
      font-size: 13px;
    }
    .help-tip {
      font-size: 12px;
      color: var(--sw-text-muted, #64748b);
      margin: 0 0 10px;
      line-height: 1.4;
    }
    .model-select-group {
      display: grid;
      gap: 10px;
    }
    .model-option {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
    }
    .model-option input[type='radio'] {
      margin-top: 3px;
    }
    .option-content {
      flex: 1;
      display: grid;
      gap: 3px;
    }
    .option-title {
      font-size: 13px;
    }
    .model-picker-select {
      width: 100%;
      margin-top: 4px;
      padding: 6px 8px;
      border: 1px solid var(--sw-border, #cbd5e1);
      border-radius: var(--sw-radius-sm, 6px);
      background: var(--sw-surface, #fff);
      color: var(--sw-text-primary, #0f172a);
      font-size: 12px;
    }
    .no-models-tip {
      display: grid;
      gap: 3px;
      margin-top: 4px;
    }
    .warning-text {
      color: #b45309;
      font-size: 12px;
    }
    .text-link {
      color: #2563eb;
      font-size: 12px;
      text-decoration: none;
      font-weight: 600;
    }
    .outputs {
      display: grid;
      gap: 7px;
      margin: 18px 0;
    }
    .outputs label {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .runtime-binding {
      margin-top: 18px;
      padding-top: 2px;
      border-top: 1px solid var(--sw-border);
    }
    .runtime-binding p {
      margin: -2px 0 12px;
      font-size: 12px;
    }
    .data-file-binding {
      margin-top: 14px;
      display: grid;
      gap: 12px;
    }
    .section-subhead h3 {
      margin: 0 0 2px;
      font-size: 14px;
      color: var(--sw-text-primary, #0f172a);
    }
    .subhead-tip {
      font-size: 11px;
      color: #64748b;
      display: block;
      margin-bottom: 6px;
    }
    .data-file-form-grid {
      display: grid;
      gap: 8px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
    }
    .form-label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: #475569;
      font-weight: 500;
    }
    .form-select {
      width: 100%;
      padding: 7px 9px;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #0f172a;
      font-size: 12px;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .form-select:focus {
      border-color: #0284c7;
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
    }
    .form-select:disabled {
      background: #f1f5f9;
      color: #94a3b8;
      cursor: not-allowed;
    }
    .frozen-binding-card {
      padding: 10px 12px;
      border-radius: 8px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      font-size: 12px;
      display: grid;
      gap: 4px;
    }
    .frozen-binding-card .card-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .frozen-binding-card .mode-tag {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      background: #dcfce7;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .frozen-binding-card .view-detail {
      color: #15803d;
      font-size: 11px;
      display: block;
      margin-top: 2px;
    }
    .empty {
      display: grid;
      height: 100%;
      place-items: center;
      color: var(--sw-text-muted);
      text-align: center;
    }
  `,
})
export class NodeInspectorPanelComponent implements OnDestroy {
  readonly store = inject(WorkflowEditorStore);
  readonly facade = inject(WorkflowEditorFacade);
  readonly operatorNames = inject(OperatorNameService);
  private readonly api = inject(ApiClient);
  private readonly files = inject(DataFileService);
  private readonly rete = inject(ReteWorkflowAdapter);
  private readonly subscriptions: Subscription[] = [];

  readonly availableModels = signal<ModelVersionSummary[]>([]);
  readonly loadingModels = signal(false);
  readonly dataCollections = signal<DataCollectionSummary[]>([]);
  readonly dataFiles = signal<DataFileSummary[]>([]);
  readonly dataFileVersions = signal<DataFileVersionSummary[]>([]);
  readonly selectedCollectionId = signal<number | null>(null);
  readonly selectedFileId = signal<number | null>(null);
  readonly selectedFileVersionId = signal<number | null>(null);
  private dataCollectionsLoaded = false;
  private lastBackfilledVersionId: number | null = null;

  readonly dataFileNode = computed(() => {
    const node = this.store.selectedNode();
    return node?.node_code === 'data_file_input_v1' ? node : null;
  });

  readonly selectedDataFileVersion = computed(() => {
    const id = this.selectedFileVersionId();
    return id
      ? this.dataFileVersions().find((version) => version.id === id) || null
      : null;
  });

  readonly currentDataFileBinding = computed(() => {
    const node = this.dataFileNode();
    if (!node) return null;
    const binding = this.store.bindings().get(node.id);
    if (!binding || binding.kind !== 'data_file') return null;
    return {
      output_mode: binding.output_mode,
      view_summary: binding.view_summary,
    };
  });

  readonly dataFileBindingSummary = computed(() => {
    const node = this.dataFileNode();
    const binding = node ? this.store.bindings().get(node.id) : null;
    if (!binding || binding.kind !== 'data_file') return null;
    return {
      fileName: binding.file_name || '',
      version: binding.version || '',
      fileVersionId: binding.file_version_id,
      outputMode: binding.output_mode,
      viewSummary: binding.view_summary || '',
    };
  });
  private lastFetchedCode: string | null = null;
  readonly selectedDataBinding = computed(() => {
    this.store.bindingRevision();
    const node = this.store.selectedNode();
    if (
      !node ||
      !['dataset_channel_v1', 'dataset_asset_v1'].includes(node.node_code)
    )
      return null;
    return {
      id: node.id,
      selection: this.store.bindingSelections().get(node.id) as
        | DataAssetSelection
        | null,
      wholeAsset: node.node_code === 'dataset_asset_v1',
    };
  });

  constructor() {
    effect(() => {
      const node = this.store.selectedNode();
      if (!node) {
        this.lastFetchedCode = null;
        this.availableModels.set([]);
        return;
      }
      if (this.requiresModel(node)) {
        if (this.lastFetchedCode !== node.node_code) {
          this.lastFetchedCode = node.node_code;
          this.loadModels(node.node_code);
        }
      } else {
        this.lastFetchedCode = null;
        this.availableModels.set([]);
      }
    });
    effect(() => {
      const node = this.dataFileNode();
      if (node) {
        const binding = this.store.bindings().get(node.id);
        if (binding?.kind === 'data_file') {
          if (this.lastBackfilledVersionId !== binding.file_version_id) {
            this.lastBackfilledVersionId = binding.file_version_id;
            this.backfillBindingSelection(binding.file_version_id);
          }
        } else if (!this.dataCollectionsLoaded) {
          this.loadCollections();
        }
      } else {
        this.lastBackfilledVersionId = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }

  onCollectionChange(value: string | number | null): void {
    const id = Number(value);
    this.selectedCollectionId.set(Number.isInteger(id) ? id : null);
    this.dataFiles.set([]);
    this.dataFileVersions.set([]);
    this.selectedFileId.set(null);
    this.selectedFileVersionId.set(null);
    if (Number.isInteger(id)) {
      this.subscriptions.push(
        this.files.listFiles(id).subscribe({
          next: (items) => this.dataFiles.set(items),
          error: () => this.dataFiles.set([]),
        }),
      );
    }
  }

  onFileChange(value: string | number | null): void {
    const id = Number(value);
    this.selectedFileId.set(Number.isInteger(id) ? id : null);
    this.dataFileVersions.set([]);
    this.selectedFileVersionId.set(null);
    if (Number.isInteger(id)) {
      this.subscriptions.push(
        this.files.listFileVersions(id).subscribe({
          next: (items) => this.dataFileVersions.set(items),
          error: () => this.dataFileVersions.set([]),
        }),
      );
    }
  }

  onVersionChange(value: string | number | null): void {
    const id = Number(value);
    this.selectedFileVersionId.set(Number.isInteger(id) ? id : null);
  }

  onDataFilePreviewLoaded(event: {
    preview: DataFilePreview;
    sampleRows: Array<Record<string, unknown>>;
  }): void {
    const node = this.dataFileNode();
    if (!node) return;
    const binding = this.store.bindings().get(node.id);
    const file = this.dataFiles().find(
      (item) => item.id === this.selectedFileId(),
    );
    const version = this.dataFileVersions().find(
      (item) => item.id === this.selectedFileVersionId(),
    );
    const prev = this.rete.getNodeData(node.id) || {};
    this.rete.setNodeData(node.id, {
      ...prev,
      fileName:
        file?.name ||
        (prev['fileName'] as string) ||
        (binding?.kind === 'data_file' ? binding.file_name : '') ||
        '',
      version:
        version?.version_code ||
        (prev['version'] as string) ||
        (binding?.kind === 'data_file' ? binding.version : '') ||
        '',
      outputMode:
        binding?.kind === 'data_file'
          ? binding.output_mode
          : (node.parameters?.['output_mode'] as string) || 'table',
      columnSummary: binding?.kind === 'data_file' ? binding.view_summary : '',
      sampleRows: event.sampleRows,
      columns: event.preview.columns.map((c) => c.name),
    });
  }

  onDataFileViewChange(view: DataFileViewSelection): void {
    const node = this.dataFileNode();
    const versionId = this.selectedFileVersionId();
    if (!node || !versionId) return;
    const outputMode = view.output_mode;
    const mapping =
      outputMode === 'table'
        ? { selected_columns: view.selected_columns || [] }
        : {
            time_column: view.time_column || '',
            value_column: view.value_column || '',
            ...(view.point_column ? { point_column: view.point_column } : {}),
          };
    const payload: DataFileViewCreate = { view_kind: outputMode, mapping };
    this.subscriptions.push(
      this.files.createView(versionId, payload).subscribe({
        next: (created) => {
          const file =
            this.dataFiles().find(
              (item) => item.id === this.selectedFileId(),
            ) || undefined;
          const version =
            this.dataFileVersions().find((item) => item.id === versionId) ||
            undefined;
          const binding = {
            kind: 'data_file' as const,
            file_version_id: versionId,
            data_view_id: Number(created.id),
            output_mode: outputMode,
            ...(file?.name ? { file_name: file.name } : {}),
            ...(version
              ? { version: version.version_code || `v${version.version_no}` }
              : {}),
            view_summary: this.viewSummary(view),
          };
          this.facade.setDataFileBinding(node.id, binding, outputMode);
          this.facade.setParameter(node.id, 'output_mode', outputMode);
          const prev = this.rete.getNodeData(node.id) || {};
          this.rete.setNodeData(node.id, {
            ...prev,
            fileName: file?.name || (prev['fileName'] as string) || '',
            version:
              version?.version_code || (prev['version'] as string) || '',
            outputMode,
            columnSummary: binding.view_summary,
            selectedColumns: view.selected_columns,
            timeColumn: view.time_column,
            valueColumn: view.value_column,
          });
        },
        error: () =>
          this.store.setMessage(
            'error',
            '数据视图创建失败，请检查列映射后重试。',
          ),
      }),
    );
  }

  private backfillBindingSelection(versionId: number): void {
    this.selectedFileVersionId.set(versionId);
    this.subscriptions.push(
      this.files.getFileVersion(versionId).subscribe({
        next: (version) => {
          if (!version) return;
          this.selectedFileVersionId.set(version.id);
          const fileId = version.file_id;
          this.selectedFileId.set(fileId);
          this.subscriptions.push(
            this.files.listFileVersions(fileId).subscribe({
              next: (versions) => this.dataFileVersions.set(versions),
              error: () => this.dataFileVersions.set([version]),
            }),
          );

          // Fetch preview rows so canvas node can render ECharts immediately
          this.subscriptions.push(
            this.files.getPreview(version.id).subscribe({
              next: (preview) => {
                const node = this.dataFileNode();
                if (node) {
                  const b = this.store.bindings().get(node.id);
                  let timeCol = '';
                  let valCol = '';
                  if (b?.kind === 'data_file' && b.view_summary) {
                    const parts = b.view_summary.split(' → ').map((s) => s.trim());
                    if (parts[0]) timeCol = parts[0];
                    if (parts[1]) valCol = parts[1];
                  }
                  const prev = this.rete.getNodeData(node.id) || {};
                  this.rete.setNodeData(node.id, {
                    ...prev,
                    sampleRows: preview.rows || [],
                    columns: preview.columns.map((c) => c.name),
                    timeColumn: timeCol || (prev['timeColumn'] as string) || '',
                    valueColumn: valCol || (prev['valueColumn'] as string) || '',
                  });
                }
              },
            }),
          );

          this.subscriptions.push(
            this.files.listCollections().subscribe({
              next: (collections) => {
                this.dataCollections.set(collections);
                this.dataCollectionsLoaded = true;
                for (const col of collections) {
                  this.files.listFiles(col.id).subscribe({
                    next: (files) => {
                      const match = files.find((f) => f.id === fileId);
                      if (match) {
                        this.selectedCollectionId.set(col.id);
                        this.dataFiles.set(files);
                        const node = this.dataFileNode();
                        if (node) {
                          const b = this.store.bindings().get(node.id);
                          let timeCol = '';
                          let valCol = '';
                          if (b?.kind === 'data_file' && b.view_summary) {
                            const parts = b.view_summary.split(' → ').map((s) => s.trim());
                            if (parts[0]) timeCol = parts[0];
                            if (parts[1]) valCol = parts[1];
                          }
                          const prev = this.rete.getNodeData(node.id) || {};
                          this.rete.setNodeData(node.id, {
                            ...prev,
                            fileName: match.name,
                            version:
                              version.version_code || `v${version.version_no}`,
                            outputMode:
                              b?.kind === 'data_file'
                                ? b.output_mode
                                : (node.parameters?.['output_mode'] as string) ||
                                  'table',
                            columnSummary:
                              b?.kind === 'data_file' ? b.view_summary : '',
                            timeColumn: timeCol || (prev['timeColumn'] as string) || '',
                            valueColumn: valCol || (prev['valueColumn'] as string) || '',
                          });
                        }
                      }
                    },
                  });
                }
              },
            }),
          );
        },
      }),
    );
  }

  private loadCollections(): void {
    this.dataCollectionsLoaded = true;
    this.subscriptions.push(
      this.files.listCollections().subscribe({
        next: (items) => this.dataCollections.set(items),
        error: () => {
          this.dataCollections.set([]);
          this.dataCollectionsLoaded = false;
        },
      }),
    );
  }

  private viewSummary(view: DataFileViewSelection): string {
    return view.output_mode === 'table'
      ? (view.selected_columns || []).join('、')
      : [view.time_column, view.value_column, view.point_column]
          .filter(Boolean)
          .join(' → ');
  }

  requiresModel(node: EditorNode): boolean {
    if (node.node_code === 'seasonal_robust_anomaly') return true;
    const alg = node.definition?.algorithm;
    if (alg && typeof alg === 'object') {
      const req = (alg as Record<string, unknown>)['training_requirement'];
      const strat = (alg as Record<string, unknown>)['model_strategy'];
      if (req === 'required' || strat === 'fit_per_dataset') return true;
    }
    return false;
  }

  selectedModelId(node: EditorNode): string {
    return String(node.model_binding?.model_version_id || node.parameters?.['model_version_id'] || '');
  }

  onModelChoiceChange(node: EditorNode, modelId: string): void {
    if (modelId === '__none__') {
      this.facade.setModelBinding(node.id, null);
    } else {
      this.facade.setModelBinding(node.id, modelId);
    }
  }

  onModelSelect(node: EditorNode, modelId: string): void {
    this.facade.setModelBinding(node.id, modelId);
  }

  loadNodeVersions(node: EditorNode, event: Event): void {
    if ((event.target as HTMLDetailsElement).open) this.facade.loadVersionsForNode(node);
  }

  changeNodeVersion(node: EditorNode, version: string): void {
    const definition = this.facade.versionsForNode(node).find((item) => item.version === version);
    if (definition) this.facade.changeNodeVersion(node, definition);
  }

  removeNode(id: string): void { if (typeof window !== 'undefined' && !window.confirm('移除该节点并删除其连接？')) return; this.facade.removeNode(id); }

  private loadModels(algorithmCode: string): void {
    this.loadingModels.set(true);
    this.api
      .get<ModelVersionSummary[]>('/api/v1/model-versions', { algorithm_code: algorithmCode })
      .subscribe({
        next: (items) => {
          this.availableModels.set(items || []);
          this.loadingModels.set(false);
        },
        error: () => {
          this.availableModels.set([]);
          this.loadingModels.set(false);
        },
      });
  }
}
