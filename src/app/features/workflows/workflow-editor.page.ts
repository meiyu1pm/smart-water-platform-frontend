import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject } from '@angular/core';
import { DataAssetSelection } from '../../core/models/api.models';
import { Definition, EditorNode, Edge, Graph, StoredBinding, ValidationIssue, ValidationStatus } from './workflow-editor.models';
import { WorkflowCommandBus } from './workflow-command-bus';
import { WorkflowEditorFacade } from './workflow-editor-facade';
import { ReteWorkflowAdapter } from './rete-workflow-adapter';
import { WorkflowEditorStore } from './workflow-editor-store';
import { WorkflowGraphSerializer } from './workflow-graph-serializer';

export type { Definition, EditorNode, Edge, Graph, StoredBinding, ValidationIssue, ValidationStatus } from './workflow-editor.models';

/**
 * 架构边界：上游是旧路由入口， 下游是 Facade、Store、CommandBus 和 ReteWorkflowAdapter。
 * 这是兼容性的薄路由壳：不拥有业务状态，不访问 HTTP、Cache、Router 或 Rete；画布销毁委托 Adapter。
 */
@Component({ selector: 'app-workflow-editor-page', imports: [], providers: [WorkflowEditorStore, WorkflowCommandBus, WorkflowGraphSerializer, ReteWorkflowAdapter, WorkflowEditorFacade], template: `<div #editorHost class="editor-host"></div>`, styles: `` })
export class WorkflowEditorPage implements AfterViewInit, OnDestroy {
  readonly store = inject(WorkflowEditorStore);
  readonly facade = inject(WorkflowEditorFacade);
  readonly commandBus = inject(WorkflowCommandBus);
  readonly adapter = inject(ReteWorkflowAdapter);
  readonly serializer = inject(WorkflowGraphSerializer);
  @ViewChild('editorHost') editorHost?: ElementRef<HTMLDivElement>;
  readonly definitions = this.store.definitions;
  readonly nodes = this.store.nodes;
  readonly selectedId = this.store.selectedId;
  readonly selectedNode = this.store.selectedNode;
  readonly selectedDataBinding = computed(() => { this.store.bindingRevision(); const node = this.selectedNode(); if (!node || !['dataset_channel_v1', 'dataset_asset_v1'].includes(node.node_code)) return null; return { id: node.id, label: node.definition?.node_name || node.node_code, selection: this.store.bindingSelections().get(node.id) ?? null, wholeAsset: node.node_code === 'dataset_asset_v1' }; });
  readonly bindingNodes = computed(() => this.nodes().filter((node) => node.node_code === 'dataset_channel_v1' || node.node_code === 'dataset_asset_v1').map((node) => ({ id: node.id, label: node.definition?.node_name || node.node_code })));
  readonly bindingsReady = this.store.bindingsReady;
  readonly graphLoaded = this.store.graphLoaded;
  readonly workflowId = this.store.workflowId;
  readonly workflowName = this.store.workflowName;
  readonly publishedVersionId = this.store.publishedVersionId;
  readonly publishedVersionNumber = this.store.publishedVersionNumber;
  readonly draftMatchesPublished = this.store.draftMatchesPublished;
  readonly draftRevision = this.store.draftRevision;
  readonly busy = this.store.busy;
  readonly message = this.store.message;
  readonly messageType = this.store.messageType;
  readonly autosaveState = this.store.autosaveState;
  readonly validationStatus = this.store.validationStatus;
  readonly validationIssues = this.store.validationIssues;
  readonly parametersValid = this.store.parametersValid;
  readonly history = this.store.history;
  readonly historyIndex = this.store.historyIndex;
  get edges(): Edge[] { return this.store.edges(); }
  get graphOutputs(): Array<{ node_id: string; port: string }> { return this.store.outputs(); }
  constructor() { this.facade.initialize(); }
  ngAfterViewInit(): void { if (this.editorHost) void this.mountAdapter(); }
  ngOnDestroy(): void { this.adapter.destroy(); this.facade.destroy(); }
  private async mountAdapter(): Promise<void> { if (this.editorHost) await this.adapter.mount(this.editorHost.nativeElement, { nodes: this.nodes(), edges: this.edges }, { editable: true, onNodePicked: (id) => this.handleReteNodePicked(id) }); }
  attachEditorHost(element: HTMLDivElement): void { this.editorHost = new ElementRef(element); void this.mountAdapter(); }
  detachEditorHost(element: HTMLDivElement): void { if (this.editorHost?.nativeElement === element) { this.adapter.detachHost(element); this.editorHost = undefined; } }
  refreshEditorViewport(): void { this.adapter.refresh(); }
  fitView(): Promise<void> { return this.adapter.fitView(); }
  onCatalogDragStart(event: DragEvent, definition: Definition): void { event.dataTransfer?.setData('application/x-node-code', definition.node_code); }
  allowDrop(event: DragEvent): void { event.preventDefault(); }
  onCanvasDrop(event: DragEvent): void { event.preventDefault(); const code = event.dataTransfer?.getData('application/x-node-code'); const definition = this.store.definitionByCode().get(code || ''); if (definition) void this.addNode(definition); }
  async addNode(definition: Definition): Promise<void> { const node = this.facade.addNode(definition); await this.adapter.addNode(node); }
  async removeNode(id: string): Promise<void> { if (typeof window !== 'undefined' && !window.confirm('移除该节点并删除其连接？')) return; this.facade.removeNode(id); await this.adapter.removeNode(id); }
  select(id: string): void { this.store.selectedId.set(id); void this.adapter.select(id); }
  moveNode(id: string, x: number, y: number): void { this.facade.moveNode(id, x, y); }
  parameterEntries(node: EditorNode): Array<{ key: string; value: unknown }> { return this.facade.parameterEntries(node); }
  parameterSchema(node: EditorNode, key: string): Record<string, any> { return this.facade.parameterSchema(node, key); }
  defaultParameters(definition: Definition): Record<string, unknown> { return this.facade.defaultParameters(definition); }
  coerceNumber(value: unknown, integer: boolean): number { return this.facade.coerceNumber(value, integer); }
  setParameter(id: string, key: string, value: unknown): void { this.facade.setParameter(id, key, value); this.adapter.setNodeData(id, this.nodes().find((n) => n.id === id)?.parameters ?? {}); }
  setParameters(id: string, parameters: Record<string, unknown>): void { this.facade.setParameters(id, parameters); this.adapter.setNodeData(id, parameters); }
  setParameterValidity(id: string, valid: boolean): void { this.facade.setParameterValidity(id, valid); }
  isOutputPort(nodeId: string, port: string): boolean { return this.facade.isOutputPort(nodeId, port); }
  toggleOutputPort(nodeId: string, port: string): void { this.facade.toggleOutputPort(nodeId, port); }
  setBinding(nodeId: string, selection: DataAssetSelection | null): void { this.facade.setBinding(nodeId, selection); }
  graph(): Graph { return this.facade.graph(); }
  loadGraph(graph: Graph): void { this.facade.loadGraph(graph); void this.adapter.sync({ nodes: this.nodes(), edges: this.edges }); }
  undo(): void { this.facade.undo(); }
  redo(): void { this.facade.redo(); }
  validate(): void { this.facade.validate(); }
  save(): void { this.facade.save(); }
  publish(): void { this.facade.publish(); }
  run(): void { this.facade.run(); }
  autosaveLabel(): string { return this.facade.autosaveLabel(); }
  validationButtonLabel(): string { return this.facade.validationButtonLabel(); }
  protected openCompositeNodeDocument(_nodeId: string): void {}
  protected handleReteNodePicked(nodeId: string, pickedAt = Date.now()): void { this.facade.notifyNodePicked(nodeId, pickedAt, (id) => this.openCompositeNodeDocument(id)); }
  shortNodeId(nodeId: string): string { return nodeId.length > 8 ? nodeId.slice(0, 8) : nodeId; }
  showError(text: string): void { this.store.setMessage('error', text); }
}
