import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';

import { AssetSelection, FengtaiNetworkLayer, FengtaiTopology } from './fengtai-leakage.models';
import {
  LeakageCameraMode,
  LeakageNetwork3dScene,
  LeakageSceneAsset,
} from './leakage-network-3d.scene';

/**
 * 架构位置：漏损闭环工作台的三维管网 Angular 适配层。
 * 上游：闭环页面提供拓扑、时间帧图层与全局资产选择。
 * 下游：LeakageNetwork3dScene，并向页面发出资产和相机状态事件。
 * 状态：只拥有搜索、悬停及视角 UI 状态；GPU 状态由 Scene 内核拥有。
 * 不负责：API、阶段推进、资产详情和图层解锁规则。
 * 不变量：无自动旋转；Canvas 始终有 DOM 搜索作为键盘替代入口。
 */
@Component({
  selector: 'app-leakage-network-3d',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="network-shell" aria-label="全管网三维态势">
      <div class="scene-toolbar" aria-label="管网视角工具栏">
        <div class="scene-summary" aria-live="polite">
          <strong>全管网态势</strong>
          <span>{{ nodeCount }} 个点位 · {{ pipeCount }} 条可连接管段</span>
        </div>
        <div class="view-actions" role="group" aria-label="切换管网视角">
          <button
            type="button"
            [class.is-active]="cameraMode === 'perspective'"
            [attr.aria-pressed]="cameraMode === 'perspective'"
            (click)="setCameraMode('perspective')"
          >
            透视
          </button>
          <button
            type="button"
            [class.is-active]="cameraMode === 'top'"
            [attr.aria-pressed]="cameraMode === 'top'"
            (click)="setCameraMode('top')"
          >
            俯视
          </button>
          <button type="button" (click)="resetCamera()">最佳视角</button>
        </div>
      </div>

      <div class="scene-stage">
        <div #canvasHost class="canvas-host"></div>

        @if (hoveredAsset) {
          <div
            class="asset-tooltip"
            [style.left.px]="tooltipX"
            [style.top.px]="tooltipY"
            role="status"
          >
            <strong>{{ hoveredAsset.name }}</strong>
            <span
              >{{ assetTypeLabel(hoveredAsset.type) }} · {{ activeValueLabel(hoveredAsset) }}</span
            >
          </div>
        }

        @if (!nodeCount) {
          <div class="empty-state" role="status">
            <strong>等待管网拓扑</strong>
            <span>导入并解析数据后，将在这里生成三维管网。</span>
          </div>
        }

        <aside class="asset-finder" aria-label="资产查找与键盘替代操作">
          <label for="network-asset-search">查找节点或管段</label>
          <div class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5"></circle>
              <path d="m16 16 4 4"></path>
            </svg>
            <input
              id="network-asset-search"
              type="search"
              autocomplete="off"
              placeholder="输入名称或编号"
              [value]="searchQuery"
              (input)="updateSearch($event)"
              (keydown.enter)="selectFirstSearchResult()"
            />
          </div>
          @if (searchQuery) {
            <div class="search-results" aria-label="资产搜索结果">
              @for (asset of searchResults; track asset.id + asset.kind) {
                <button
                  type="button"
                  [class.is-selected]="selectedAsset?.id === asset.id"
                  [attr.aria-pressed]="selectedAsset?.id === asset.id"
                  (click)="selectFromList(asset)"
                >
                  <span>{{ asset.name }}</span>
                  <small>{{ assetTypeLabel(asset.type) }}</small>
                </button>
              } @empty {
                <p>没有匹配的资产</p>
              }
            </div>
          }
          <p class="interaction-hint">鼠标拖动旋转，滚轮缩放。键盘用户可通过上方搜索选择资产。</p>
        </aside>

        <div class="scene-legend" aria-label="管网图例">
          <span><i class="legend-dot node"></i>节点</span>
          <span><i class="legend-dot valve"></i>阀门</span>
          <span><i class="legend-line"></i>管段</span>
          @if (activeLayer) {
            <span class="active-layer">{{ activeLayer.name }} · {{ activeLayer.unit }}</span>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './leakage-network-3d.component.scss',
})
export class LeakageNetwork3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() topology: FengtaiTopology | undefined;
  @Input() activeLayer: FengtaiNetworkLayer | null = null;
  @Input() activeFrameValues: Record<string, number | null> = {};
  @Input() selectedAsset: AssetSelection | null = null;
  @Input() lockedLayerCodes: string[] = [];
  @Output() readonly assetSelected = new EventEmitter<AssetSelection>();
  @Output() readonly assetSelectionCleared = new EventEmitter<void>();
  @Output() readonly cameraModeChange = new EventEmitter<LeakageCameraMode>();
  @ViewChild('canvasHost') private canvasHost?: ElementRef<HTMLDivElement>;

  protected cameraMode: LeakageCameraMode = 'perspective';
  protected nodeCount = 0;
  protected pipeCount = 0;
  protected searchQuery = '';
  protected searchResults: LeakageSceneAsset[] = [];
  protected hoveredAsset: LeakageSceneAsset | null = null;
  protected tooltipX = 0;
  protected tooltipY = 0;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private scene: LeakageNetwork3dScene | null = null;

  ngAfterViewInit(): void {
    const host = this.canvasHost?.nativeElement;
    if (!host) return;
    this.zone.runOutsideAngular(() => {
      this.scene = new LeakageNetwork3dScene(host, {
        hover: (asset, x, y) => this.zone.run(() => this.showHover(asset, x, y)),
        select: (asset) => this.zone.run(() => this.emitSelection(asset)),
        clearSelection: () => this.zone.run(() => this.assetSelectionCleared.emit()),
      });
    });
    this.syncScene(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.scene) return;
    if (changes['topology']) this.syncScene(true);
    if (changes['activeLayer'] || changes['activeFrameValues'] || changes['lockedLayerCodes']) {
      this.scene.setLayer(this.activeLayer, this.activeFrameValues, this.lockedLayerCodes);
    }
    if (changes['selectedAsset']) this.scene.setSelection(this.selectedAsset);
  }

  ngOnDestroy(): void {
    this.scene?.dispose();
    this.scene = null;
  }

  protected setCameraMode(mode: LeakageCameraMode): void {
    this.cameraMode = mode;
    this.scene?.setCameraMode(mode);
    this.cameraModeChange.emit(mode);
    this.cdr.markForCheck();
  }

  protected resetCamera(): void {
    this.scene?.resetCamera(this.cameraMode);
  }

  protected updateSearch(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.searchResults = this.scene?.search(this.searchQuery) ?? [];
  }

  protected selectFirstSearchResult(): void {
    const first = this.searchResults[0];
    if (first) this.selectFromList(first);
  }

  protected selectFromList(asset: LeakageSceneAsset): void {
    this.emitSelection(asset);
    this.scene?.focus(asset);
  }

  protected assetTypeLabel(type: AssetSelection['type']): string {
    return (
      {
        node: '节点',
        pipe: '管段',
        valve: '阀门',
        hydrant: '消火栓',
        meter: '水表',
      } as Record<AssetSelection['type'], string>
    )[type];
  }

  protected activeValueLabel(asset: LeakageSceneAsset): string {
    if (!this.activeLayer || !this.layerAppliesTo(asset)) return '基础拓扑';
    const value = this.activeFrameValues[asset.id];
    return value === null || value === undefined
      ? `${this.activeLayer.name}：无数据`
      : `${this.activeLayer.name}：${this.formatValue(value)} ${this.activeLayer.unit}`;
  }

  private syncScene(topologyChanged: boolean): void {
    if (!this.scene) return;
    if (topologyChanged) {
      this.scene.setTopology(this.topology);
      this.nodeCount = this.scene.counts.nodes;
      this.pipeCount = this.scene.counts.pipes;
      this.searchResults = this.scene.search(this.searchQuery);
    }
    this.scene.setLayer(this.activeLayer, this.activeFrameValues, this.lockedLayerCodes);
    this.scene.setSelection(this.selectedAsset);
    this.cdr.markForCheck();
  }

  private showHover(asset: LeakageSceneAsset | null, x: number, y: number): void {
    this.hoveredAsset = asset;
    this.tooltipX = x;
    this.tooltipY = y;
    this.cdr.markForCheck();
  }

  private emitSelection(asset: LeakageSceneAsset): void {
    this.assetSelected.emit({ type: asset.type, id: asset.id, name: asset.name });
  }

  private layerAppliesTo(asset: LeakageSceneAsset): boolean {
    if (!this.activeLayer) return false;
    if (this.activeLayer.asset_type === 'pipe') return asset.kind === 'pipe';
    if (this.activeLayer.asset_type === 'valve') return asset.type === 'valve';
    return asset.kind === 'node';
  }

  private formatValue(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
}
