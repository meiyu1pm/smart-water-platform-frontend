import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { delay, of } from 'rxjs';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { Definition, Graph } from './workflow-editor.models';
import { WorkflowCommandBus } from './workflow-command-bus';
import { WorkflowEditorStore } from './workflow-editor-store';
import { WorkflowGraphSerializer } from './workflow-graph-serializer';
import { WorkflowEditorFacade } from './workflow-editor-facade';
import {
  ROOT_CANVAS_PANEL_ID,
  WorkflowEditorWorkspacePage,
  isRootWorkflowDocumentPanelId,
} from './workflow-editor-workspace.page';
import { ReteWorkflowAdapter } from './rete-workflow-adapter';
import { WorkflowDocumentTabComponent } from './workflow-document-tab.component';

const createWorkflowApi = (
  options: {
    asyncResponses?: boolean;
    draftResponse?: Record<string, unknown>;
    publishResponse?: Record<string, unknown>;
    runResponse?: Record<string, unknown>;
    requests?: Array<{ method: string; path: string; body: unknown }>;
  } = {},
) => {
  const requests = options.requests ?? [];
  const respond = <T>(value: T) => (options.asyncResponses ? of(value).pipe(delay(0)) : of(value));
  return {
    get: <T>(path: string) => {
      if (/\/operators\/[^/]+\/versions\//.test(path)) {
        return respond({
          version: {
            version: '1.0.0',
            executor_type: 'composite_workflow',
            composite_workflow_version_id: 42,
          },
        } as T);
      }
      if (path.includes('operators')) {
        return respond({
          items: [
            {
              code: 'dataset_channel_v1',
              name: 'Dataset channel',
              description: '',
              category: 'data_source',
              kind: 'data_source',
              status: 'active',
              available: true,
              active_version: {
                version: '1.0.0',
                runtime_type: 'platform',
                executor_type: 'builtin_handler',
                maturity: 'production',
                available: true,
                input_ports: [],
                output_ports: [{ key: 'series', label: 'Series', data_type: 'timeseries' }],
                parameter_schema: { properties: {} },
                ui_schema: {},
                visualization_schema: {},
                algorithm: null,
              },
            },
          ],
        } as T);
      }
      if (path.endsWith('/versions')) {
        return respond([
          { id: 12, version: 2, status: 'published' },
          { id: 11, version: 1, status: 'published' },
        ] as T);
      }
      return respond({
        id: 1,
        workflow_name: 'Demo',
        draft_revision: 1,
        draft_graph: {
          contract_version: '1.0',
          nodes: [
            {
              id: 'source',
              node_code: 'dataset_channel_v1',
              node_version: '1.0.0',
              parameters: {},
            },
          ],
          edges: [],
          outputs: [{ node_id: 'source', port: 'series' }],
          bindings: {
            source: {
              dataset_asset_id: 2,
              dataset_version_id: 4,
              monitor_point_id: 8,
              metric_code: 'flow',
              value_source: 'processed',
              start: '2026-01-01T00:00:00',
              end: '2026-01-02T00:00:00',
            },
          },
        },
      } as T);
    },
    post: <T>(path: string, body: unknown) => {
      requests.push({ method: 'POST', path, body });
      if (path.endsWith('/publish'))
        return of((options.publishResponse ?? { id: 20, version: 3 }) as T);
      if (path.includes('/runs')) return of((options.runResponse ?? {}) as T);
      return of({} as T);
    },
    put: <T>(path: string, body: unknown) => {
      requests.push({ method: 'PUT', path, body });
      return of((options.draftResponse ?? {}) as T);
    },
  };
};

const configureFacadeTest = (api: unknown, routeId: string | null = '1') => {
  TestBed.configureTestingModule({
    providers: [
      WorkflowEditorStore,
      WorkflowCommandBus,
      WorkflowGraphSerializer,
      WorkflowEditorFacade,
      { provide: ApiClient, useValue: api },
      { provide: AuthService, useValue: { user: () => null } },
      {
        provide: NotificationService,
        useValue: { success: () => undefined, error: () => undefined },
      },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeId } } } },
    ],
  });
  const facade = TestBed.inject(WorkflowEditorFacade);
  facade.initialize();
  return { facade, store: TestBed.inject(WorkflowEditorStore) };
};

