import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as echarts from 'echarts';

import { DatasetLineageTree, DatasetLineageTreeNode } from '../../core/models/api.models';

export interface LineageChartNode {
  name: string;
  versionId?: number;
  isVirtualRoot?: boolean;
  versionCode?: string;
  operationName?: string;
  versionKind?: string;
  recordCount?: number;
  quality?: DatasetLineageTreeNode['quality'];
  isCurrent?: boolean;
  isSelected?: boolean;
  children?: LineageChartNode[];
  warning?: boolean;
  itemStyle?: Record<string, unknown>;
  label?: Record<string, unknown>;
}

/** Converts the API's flat forest into the nested shape required by ECharts with rich card styling. */
export function buildLineageTree(
  tree: DatasetLineageTree,
  selectedVersionId: number | null = null,
): LineageChartNode | null {
  const nodes = new Map(tree.nodes.map((node) => [node.version_id, node]));
  const children = new Map<number, number[]>();
  const childIds = new Set<number>();
  let hasWarning = false;

  for (const edge of tree.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) {
      hasWarning = true;
      continue;
    }
    const siblings = children.get(edge.from) ?? [];
    siblings.push(edge.to);
    children.set(edge.from, siblings);
    childIds.add(edge.to);
  }

  const roots = tree.roots.filter((id) => nodes.has(id));
  for (const id of nodes.keys()) {
    if (!childIds.has(id) && !roots.includes(id)) roots.push(id);
  }
  if (!roots.length && nodes.size) {
    hasWarning = true;
    roots.push(...nodes.keys());
  }

  const build = (id: number, path: Set<number>): LineageChartNode => {
    const source = nodes.get(id) as DatasetLineageTreeNode;
    const cycle = path.has(id);
    if (cycle) hasWarning = true;
    const nextPath = new Set(path);
    nextPath.add(id);

    const isCurrent = source.version_id === tree.current_version_id;
    const isSelected = selectedVersionId != null && source.version_id === selectedVersionId;
    const empty = source.record_count === 0;
    const isDerived = source.version_kind === 'derived';
    const shortCode = source.version_code ? source.version_code.slice(0, 8) : `v${source.version_id}`;
    const opName = source.operation_name || (isDerived ? '治理版本' : '初始导入');

    const tone = source.is_synthetic ? '#7c3aed' : isDerived ? '#059669' : '#0284c7';

    return {
      name: `${opName}\n${shortCode}`,
      versionId: source.version_id,
      versionCode: source.version_code,
      operationName: opName,
      versionKind: source.version_kind,
      recordCount: source.record_count,
      quality: source.quality,
      isCurrent,
      isSelected,
      warning: cycle || empty,
      itemStyle: {
        color: empty
          ? '#fffbeb'
          : isSelected
            ? '#f0f7ff'
            : isCurrent
              ? '#f0fdf4'
              : '#ffffff',
        borderColor: empty
          ? '#f59e0b'
          : isSelected
            ? '#0f5f92'
            : isCurrent
              ? '#16a34a'
              : tone,
        borderWidth: isSelected ? 3.5 : isCurrent ? 3 : 1.5,
        shadowBlur: isSelected ? 14 : isCurrent ? 10 : 4,
        shadowColor: isSelected
          ? 'rgba(15, 95, 146, 0.35)'
          : isCurrent
            ? 'rgba(22, 163, 74, 0.25)'
            : 'rgba(15, 23, 42, 0.08)',
        borderRadius: 8,
      },
      label: {
        color: empty ? '#92400e' : '#0f172a',
        fontSize: 12,
        lineHeight: 18,
        align: 'center',
      },
      children: cycle ? [] : (children.get(id) ?? []).map((child) => build(child, nextPath)),
    };
  };

  const builtRoots = roots.map((id) => build(id, new Set<number>()));
  if (builtRoots.length === 1 && !hasWarning) return builtRoots[0];
  return {
    name: '数据资产',
    isVirtualRoot: true,
    itemStyle: {
      color: '#f8fafc',
      borderColor: '#2563eb',
      borderWidth: 2,
      borderRadius: 8,
      shadowBlur: 6,
      shadowColor: 'rgba(37, 99, 235, 0.15)',
    },
    label: {
      color: '#0f4c81',
      align: 'center',
      padding: [8, 14, 8, 14],
      lineHeight: 18,
    },
    children: builtRoots,
  };
}

