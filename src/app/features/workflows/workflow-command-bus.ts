import { Injectable } from '@angular/core';
import { Definition, Edge, EditorNode } from './workflow-editor.models';
import { WorkflowEditorStore } from './workflow-editor-store';

/**
 * 架构边界：上游是目录、画布和属性面板，下游只有 WorkflowEditorStore。
 * 所有图修改（含撤销/重做）唯一经过此总线；不访问 HTTP、DOM、Rete 或 Dockview，也不负责销毁。
 */
@Injectable()
export class WorkflowCommandBus {
  private readonly undoStack: Array<{ nodes: EditorNode[]; edges: Edge[]; outputs: Array<{ node_id: string; port: string }> }> = [];
  private readonly redoStack: Array<{ nodes: EditorNode[]; edges: Edge[]; outputs: Array<{ node_id: string; port: string }> }> = [];

  constructor(private readonly store: WorkflowEditorStore) {}

  private snapshot() { return { nodes: structuredClone(this.store.nodes()), edges: structuredClone(this.store.edges()), outputs: structuredClone(this.store.outputs()) }; }
  private commit(mutator: () => void): void {
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
    mutator();
    this.store.autosaveState.set('dirty');
  }
  addNode(definition: Definition, node?: Partial<EditorNode>): EditorNode {
    const created: EditorNode = {
      id: node?.id ?? `${definition.node_code}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      node_code: definition.node_code, node_version: node?.node_version ?? definition.version,
      parameters: { ...(definition.default_params ?? {}), ...(node?.parameters ?? {}) },
      x: node?.x ?? 80, y: node?.y ?? 80, collapsed: node?.collapsed ?? false, definition,
    };
    this.commit(() => this.store.nodes.update((items) => [...items, created]));
    this.store.selectedId.set(created.id);
    return created;
  }
  removeNode(id: string): void {
    this.commit(() => {
      this.store.nodes.update((items) => items.filter((n) => n.id !== id));
      this.store.edges.update((items) => items.filter((e) => e.source.node_id !== id && e.target.node_id !== id));
      this.store.outputs.update((items) => items.filter((o) => o.node_id !== id));
    });
    if (this.store.selectedId() === id) this.store.selectedId.set(this.store.nodes()[0]?.id ?? null);
  }
  moveNode(id: string, x: number, y: number): void { this.commit(() => this.store.nodes.update((items) => items.map((n) => n.id === id ? { ...n, x, y } : n))); }
  connect(edge: Edge): boolean {
    if (edge.source.node_id === edge.target.node_id || this.store.edges().some((e) => JSON.stringify(e) === JSON.stringify(edge))) return false;
    this.commit(() => this.store.edges.update((items) => [...items, structuredClone(edge)])); return true;
  }
  replaceConnection(previous: Edge, next: Edge): void { this.commit(() => this.store.edges.update((items) => items.map((e) => JSON.stringify(e) === JSON.stringify(previous) ? structuredClone(next) : e))); }
  deleteConnection(edge: Edge): void { this.commit(() => this.store.edges.update((items) => items.filter((e) => JSON.stringify(e) !== JSON.stringify(edge)))); }
  setParameter(id: string, key: string, value: unknown): void { this.setParameters(id, { [key]: value }); }
  setParameters(id: string, parameters: Record<string, unknown>): void { this.commit(() => this.store.nodes.update((items) => items.map((n) => n.id === id ? { ...n, parameters: { ...n.parameters, ...parameters } } : n))); }
  setParameterValidity(id: string, valid: boolean): void {
    const next = new Set(this.store.invalidParameterNodes()); if (valid) next.delete(id); else next.add(id); this.store.setInvalidParameterNodes(next);
  }
  toggleOutput(nodeId: string, port: string): void { this.commit(() => this.store.outputs.update((items) => items.some((o) => o.node_id === nodeId && o.port === port) ? items.filter((o) => !(o.node_id === nodeId && o.port === port)) : [...items, { node_id: nodeId, port }])); }
  undo(): void { const previous = this.undoStack.pop(); if (!previous) return; this.redoStack.push(this.snapshot()); this.restore(previous); }
  redo(): void { const next = this.redoStack.pop(); if (!next) return; this.undoStack.push(this.snapshot()); this.restore(next); }
  private restore(value: { nodes: EditorNode[]; edges: Edge[]; outputs: Array<{ node_id: string; port: string }> }): void { this.store.setNodes(value.nodes); this.store.setEdges(value.edges); this.store.setOutputs(value.outputs); this.store.autosaveState.set('dirty'); }
}

