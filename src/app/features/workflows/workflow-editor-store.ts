import { Injectable, computed, signal } from '@angular/core';
import {
  AutosaveState,
  Definition,
  Edge,
  EditorNode,
  StoredBinding,
  ValidationIssue,
  ValidationStatus,
} from './workflow-editor.models';

/**
 * 架构边界：上游是 CommandBus/Facade 的领域写入，下游是页面、面板和 Rete Adapter 的只读信号。
 * Store 独占节点、边、输出、绑定、选择、参数有效性及草稿/校验/发布状态；禁止 HTTP/DOM/Rete/Dockview。
 * Store 不负责副作用和销毁，Facade/Adapter 分别负责外部请求与画布生命周期。
 */
@Injectable()
export class WorkflowEditorStore {
  readonly definitions = signal<Definition[]>([]);
  readonly nodes = signal<EditorNode[]>([]);
  readonly edges = signal<Edge[]>([]);
  readonly outputs = signal<Array<{ node_id: string; port: string }>>([]);
  readonly bindings = signal<Map<string, StoredBinding>>(new Map());
  readonly bindingSelections = signal<Map<string, unknown>>(new Map());
  readonly selectedId = signal<string | null>(null);
  readonly invalidParameterNodes = signal<ReadonlySet<string>>(new Set());
  readonly workflowId = signal<number | null>(null);
  readonly workflowName = signal('工作流编辑器');
  readonly draftRevision = signal(1);
  readonly autosaveState = signal<AutosaveState>('saved');
  readonly validationStatus = signal<ValidationStatus>('not_validated');
  readonly validationIssues = signal<ValidationIssue[]>([]);
  readonly validationRevision = signal<number | null>(null);
  readonly publishedVersionId = signal<number | null>(null);
  readonly publishedVersionNumber = signal<number | null>(null);
  readonly draftMatchesPublished = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly messageType = signal<'info' | 'error'>('info');
  readonly graphLoaded = signal(false);
  readonly parametersValid = computed(() => this.invalidParameterNodes().size === 0);
  readonly selectedNode = computed(() => this.nodes().find((n) => n.id === this.selectedId()) ?? null);
  readonly bindingsReady = computed(() =>
    this.nodes()
      .filter((n) => n.node_code === 'dataset_channel_v1' || n.node_code === 'dataset_asset_v1')
      .every((n) => this.bindings().has(n.id)),
  );

  setDefinitions(value: Definition[]): void { this.definitions.set(value); }
  setNodes(value: EditorNode[]): void { this.nodes.set(value); }
  setEdges(value: Edge[]): void { this.edges.set(value); }
  setOutputs(value: Array<{ node_id: string; port: string }>): void { this.outputs.set(value); }
  setBindings(value: Map<string, StoredBinding>): void { this.bindings.set(new Map(value)); }
  setBindingSelections(value: Map<string, unknown>): void { this.bindingSelections.set(new Map(value)); }
  setInvalidParameterNodes(value: ReadonlySet<string>): void { this.invalidParameterNodes.set(new Set(value)); }
  setMessage(type: 'info' | 'error', value: string): void { this.messageType.set(type); this.message.set(value); }
  resetTransientValidation(): void {
    this.validationStatus.set('not_validated');
    this.validationIssues.set([]);
    this.validationRevision.set(null);
  }
}

