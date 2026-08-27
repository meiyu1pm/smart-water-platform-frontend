import { Component, Input } from '@angular/core';
import { NodeComponent } from 'rete-angular-plugin/21';

/**
 * 数据文件输入节点的视觉增强层。数据由 Rete 适配器注入；此组件不调用 API，
 * 不修改 Graph，完整文件预览和 DataView 创建由属性面板完成。
 *
 * 这里复用 Rete 的 Classic NodeComponent，而不是绘制一个没有端口的装饰卡片。
 * AngularPlugin 的 node 自定义渲染会替换默认节点，因此必须继续把 data、emit 和
 * rendered 传给 Classic NodeComponent，保证输入输出 socket 仍由 Rete 管理并可连线。
 */
@Component({
  selector: 'app-data-file-input-node',
  standalone: true,
  imports: [NodeComponent],
  template: `
    <div class="data-file-node" aria-label="数据文件输入">
      <ng-component [data]="data" [emit]="emit" [rendered]="rendered" />
      <footer class="file-metadata">
        <span class="file-name">{{ display('fileName') || display('file_name') || '尚未选择文件' }}</span>
      @if (display('version') || display('outputMode') || display('output_mode')) {
        <span class="meta">
          {{ display('version') }}
          @if (display('outputMode') || display('output_mode')) {
            · {{ display('outputMode') || display('output_mode') }}
          }
        </span>
      }
      @if (display('columnSummary') || display('column_summary')) {
        <span class="columns">{{ display('columnSummary') || display('column_summary') }}</span>
      }
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 180px;
    }
    .data-file-node {
      min-width: 180px;
      color: #0f172a;
    }
    ng-component {
      display: block;
    }
    .file-metadata {
      display: grid;
      gap: 3px;
      margin: -4px 9px 8px;
      padding: 5px 7px;
      border-radius: 0 0 6px 6px;
      background: #eff6ff;
      font-size: 10px;
      line-height: 1.25;
      pointer-events: none;
    }
    .file-metadata span {
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
    }
  `,
})
export class DataFileInputNodeComponent {
  @Input() data: any = {};
  @Input() emit: (data: unknown) => void = () => undefined;
  @Input() rendered: () => void = () => undefined;

  display(key: string): string {
    const nested = this.data?.['data'];
    const value =
      this.data?.[key] ??
      (nested && typeof nested === 'object' ? (nested as Record<string, unknown>)[key] : undefined);
    return value === null || value === undefined ? '' : String(value);
  }
}
