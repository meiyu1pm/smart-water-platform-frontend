import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { ApiClient } from '../../core/services/api-client.service';
import { OperatorNameService } from '../../core/services/operator-name.service';
import type { Definition, EditorNode, Edge } from './workflow-editor.models';
import { ReteWorkflowAdapter } from './rete-workflow-adapter';
import { WorkflowEditorStore } from './workflow-editor-store';
import { WorkflowCommandBus } from './workflow-command-bus';

export interface CompositeCanvasParams {
  workflowVersionId: number;
  workflowName?: string;
  nodeId?: string;
  title?: string;
  readOnly?: boolean;
}

interface CompositeGraphResponse {
  workflow_version_id: number;
  workflow_name: string;
  version: number;
  graph: {
    contract_version?: string;
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
    outputs?: Array<Record<string, unknown>>;
  };
  definitions?: Array<Record<string, unknown>> | Record<string, Record<string, unknown>>;
  interface?: Record<string, unknown>;
}

interface PortLike {
  key: string;
  label: string;
  data_type: string;
  semantic_type?: string | null;
  unit?: string | null;
  cardinality?: string;
}

@Component({
  selector: 'app-workflow-composite-canvas-panel',
  providers: [ReteWorkflowAdapter, WorkflowEditorStore, WorkflowCommandBus],
  standalone: true,
  template: `
    <section class="composite-shell" aria-label="复合节点内部画布">
      <div #editorHost class="composite-rete-host"></div>
      @if (loading()) {
        <div class="state-card">正在加载复合节点内部流程…</div>
      }
      @if (errorMessage(); as error) {
        <div class="state-card error" role="alert">
          <strong>复合节点暂时无法打开</strong>
          <span>{{ error }}</span>
        </div>
      }
      @if (!loading() && !errorMessage() && renderedNodeCount() === 0) {
        <div class="state-card">该复合节点没有可显示的内部流程。</div>
      }
      <span class="readonly-badge">只读浏览</span>
    </section>
  `,
  styles: `
    :host,
    .composite-shell,
    .composite-rete-host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
    .composite-shell {
      position: relative;
      overflow: hidden;
      background-color: var(--sw-canvas-bg);
      background-image:
        linear-gradient(var(--sw-border) 1px, transparent 1px),
        linear-gradient(90deg, var(--sw-border) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .composite-rete-host {
      position: absolute;
      inset: 0;
    }
    :host ::ng-deep [data-testid='node'] {
      cursor: default !important;
      pointer-events: none !important;
      user-select: none;
    }
    :host ::ng-deep [data-testid='node'] * {
      pointer-events: none !important;
    }
    :host ::ng-deep [data-testid='connection'],
    :host ::ng-deep .connection,
    :host ::ng-deep .connection-path {
      pointer-events: none !important;
    }
    .state-card {
      position: absolute;
      inset: 50% auto auto 50%;
      display: grid;
      gap: 6px;
      max-width: min(440px, calc(100% - 32px));
      padding: 16px 18px;
      transform: translate(-50%, -50%);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: color-mix(in srgb, var(--sw-surface) 94%, transparent);
      color: var(--sw-text-muted);
      box-shadow: var(--sw-shadow-sm);
      text-align: center;
    }
    .state-card.error {
      border-color: color-mix(in srgb, var(--sw-color-danger) 35%, var(--sw-border));
      color: var(--sw-color-danger);
    }
    .state-card.error span {
      color: var(--sw-text-muted);
    }
    .readonly-badge {
      position: absolute;
      top: 10px;
      right: 12px;
      z-index: 2;
      padding: 4px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--sw-surface) 90%, transparent);
      color: var(--sw-text-muted);
      font-size: 12px;
      pointer-events: none;
    }
  `,
})
export class WorkflowCompositeCanvasPanelComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorHost', { static: true }) private editorHost!: ElementRef<HTMLDivElement>;
  private readonly api = inject(ApiClient);
  private readonly adapter = inject(ReteWorkflowAdapter);
  private readonly operatorNames = inject(OperatorNameService);
  private readonly subscriptions: Subscription[] = [];
  private resizeObserver?: ResizeObserver;
  private viewReady = false;
  private requestVersion = 0;

  params: CompositeCanvasParams = { workflowVersionId: 0, readOnly: true };
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly renderedNodeCount = signal(0);

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.observeResize();
    this.loadCompositeGraph();
  }

  /** Dockview updates panel parameters by assignment; this method also helps isolated tests. */
  setParams(params: CompositeCanvasParams): void {
    this.params = params;
    if (this.viewReady) this.loadCompositeGraph();
  }

  ngOnDestroy(): void {
    this.requestVersion += 1;
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.resizeObserver?.disconnect();
    this.adapter.destroy();
  }

  private loadCompositeGraph(): void {
    const versionId = Number(this.params?.workflowVersionId);
    if (!Number.isInteger(versionId) || versionId <= 0) {
      this.errorMessage.set('缺少复合节点版本信息。');
      this.loading.set(false);
      return;
    }
    const requestVersion = ++this.requestVersion;
    this.loading.set(true);
    this.errorMessage.set('');
    this.renderedNodeCount.set(0);
    this.destroyRete();
    this.subscriptions.push(
      this.api
        .get<CompositeGraphResponse>(`/api/v1/workflow-versions/${versionId}/composite-graph`)
        .subscribe({
          next: (response) => {
            if (requestVersion !== this.requestVersion) return;
            this.loading.set(false);
            void this.renderGraph(response).catch(() => {
              this.errorMessage.set('复合节点内部图数据无法显示。');
            });
          },
          error: () => {
            if (requestVersion !== this.requestVersion) return;
            this.loading.set(false);
            this.errorMessage.set('无法读取该复合节点的内部工作流，请稍后重试。');
          },
        }),
    );
  }

  private async renderGraph(response: CompositeGraphResponse): Promise<void> {
    const graph = response?.graph || {};
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const definitions = this.normalizeDefinitions(response?.definitions);
    const positions = this.positionsForNodes(nodes, graph.edges || []);
    const editorNodes: EditorNode[] = [];
    for (const [index, rawNode] of nodes.entries()) {
      const nodeId = String(rawNode['id'] || `node-${index + 1}`);
      const definition = this.definitionForNode(rawNode, definitions);
      if (!definition) continue;
      const position = positions.get(nodeId) || { x: 60, y: 60 };
      editorNodes.push({ id: nodeId, node_code: definition.node_code, node_version: definition.version, parameters: {}, x: position.x, y: position.y, collapsed: false, definition });
    }
    const editorEdges: Edge[] = (graph.edges || []).map((raw) => this.normalizeEdge(raw)).filter((edge): edge is Edge => Boolean(edge));
    await this.adapter.mount(this.editorHost.nativeElement, { nodes: editorNodes, edges: editorEdges }, { editable: false });
    this.renderedNodeCount.set(this.adapter.nodeCount);
    this.adapter.refresh();
  }

  private definitionForNode(
    rawNode: Record<string, unknown>,
    definitions: Map<string, Record<string, unknown>>,
  ): Definition | null {
    const code = String(rawNode['node_code'] || '');
    const version = String(rawNode['node_version'] || rawNode['version'] || '');
    const raw =
      (rawNode['definition'] as Record<string, unknown> | undefined) ||
      definitions.get(`${code}@${version}`) ||
      definitions.get(code);
    if (!raw) return null;
    const ports = (value: unknown): PortLike[] =>
      Array.isArray(value)
        ? value
            .filter((port): port is Record<string, unknown> =>
              Boolean(port && typeof port === 'object'),
            )
            .map((port) => ({
              key: String(port['key'] || ''),
              label: String(port['label'] || port['key'] || ''),
              data_type: String(port['data_type'] || 'json'),
              semantic_type: (port['semantic_type'] as string | null | undefined) ?? null,
              unit: (port['unit'] as string | null | undefined) ?? null,
              cardinality: String(port['cardinality'] || 'one'),
            }))
        : [];
    return {
      node_code: code,
      version: version || String(raw['version'] || ''),
      node_name: String(raw['node_name'] || raw['name'] || code),
      description: String(raw['description'] || ''),
      category: String(raw['category'] || 'algorithm'),
      runtime_type: String(raw['runtime_type'] || 'platform'),
      input_ports: ports(raw['input_ports'] || raw['inputs']),
      output_ports: ports(raw['output_ports'] || raw['outputs']),
    };
  }

  private normalizeDefinitions(
    definitions: CompositeGraphResponse['definitions'],
  ): Map<string, Record<string, unknown>> {
    const result = new Map<string, Record<string, unknown>>();
    if (Array.isArray(definitions)) {
      for (const definition of definitions) {
        const code = String(definition['node_code'] || definition['code'] || '');
        const version = String(definition['version'] || definition['node_version'] || '');
        if (!code) continue;
        result.set(code, definition);
        if (version) result.set(`${code}@${version}`, definition);
      }
    } else if (definitions && typeof definitions === 'object') {
      for (const [key, definition] of Object.entries(definitions)) {
        if (definition && typeof definition === 'object') result.set(key, definition);
      }
    }
    return result;
  }

  private normalizeEdge(rawEdge: Record<string, unknown>): {
    source: { node_id: string; port: string };
    target: { node_id: string; port: string };
  } | null {
    const source = (rawEdge['source'] || {}) as Record<string, unknown>;
    const target = (rawEdge['target'] || {}) as Record<string, unknown>;
    const sourceId = String(source['node_id'] || source['node'] || '');
    const targetId = String(target['node_id'] || target['node'] || '');
    const sourcePort = String(source['port'] || source['output'] || '');
    const targetPort = String(target['port'] || target['input'] || '');
    if (!sourceId || !targetId || !sourcePort || !targetPort) return null;
    return {
      source: { node_id: sourceId, port: sourcePort },
      target: { node_id: targetId, port: targetPort },
    };
  }

  private positionsForNodes(
    nodes: Array<Record<string, unknown>>,
    edges: Array<Record<string, unknown>>,
  ): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    const missing: string[] = [];
    for (const [index, node] of nodes.entries()) {
      const id = String(node['id'] || `node-${index + 1}`);
      const ui = (node['ui'] || {}) as Record<string, unknown>;
      const position = (ui['position'] || node['position'] || {}) as Record<string, unknown>;
      const x = Number(position['x'] ?? node['x']);
      const y = Number(position['y'] ?? node['y']);
      if (Number.isFinite(x) && Number.isFinite(y)) result.set(id, { x, y });
      else missing.push(id);
    }
    const depth = new Map<string, number>();
    for (let pass = 0; pass < nodes.length; pass += 1) {
      let changed = false;
      for (const rawEdge of edges) {
        const edge = this.normalizeEdge(rawEdge);
        if (!edge) continue;
        const sourceDepth = depth.get(edge.source.node_id) || 0;
        const nextDepth = sourceDepth + 1;
        if (nextDepth > (depth.get(edge.target.node_id) || 0)) {
          depth.set(edge.target.node_id, nextDepth);
          changed = true;
        }
      }
      if (!changed) break;
    }
    missing.forEach((id, index) => {
      const column = depth.get(id) || Math.floor(index / 3);
      const row = index % 3;
      result.set(id, { x: 70 + column * 300, y: 70 + row * 180 });
    });
    return result;
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.adapter.refresh());
    this.resizeObserver.observe(this.editorHost.nativeElement);
  }

  private destroyRete(): void {
    this.adapter.destroy();
    this.editorHost?.nativeElement.replaceChildren();
  }
}
