import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { Definition, Graph } from './workflow-editor.models';
import { WorkflowCommandBus } from './workflow-command-bus';
import { WorkflowEditorStore } from './workflow-editor-store';
import { WorkflowGraphSerializer } from './workflow-graph-serializer';
import { WorkflowEditorFacade } from './workflow-editor-facade';
import { WorkflowEditorWorkspacePage } from './workflow-editor-workspace.page';
import { ReteWorkflowAdapter } from './rete-workflow-adapter';

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

  it('keeps dataset bindings isolated from graph node parameters', () => {
    const store = new WorkflowEditorStore();
    const commands = new WorkflowCommandBus(store);
    const node = commands.addNode(source, { id: 'dataset-channel' });
    const oldBinding = { dataset_asset_id: 7, dataset_version_id: 8, metric_code: 'flow' };
    const newBinding = { dataset_asset_id: 9, dataset_version_id: 10, metric_code: 'pressure' };
    const oldSelection = { asset: { id: 7 }, version: { id: 8 }, channel: { monitor_point_id: 1, metric_code: 'flow' } } as any;
    const newSelection = { asset: { id: 9 }, version: { id: 10 }, channel: { monitor_point_id: 2, metric_code: 'pressure' } } as any;
    commands.setBinding(node.id, oldBinding, oldSelection);
    commands.setParameter(node.id, 'window', 24);
    commands.setBinding(node.id, newBinding, newSelection);
    commands.undo();
    expect(store.bindings().get(node.id)).toEqual(oldBinding);
    expect(store.bindingSelections().get(node.id)).toEqual(oldSelection);
    commands.redo();
    expect(store.bindings().get(node.id)).toEqual(newBinding);
    expect(store.bindingSelections().get(node.id)).toEqual(newSelection);
    expect(store.nodes()[0].parameters).toEqual({ window: 24 });
  });

  it('round-trips data-file bindings while keeping resource IDs out of node parameters', () => {
    const serializer = new WorkflowGraphSerializer();
    const definition: Definition = { node_code: 'data_file_input_v1', version: '1.0.0', node_name: '数据文件', description: '', category: 'data_source', runtime_type: 'platform', input_ports: [], output_ports: [{ key: 'table', label: '表格', data_type: 'table' }, { key: 'series', label: '时序', data_type: 'timeseries' }] };
    const binding = { kind: 'data_file' as const, file_version_id: 12, data_view_id: 31, output_mode: 'timeseries' as const, file_name: 'flow.csv' };
    const nodes = [{ id: 'file', node_code: definition.node_code, node_version: definition.version, parameters: { binding_key: 'file', output_mode: 'timeseries', data_view_id: 31 }, x: 0, y: 0, collapsed: false, definition }];
    const graph = serializer.serialize(nodes, [], [], new Map([['file', binding]]));
    expect(graph.nodes[0]['parameters']).toEqual({ binding_key: 'file', output_mode: 'timeseries' });
    const restored = serializer.deserialize(graph, new Map([[definition.node_code, definition]]));
    expect(restored.bindings.get('file')).toEqual(binding);
  });

  it('keeps the Workspace independent from the legacy Page and sends expected_revision through Facade', () => {
    expect(WorkflowEditorWorkspacePage.toString()).not.toContain('WorkflowEditorPage');
    const requests: Array<{ method: string; body: any }> = [];
    TestBed.configureTestingModule({
      providers: [
        WorkflowEditorStore, WorkflowCommandBus, WorkflowGraphSerializer, WorkflowEditorFacade,
        { provide: ApiClient, useValue: { get: () => of({}), put: (_path: string, body: any) => { requests.push({ method: 'PUT', body }); return of({ draft_revision: 13, draft_validation_status: 'valid' }); }, post: () => of({}) } },
        { provide: AuthService, useValue: { user: () => ({ id: 1 }) } },
        { provide: NotificationService, useValue: { success: () => undefined, error: () => undefined } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      ],
    });
    const facade = TestBed.inject(WorkflowEditorFacade);
    const store = TestBed.inject(WorkflowEditorStore);
    store.workflowId.set(7); store.draftRevision.set(12);
    facade.save();
    expect(requests[0]?.body.expected_revision).toBe(12);
  });

  it('keeps sync incremental instead of rebuilding the Rete editor', () => {
    expect(ReteWorkflowAdapter.prototype.sync.toString()).not.toContain('mount');
    expect(ReteWorkflowAdapter.prototype.sync.toString()).not.toContain('destroy');
  });

  it('resolves a custom renderer from the Rete node payload and updates display data in place', () => {
    const adapter = Object.create(ReteWorkflowAdapter.prototype) as any;
    const node = { id: 'file', data: { renderer_key: 'data-file-input', fileName: 'old.csv' } };
    const update = vi.fn(() => Promise.resolve());
    adapter.reteNodes = new Map([['file', node]]);
    adapter.area = { update };
    expect(adapter.rendererKey({ type: 'node', payload: node })).toBe('data-file-input');
    adapter.setNodeData('file', { fileName: 'new.csv', outputMode: 'table' });
    expect(node.data).toMatchObject({ renderer_key: 'data-file-input', fileName: 'new.csv', outputMode: 'table' });
    expect(update).toHaveBeenCalledWith('node', 'file');
  });

  it('protects incremental Rete synchronization from user command paths', async () => {
    const commandCalls: string[] = [];
    const adapter = Object.create(ReteWorkflowAdapter.prototype) as any;
    adapter.host = {};
    adapter.reteNodes = new Map();
    adapter.editor = { getConnections: () => [], removeConnection: async () => commandCalls.push('remove-connection') };
    adapter.area = { translate: async () => { expect(adapter.synchronizationProtected).toBe(true); } };
    adapter.addNode = async () => { expect(adapter.synchronizationProtected).toBe(true); };
    adapter.addConnection = async () => { expect(adapter.synchronizationProtected).toBe(true); };
    const snapshot = { nodes: [{ id: 'a', node_code: 'source', node_version: '1.0.0', parameters: {}, x: 1, y: 2, collapsed: false, definition: source }], edges: [] };
    adapter.hydrating = false;
    await adapter.sync(snapshot);
    expect(adapter.synchronizationProtected).toBe(false);
    adapter.hydrating = true;
    await adapter.sync(snapshot);
    expect(adapter.synchronizationProtected).toBe(true);
    expect(commandCalls).toEqual([]);
  });

  it('only unmounts the Rete surface owned by the destroyed canvas host', () => {
    const adapter = Object.create(ReteWorkflowAdapter.prototype) as any;
    const activeHost = {}; const staleHost = {}; const destroyed: string[] = [];
    adapter.host = activeHost; adapter.mountGeneration = 4; adapter.reteNodes = new Map([['node-1', {}]]);
    adapter.area = { destroy: () => destroyed.push('area') }; adapter.editor = {};
    adapter.unmount(staleHost);
    expect(destroyed).toEqual([]); expect(adapter.host).toBe(activeHost);
    adapter.unmount(activeHost);
    expect(destroyed).toEqual(['area']); expect(adapter.host).toBeUndefined(); expect(adapter.nodeCount).toBe(0);
  });
});
