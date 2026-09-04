import { Injectable, Type } from '@angular/core';

import { DataFileInputNodeComponent } from './data-file-input-node.component';

/**
 * 节点视觉扩展的唯一注册点。工作流领域状态仍由 Store/CommandBus 拥有，
 * 注册表只把后端声明的 renderer component 映射为 Angular 组件，不访问 HTTP。
 */
@Injectable({ providedIn: 'root' })
export class NodeRendererRegistry {
  private readonly renderers = new Map<string, Type<unknown>>([
    ['data-file-input', DataFileInputNodeComponent],
  ]);

  register(key: string, component: Type<unknown>): void {
    if (key.trim()) this.renderers.set(key.trim(), component);
  }

  resolve(key: string | null | undefined): Type<unknown> | null {
    return key ? (this.renderers.get(key) ?? null) : null;
  }
}
