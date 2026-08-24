import { Injectable } from '@angular/core';
import { Definition, Edge, EditorNode, Graph, StoredBinding } from './workflow-editor.models';

/**
 * 架构边界：上游是 Store/API Graph 1.0，下游是 Store 或 Rete hydration；不访问 HTTP/DOM/Rete/Dockview。
 * 负责 Graph 1.0 双向转换，并在边界清理孤立边和失效输出；不负责状态、通知或销毁。
 */
@Injectable()
export class WorkflowGraphSerializer {
  serialize(nodes: EditorNode[], edges: Edge[], outputs: Array<{ node_id: string; port: string }>, bindings?: Map<string, StoredBinding>): Graph {
    const validNodes = new Set(nodes.map((n) => n.id));
    const safeEdges = this.sanitizeEdges(nodes, edges);
    const safeOutputs = outputs.filter((o) => {
      const node = nodes.find((n) => n.id === o.node_id);
      return Boolean(node?.definition?.output_ports.some((p) => p.key === o.port));
    });
    const graph: Graph = {
      contract_version: '1.0',
      nodes: nodes.filter((n) => validNodes.has(n.id)).map((n) => ({ id: n.id, node_code: n.node_code, node_version: n.node_version, parameters: n.parameters, ui: { position: { x: n.x, y: n.y }, collapsed: n.collapsed } })),
      edges: safeEdges,
      outputs: safeOutputs,
    };
    if (bindings?.size) graph.bindings = Object.fromEntries(bindings.entries());
    return graph;
  }
  deserialize(graph: Graph, definitions: Map<string, Definition>): { nodes: EditorNode[]; edges: Edge[]; outputs: Array<{ node_id: string; port: string }>; bindings: Map<string, StoredBinding> } {
    const nodes = (graph.nodes ?? []).map((raw, index) => {
      const ui = ((raw['ui'] ?? {}) as Record<string, unknown>); const position = ((ui['position'] ?? {}) as Record<string, unknown>);
      const definition = definitions.get(String(raw['node_code']));
      return { id: String(raw['id']), node_code: String(raw['node_code']), node_version: String(raw['node_version']), parameters: (raw['parameters'] as Record<string, unknown>) ?? {}, x: Number(position['x'] ?? 34 + (index % 2) * 285), y: Number(position['y'] ?? 30 + Math.floor(index / 2) * 145), collapsed: Boolean(ui['collapsed'] ?? false), definition };
    });
    const edges = this.sanitizeEdges(nodes, graph.edges ?? []);
    const outputs = (graph.outputs ?? []).filter((o) => nodes.find((n) => n.id === o.node_id)?.definition?.output_ports.some((p) => p.key === o.port));
    const bindings = new Map<string, StoredBinding>();
    for (const [id, value] of Object.entries(graph.bindings ?? {})) if (value && Number.isInteger(Number(value.dataset_version_id))) bindings.set(id, { ...value });
    return { nodes, edges, outputs, bindings };
  }
  sanitizeEdges(nodes: EditorNode[], edges: Edge[]): Edge[] {
    const byId = new Map(nodes.map((n) => [n.id, n])); const seen = new Set<string>(); const result: Edge[] = [];
    for (const edge of edges) {
      const source = byId.get(edge.source?.node_id); const target = byId.get(edge.target?.node_id);
      const sourcePort = source?.definition?.output_ports.find((p) => p.key === edge.source?.port); const targetPort = target?.definition?.input_ports.find((p) => p.key === edge.target?.port);
      if (!source || !target || !sourcePort || !targetPort || source.id === target.id) continue;
      const key = `${source.id}:${sourcePort.key}->${target.id}:${targetPort.key}`; if (seen.has(key)) continue; seen.add(key);
      result.push({ source: { node_id: source.id, port: sourcePort.key }, target: { node_id: target.id, port: targetPort.key } });
    }
    return result;
  }
}
