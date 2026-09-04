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
    // Unknown historical definitions must round-trip unchanged. The server owns semantic validation.
    const safeEdges = this.sanitizeEdges(nodes, edges);
    const safeOutputs = outputs.filter((o) => {
      const node = nodes.find((n) => n.id === o.node_id);
      return !node || !node.definition || node.definition.output_ports.some((p) => p.key === o.port);
    });
    const graph: Graph = {
      contract_version: '1.0',
      nodes: nodes.filter((n) => validNodes.has(n.id)).map((n) => ({ id: n.id, node_code: n.node_code, node_version: n.node_version, parameters: this.safeParameters(n), ...(n.model_binding?.model_version_id ? { model_binding: { model_version_id: n.model_binding.model_version_id } } : {}), ui: { position: { x: n.x, y: n.y }, collapsed: n.collapsed } })),
      edges: safeEdges,
      outputs: safeOutputs,
    };
    if (bindings?.size) graph.bindings = Object.fromEntries(bindings.entries());
    return graph;
  }
  deserialize(graph: Graph, definitions: Map<string, Definition>): { nodes: EditorNode[]; edges: Edge[]; outputs: Array<{ node_id: string; port: string }>; bindings: Map<string, StoredBinding> } {
    const nodes = (graph.nodes ?? []).map((raw, index) => {
      const ui = ((raw['ui'] ?? {}) as Record<string, unknown>); const position = ((ui['position'] ?? {}) as Record<string, unknown>);
      const nodeCode = String(raw['node_code']); const nodeVersion = String(raw['node_version']);
      const definition = definitions.get(`${nodeCode}@${nodeVersion}`);
      const parameters = { ...((raw['parameters'] as Record<string, unknown>) ?? {}) };
      const rawBinding = raw['model_binding'] as Record<string, unknown> | undefined;
      const modelVersionId = String(rawBinding?.['model_version_id'] ?? parameters['model_version_id'] ?? '');
      // Legacy graphs carried the model inside parameters; normalize on the next successful save.
      if (modelVersionId) delete parameters['model_version_id'];
      return { id: String(raw['id']), node_code: nodeCode, node_version: nodeVersion, parameters, ...(modelVersionId ? { model_binding: { model_version_id: modelVersionId } } : {}), x: Number(position['x'] ?? 34 + (index % 2) * 285), y: Number(position['y'] ?? 30 + Math.floor(index / 2) * 145), collapsed: Boolean(ui['collapsed'] ?? false), definition };
    });
    const edges = this.sanitizeEdges(nodes, graph.edges ?? []);
    const outputs = (graph.outputs ?? []).filter((o) => { const node = nodes.find((n) => n.id === o.node_id); return Boolean(node && (!node.definition || node.definition.output_ports.some((p) => p.key === o.port))); });
    const bindings = new Map<string, StoredBinding>();
    for (const [id, value] of Object.entries(graph.bindings ?? {})) {
      const raw = value as unknown as Record<string, unknown>;
      if (raw?.['kind'] === 'data_file' && Number.isInteger(Number(raw['file_version_id'])) && Number.isInteger(Number(raw['data_view_id'])) && (raw['output_mode'] === 'table' || raw['output_mode'] === 'timeseries')) {
        bindings.set(id, { ...raw, file_version_id: Number(raw['file_version_id']), data_view_id: Number(raw['data_view_id']) } as StoredBinding);
      } else if (raw && Number.isInteger(Number(raw['dataset_version_id']))) {
        bindings.set(id, { ...raw, dataset_asset_id: Number(raw['dataset_asset_id']), dataset_version_id: Number(raw['dataset_version_id']) } as StoredBinding);
      }
    }
    return { nodes, edges, outputs, bindings };
  }
  private safeParameters(node: EditorNode): Record<string, unknown> {
    if (node.node_code !== 'data_file_input_v1') return node.parameters;
    const parameters = { ...node.parameters };
    delete parameters['file_version_id'];
    delete parameters['data_view_id'];
    delete parameters['file_name'];
    return parameters;
  }
  sanitizeEdges(nodes: EditorNode[], edges: Edge[]): Edge[] {
    const byId = new Map(nodes.map((n) => [n.id, n])); const seen = new Set<string>(); const result: Edge[] = [];
    for (const edge of edges) {
      const source = byId.get(edge.source?.node_id); const target = byId.get(edge.target?.node_id);
      const sourcePort = source?.definition?.output_ports.find((p) => p.key === edge.source?.port); const targetPort = target?.definition?.input_ports.find((p) => p.key === edge.target?.port);
      // Do not erase historical edges merely because the exact definition is not installed locally.
      if (!source || !target || source.id === target.id) continue;
      if ((source.definition && !sourcePort) || (target.definition && !targetPort)) continue;
      const key = `${source.id}:${edge.source.port}->${target.id}:${edge.target.port}`; if (seen.has(key)) continue; seen.add(key);
      result.push({ source: { node_id: source.id, port: edge.source.port }, target: { node_id: target.id, port: edge.target.port } });
    }
    return result;
  }
}
