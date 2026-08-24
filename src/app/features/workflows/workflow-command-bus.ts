import { Injectable } from '@angular/core';
import { DataAssetSelection } from '../../core/models/api.models';
import { Definition, Edge, EditorNode, Graph, StoredBinding } from './workflow-editor.models';
import { WorkflowEditorStore } from './workflow-editor-store';

/**
 * 架构边界：上游是目录、画布、属性面板和 Facade，下游只有 WorkflowEditorStore。
 * 用户图修改唯一经过此总线；hydrate/load 是无历史的恢复入口。总线不访问 HTTP、DOM、Rete 或 Dockview。
 * 每次提交统一维护 dirty、校验失效、发布匹配状态和自动保存钩子；销毁职责属于注入作用域。
 */
@Injectable()
export class WorkflowCommandBus {
  private readonly undoStack: EditorSnapshot[] = [];
  private readonly redoStack: EditorSnapshot[] = [];
  private dirtyHook?: () => void;
  constructor(private readonly store: WorkflowEditorStore) {}
  onDirty(hook: () => void): void { this.dirtyHook = hook; }
  private snapshot(): EditorSnapshot { return { nodes: structuredClone(this.store.nodes()), edges: structuredClone(this.store.edges()), outputs: structuredClone(this.store.outputs()), bindings: structuredClone(Object.fromEntries(this.store.bindings())), bindingSelections: structuredClone(Object.fromEntries(this.store.bindingSelections())), invalidParameterNodes: [...this.store.invalidParameterNodes()] }; }
  private commit(mutator: () => void): void { this.undoStack.push(this.snapshot()); this.redoStack.length = 0; mutator(); this.recordHistory(); this.store.autosaveState.set('dirty'); this.store.resetTransientValidation(); this.store.draftMatchesPublished.set(false); this.dirtyHook?.(); }
  hydrate(snapshot: EditorSnapshot, options: { recordHistory?: boolean } = {}): void { if (options.recordHistory) this.commit(() => this.restore(snapshot, true)); else this.restore(snapshot, false); }
  addNode(definition: Definition, node?: Partial<EditorNode>): EditorNode { const created: EditorNode = { id: node?.id ?? crypto.randomUUID(), node_code: definition.node_code, node_version: node?.node_version ?? definition.version, parameters: { ...(definition.default_params ?? {}), ...(node?.parameters ?? {}) }, x: node?.x ?? 80, y: node?.y ?? 80, collapsed: node?.collapsed ?? false, definition }; this.commit(() => this.store.nodes.update((items) => [...items, created])); this.store.selectedId.set(created.id); return created; }
  removeNode(id: string): void { this.commit(() => { this.store.nodes.update((items) => items.filter((n) => n.id !== id)); this.store.edges.update((items) => items.filter((e) => e.source.node_id !== id && e.target.node_id !== id)); this.store.outputs.update((items) => items.filter((o) => o.node_id !== id)); this.store.bindings.update((items) => { const next = new Map(items); next.delete(id); return next; }); this.store.bindingSelections.update((items) => { const next = new Map(items); next.delete(id); return next; }); }); if (this.store.selectedId() === id) this.store.selectedId.set(null); }
  moveNode(id: string, x: number, y: number): void { this.commit(() => this.store.nodes.update((items) => items.map((n) => n.id === id ? { ...n, x, y } : n))); }
  connect(edge: Edge): boolean { if (edge.source.node_id === edge.target.node_id || this.store.edges().some((e) => JSON.stringify(e) === JSON.stringify(edge))) return false; this.commit(() => this.store.edges.update((items) => [...items, structuredClone(edge)])); return true; }
  replaceConnection(previous: Edge, next: Edge): void { this.commit(() => this.store.edges.update((items) => items.map((e) => JSON.stringify(e) === JSON.stringify(previous) ? structuredClone(next) : e))); }
  deleteConnection(edge: Edge): void { this.commit(() => this.store.edges.update((items) => items.filter((e) => JSON.stringify(e) !== JSON.stringify(edge)))); }
  setParameter(id: string, key: string, value: unknown): void { this.setParameters(id, { ...(this.store.nodes().find((n) => n.id === id)?.parameters ?? {}), [key]: value }); }
  setParameters(id: string, parameters: Record<string, unknown>): void { if (JSON.stringify(this.store.nodes().find((n) => n.id === id)?.parameters) === JSON.stringify(parameters)) return; this.commit(() => this.store.nodes.update((items) => items.map((n) => n.id === id ? { ...n, parameters: { ...parameters } } : n))); }
  setParameterValidity(id: string, valid: boolean): void { const next = new Set(this.store.invalidParameterNodes()); if (valid) next.delete(id); else next.add(id); this.store.setInvalidParameterNodes(next); }
  toggleOutput(nodeId: string, port: string): void { this.commit(() => this.store.outputs.update((items) => items.some((o) => o.node_id === nodeId && o.port === port) ? items.filter((o) => !(o.node_id === nodeId && o.port === port)) : [...items, { node_id: nodeId, port }])); }
  setBinding(nodeId: string, binding: StoredBinding | null, selection: DataAssetSelection | null): void { this.commit(() => { this.store.bindings.update((items) => { const next = new Map(items); if (binding) next.set(nodeId, binding); else next.delete(nodeId); return next; }); this.store.bindingSelections.update((items) => { const next = new Map(items); if (selection) next.set(nodeId, selection); else next.delete(nodeId); return next; }); this.store.setBindingRevision(); }); }
  undo(): void { const previous = this.undoStack.pop(); if (!previous) return; this.redoStack.push(this.snapshot()); this.restore(previous, true); this.store.historyIndex.update((index) => Math.max(0, index - 1)); }
  redo(): void { const next = this.redoStack.pop(); if (!next) return; this.undoStack.push(this.snapshot()); this.restore(next, true); this.store.historyIndex.update((index) => index + 1); }
  private recordHistory(): void { const snapshot: Graph = { contract_version: '1.0', nodes: this.store.nodes().map((node) => ({ id: node.id, node_code: node.node_code, node_version: node.node_version, parameters: node.parameters, ui: { position: { x: node.x, y: node.y }, collapsed: node.collapsed } })), edges: this.store.edges(), outputs: this.store.outputs(), bindings: Object.fromEntries(this.store.bindings()) }; const history = this.store.history().slice(0, this.store.historyIndex() + 1); history.push(snapshot); this.store.setHistory(history.slice(-50), Math.min(history.length - 1, 49)); }
  private restore(value: EditorSnapshot, dirty: boolean): void { this.store.setNodes(value.nodes); this.store.setEdges(value.edges); this.store.setOutputs(value.outputs); this.store.setBindings(new Map(Object.entries(value.bindings))); this.store.setBindingSelections(new Map(Object.entries(value.bindingSelections))); this.store.setInvalidParameterNodes(new Set(value.invalidParameterNodes)); if (dirty) { this.store.autosaveState.set('dirty'); this.store.resetTransientValidation(); this.dirtyHook?.(); } }
}
export interface EditorSnapshot { nodes: EditorNode[]; edges: Edge[]; outputs: Array<{ node_id: string; port: string }>; bindings: Record<string, StoredBinding>; bindingSelections: Record<string, DataAssetSelection>; invalidParameterNodes: string[]; }
