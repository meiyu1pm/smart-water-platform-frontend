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

import { DataAssetSelection, DataCollectionSummary, DataFileSummary, DataFileVersionSummary, DataFileView, DataFileViewCreate, ModelVersionSummary } from '../../core/models/api.models';
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
    for (const item of this.store.definitions()) {
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
  ngAfterViewInit(): void {
    const host = this.editorHost.nativeElement;
    void this.adapter.mount(host, { nodes: this.store.nodes(), edges: this.store.edges() }, { editable: true });
    if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.adapter.refresh()); this.resizeObserver.observe(host); }
  }
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.adapter.unmount(this.editorHost.nativeElement);
  }
  allowDrop(event: DragEvent): void { event.preventDefault(); }
  onCanvasDrop(event: DragEvent): void { event.preventDefault(); const definition = this.store.definitionByCode().get(event.dataTransfer?.getData('application/x-node-code') || ''); if (definition) void this.addNode(definition); }
  addNode(definition: Definition): void { const node = this.facade.addNode(definition); void this.adapter.addNode(node); }
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

        <h3>参数</h3>
        <app-operator-parameter-form
          [schema]="node.definition?.parameter_schema || {}"
          [uiSchema]="node.definition?.ui_schema || {}"
          [model]="node.parameters"
          (parametersChange)="facade.setParameters(node.id, $event)"
          (validityChange)="facade.setParameterValidity(node.id, $event)"
        />
        @if (dataFileNode(); as dataNode) {
          <section class="runtime-binding data-file-binding">
            <h3>数据文件输入</h3>
            <p>选择文件版本，并通过预览表头创建固定的表格或时序输出视图。</p>
            <label>数据集合
              <select [ngModel]="selectedCollectionId()" (ngModelChange)="onCollectionChange($event)">
                <option [ngValue]="null">请选择集合</option>
                @for (collection of dataCollections(); track collection.id) {
                  <option [ngValue]="collection.id">{{ collection.name }}</option>
                }
              </select>
            </label>
            <label>数据文件
              <select [ngModel]="selectedFileId()" (ngModelChange)="onFileChange($event)" [disabled]="!dataFiles().length">
                <option [ngValue]="null">请选择文件</option>
                @for (file of dataFiles(); track file.id) {
                  <option [ngValue]="file.id">{{ file.name }}</option>
                }
              </select>
            </label>
            <label>文件版本
              <select [ngModel]="selectedFileVersionId()" (ngModelChange)="onVersionChange($event)" [disabled]="!dataFileVersions().length">
                <option [ngValue]="null">请选择版本</option>
                @for (version of dataFileVersions(); track version.id) {
                  <option [ngValue]="version.id">{{ version.version }} · {{ version.status }}</option>
                }
              </select>
            </label>
            @if (selectedFileVersionId()) {
              <app-data-file-preview-panel [fileVersionId]="selectedFileVersionId()" (viewChange)="onDataFileViewChange($event)" />
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
  readonly dataFileNode = computed(() => { const node = this.store.selectedNode(); return node?.node_code === 'data_file_input_v1' ? node : null; });
  private lastFetchedCode: string | null = null;
  readonly selectedDataBinding = computed(() => { this.store.bindingRevision(); const node = this.store.selectedNode(); if (!node || !['dataset_channel_v1', 'dataset_asset_v1'].includes(node.node_code)) return null; return { id: node.id, selection: this.store.bindingSelections().get(node.id) as DataAssetSelection | null, wholeAsset: node.node_code === 'dataset_asset_v1' }; });

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
          this.selectedFileVersionId.set(binding.file_version_id);
          this.selectedFileId.set(null);
        }
        if (!this.dataCollectionsLoaded) this.loadCollections();
      }
    });
  }

  ngOnDestroy(): void { this.subscriptions.forEach((subscription) => subscription.unsubscribe()); }

  onCollectionChange(value: string): void {
    const id = Number(value); this.selectedCollectionId.set(Number.isInteger(id) ? id : null); this.dataFiles.set([]); this.dataFileVersions.set([]); this.selectedFileId.set(null); this.selectedFileVersionId.set(null);
    if (Number.isInteger(id)) this.subscriptions.push(this.files.listFiles(id).subscribe({ next: (items) => this.dataFiles.set(items), error: () => this.dataFiles.set([]) }));
  }

  onFileChange(value: string): void {
    const id = Number(value); this.selectedFileId.set(Number.isInteger(id) ? id : null); this.dataFileVersions.set([]); this.selectedFileVersionId.set(null);
    if (Number.isInteger(id)) this.subscriptions.push(this.files.listFileVersions(id).subscribe({ next: (items) => this.dataFileVersions.set(items), error: () => this.dataFileVersions.set([]) }));
  }

  onVersionChange(value: string): void { const id = Number(value); this.selectedFileVersionId.set(Number.isInteger(id) ? id : null); }

  onDataFileViewChange(view: DataFileView): void {
    const node = this.dataFileNode(); const versionId = this.selectedFileVersionId();
    if (!node || !versionId) return;
    const payload: DataFileViewCreate = { output_mode: view.output_mode, ...(view.selected_columns ? { selected_columns: view.selected_columns } : {}), ...(view.time_column ? { time_column: view.time_column } : {}), ...(view.value_column ? { value_column: view.value_column } : {}), ...(view.point_column ? { point_column: view.point_column } : {}) };
    this.subscriptions.push(this.files.createView(versionId, payload).subscribe({
      next: (created) => {
        const file = this.dataFiles().find((item) => item.id === this.selectedFileId()) || undefined;
        const version = this.dataFileVersions().find((item) => item.id === versionId) || undefined;
        const binding = { kind: 'data_file' as const, file_version_id: versionId, data_view_id: Number(created.id), output_mode: view.output_mode, ...(file?.name ? { file_name: file.name } : {}), ...(version?.version ? { version: version.version } : {}), view_summary: this.viewSummary(view) };
        this.facade.setDataFileBinding(node.id, binding, view.output_mode);
        this.facade.setParameter(node.id, 'output_mode', view.output_mode);
        this.rete.setNodeData(node.id, { fileName: file?.name || '', version: version?.version || '', outputMode: view.output_mode, columnSummary: binding.view_summary });
      },
      error: () => this.store.setMessage('error', '数据视图创建失败，请检查列映射后重试。'),
    }));
  }

  private loadCollections(): void { this.dataCollectionsLoaded = true; this.subscriptions.push(this.files.listCollections().subscribe({ next: (items) => this.dataCollections.set(items), error: () => { this.dataCollections.set([]); this.dataCollectionsLoaded = false; } })); }
  private viewSummary(view: DataFileView): string { return view.output_mode === 'table' ? (view.selected_columns || []).join('、') : [view.time_column, view.value_column, view.point_column].filter(Boolean).join(' → '); }

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
    return String(node.parameters?.['model_version_id'] || '');
  }

  onModelChoiceChange(node: EditorNode, modelId: string): void {
    if (modelId === '__none__') {
      this.facade.setParameter(node.id, 'model_version_id', '');
    } else {
      this.facade.setParameter(node.id, 'model_version_id', modelId);
    }
  }

  onModelSelect(node: EditorNode, modelId: string): void {
    this.facade.setParameter(node.id, 'model_version_id', modelId);
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