const source: Definition = {
  node_code: 'source',
  version: '1.0.0',
  node_name: 'Source',
  description: '',
  category: 'data_source',
  runtime_type: 'platform',
  input_ports: [],
  output_ports: [{ key: 'out', label: 'Out', data_type: 'timeseries' }],
};
const sink: Definition = {
  node_code: 'sink',
  version: '1.0.0',
  node_name: 'Sink',
  description: '',
  category: 'algorithm',
  runtime_type: 'platform',
  input_ports: [{ key: 'in', label: 'In', data_type: 'timeseries' }],
  output_ports: [{ key: 'result', label: 'Result', data_type: 'report' }],
};

describe('workflow editor architecture', () => {
  it('round-trips Graph 1.0 and drops isolated edges and invalid outputs', () => {
    const serializer = new WorkflowGraphSerializer();
    const graph: Graph = {
      contract_version: '1.0',
      nodes: [
        {
          id: 'a',
          node_code: 'source',
          node_version: '1.0.0',
          parameters: {},
          ui: { position: { x: 10, y: 20 }, collapsed: false },
        },
        {
          id: 'b',
          node_code: 'sink',
          node_version: '1.0.0',
          parameters: {},
          ui: { position: { x: 100, y: 20 }, collapsed: true },
        },
      ],
      edges: [
        { source: { node_id: 'a', port: 'out' }, target: { node_id: 'b', port: 'in' } },
        { source: { node_id: 'missing', port: 'out' }, target: { node_id: 'b', port: 'in' } },
      ],
      outputs: [
        { node_id: 'b', port: 'result' },
        { node_id: 'missing', port: 'result' },
      ],
    };
    const restored = serializer.deserialize(
      graph,
      new Map([
        ['source', source],
        ['sink', sink],
      ]),
    );
    expect(restored.edges).toHaveLength(1);
    expect(restored.outputs).toEqual([{ node_id: 'b', port: 'result' }]);
    expect(
      serializer.serialize(restored.nodes, restored.edges, restored.outputs).contract_version,
    ).toBe('1.0');
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

  it('replaces a frozen model when switching to a different algorithm version', () => {
    const store = new WorkflowEditorStore();
    const commands = new WorkflowCommandBus(store);
    const sourceDefinition: Definition = { ...source, algorithm: { code: 'seasonal_robust_anomaly', algorithm_version_id: 11 }, default_model_version_id: 'model-old' };
    const targetDefinition: Definition = { ...source, version: '2.0.0', algorithm: { code: 'seasonal_robust_anomaly', algorithm_version_id: 12 }, default_model_version_id: 'model-new' };
    const node = commands.addNode(sourceDefinition, { id: 'algorithm-node' });
    expect(node.model_binding).toEqual({ model_version_id: 'model-old' });

    commands.changeNodeVersion(node.id, targetDefinition);
    expect(store.nodes()[0].model_binding).toEqual({ model_version_id: 'model-new' });

    commands.undo();
    expect(store.nodes()[0].model_binding).toEqual({ model_version_id: 'model-old' });
  });

  it('keeps dataset bindings isolated from graph node parameters', () => {
    const store = new WorkflowEditorStore();
    const commands = new WorkflowCommandBus(store);
    const node = commands.addNode(source, { id: 'dataset-channel' });
    const oldBinding = { dataset_asset_id: 7, dataset_version_id: 8, metric_code: 'flow' };
    const newBinding = { dataset_asset_id: 9, dataset_version_id: 10, metric_code: 'pressure' };
    const oldSelection = {
      asset: { id: 7 },
      version: { id: 8 },
      channel: { monitor_point_id: 1, metric_code: 'flow' },
    } as any;
    const newSelection = {
      asset: { id: 9 },
      version: { id: 10 },
      channel: { monitor_point_id: 2, metric_code: 'pressure' },
    } as any;
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

  it('keeps the Workspace independent from the legacy shell and sends expected_revision through Facade', () => {
    const requests: Array<{ method: string; body: any }> = [];
    TestBed.configureTestingModule({
      providers: [
        WorkflowEditorStore,
        WorkflowCommandBus,
        WorkflowGraphSerializer,
        WorkflowEditorFacade,
        {
          provide: ApiClient,
          useValue: {
            get: () => of({}),
            put: (_path: string, body: any) => {
              requests.push({ method: 'PUT', body });
              return of({ draft_revision: 13, draft_validation_status: 'valid' });
            },
            post: () => of({}),
          },
        },
        { provide: AuthService, useValue: { user: () => ({ id: 1 }) } },
        {
          provide: NotificationService,
          useValue: { success: () => undefined, error: () => undefined },
        },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
      ],
    });
    const facade = TestBed.inject(WorkflowEditorFacade);
    const store = TestBed.inject(WorkflowEditorStore);
    store.workflowId.set(7);
    store.draftRevision.set(12);
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
    adapter.editor = {
      getConnections: () => [],
      removeConnection: async () => commandCalls.push('remove-connection'),
    };
    adapter.area = {
      translate: async () => {
        expect(adapter.synchronizationProtected).toBe(true);
      },
    };
    adapter.addNode = async () => {
      expect(adapter.synchronizationProtected).toBe(true);
    };
    adapter.addConnection = async () => {
      expect(adapter.synchronizationProtected).toBe(true);
    };
    const snapshot = {
      nodes: [
        {
          id: 'a',
          node_code: 'source',
          node_version: '1.0.0',
          parameters: {},
          x: 1,
          y: 2,
          collapsed: false,
          definition: source,
        },
      ],
      edges: [],
    };
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
    const activeHost = {};
    const staleHost = {};
    const destroyed: string[] = [];
    adapter.host = activeHost;
    adapter.mountGeneration = 4;
    adapter.reteNodes = new Map([['node-1', {}]]);
    adapter.area = { destroy: () => destroyed.push('area') };
    adapter.editor = {};
    adapter.unmount(staleHost);
    expect(destroyed).toEqual([]);
    expect(adapter.host).toBe(activeHost);
    adapter.unmount(activeHost);
    expect(destroyed).toEqual(['area']);
    expect(adapter.host).toBeUndefined();
    expect(adapter.nodeCount).toBe(0);
  });
});

describe('workflow editor facade behavior', () => {
  it('loads the server catalog and starter graph', () => {
    const { store } = configureFacadeTest(createWorkflowApi());

    expect(store.definitions()).toHaveLength(1);
    expect(store.nodes().map((node) => node.id)).toEqual(['source']);
    expect(store.workflowName()).toBe('Demo');
  });

  it('restores dataset bindings from the workflow draft graph', () => {
    const { facade, store } = configureFacadeTest(createWorkflowApi());

    expect(facade.graph().bindings?.['source']).toEqual({
      dataset_asset_id: 2,
      dataset_version_id: 4,
      monitor_point_id: 8,
      metric_code: 'flow',
      value_source: 'processed',
      start: '2026-01-01T00:00:00',
      end: '2026-01-02T00:00:00',
    });
    expect(store.bindingsReady()).toBe(true);
  });

  it('restores the latest published version when reopening an existing workflow', () => {
    const { store } = configureFacadeTest(createWorkflowApi());

    expect(store.publishedVersionId()).toBe(12);
    expect(store.publishedVersionNumber()).toBe(2);
  });

  it('shows the last saved validation result without issuing a validation request', () => {
    const requests: Array<{ method: string; path: string; body: unknown }> = [];
    const { facade, store } = configureFacadeTest(createWorkflowApi({ requests }));

    facade.validate();

    expect(requests.some((request) => request.path.endsWith('/validate'))).toBe(false);
    expect(store.message()).toContain('保存草稿后将自动校验');
    expect(facade.validationButtonLabel()).toBe('尚无记录');
  });

  it('keeps a successfully saved draft saved when validation reports issues', () => {
    const { facade, store } = configureFacadeTest(
      createWorkflowApi({
        draftResponse: {
          draft_revision: 2,
          draft_validation_status: 'invalid',
          draft_validation_revision: 2,
          draft_validation_issues: [{ code: 'MISSING_INPUT', message: '缺少输入' }],
        },
      }),
    );

    facade.save();

    expect(store.autosaveState()).toBe('saved');
    expect(store.validationStatus()).toBe('invalid');
    expect(store.message()).toContain('发现 1 个校验问题');
  });

  it('saves a dirty draft before publishing and only publishes a valid result', () => {
    const requests: Array<{ method: string; path: string; body: unknown }> = [];
    const { facade, store } = configureFacadeTest(
      createWorkflowApi({
        requests,
        draftResponse: { draft_revision: 2, draft_validation_status: 'valid' },
      }),
    );
    facade.setParameter('source', 'example', 1);

    facade.publish();

    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'PUT /api/v1/workflows/1/draft',
      'POST /api/v1/workflows/1/publish',
    ]);
    expect(store.draftMatchesPublished()).toBe(true);
    expect(store.publishedVersionId()).toBe(20);
    expect(store.publishedVersionNumber()).toBe(3);
  });

  it('does not publish after a saved draft fails validation', () => {
    const requests: Array<{ method: string; path: string; body: unknown }> = [];
    const { facade, store } = configureFacadeTest(
      createWorkflowApi({
        requests,
        draftResponse: {
          draft_revision: 2,
          draft_validation_status: 'invalid',
          draft_validation_issues: [{ code: 'BAD_GRAPH', message: '图结构无效' }],
        },
      }),
    );
    facade.setParameter('source', 'example', 1);

    facade.publish();

    expect(requests.map((request) => request.method)).toEqual(['PUT']);
    expect(store.draftMatchesPublished()).toBe(false);
  });

  it('confirms before running an unpublished draft and runs the exact published version', () => {
    const requests: Array<{ method: string; path: string; body: unknown }> = [];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { facade } = configureFacadeTest(createWorkflowApi({ requests }));

    facade.run();

    const runRequest = requests.find((request) => request.path.includes('/runs'));
    expect(confirm).toHaveBeenCalled();
    expect(runRequest?.path).toBe('/api/v1/workflow-versions/12/runs');
    expect(runRequest?.body).toEqual({ input_bindings: {}, parameter_overrides: {} });
    confirm.mockRestore();
  });

  it('preserves connections for a missing historical definition', () => {
    const { facade, store } = configureFacadeTest(createWorkflowApi());

    facade.loadGraph({
      contract_version: '1.0',
      nodes: [
        { id: 'source', node_code: 'dataset_channel_v1', node_version: '1.0.0', parameters: {} },
        {
          id: 'retired-node',
          node_code: 's01_assessment_v1',
          node_version: '1.0.0',
          parameters: {},
        },
      ],
      edges: [
        {
          source: { node_id: 'source', port: 'series' },
          target: { node_id: 'retired-node', port: 'inlet_flow' },
        },
      ],
      outputs: [],
    });

    expect(facade.graph().edges).toHaveLength(1);
    expect(facade.graph().edges[0].target.node_id).toBe('retired-node');
  });

  it('opens a composite document only after the same node is picked twice quickly', () => {
    const { facade, store } = configureFacadeTest(createWorkflowApi());
    const definition: Definition = {
      node_code: 'water_adaptive_anomaly',
      version: '1.0.0',
      node_name: '水务自适应多变量异常检测',
      description: '',
      category: 'composite',
      runtime_type: 'platform',
      executor_type: 'composite_workflow',
      composite_workflow_version_id: 42,
      input_ports: [],
      output_ports: [],
    };
    store.nodes.set([
      {
        id: 'composite-1',
        node_code: definition.node_code,
        node_version: definition.version,
        parameters: {},
        x: 10,
        y: 10,
        collapsed: false,
        definition,
      },
    ]);
    const openDocument = vi.fn();

    facade.notifyNodePicked('composite-1', 100, openDocument);
    expect(openDocument).not.toHaveBeenCalled();
    facade.notifyNodePicked('composite-1', 400, openDocument);

    expect(openDocument).toHaveBeenCalledWith('composite-1');
    expect(store.selectedId()).toBe('composite-1');
  });

  it('does not open ordinary nodes or mutate the graph while double picking', () => {
    const { facade, store } = configureFacadeTest(createWorkflowApi());
    store.nodes.set([
      {
        id: 'ordinary-1',
        node_code: 'dataset_channel_v1',
        node_version: '1.0.0',
        parameters: {},
        x: 10,
        y: 10,
        collapsed: false,
        definition: {
          ...source,
          node_code: 'dataset_channel_v1',
          node_name: '数据通道',
        },
      },
    ]);
    const before = JSON.stringify(facade.graph());
    const openDocument = vi.fn();

    facade.notifyNodePicked('ordinary-1', 100, openDocument);
    facade.notifyNodePicked('ordinary-1', 300, openDocument);

    expect(openDocument).not.toHaveBeenCalled();
    expect(JSON.stringify(facade.graph())).toBe(before);
  });
});

describe('workflow editor workspace behavior', () => {
  const configureWorkspaceTest = (asyncResponses = false) => {
    TestBed.configureTestingModule({
      imports: [WorkflowEditorWorkspacePage],
      providers: [
        { provide: ApiClient, useValue: createWorkflowApi({ asyncResponses }) },
        {
          provide: NotificationService,
          useValue: { success: () => undefined, error: () => undefined },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '1' }, queryParamMap: { get: () => null } },
          },
        },
      ],
    });
  };

  it('keeps a dedicated message row so the workspace remains in the flexible grid row', async () => {
    configureWorkspaceTest(true);
    globalThis.ResizeObserver ??= class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    const fixture = TestBed.createComponent(WorkflowEditorWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();

    const messageSlot = fixture.nativeElement.querySelector('.message-slot');
    const workspaceBody = fixture.nativeElement.querySelector('.workspace-body');

    expect(messageSlot).toBeTruthy();
    expect(messageSlot.textContent.trim()).toBe('');
    expect(workspaceBody).toBeTruthy();
    fixture.destroy();
  });

  it('requests workspace initialization again when a delayed graph becomes ready', async () => {
    configureWorkspaceTest();
    const fixture = TestBed.createComponent(WorkflowEditorWorkspacePage);
    const workspace = fixture.componentInstance;
    vi.spyOn(fixture.debugElement.injector.get(ReteWorkflowAdapter), 'mount').mockResolvedValue();
    workspace.mobile.set(true);
    workspace.graphLoaded.set(false);
    const requestInitialization = vi.spyOn(workspace as any, 'requestWorkspaceInitialization');
    fixture.detectChanges();
    requestInitialization.mockClear();

    workspace.graphLoaded.set(true);
    fixture.detectChanges();
    await Promise.resolve();

    expect(requestInitialization).toHaveBeenCalled();
    fixture.destroy();
  });

  it('uses a stable root document id and distinguishes composite document ids', () => {
    expect(ROOT_CANVAS_PANEL_ID).toBe('canvas:root');
    expect(ROOT_CANVAS_PANEL_ID).not.toBe('canvas');
    expect(isRootWorkflowDocumentPanelId('canvas:root')).toBe(true);
    expect(isRootWorkflowDocumentPanelId('canvas:root/composite:c1')).toBe(false);
  });

  it('does not render a close button for the root document tab', () => {
    TestBed.configureTestingModule({ imports: [WorkflowDocumentTabComponent] });
    const fixture = TestBed.createComponent(WorkflowDocumentTabComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.document-close')).toBeNull();

    const compositeFixture = TestBed.createComponent(WorkflowDocumentTabComponent);
    compositeFixture.componentInstance.params = {
      kind: 'composite',
      title: '复合算子 · C1',
      closable: true,
      path: 'root/c1',
    };
    compositeFixture.detectChanges();
    expect(compositeFixture.nativeElement.querySelector('.document-close')).toBeTruthy();
    fixture.destroy();
    compositeFixture.destroy();
  });

  it('opens the exact composite version instead of the newer active catalog version', async () => {
    configureWorkspaceTest();
    const fixture = TestBed.createComponent(WorkflowEditorWorkspacePage);
    fixture.detectChanges();
    await fixture.whenStable();
    const workspace = fixture.componentInstance;
    workspace.mobile.set(false);
    const addedPanels: Array<Record<string, unknown>> = [];
    (workspace as any).dockviewApi = {
      getPanel: () => undefined,
      addPanel: (panel: Record<string, unknown>) => {
        addedPanels.push(panel);
        return { api: { setActive: () => undefined } };
      },
    };
    workspace.nodes.set([
      {
        id: 'legacy-composite',
        node_code: 'water_adaptive_anomaly',
        node_version: '1.0.0',
        parameters: {},
        x: 10,
        y: 10,
        collapsed: false,
        definition: {
          node_code: 'water_adaptive_anomaly',
          version: '2.0.0',
          node_name: '水务自适应多变量异常检测',
          description: '',
          category: 'composite',
          runtime_type: 'platform',
          executor_type: 'composite_workflow',
          composite_workflow_version_id: 999,
          input_ports: [],
          output_ports: [],
        },
      },
    ]);

    (workspace as any).openCompositeNodeDocument('legacy-composite');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect((addedPanels[0]?.['params'] as Record<string, unknown>)?.['workflowVersionId']).toBe(42);
    fixture.destroy();
  });
});
