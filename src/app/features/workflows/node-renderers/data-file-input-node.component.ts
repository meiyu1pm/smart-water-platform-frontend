import { Component, Input } from '@angular/core';

/**
 * 数据文件输入节点的纯展示组件。数据由 Rete 适配器注入；此组件不调用 API，
 * 不修改 Graph，完整文件预览和 DataView 创建由属性面板完成。
 */
@Component({
  selector: 'app-data-file-input-node',
  standalone: true,
  template: `
    <article class="data-file-node" aria-label="数据文件输入">
      <header>{{ display('label') || '数据文件' }}</header>
      <p class="file-name">{{ display('fileName') || display('file_name') || '尚未选择文件' }}</p>
      @if (display('version') || display('outputMode') || display('output_mode')) {
        <p class="meta">
          {{ display('version') }}
          @if (display('outputMode') || display('output_mode')) {
            · {{ display('outputMode') || display('output_mode') }}
          }
        </p>
      }
      @if (display('columnSummary') || display('column_summary')) {
        <p class="columns">{{ display('columnSummary') || display('column_summary') }}</p>
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
      min-width: 180px;
    }
    .data-file-node {
      padding: 10px 12px;
      border-radius: 8px;
      background: #eff6ff;
      color: #0f172a;
    }
    header {
      font-weight: 700;
      font-size: 13px;
    }
    p {
      margin: 5px 0 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-name {
      color: #1e3a8a;
      font-size: 12px;
    }
    .meta,
    .columns {
      color: #475569;
      font-size: 10px;
    }
  `,
})
export class DataFileInputNodeComponent {
  @Input() data: Record<string, unknown> = {};

  display(key: string): string {
    const nested = this.data?.['data'];
    const value =
      this.data?.[key] ??
      (nested && typeof nested === 'object' ? (nested as Record<string, unknown>)[key] : undefined);
    return value === null || value === undefined ? '' : String(value);
  }
}
