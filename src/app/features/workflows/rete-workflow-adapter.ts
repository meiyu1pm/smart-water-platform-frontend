import { Injector, Injectable } from '@angular/core';
import { NodeEditor, ClassicPreset } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularPlugin, Presets as AngularPresets } from 'rete-angular-plugin/21';
import { Edge, EditorNode } from './workflow-editor.models';
import { WorkflowCommandBus } from './workflow-command-bus';
import { WorkflowEditorStore } from './workflow-editor-store';

/**
 * 架构边界：上游是 Workspace 的 DOM 宿主和 Store 快照，下游是 Rete 画布事件/渲染。
 * 仅此适配器拥有 Rete 生命周期、渲染、连接、选择和坐标同步；不访问 HTTP/Dockview，不拥有领域状态。
 * editable=false 用于复合画布等只读场景；销毁时释放 Rete Area、ResizeObserver 由宿主负责。
 */
@Injectable()
export class ReteWorkflowAdapter {
  private editor?: NodeEditor<any>;
  private area?: AreaPlugin<any, any>;
  private selection?: ReturnType<typeof AreaExtensions.selector>;
  private readonly reteNodes = new Map<string, any>();
  private host?: HTMLDivElement;
  private hydrating = false;
  private editable = true;
  private nodePickedHandler?: (id: string) => void;

  constructor(private readonly injector: Injector, private readonly commands: WorkflowCommandBus, private readonly store: WorkflowEditorStore) {}