@Component({
  selector: 'app-dataset-lineage-tree',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="tree-container">
      <div class="tree-toolbar">
        <div class="legend-group">
          <span class="legend-item"><span class="dot imported"></span>原始导入</span>
          <span class="legend-item"><span class="dot derived"></span>治理生成</span>
          <span class="legend-item"><span class="dot current"></span>当前使用</span>
          <span class="legend-item"><span class="dot selected"></span>当前选中</span>
        </div>
        <div class="action-group">
          <button
            mat-icon-button
            type="button"
            matTooltip="放大"
            (click)="zoomIn()"
            aria-label="放大"
          >
            <span class="ctrl-icon">+</span>
          </button>
          <button
            mat-icon-button
            type="button"
            matTooltip="缩小"
            (click)="zoomOut()"
            aria-label="缩小"
          >
            <span class="ctrl-icon">-</span>
          </button>
          <button
            mat-icon-button
            type="button"
            matTooltip="重置视角"
            (click)="resetView()"
            aria-label="重置视角"
          >
            <span class="ctrl-icon">⟲</span>
          </button>
        </div>
      </div>
      <div class="lineage-host" #host role="img" aria-label="数据版本血缘树"></div>
      @if (!tree?.nodes?.length) {
        <div class="empty-overlay">
          <p>暂无可展示的数据版本演进记录。</p>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      width: 100%;
    }
    .tree-container {
      position: relative;
      background: #fafbfd;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }
    .tree-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #ffffff;
      border-bottom: 1px solid #edf2f7;
    }
    .legend-group {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
      color: #64748b;
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .dot.imported {
      background: #0284c7;
    }
    .dot.derived {
      background: #059669;
    }
    .dot.current {
      background: #16a34a;
      box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.3);
    }
    .dot.selected {
      background: #0f5f92;
      box-shadow: 0 0 0 2px rgba(15, 95, 146, 0.35);
    }
    .action-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .ctrl-icon {
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      color: #475569;
    }
    .lineage-host {
      width: 100%;
      height: 480px;
      min-height: 380px;
    }
    .empty-overlay {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.85);
    }
  `,
})
export class DatasetLineageTreeComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() tree: DatasetLineageTree | null = null;
  @Input() selectedVersionId: number | null = null;
  @Output() versionSelected = new EventEmitter<number>();
  @ViewChild('host') private host?: ElementRef<HTMLDivElement>;

  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    if (!this.host) return;
    this.chart = echarts.init(this.host.nativeElement);
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.host.nativeElement);
    this.chart.on('click', (params) => {
      const versionId = (params.data as LineageChartNode | undefined)?.versionId;
      if (typeof versionId === 'number') this.versionSelected.emit(versionId);
    });
    this.render();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  zoomIn(): void {
    if (!this.chart) return;
    this.chart.dispatchAction({
      type: 'dataZoom',
      batch: [{ start: 20, end: 80 }],
    });
  }

  zoomOut(): void {
    if (!this.chart) return;
    this.chart.dispatchAction({
      type: 'dataZoom',
      batch: [{ start: 0, end: 100 }],
    });
  }

  resetView(): void {
    this.render();
  }

  private render(): void {
    if (!this.chart || !this.tree?.nodes?.length) {
      this.chart?.clear();
      return;
    }
    const root = buildLineageTree(this.tree, this.selectedVersionId);
    if (!root) return;
    this.chart.setOption(
      {
        animationDuration: 280,
        tooltip: {
          trigger: 'item',
          triggerOn: 'mousemove',
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          padding: [10, 14],
          textStyle: { color: '#0f172a', fontSize: 12 },
          extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border-radius: 8px;',
          formatter: (params: { data?: LineageChartNode }) => {
            const nodeData = params.data;
            if (!nodeData || !nodeData.versionId) return '<b>数据资产根源</b>';
            const nodeMeta = this.tree?.nodes.find((n) => n.version_id === nodeData.versionId);
            if (!nodeMeta) return '';
            const isCur = nodeMeta.version_id === this.tree?.current_version_id;
            const qScore = nodeMeta.quality ? `${nodeMeta.quality.grade} (${nodeMeta.quality.score.toFixed(1)}分)` : '尚未评估';
            return `
              <div style="font-weight: 700; font-size: 13px; margin-bottom: 6px; color: #0f172a;">
                ${nodeMeta.operation_name} ${isCur ? '<span style="background: #2563eb; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 3px; margin-left: 4px;">当前版本</span>' : ''}
              </div>
              <div style="color: #475569; font-size: 11px; line-height: 1.6;">
                <div>• 版本代码: <b>${nodeMeta.version_code}</b></div>
                <div>• 数据规模: <b>${(nodeMeta.record_count || 0).toLocaleString()} 条</b></div>
                <div>• 质量评估: <b>${qScore}</b></div>
                <div>• 创建时间: <b>${nodeMeta.created_at || '—'}</b></div>
                ${nodeMeta.version_note ? `<div>• 版本说明: <i>${nodeMeta.version_note}</i></div>` : ''}
              </div>
              <div style="margin-top: 6px; font-size: 10px; color: #0284c7; font-weight: 600;">点击节点切换查看此版本详情</div>
            `;
          },
        },
        series: [
          {
            type: 'tree',
            data: [root],
            left: 70,
            right: 190,
            top: 24,
            bottom: 24,
            orient: 'LR',
            layout: 'orthogonal',
            roam: true,
            expandAndCollapse: false,
            initialTreeDepth: -1,
            symbol: 'roundRect',
            symbolSize: [192, 74],
            edgeShape: 'curve',
            edgeForkPosition: '50%',
            lineStyle: { color: '#94a3b8', width: 2, curveness: 0.45 },
            label: {
              position: 'inside',
              align: 'center',
              verticalAlign: 'middle',
              formatter: (params: { data?: LineageChartNode }) => {
                const node = params.data;
                if (!node) return '';
                if (node.isVirtualRoot) {
                  return '{rootTitle| 📊 原始数据接入源 }\n{meta|包含多个初始导入分支}';
                }
                const isDerived = node.versionKind === 'derived';
                const tag = isDerived
                  ? (node.isCurrent ? '{tagDerived|★ 治理}' : '{tagDerived|治理}')
                  : (node.isCurrent ? '{tagImported|★ 原始}' : '{tagImported|原始}');
                const opName = (node.operationName || (isDerived ? '治理版本' : '初始导入')).slice(0, 6);
                const headerLine = `${tag} {title|${opName}}`;

                const shortCode = node.versionCode
                  ? node.versionCode.slice(0, 8)
                  : node.versionId
                    ? `v${node.versionId}`
                    : '';
                const count = node.recordCount || 0;
                const countStr = count >= 10000 ? `${(count / 10000).toFixed(1)}w` : count.toLocaleString();
                const metaLine = `{meta|${shortCode} · ${countStr}条}`;

                let qualitySnippet = '{gradeNone|质量: 未评估}';
                if (node.quality) {
                  const g = node.quality.grade || 'A';
                  const s = node.quality.score != null ? node.quality.score.toFixed(1) : '-';
                  if (g === 'A') qualitySnippet = `{gradeA|质量 A · ${s}分}`;
                  else if (g === 'B') qualitySnippet = `{gradeB|质量 B · ${s}分}`;
                  else if (g === 'C') qualitySnippet = `{gradeC|质量 C · ${s}分}`;
                  else qualitySnippet = `{gradeD|质量 ${g} · ${s}分}`;
                }

                return `${headerLine}\n${metaLine}\n${qualitySnippet}`;
              },
              rich: {
                title: {
                  fontSize: 12,
                  fontWeight: 'bold',
                  color: '#0f172a',
                  lineHeight: 18,
                },
                rootTitle: {
                  fontSize: 13,
                  fontWeight: 'bold',
                  color: '#0f4c81',
                  lineHeight: 20,
                },
                curBadge: {
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  fontSize: 9,
                  fontWeight: 'bold',
                  padding: [1, 4],
                  borderRadius: 3,
                },
                tagImported: {
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  fontSize: 9,
                  fontWeight: '600',
                  padding: [1, 4],
                  borderRadius: 3,
                },
                tagDerived: {
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  fontSize: 9,
                  fontWeight: '600',
                  padding: [1, 4],
                  borderRadius: 3,
                },
                meta: {
                  fontSize: 10,
                  color: '#64748b',
                  lineHeight: 15,
                },
                gradeA: {
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  fontWeight: 'bold',
                  fontSize: 9,
                  padding: [1, 6],
                  borderRadius: 3,
                },
                gradeB: {
                  backgroundColor: '#e0f2fe',
                  color: '#0284c7',
                  fontWeight: 'bold',
                  fontSize: 9,
                  padding: [1, 6],
                  borderRadius: 3,
                },
                gradeC: {
                  backgroundColor: '#fef3c7',
                  color: '#d97706',
                  fontWeight: 'bold',
                  fontSize: 9,
                  padding: [1, 6],
                  borderRadius: 3,
                },
                gradeD: {
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  fontWeight: 'bold',
                  fontSize: 9,
                  padding: [1, 6],
                  borderRadius: 3,
                },
                gradeNone: {
                  backgroundColor: '#f1f5f9',
                  color: '#94a3b8',
                  fontSize: 9,
                  padding: [1, 5],
                  borderRadius: 3,
                },
              },
            },
            leaves: {
              label: {
                position: 'inside',
                align: 'center',
                verticalAlign: 'middle',
              },
            },
            emphasis: {
              focus: 'descendant',
              itemStyle: {
                shadowBlur: 16,
                shadowColor: 'rgba(15, 95, 146, 0.4)',
              },
            },
          },
        ],
      },
      { notMerge: true },
    );
  }
}

