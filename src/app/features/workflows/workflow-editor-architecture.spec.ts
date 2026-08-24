import { describe, expect, it } from 'vitest';
import { Definition, Graph } from './workflow-editor.models';
import { WorkflowCommandBus } from './workflow-command-bus';
import { WorkflowEditorStore } from './workflow-editor-store';
import { WorkflowGraphSerializer } from './workflow-graph-serializer';

const source: Definition = {
  node_code: 'source', version: '1.0.0', node_name: 'Source', description: '', category: 'data_source', runtime_type: 'platform',
  input_ports: [], output_ports: [{ key: 'out', label: 'Out', data_type: 'timeseries' }],
};
const sink: Definition = {
  node_code: 'sink', version: '1.0.0', node_name: 'Sink', description: '', category: 'algorithm', runtime_type: 'platform',
  input_ports: [{ key: 'in', label: 'In', data_type: 'timeseries' }], output_ports: [{ key: 'result', label: 'Result', data_type: 'report' }],
};

describe('workflow editor architecture', () => {
  it('round-trips Graph 1.0 and drops isolated edges and invalid outputs', () => {
    const serializer = new WorkflowGraphSerializer();
    const graph: Graph = {
      contract_version: '1.0',
      nodes: [
        { id: 'a', node_code: 'source', node_version: '1.0.0', parameters: {}, ui: { position: { x: 10, y: 20 }, collapsed: false } },
        { id: 'b', node_code: 'sink', node_version: '1.0.0', parameters: {}, ui: { position: { x: 100, y: 20 }, collapsed: true } },
      ],
      edges: [
        { source: { node_id: 'a', port: 'out' }, target: { node_id: 'b', port: 'in' } },
        { source: { node_id: 'missing', port: 'out' }, target: { node_id: 'b', port: 'in' } },
      ],
      outputs: [{ node_id: 'b', port: 'result' }, { node_id: 'missing', port: 'result' }],
    };
    const restored = serializer.deserialize(graph, new Map([['source', source], ['sink', sink]]));
    expect(restored.edges).toHaveLength(1);
    expect(restored.outputs).toEqual([{ node_id: 'b', port: 'result' }]);
    expect(serializer.serialize(restored.nodes, restored.edges, restored.outputs).contract_version).toBe('1.0');
  });

  it('routes graph mutations and history through the command bus', () => {
    const store = new WorkflowEditorStore();
    const commands = new WorkflowCommandBus(store);
    const a = commands.addNode(source, { id: 'a' });
    expect(store.nodes()).toHaveLength(1);
    commands.moveNode(a.id, 42, 24);
    expect(store.nodes()[0].x).toBe(42);
    commands.undo();
    expect(store.nodes()[0].x).toBe(80);
    commands.redo();
    expect(store.nodes()[0].x).toBe(42);
    commands.toggleOutput(a.id, 'out');
    expect(store.outputs()).toEqual([{ node_id: 'a', port: 'out' }]);
  });
});