  async mount(host: HTMLDivElement, snapshot: { nodes: EditorNode[]; edges: Edge[] }, options: { editable?: boolean; onNodePicked?: (id: string) => void } = {}): Promise<void> {
    if (this.editor && this.host === host) { this.editable = options.editable ?? this.editable; await this.syncIncremental(snapshot); return; }
    this.destroy(); this.host = host; this.editable = options.editable ?? true; host.replaceChildren();
    this.editor = new NodeEditor(); this.area = new AreaPlugin(host); this.selection = AreaExtensions.selector();
    const connection = new ConnectionPlugin(); connection.addPreset(ConnectionPresets.classic.setup());
    const render = new AngularPlugin({ injector: this.injector }); render.addPreset(AngularPresets.classic.setup() as any);
    this.editor.use(this.area); this.area.use(render as any); this.area.use(connection);
    this.hydrating = true;
    try {
      for (const node of snapshot.nodes) await this.addNode(node);
      for (const edge of snapshot.edges) await this.addConnection(edge);
      await AreaExtensions.zoomAt(this.area, this.editor.getNodes());
    } finally { this.hydrating = false; }
    this.installEvents(options.onNodePicked ?? this.nodePickedHandler);
  }
  setReadOnly(readOnly: boolean): void { this.editable = !readOnly; }
  setNodePickedHandler(handler?: (id: string) => void): void { this.nodePickedHandler = handler; }
  detachHost(host: HTMLDivElement): void { if (this.host === host) this.host = undefined; }
  async sync(snapshot: { nodes: EditorNode[]; edges: Edge[] }): Promise<void> { await this.syncIncremental(snapshot); }
  refresh(): void { (this.area?.area as any)?.update?.(); }
  get areaPlugin(): AreaPlugin<any, any> | undefined { return this.area; }
  get editorInstance(): NodeEditor<any> | undefined { return this.editor; }
  get synchronizationProtected(): boolean { return this.hydrating; }
  get nodeCount(): number { return this.reteNodes.size; }
  destroy(): void { this.area?.destroy(); this.editor = undefined; this.area = undefined; this.reteNodes.clear(); }
  async addNode(item: EditorNode): Promise<void> {
    if (!this.editor) return;
    const node = new ClassicPreset.Node(item.definition?.node_name ?? item.node_code);
    for (const port of item.definition?.input_ports ?? []) node.addInput(port.key, new ClassicPreset.Input(new ClassicPreset.Socket(port.data_type), port.label, Boolean(port.required)));
    for (const port of item.definition?.output_ports ?? []) node.addOutput(port.key, new ClassicPreset.Output(new ClassicPreset.Socket(port.data_type), port.label));
    (node as any).id = item.id; (node as any).__backendId = item.id;
    await this.editor.addNode(node); this.reteNodes.set(item.id, node); await this.area?.translate(node.id, { x: item.x, y: item.y });
  }
  async removeNode(id: string): Promise<void> {
    const node = this.reteNodes.get(id); if (!node || !this.editor) return;
    for (const connection of this.editor.getConnections()) if (connection.source === node.id || connection.target === node.id) await this.editor.removeConnection(connection.id);
    await this.editor.removeNode(node.id); this.reteNodes.delete(id);
  }
  private async syncIncremental(snapshot: { nodes: EditorNode[]; edges: Edge[] }): Promise<void> {
    if (!this.editor || !this.area || !this.host) return;
    this.hydrating = true;
    try {
      const wanted = new Map(snapshot.nodes.map((node) => [node.id, node]));
      for (const id of [...this.reteNodes.keys()]) if (!wanted.has(id)) await this.removeNode(id);
      for (const node of snapshot.nodes) {
        if (!this.reteNodes.has(node.id)) await this.addNode(node);
        else await this.area.translate(this.reteNodes.get(node.id).id, { x: node.x, y: node.y });
      }
      const edgeKey = (edge: Edge) => `${edge.source.node_id}:${edge.source.port}->${edge.target.node_id}:${edge.target.port}`;
      const wantedEdges = new Map(snapshot.edges.map((edge) => [edgeKey(edge), edge]));
      for (const connection of [...this.editor.getConnections()]) {
        const edge: Edge = { source: { node_id: String(connection.source), port: String(connection.sourceOutput) }, target: { node_id: String(connection.target), port: String(connection.targetInput) } };
        if (!wantedEdges.has(edgeKey(edge))) await this.editor.removeConnection(connection.id);
        else wantedEdges.delete(edgeKey(edge));
      }
      for (const edge of wantedEdges.values()) await this.addConnection(edge);
    } finally {
      this.hydrating = false;
    }
  }
  async select(id: string): Promise<void> {
    const node = this.reteNodes.get(id); if (!node || !this.selection || !this.area) return;
    const selectable = AreaExtensions.selectableNodes(this.area, this.selection, { accumulating: AreaExtensions.accumulateOnCtrl() });
    await selectable.select(node.id, false);
  }
  async fitView(): Promise<void> { if (this.area && this.editor) await AreaExtensions.zoomAt(this.area, this.editor.getNodes()); }
  setNodeData(id: string, data: Record<string, unknown>): void { const node = this.reteNodes.get(id); if (node) node.data = data; }
  private async addConnection(edge: Edge): Promise<boolean> {
    if (!this.editor) return false; const source = this.reteNodes.get(edge.source.node_id); const target = this.reteNodes.get(edge.target.node_id);
    if (!source || !target) return false;
    try { await this.editor.addConnection(new ClassicPreset.Connection(source, edge.source.port, target, edge.target.port)); return true; } catch { return false; }
  }
  private installEvents(onNodePicked?: (id: string) => void): void {
    if (!this.editor) return;
    this.editor.addPipe((context: any) => {
      if (!this.editable || this.hydrating) return context;
      if (context.type === 'nodepicked') { this.store.selectedId.set(String(context.data.id)); onNodePicked?.(String(context.data.id)); }
      if (context.type === 'connectioncreate') this.commands.connect({ source: { node_id: String(context.data.source), port: String(context.data.sourceOutput) }, target: { node_id: String(context.data.target), port: String(context.data.targetInput) } });
      if (context.type === 'connectionremove') this.commands.deleteConnection({ source: { node_id: String(context.data.source), port: String(context.data.sourceOutput) }, target: { node_id: String(context.data.target), port: String(context.data.targetInput) } });
      if (context.type === 'nodetranslate') this.commands.moveNode(String(context.data.id), Number(context.data.position?.x ?? 0), Number(context.data.position?.y ?? 0));
      return context;
    });
  }
}
