import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

import {
  ModelVersionSummary,
  OperatorSummary,
  OperatorVersionSummary,
  WorkflowTemplateSummary,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AlgorithmDocumentRendererService } from '../../core/services/algorithm-document-renderer.service';
import { NotificationService } from '../../core/services/notification.service';
import { OperatorNameService } from '../../core/services/operator-name.service';
import {
  StaticOperatorDocument,
  StaticOperatorDocumentService,
} from '../../core/services/operator-document.service';
import { AuthService } from '../../core/services/auth.service';
import { SwIconComponent } from '../../shared/components/sw-icon.component';
import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';
import { OperatorParameterFormComponent } from '../../shared/components/operator-parameter-form.component';
import { DataAssetSelection } from '../../core/models/api.models';

export function linkedAlgorithmCode(operator: OperatorSummary): string | null {
  const value = operator.active_version?.algorithm?.['code'];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function operatorDocumentScopeKey(operator: OperatorSummary | null): string | null {
  if (!operator) {
    return null;
  }
  const linkedCode = operator.active_version?.algorithm?.['code'];
  if (typeof linkedCode === 'string' && linkedCode.trim()) {
    return linkedCode.trim();
  }
  const operatorCode = operator.code;
  return typeof operatorCode === 'string' && operatorCode.trim() ? operatorCode.trim() : null;
}

interface OperatorFacetOption {
  code: string;
  name: string;
  description?: string | null;
}

interface OperatorFacetResponse {
  facets: Record<string, OperatorFacetOption[]>;
  permissions: string[];
}

interface AlgorithmReleaseSummary {
  release_id: string;
  algorithm_version_id: number;
  version: string;
  status: string;
  default_model_version_id: string | null;
}

const catalogWidthDefault = 380;
const catalogWidthMin = 320;
const catalogWidthRatioMax = 0.45;

export function clampOperatorCatalogWidth(value: number, availableWidth: number): number {
  const maximum = Math.max(catalogWidthMin, Math.floor(availableWidth * catalogWidthRatioMax));
  return Math.min(maximum, Math.max(catalogWidthMin, Math.round(value)));
}

export function countActiveOperatorFilters(filters: Record<string, string>): number {
  return Object.values(filters).filter(Boolean).length;
}

export interface ParameterSpecItem {
  key: string;
  title: string;
  type: string;
  description: string;
  defaultValue: unknown;
  currentValue: unknown;
  constraints: string;
  enumOptions?: unknown[];
  unit?: string;
}

export function extractParameterSpecs(version: OperatorVersionSummary): ParameterSpecItem[] {
  const schema = version.parameter_schema || {};
  const properties = (schema['properties'] as Record<string, Record<string, unknown>>) || {};
  const defaults =
    version.default_parameters ||
    (version.algorithm?.['default_params'] as Record<string, unknown>) ||
    {};
  const uiSchema = (version.ui_schema as Record<string, Record<string, unknown>>) || {};

  const keys = Array.from(new Set([...Object.keys(properties), ...Object.keys(defaults)]));
  return keys.map((key) => {
    const prop = properties[key] || {};
    const ui = uiSchema[key] || {};
    const title = String(prop['title'] || key);
    const rawType = String(
      prop['type'] || (defaults[key] !== undefined ? typeof defaults[key] : 'any'),
    );
    const typeMap: Record<string, string> = {
      integer: '整数',
      number: '数值',
      string: '文本',
      boolean: '布尔开关',
      object: '结构化对象',
      array: '列表数组',
    };
    const type = typeMap[rawType] || rawType;
    const description = String(prop['description'] || '');
    const defaultValue = prop['default'] !== undefined ? prop['default'] : defaults[key];
    const currentValue = defaults[key] !== undefined ? defaults[key] : defaultValue;

    const constraintsList: string[] = [];
    if (prop['minimum'] !== undefined && prop['maximum'] !== undefined) {
      constraintsList.push(`区间 [${prop['minimum']}, ${prop['maximum']}]`);
    } else if (prop['minimum'] !== undefined) {
      constraintsList.push(`最小值 ≥ ${prop['minimum']}`);
    } else if (prop['maximum'] !== undefined) {
      constraintsList.push(`最大值 ≤ ${prop['maximum']}`);
    }
    if (Array.isArray(prop['enum'])) {
      constraintsList.push(`选项: ${prop['enum'].join(' | ')}`);
    }
    if (prop['minLength'] !== undefined || prop['maxLength'] !== undefined) {
      constraintsList.push(`长度: ${prop['minLength'] ?? 0} ~ ${prop['maxLength'] ?? '不限'}`);
    }

    return {
      key,
      title,
      type,
      description,
      defaultValue,
      currentValue,
      constraints: constraintsList.join('；'),
      enumOptions: Array.isArray(prop['enum']) ? prop['enum'] : undefined,
      unit: typeof ui['unit'] === 'string' ? ui['unit'] : undefined,
    };
  });
}

@Component({
  selector: 'app-operator-center-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    DataAssetPickerComponent,
    OperatorParameterFormComponent,
    SwIconComponent,
  ],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">算子中心</p>
        <h1>可组合的分析算子</h1>
        <p class="lead">查看已审核的输入输出契约、参数和运行状态。运行统一从工作流开始。</p>
      </div>
      <div class="header-actions">
        <a class="secondary" routerLink="/operators/import">导入外部算法</a>
        <a class="primary" routerLink="/workflows/new">新建工作流</a>
      </div>
    </header>

    <section class="toolbar">
      <input
        [(ngModel)]="query"
        (keyup.enter)="load()"
        placeholder="搜索名称或编码"
        aria-label="搜索算子"
      />
      <select [(ngModel)]="kind" (change)="load()" aria-label="算子分类">
        <option value="">全部分类</option>
        <option value="data_source">数据源</option>
        <option value="transform">数据转换</option>
        <option value="algorithm">算法</option>
        <option value="control">控制</option>
        <option value="output">输出</option>
        <option value="composite">复合算子</option>
      </select>
      <select [(ngModel)]="maturity" (change)="load()" aria-label="成熟度">
        <option value="">全部成熟度</option>
        <option value="production">生产</option>
        <option value="candidate">候选</option>
        <option value="experimental">实验</option>
        <option value="deprecated">已弃用</option>
      </select>
      <button
        class="secondary filter-toggle"
        type="button"
        [class.active]="filtersOpen()"
        (click)="filtersOpen.set(!filtersOpen())"
      >
        详细筛选
        @if (activeFilterCount()) {
          <span>{{ activeFilterCount() }}</span>
        }
      </button>
      @if (activeFilterCount()) {
        <button class="text-button" type="button" (click)="resetFilters()">清空筛选</button>
      }
      <button class="secondary" type="button" (click)="load()">刷新</button>
    </section>

    @if (filtersOpen()) {
      <section class="filter-panel" aria-label="算子详细筛选">
        <label>
          <span>业务领域</span>
          <select [(ngModel)]="businessDomain" (change)="load()">
            <option value="">全部领域</option>
            @for (option of facetOptions('business_domain'); track option.code) {
              <option [value]="option.code">{{ option.name }}</option>
            }
          </select>
        </label>
        <label>
          <span>任务类型</span>
          <select [(ngModel)]="task" (change)="load()">
            <option value="">全部任务</option>
            @for (option of facetOptions('task'); track option.code) {
              <option [value]="option.code">{{ option.name }}</option>
            }
          </select>
        </label>
        <label>
          <span>学习范式</span>
          <select [(ngModel)]="learning" (change)="load()">
            <option value="">全部范式</option>
            @for (option of facetOptions('learning'); track option.code) {
              <option [value]="option.code">{{ option.name }}</option>
            }
          </select>
        </label>
        <label>
          <span>训练要求</span>
          <select [(ngModel)]="trainingRequirement" (change)="load()">
            <option value="">全部要求</option>
            @for (option of facetOptions('training_requirement'); track option.code) {
              <option [value]="option.code">{{ option.name }}</option>
            }
          </select>
        </label>
        <label>
          <span>模型策略</span>
          <select [(ngModel)]="modelStrategy" (change)="load()">
            <option value="">全部策略</option>
            @for (option of facetOptions('model_strategy'); track option.code) {
              <option [value]="option.code">{{ option.name }}</option>
            }
          </select>
        </label>
        <label>
          <span>运行环境</span>
          <select [(ngModel)]="runtimeType" (change)="load()">
            <option value="">全部环境</option>
            <option value="builtin_cpu">内置 CPU</option>
            <option value="builtin_gpu">内置 GPU</option>
            <option value="external_cpu">外部 CPU</option>
          </select>
        </label>
      </section>
    }

    @if (message()) {
      <div class="message">{{ message() }}</div>
    }
    <div #catalogLayout class="content-grid" [style.--operator-list-width.px]="listWidth()">
      <section class="operator-list" aria-label="算子列表">
        @for (operator of operators(); track operator.code) {
          <button
            class="operator-row"
            type="button"
            [class.selected]="selected()?.code === operator.code"
            (click)="select(operator)"
          >
            <span class="status-dot" [class.offline]="!operator.available"></span
            ><span class="row-copy"
              ><strong>{{ operatorNames.displayName(operator.code, operator.name) }}</strong
              ><small>{{ operator.code }} · {{ operator.kind }}</small></span
            ><span class="badge">{{
              operator.default_version?.version || operator.active_version?.version || '—'
            }}</span>
          </button>
        } @empty {
          <div class="empty">暂无符合条件的算子。</div>
        }
      </section>

      <div
        class="catalog-resizer"
        role="separator"
        tabindex="0"
        aria-label="调整算子列表宽度"
        aria-orientation="vertical"
        [attr.aria-valuemin]="320"
        [attr.aria-valuenow]="listWidth()"
        (pointerdown)="startListResize($event, catalogLayout)"
        (keydown)="resizeListWithKeyboard($event, catalogLayout)"
        (dblclick)="resetListWidth(catalogLayout)"
      >
        <span></span>
      </div>

      <section class="detail-card" aria-live="polite">
        @if (selected(); as operator) {
          <div class="detail-head">
            <div>
              <p class="eyebrow">{{ operator.kind }}</p>
              <h2>{{ operatorNames.displayName(operator.code, operator.name) }}</h2>
              <code>{{ operator.code }}</code>
            </div>
            <span class="state" [class.ready]="operator.available">{{
              operator.available ? '可用' : '不可运行'
            }}</span>
          </div>
          <label class="version-viewer">
            <span>查看版本</span>
            <select [ngModel]="viewedVersion()" (ngModelChange)="selectVersion(operator, $event)">
              @for (item of operator.versions || []; track item.id) {
                <option [value]="item.version">
                  {{ item.version
                  }}{{
                    item.lifecycle === 'deprecated'
                      ? ' · 已弃用'
                      : item.lifecycle === 'blocked'
                        ? ' · 已阻断'
                        : ''
                  }}
                </option>
              }
            </select>
          </label>
          @if (algorithmTags(operator); as tags) {
            <div class="tag-row">
              @for (tag of tags; track tag.code) {
                <span class="tag">{{ tag['name'] }}</span>
              }
            </div>
          }
          @if (!operator.available) {
            <div class="warning">
              {{ operator.unavailable_reason || operator.disabled_reason || '当前版本不可运行。' }}
            </div>
          }
          @if (operator.active_version; as version) {
            <div class="meta-line">
              <span>版本 {{ version.version }}</span
              ><span>{{ version.executor_type }}</span
              ><span>{{ version.runtime_type }}</span
              ><span>成熟度 {{ version.maturity }}</span>
            </div>
            <nav class="tabs" aria-label="算子详情选项卡">
              <button
                type="button"
                [class.active]="activeTab() === 'overview'"
                (click)="setTab('overview')"
              >
                简介
              </button>
              <button
                type="button"
                [class.active]="activeTab() === 'contract'"
                (click)="setTab('contract')"
              >
                契约与参数
              </button>
              <button
                type="button"
                [class.active]="activeTab() === 'training'"
                (click)="setTab('training')"
              >
                训练与模型
              </button>
              <button
                type="button"
                [class.active]="activeTab() === 'versions'"
                (click)="setTab('versions')"
              >
                版本与评估
              </button>
              <button
                type="button"
                [class.active]="activeTab() === 'documents'"
                (click)="setTab('documents')"
              >
                文档
              </button>
              <button
                type="button"
                [class.active]="activeTab() === 'usage'"
                (click)="setTab('usage')"
              >
                使用情况
              </button>
            </nav>
            @if (activeTab() === 'overview') {
              <div class="tab-body">
                <p class="description">{{ operator.description }}</p>
                <h3>适用范围</h3>
                <p class="muted">
                  {{
                    algorithmDescription(operator) ||
                      '用于已登记数据资产的可追溯分析。运行结果通过工作流统一保存。'
                  }}
                </p>
                <div class="algorithm-ref">
                  运行环境：{{ version.runtime_type }} ·
                  {{ version.runtime_ready ? '环境就绪' : '环境未就绪' }}
                </div>
              </div>
            }
            @if (activeTab() === 'contract') {
              <div class="tab-body">
                <div class="contract-grid">
                  <div>
                    <h3>输入端口</h3>
                    @for (port of version.input_ports; track port['key']) {
                      <div class="port">
                        <b>{{ port['label'] || port['key'] }}</b
                        ><small>{{ port['data_type'] }} · {{ port['unit'] || '无单位' }}</small>
                      </div>
                    } @empty {
                      <p class="muted">无输入端口</p>
                    }
                  </div>
                  <div>
                    <h3>输出端口</h3>
                    @for (port of version.output_ports; track port['key']) {
                      <div class="port">
                        <b>{{ port['label'] || port['key'] }}</b
                        ><small>{{ port['data_type'] }} · {{ port['unit'] || '无单位' }}</small>
                      </div>
                    } @empty {
                      <p class="muted">无输出端口</p>
                    }
                  </div>
                </div>

                <div class="section-title-row">
                  <div class="section-title-text">
                    <h3>默认推理与执行参数</h3>
                    <p class="section-subtitle">
                      工作流节点未配置个性化覆写时使用的系统默认参数基准。
                    </p>
                  </div>
                  @if (auth.hasPermission('operator:manage') && !editingDefaults()) {
                    <button
                      class="secondary btn-sm edit-params-btn"
                      type="button"
                      (click)="openEditDefaults(version)"
                    >
                      <app-sw-icon name="settings" [size]="16" />调整默认参数
                    </button>
                  }
                </div>

                @if (editingDefaults()) {
                  <div class="params-edit-card" aria-label="调整算子默认参数">
                    <div class="edit-card-header">
                      <div>
                        <strong>编辑版本 v{{ version.version }} 默认参数</strong>
                        <p class="muted" style="margin-top: 2px; font-size: 12px;">
                          修改后的参数将作为该算子版本后续所有新建工作流节点的默认执行配置。
                        </p>
                      </div>
                      <div class="edit-actions-top">
                        <button
                          class="text-button"
                          type="button"
                          (click)="resetToSchemaDefaults(version)"
                        >
                          恢复出厂预设
                        </button>
                      </div>
                    </div>

                    <div class="edit-card-form">
                      <app-operator-parameter-form
                        [schema]="version.parameter_schema"
                        [uiSchema]="asUiSchema(version.ui_schema)"
                        [model]="defaultParamsFormModel()"
                        (parametersChange)="onDefaultParamsChange($event)"
                        (validityChange)="onDefaultParamsValidityChange($event)"
                      />
                    </div>

                    <div class="edit-card-footer">
                      <button
                        class="secondary btn-sm"
                        type="button"
                        [disabled]="savingDefaults()"
                        (click)="cancelEditDefaults()"
                      >
                        取消
                      </button>
                      <button
                        class="primary btn-sm"
                        type="button"
                        [disabled]="!defaultParamsValid() || savingDefaults()"
                        (click)="saveDefaultParameters(operator, version)"
                      >
                        {{ savingDefaults() ? '正在保存…' : '保存生效' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="params-spec-table">
                    @for (spec of getParameterSpecs(version); track spec.key) {
                      <div class="param-row">
                        <div class="param-main">
                          <div class="param-name-line">
                            <span class="param-title">{{ spec.title }}</span>
                            <code class="param-key">{{ spec.key }}</code>
                            <span class="param-type-badge">{{ spec.type }}</span>
                            @if (spec.unit) {
                              <span class="param-unit-badge">{{ spec.unit }}</span>
                            }
                          </div>
                          @if (spec.description) {
                            <p class="param-desc">{{ spec.description }}</p>
                          }
                          @if (spec.constraints) {
                            <div class="param-constraints">
                              <span class="constraint-label">约束：</span>
                              <span>{{ spec.constraints }}</span>
                            </div>
                          }
                        </div>
                        <div class="param-value-col">
                          <span class="param-val-label">默认值</span>
                          <span class="param-val-pill">{{
                            formatParamValue(spec.currentValue)
                          }}</span>
                        </div>
                      </div>
                    } @empty {
                      <p class="muted">该算子没有可配置的默认参数。</p>
                    }
                  </div>
                }

                @if (auth.hasPermission('operator:manage') && version.algorithm) {
                  <section class="release-binding-card" aria-label="版本默认发布包">
                    <div>
                      <strong>新建节点使用的公共发布包</strong>
                      <p class="muted">
                        只影响之后创建的节点；已有节点和已发布工作流继续使用原来的模型快照。
                      </p>
                    </div>
                    <div class="release-binding-actions">
                      <select
                        aria-label="公共发布包"
                        [ngModel]="version.default_release_id || ''"
                        [disabled]="loadingReleases() || savingRelease()"
                        (ngModelChange)="saveDefaultRelease(operator, version, $event)"
                      >
                        <option value="">不绑定公共发布包</option>
                        @for (release of releases(); track release.release_id) {
                          <option [value]="release.release_id">
                            {{ release.version }} · {{ release.status
                            }}{{ release.default_model_version_id ? ' · 含默认模型' : '' }}
                          </option>
                        }
                      </select>
                    </div>
                  </section>
                }

                <details class="raw-contract-details">
                  <summary>查看底层原始 JSON 契约</summary>
                  <div class="raw-contract-content">
                    <h4>参数契约 Schema (JSON Schema)</h4>
                    <pre>{{ version.parameter_schema | json }}</pre>
                    <h4>当前默认参数快照 (Raw JSON)</h4>
                    <pre>{{
                      version.default_parameters || version.algorithm?.['default_params'] || {}
                        | json
                    }}</pre>
                  </div>
                </details>
              </div>
            }
            @if (activeTab() === 'training') {
              <div class="tab-body">
                @if (version.algorithm; as algorithm) {
                  <div class="training-header-info">
                    <p>
                      <b>学习方式：</b>{{ algorithm['learning_paradigm'] || '规则方法' }}　<b
                        >训练要求：</b
                      >{{ algorithm['training_requirement'] || '无需训练' }}
                    </p>
                    <p class="muted">模型策略：{{ algorithm['model_strategy'] || '无状态' }}</p>
                  </div>

                  @if (algorithm['training_requirement'] === 'required') {
                    <div class="training-card">
                      <div class="card-title-row">
                        <b>🎯 在线模型训练</b>
                        <a class="text-button" routerLink="/tasks">查看训练任务记录 ↗</a>
                      </div>
                      <p class="muted">
                        训练任务通过独立 training_cpu
                        队列执行。训练产出的模型将持久化存入模型库，可供工作流节点绑定或由管理员设为算子默认模型。
                      </p>
                      @if (auth.hasPermission('algorithm:train')) {
                        <app-data-asset-picker
                          [channelRequired]="true"
                          (selectionChange)="setTrainingSelection($event)"
                        />
                        <div class="training-fields">
                          <label
                            >季节性
                            <select [(ngModel)]="trainingSeasonality">
                              <option value="auto">自动判断</option>
                              <option value="daily">日周期</option>
                              <option value="weekly">周周期</option>
                            </select>
                          </label>
                          <label
                            >最少周期
                            <input
                              type="number"
                              min="1"
                              max="365"
                              [(ngModel)]="trainingMinimumCycles"
                            />
                          </label>
                          <label
                            >MAD 下限
                            <input
                              type="number"
                              min="0.000001"
                              step="0.000001"
                              [(ngModel)]="trainingMadFloor"
                            />
                          </label>
                        </div>
                        <div class="training-actions-bar">
                          <button
                            class="primary"
                            type="button"
                            [disabled]="!trainingSelection() || trainingBusy()"
                            (click)="startTraining(operator)"
                          >
                            {{ trainingBusy() ? '训练任务执行中…' : '开始在线训练' }}
                          </button>
                          @if (trainingMessage()) {
                            <span class="training-feedback" [class.success]="trainingSuccess()">{{
                              trainingMessage()
                            }}</span>
                          }
                        </div>
                      }
                    </div>

                    <section class="models-registry-section">
                      <div class="section-title-row">
                        <div>
                          <h3>📦 已训练模型资产 (Model Registry)</h3>
                          <p class="muted">
                            查看该算子已训练并就绪的模型权重，支持设置默认模型与公开流转
                          </p>
                        </div>
                        <button
                          class="secondary btn-sm"
                          type="button"
                          (click)="loadModels(operator)"
                        >
                          刷新列表
                        </button>
                      </div>

                      @if (loadingModels()) {
                        <p class="muted" style="padding: 12px 0;">正在加载模型列表…</p>
                      } @else if (models().length === 0) {
                        <div class="empty-models-card">
                          <p class="muted">
                            暂无可用的已训练模型。请在上方选择数据资产并点击“开始在线训练”。
                          </p>
                        </div>
                      } @else {
                        <div class="models-grid">
                          @for (model of models(); track model.model_version_id) {
                            <article
                              class="model-item-card"
                              [class.is-default-card]="model.is_default"
                            >
                              <div class="model-item-head">
                                <div class="model-tags-row">
                                  <strong class="model-code-label">{{ model.version }}</strong>
                                  @if (model.is_default) {
                                    <span class="badge badge-default-model">★ 算子默认</span>
                                  }
                                  <span
                                    class="badge"
                                    [class.badge-ready]="model.status === 'ready'"
                                    [class.badge-pending]="model.status === 'training'"
                                  >
                                    {{ model.status === 'ready' ? '就绪' : model.status }}
                                  </span>
                                  <span class="badge badge-vis">{{
                                    model.visibility === 'public' ? '公开' : '私有'
                                  }}</span>
                                </div>
                                <span class="model-time muted">{{
                                  model.created_at | date: 'yyyy-MM-dd HH:mm'
                                }}</span>
                              </div>

                              <div class="model-item-details">
                                @if (model.training_dataset; as ds) {
                                  <div class="detail-line">
                                    <span class="muted">训练来源：</span>
                                    <span
                                      >{{
                                        ds.monitor_point_name ||
                                          ds.monitor_point_code ||
                                          '点位#' + ds.monitor_point_id
                                      }}
                                      · {{ ds.metric_code || '流量' }}</span
                                    >
                                  </div>
                                }
                                @if (model.metrics; as m) {
                                  <div class="metrics-chips">
                                    <span class="chip"
                                      >拟合周期: <b>{{ m['seasonal_slots'] || '-' }} Slots</b></span
                                    >
                                    <span class="chip"
                                      >样本量: <b>{{ m['training_rows'] || '-' }} 条</b></span
                                    >
                                    <span class="chip"
                                      >步长:
                                      <b>{{
                                        m['interval_seconds'] ? m['interval_seconds'] + 's' : '-'
                                      }}</b></span
                                    >
                                  </div>
                                }
                                @if (model.owner_username) {
                                  <div class="detail-line" style="font-size: 11px;">
                                    <span class="muted">创建人：</span>
                                    <span>{{ model.owner_username }}</span>
                                  </div>
                                }
                              </div>

                              <div class="model-item-actions">
                                <button
                                  class="secondary btn-xs"
                                  type="button"
                                  (click)="openModelDetail(model)"
                                >
                                  基线详情
                                </button>
                                @if (
                                  auth.user()?.id === model.owner_user_id ||
                                  auth.hasPermission('admin')
                                ) {
                                  <button
                                    class="secondary btn-xs"
                                    type="button"
                                    (click)="toggleVisibility(operator, model)"
                                  >
                                    {{ model.visibility === 'public' ? '设为私有' : '设为公开' }}
                                  </button>
                                }
                                <a class="primary btn-xs link-btn" [routerLink]="['/workflows/new']"
                                  >在工作流中使用</a
                                >
                              </div>
                            </article>
                          }
                        </div>
                      }
                    </section>
                  } @else {
                    <div class="training-card">
                      {{
                        operator.code === 'chronos2_flow_forecast'
                          ? '预训练零样本，本版本不支持平台内训练。'
                          : '此算子不需要平台训练。'
                      }}
                    </div>
                  }
                  <h3>训练默认参数</h3>
                  <pre>{{ algorithm['training_default_params'] | json }}</pre>
                }
              </div>
            }
            @if (activeTab() === 'versions') {
              <div class="tab-body">
                <h3>已登记算子版本</h3>
                @for (item of operator.versions || []; track item.id) {
                  <div class="version-row">
                    <span class="version-identity">
                      <b>{{ item.version }}</b>
                      <small>{{
                        item.lifecycle ||
                          (item.version === operator.default_version?.version
                            ? 'current'
                            : 'installed')
                      }}</small>
                    </span>
                    <span>{{ item.status }} · {{ item.maturity }}</span>
                    <span [class.available-text]="item.available">
                      {{ item.available ? '可用' : versionUnavailableReason(item) }}
                    </span>
                  </div>
                } @empty {
                  <p class="muted">暂无版本记录。</p>
                }
                @if (activeRelease(operator); as release) {
                  <div class="algorithm-ref">
                    该算子版本的默认发布包：{{ release.version }} · {{ release.status }}
                  </div>
                }
              </div>
            }
            @if (activeTab() === 'documents') {
              <div class="tab-body documents-tab-body">
                @if (loadingDocuments()) {
                  <p class="muted" style="padding: 16px 0;">正在加载算子文档…</p>
                } @else if (documents().length === 0 && !documentMessage()) {
                  <div class="empty-docs-box">
                    <p class="muted">该算子暂未发布文档。</p>
                  </div>
                }
                @if (documentMessage()) {
                  <div class="empty-docs-box">
                    <p class="muted">{{ documentMessage() }}</p>
                  </div>
                }
                @for (doc of documents(); track doc.id) {
                  <section class="doc-card">
                    <div class="doc-card-header">
                      <h3>{{ doc.title }}</h3>
                      <span class="doc-version-tag">文档版本 v{{ doc.version }}</span>
                    </div>
                    @if (doc.markdownError) {
                      <p class="muted">该文档暂时无法读取，请稍后重试。</p>
                    } @else if (doc.markdown) {
                      <article
                        class="markdown"
                        [innerHTML]="renderMarkdown(doc.markdown)"
                      ></article>
                    } @else {
                      <p class="muted">该文档暂无可展示的 Markdown 内容。</p>
                    }
                  </section>
                }
              </div>
            }
            @if (activeTab() === 'usage') {
              <div class="tab-body usage-grid">
                <div><b>工作流引用</b><strong>—</strong></div>
                <div><b>近 7 天运行</b><strong>—</strong></div>
                <div><b>成功率</b><strong>—</strong></div>
                <p class="muted">详细使用统计将在任务聚合接口接入后展示。</p>
              </div>
            }
          }
        } @else {
          <div class="empty">选择一个算子查看契约。</div>
        }
      </section>
    </div>

    <section class="starter-section">
      <div>
        <p class="eyebrow">流程结构</p>
        <h2>从内置结构开始</h2>
        <p class="muted">结构会复制为你的私有草稿，载入后仍可自由拖拽、连线和调参。</p>
      </div>
      <div class="starter-grid">
        @for (template of templates(); track template.template_code) {
          <article class="starter-card">
            <div class="starter-title">
              <h3>{{ template.name }}</h3>
              <span>{{ template.node_count }} 节点</span>
            </div>
            <p>{{ template.description }}</p>
            <small>需要：{{ template.required_bindings.join('、') || '无' }}</small
            ><a
              class="secondary"
              [routerLink]="['/workflows/new']"
              [queryParams]="{ template: template.template_code }"
              >使用此结构</a
            >
          </article>
        }
      </div>
    </section>

    @if (selectedModelForDetail(); as detailModel) {
      <div class="modal-backdrop" (click)="selectedModelForDetail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <header class="modal-header">
            <div>
              <span class="eyebrow">模型基线参数详情</span>
              <h3>{{ detailModel.version }}</h3>
            </div>
            <button
              class="text-button modal-close-btn"
              type="button"
              (click)="selectedModelForDetail.set(null)"
            >
              ✕
            </button>
          </header>
          <div class="modal-body">
            <div class="detail-props-grid">
              <div>
                <b>模型版本 ID:</b> <code>{{ detailModel.model_version_id }}</code>
              </div>
              <div><b>算法编码:</b> {{ detailModel.algorithm_code || '-' }}</div>
              <div><b>状态:</b> {{ detailModel.status }}</div>
              <div><b>可见性:</b> {{ detailModel.visibility === 'public' ? '公开' : '私有' }}</div>
              <div>
                <b>是否默认模型:</b> {{ detailModel.is_default ? '★ 是 (算子默认)' : '否' }}
              </div>
              <div><b>创建时间:</b> {{ detailModel.created_at | date: 'yyyy-MM-dd HH:mm:ss' }}</div>
            </div>
            <h4>训练拟合指标 (Metrics)</h4>
            <pre>{{ detailModel.metrics | json }}</pre>
            <h4>模型兼容性约束 (Compatibility)</h4>
            <pre>{{ detailModel.compatibility | json }}</pre>
            <h4>元数据与数据快照 (Metadata)</h4>
            <pre>{{ detailModel.metadata | json }}</pre>
          </div>
          <footer class="modal-footer">
            <button
              class="secondary"
              type="button"
              (click)="copyModelId(detailModel.model_version_id)"
            >
              复制模型ID
            </button>
            <button class="primary" type="button" (click)="selectedModelForDetail.set(null)">
              关闭
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      color: var(--sw-text-primary);
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      font-size: clamp(27px, 2.4vw, 34px);
      letter-spacing: -0.025em;
      margin-top: 4px;
    }
    h2 {
      font-size: 22px;
    }
    h3 {
      font-size: 15px;
    }
    .page-header,
    .detail-head,
    .starter-title,
    .meta-line,
    .toolbar,
    .header-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .page-header {
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 20px;
    }
    .header-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .eyebrow {
      color: var(--sw-color-primary);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .description,
    .muted {
      color: var(--sw-text-muted);
    }
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0;
    }
    .tag {
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 15%, var(--sw-border));
      background: var(--sw-color-primary-soft);
      color: var(--sw-color-primary-strong);
      padding: 4px 9px;
      font-size: 12px;
    }
    .toolbar {
      flex-wrap: wrap;
      margin-bottom: var(--sw-space-3);
      padding: var(--sw-space-3);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    input,
    select {
      min-height: 40px;
      border: 1px solid var(--sw-border-strong);
      border-radius: var(--sw-radius-sm);
      padding: 0 12px;
      background: var(--sw-surface);
      color: var(--sw-text-primary);
    }
    input {
      min-width: 240px;
      flex: 1;
    }
    button,
    .primary,
    .secondary {
      border: 0;
      border-radius: var(--sw-radius-sm);
      padding: 10px 15px;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      display: inline-flex;
      justify-content: center;
      align-items: center;
    }
    .primary {
      background: var(--sw-color-primary);
      color: white;
    }
    .secondary {
      background: var(--sw-surface);
      color: var(--sw-color-primary-strong);
      border: 1px solid var(--sw-border-strong);
    }
    .filter-toggle.active {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary-soft);
    }
    .filter-toggle span {
      min-width: 20px;
      height: 20px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      margin-left: 6px;
      background: var(--sw-color-primary);
      color: white;
      font-size: 11px;
    }
    .text-button {
      padding-inline: 4px;
      background: transparent;
      color: var(--sw-color-primary);
    }
    .filter-panel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      padding: 14px;
      margin-bottom: 18px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-muted);
    }
    .filter-panel label {
      display: grid;
      gap: 6px;
      color: var(--sw-text-secondary);
      font-size: 12px;
      font-weight: 700;
    }
    .filter-panel select {
      width: 100%;
      min-width: 0;
      font-weight: 400;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .message,
    .warning {
      border-radius: 10px;
      padding: 11px 14px;
      margin-bottom: 16px;
      border: 1px solid color-mix(in srgb, var(--sw-color-warning) 25%, var(--sw-border));
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
    }
    .content-grid {
      display: grid;
      grid-template-columns: var(--operator-list-width, 380px) 12px minmax(0, 1fr);
      gap: 0;
      align-items: start;
    }
    .operator-list,
    .detail-card,
    .starter-section {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      box-shadow: var(--sw-shadow-sm);
    }
    .operator-list {
      padding: 10px;
      max-height: min(680px, calc(100vh - 250px));
      overflow: auto;
      scrollbar-gutter: stable;
    }
    .operator-list .empty {
      min-height: 180px;
      display: grid;
      place-items: center;
      padding: var(--sw-space-5);
      color: var(--sw-text-muted);
      text-align: center;
    }
    .catalog-resizer {
      align-self: stretch;
      min-height: 420px;
      display: grid;
      place-items: center;
      cursor: col-resize;
      touch-action: none;
      outline: none;
    }
    .catalog-resizer span {
      width: 3px;
      height: 54px;
      border-radius: 999px;
      background: var(--sw-border-strong);
      transition:
        height 120ms ease,
        background 120ms ease;
    }
    .catalog-resizer:hover span,
    .catalog-resizer:focus-visible span {
      height: 78px;
      background: var(--sw-color-primary);
    }
    .operator-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      padding: 13px 12px;
      background: var(--sw-surface);
      color: var(--sw-text-primary);
      border: 1px solid transparent;
      border-bottom-color: var(--sw-border);
      border-radius: var(--sw-radius-sm);
      transition:
        background-color var(--sw-motion-fast) var(--sw-ease-standard),
        border-color var(--sw-motion-fast) var(--sw-ease-standard);
    }
    .operator-row:hover {
      background: var(--sw-color-primary-faint);
    }
    .operator-row.selected {
      background: var(--sw-color-primary-soft);
      border-color: color-mix(in srgb, var(--sw-color-primary) 36%, var(--sw-border));
    }
    .status-dot {
      flex: 0 0 9px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--sw-color-success);
    }
    .status-dot.offline {
      background: var(--sw-border-strong);
    }
    .row-copy {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .row-copy strong {
      overflow-wrap: anywhere;
      line-height: 1.35;
    }
    .row-copy small,
    .badge,
    .port small {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .badge {
      white-space: nowrap;
    }
    .detail-card {
      padding: 22px;
      min-height: 420px;
    }
    .detail-head {
      justify-content: space-between;
      align-items: flex-start;
    }
    .version-viewer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--sw-space-2);
      margin: var(--sw-space-3) 0 0;
      color: var(--sw-text-muted);
      font-size: 12px;
      font-weight: 700;
    }
    .version-viewer select {
      min-width: 150px;
    }
    code {
      color: var(--sw-text-muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .state {
      white-space: nowrap;
      border-radius: 999px;
      padding: 5px 10px;
      background: var(--sw-surface-sunken);
      color: var(--sw-text-muted);
      font-size: 12px;
      font-weight: 700;
    }
    .state.ready {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .meta-line {
      flex-wrap: wrap;
      color: var(--sw-text-muted);
      font-size: 12px;
      border-top: 1px solid var(--sw-border);
      border-bottom: 1px solid var(--sw-border);
      padding: 12px 0;
      margin: 16px 0;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-bottom: 1px solid var(--sw-border);
      margin-bottom: 16px;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .tabs button {
      border-radius: 8px 8px 0 0;
      padding: 9px 12px;
      background: transparent;
      color: var(--sw-text-muted);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }
    .tabs button.active {
      color: var(--sw-color-primary-strong);
      border-bottom-color: var(--sw-color-primary);
      background: var(--sw-color-primary-faint);
    }
    .tab-body {
      min-height: 220px;
    }
    .contract-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .port {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 9px 0;
      border-bottom: 1px solid var(--sw-border);
    }
    details {
      margin-top: 16px;
    }
    .section-subtitle {
      color: var(--sw-text-muted);
      font-size: 12px;
      margin-top: 2px;
    }
    .edit-params-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    }
    .params-spec-table {
      display: grid;
      gap: 10px;
      margin-bottom: 16px;
    }
    .param-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 12px 14px;
      background: var(--sw-surface-muted);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      gap: 16px;
      transition:
        background 0.15s,
        border-color 0.15s;
    }
    .param-row:hover {
      background: var(--sw-color-primary-faint);
      border-color: var(--sw-border-strong);
    }
    .param-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .param-name-line {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .param-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--sw-text-primary);
    }
    .param-key {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      background: var(--sw-surface-sunken);
      color: var(--sw-text-secondary);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .param-type-badge {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
      font-weight: 500;
    }
    .param-unit-badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--sw-color-accent-soft);
      color: var(--sw-color-accent);
    }
    .param-desc {
      font-size: 12px;
      color: var(--sw-text-secondary);
      margin: 0;
      line-height: 1.4;
    }
    .param-constraints {
      font-size: 11px;
      color: var(--sw-text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .constraint-label {
      color: var(--sw-text-muted);
    }
    .param-value-col {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      flex-shrink: 0;
    }
    .param-val-label {
      font-size: 11px;
      color: var(--sw-text-muted);
    }
    .param-val-pill {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      background: var(--sw-color-primary-soft);
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 25%, var(--sw-border));
      color: var(--sw-color-primary-strong);
      border-radius: 6px;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .params-edit-card {
      margin-bottom: 18px;
      padding: 16px;
      border: 1px solid color-mix(in srgb, var(--sw-color-primary) 38%, var(--sw-border));
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-primary-faint);
      box-shadow: var(--sw-shadow-sm);
      display: grid;
      gap: 14px;
    }
    .edit-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--sw-border);
    }
    .edit-card-header strong {
      font-size: 14px;
      color: var(--sw-color-primary-strong);
    }
    .edit-card-form {
      padding: 8px 0;
    }
    .edit-card-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--sw-border);
    }
    .raw-contract-details {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px dashed var(--sw-border-strong);
    }
    .release-binding-card {
      margin-top: 18px;
      padding: 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .release-binding-card p {
      margin: 4px 0 0;
    }
    .release-binding-actions select {
      min-width: 240px;
      max-width: 360px;
    }
    .raw-contract-details summary {
      color: var(--sw-text-muted);
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .raw-contract-details summary:hover {
      color: var(--sw-color-primary);
    }
    .raw-contract-content {
      margin-top: 10px;
    }
    .raw-contract-content h4 {
      font-size: 12px;
      margin: 8px 0 4px;
      color: var(--sw-text-secondary);
    }
    pre {
      white-space: pre-wrap;
      overflow: auto;
      background: var(--sw-surface-muted);
      color: var(--sw-text-primary);
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      max-height: 180px;
    }
    .algorithm-ref {
      margin-top: 12px;
      padding: 10px;
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
      border-radius: 8px;
      font-size: 13px;
    }
    .training-card {
      margin: 14px 0;
      padding: 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-primary-faint);
      display: grid;
      gap: 8px;
    }
    .training-card app-data-asset-picker {
      width: 100%;
    }
    .training-fields {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .training-fields label {
      display: grid;
      gap: 5px;
      color: var(--sw-text-secondary);
      font-size: 12px;
    }
    .training-fields input,
    .training-fields select {
      width: 100%;
      min-width: 0;
      min-height: 36px;
      box-sizing: border-box;
    }
    .training-header-info {
      margin-bottom: 14px;
    }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .training-actions-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 14px;
      flex-wrap: wrap;
    }
    .training-feedback {
      font-size: 13px;
      color: var(--sw-color-warning);
    }
    .training-feedback.success {
      color: var(--sw-color-success);
      font-weight: 600;
    }
    .models-registry-section {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--sw-border);
    }
    .section-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
      gap: 12px;
    }
    .empty-models-card {
      padding: 20px;
      border: 1px dashed var(--sw-border-strong);
      border-radius: var(--sw-radius-sm);
      text-align: center;
      background: var(--sw-surface-muted);
    }
    .models-grid {
      display: grid;
      gap: 12px;
    }
    .model-item-card {
      padding: 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface);
      transition:
        border-color 0.15s,
        box-shadow 0.15s;
    }
    .model-item-card:hover {
      border-color: var(--sw-border-strong);
      box-shadow: var(--sw-shadow-md);
    }
    .model-item-card.is-default-card {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary-faint);
    }
    .model-item-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .model-tags-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .model-code-label {
      font-size: 14px;
      color: var(--sw-text-primary);
    }
    .badge-default-model {
      background: var(--sw-color-primary);
      color: #fff;
      font-weight: 700;
    }
    .badge-ready {
      background: var(--sw-color-success-soft);
      color: var(--sw-color-success);
    }
    .badge-pending {
      background: var(--sw-color-warning-soft);
      color: var(--sw-color-warning);
    }
    .badge-vis {
      background: var(--sw-surface-sunken);
      color: var(--sw-text-secondary);
    }
    .model-item-details {
      display: grid;
      gap: 5px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .detail-line {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .metrics-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .chip {
      padding: 2px 8px;
      background: var(--sw-surface-sunken);
      border-radius: 4px;
      color: var(--sw-text-secondary);
      font-size: 11px;
    }
    .model-item-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn-xs {
      padding: 4px 10px;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 13px;
      border-radius: 8px;
      cursor: pointer;
    }
    .link-btn {
      text-decoration: none;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: color-mix(in srgb, var(--sw-text-primary) 48%, transparent);
      display: grid;
      place-items: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }
    .modal-card {
      background: var(--sw-surface-raised);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      width: min(90vw, 680px);
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--sw-shadow-lg);
    }
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--sw-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-close-btn {
      font-size: 18px;
      cursor: pointer;
      color: var(--sw-text-secondary);
    }
    .modal-body {
      padding: 20px;
      overflow: auto;
      display: grid;
      gap: 12px;
    }
    .detail-props-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 12px;
      background: var(--sw-surface-muted);
      border: 1px solid var(--sw-border);
      border-radius: 8px;
      font-size: 12px;
    }
    .modal-footer {
      padding: 14px 20px;
      border-top: 1px solid var(--sw-border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .version-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--sw-border);
      color: var(--sw-text-muted);
    }
    .version-row b {
      color: var(--sw-text-primary);
    }
    .version-select-row {
      grid-template-columns: auto minmax(140px, 0.9fr) minmax(150px, 1fr) minmax(180px, 1fr);
      align-items: center;
      cursor: pointer;
      border: 1px solid transparent;
      border-radius: 9px;
      padding: 10px 12px;
      transition:
        border-color 0.16s ease,
        background 0.16s ease;
    }
    .version-select-row:hover:not(.disabled),
    .version-select-row.selected {
      border-color: var(--sw-color-primary);
      background: var(--sw-color-primary-faint);
    }
    .version-select-row.current {
      background: var(--sw-color-success-soft);
    }
    .version-select-row.disabled {
      cursor: not-allowed;
      opacity: 0.66;
    }
    .version-select-row input {
      min-width: 0;
      margin: 0;
      accent-color: var(--sw-color-primary);
    }
    .version-identity {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .current-version-badge {
      color: var(--sw-color-success);
      background: var(--sw-color-success-soft);
      border-radius: 999px;
      padding: 2px 7px;
      white-space: nowrap;
    }
    .available-text {
      color: var(--sw-color-success);
    }
    .version-activation-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      margin-top: 16px;
      padding: 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
      background: var(--sw-surface-muted);
    }
    .version-activation-actions p {
      margin: 4px 0 0;
    }
    .usage-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .usage-grid > div {
      display: grid;
      gap: 6px;
      padding: 14px;
      background: var(--sw-surface-muted);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-sm);
    }
    .usage-grid strong {
      font-size: 22px;
    }
    .markdown {
      line-height: 1.7;
      color: var(--sw-text-secondary);
      max-width: 1040px;
    }
    .document-version {
      color: var(--sw-text-muted);
      font-size: 12px;
      margin: -4px 0 18px;
    }
    :host ::ng-deep .markdown h1,
    :host ::ng-deep .markdown h2,
    :host ::ng-deep .markdown h3 {
      color: var(--sw-text-primary);
      line-height: 1.3;
      margin: 1.35em 0 0.55em;
    }
    :host ::ng-deep .markdown img {
      display: block;
      width: min(100%, 1120px);
      height: auto;
      margin: 18px auto 10px;
      border: 1px solid var(--sw-border);
      border-radius: 12px;
      background: var(--sw-surface-muted);
    }
    :host ::ng-deep .markdown .katex-display {
      overflow-x: auto;
      overflow-y: hidden;
      padding: 8px 0;
    }
    :host ::ng-deep .markdown pre {
      overflow: auto;
    }
    .manage-actions {
      margin-top: 18px;
      display: flex;
      justify-content: flex-end;
    }
    .starter-section {
      margin-top: 20px;
      padding: 20px;
    }
    .starter-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 16px;
    }
    .starter-card {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-muted);
      transition:
        border-color var(--sw-motion-fast) var(--sw-ease-standard),
        background-color var(--sw-motion-fast) var(--sw-ease-standard);
    }
    .starter-card:hover {
      border-color: var(--sw-border-strong);
      background: var(--sw-color-primary-faint);
    }
    .starter-title {
      justify-content: space-between;
      align-items: flex-start;
    }
    .starter-title span {
      color: var(--sw-text-muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .starter-card p {
      color: var(--sw-text-muted);
      min-height: 48px;
    }
    .starter-card small {
      color: var(--sw-text-muted);
      overflow-wrap: anywhere;
    }
    .starter-card a {
      margin-top: auto;
    }
    .documents-tab-body {
      padding-top: 4px;
    }
    .doc-card {
      margin-bottom: 24px;
    }
    .doc-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--sw-border);
    }
    .doc-card-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--sw-text-primary);
    }
    .doc-version-tag {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      background: var(--sw-color-info-soft);
      color: var(--sw-color-info);
      border-radius: 999px;
    }
    .empty-docs-box {
      padding: 24px;
      text-align: center;
      background: var(--sw-surface-muted);
      border: 1px dashed var(--sw-border-strong);
      border-radius: 10px;
      margin: 12px 0;
    }
    :host ::ng-deep .markdown {
      line-height: 1.75;
      color: var(--sw-text-secondary);
      font-size: 14px;
    }
    :host ::ng-deep .markdown h1 {
      font-size: 20px;
      font-weight: 800;
      margin: 20px 0 12px;
      color: var(--sw-text-primary);
      letter-spacing: -0.01em;
    }
    :host ::ng-deep .markdown h2 {
      font-size: 16px;
      font-weight: 700;
      margin: 18px 0 10px;
      color: var(--sw-text-primary);
      padding-bottom: 6px;
      border-bottom: 1px solid var(--sw-border);
    }
    :host ::ng-deep .markdown h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 14px 0 8px;
      color: var(--sw-text-secondary);
    }
    :host ::ng-deep .markdown p {
      margin: 10px 0;
      line-height: 1.75;
    }
    :host ::ng-deep .markdown ul,
    :host ::ng-deep .markdown ol {
      padding-left: 22px;
      margin: 10px 0;
    }
    :host ::ng-deep .markdown li {
      margin: 5px 0;
      line-height: 1.65;
    }
    :host ::ng-deep .markdown table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 18px 0;
      font-size: 13px;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border-strong);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--sw-shadow-sm);
    }
    :host ::ng-deep .markdown th {
      background: var(--sw-surface-muted);
      font-weight: 700;
      color: var(--sw-text-primary);
      text-align: left;
      padding: 10px 14px;
      border-bottom: 1px solid var(--sw-border-strong);
      border-right: 1px solid var(--sw-border);
      white-space: nowrap;
    }
    :host ::ng-deep .markdown th:last-child {
      border-right: none;
    }
    :host ::ng-deep .markdown td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--sw-border);
      border-right: 1px solid var(--sw-border);
      color: var(--sw-text-secondary);
      line-height: 1.6;
      word-break: break-word;
    }
    :host ::ng-deep .markdown td:last-child {
      border-right: none;
    }
    :host ::ng-deep .markdown tr:last-child td {
      border-bottom: none;
    }
    :host ::ng-deep .markdown tr:nth-child(even) td {
      background: var(--sw-surface-muted);
    }
    :host ::ng-deep .markdown tr:hover td {
      background: var(--sw-color-primary-faint);
    }
    :host ::ng-deep .markdown img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 20px auto;
      border-radius: 10px;
      border: 1px solid var(--sw-border);
      background: var(--sw-surface);
      padding: 12px;
      box-shadow: var(--sw-shadow-md);
    }
    :host ::ng-deep .markdown code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: var(--sw-surface-sunken);
      color: var(--sw-color-primary-strong);
      padding: 2px 6px;
      border-radius: 4px;
    }
    :host ::ng-deep .markdown pre {
      background: #0f172a;
      color: #f8fafc;
      padding: 14px 18px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      margin: 14px 0;
    }
    :host ::ng-deep .markdown pre code {
      background: transparent;
      color: inherit;
      padding: 0;
    }
    :host ::ng-deep .markdown blockquote {
      margin: 14px 0;
      padding: 10px 16px;
      border-left: 4px solid var(--sw-color-primary);
      background: var(--sw-color-primary-faint);
      color: var(--sw-color-primary-strong);
      border-radius: 0 6px 6px 0;
      line-height: 1.65;
    }
    :host ::ng-deep .markdown em {
      color: var(--sw-text-muted);
      font-size: 13px;
    }
    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
        gap: 18px;
      }
      .catalog-resizer {
        display: none;
      }
      .operator-list {
        max-height: 360px;
      }
      .starter-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 600px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .contract-grid {
        grid-template-columns: 1fr;
      }
      input {
        min-width: 100%;
      }
      .toolbar > select,
      .toolbar > button,
      .toolbar > a {
        flex: 1 1 calc(50% - var(--sw-space-2));
      }
      .usage-grid,
      .version-row,
      .training-fields {
        grid-template-columns: 1fr;
      }
      .detail-card {
        padding: var(--sw-space-4);
      }
      .version-viewer {
        align-items: stretch;
        flex-direction: column;
      }
      .version-viewer select,
      .release-binding-actions select {
        min-width: 0;
        width: 100%;
      }
    }
  `,
})
export class OperatorCenterPage implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notice = inject(NotificationService);
  private readonly documentRenderer = inject(AlgorithmDocumentRendererService);
  private readonly operatorDocuments = inject(StaticOperatorDocumentService);
  readonly operatorNames = inject(OperatorNameService);
  readonly auth = inject(AuthService);
  readonly operators = signal<OperatorSummary[]>([]);
  readonly facets = signal<Record<string, OperatorFacetOption[]>>({});
  readonly templates = signal<WorkflowTemplateSummary[]>([]);
  readonly selected = signal<OperatorSummary | null>(null);
  readonly documents = signal<StaticOperatorDocument[]>([]);
  readonly documentMessage = signal('');
  readonly loadingDocuments = signal(false);
  readonly models = signal<ModelVersionSummary[]>([]);
  readonly loadingModels = signal(false);
  readonly releases = signal<AlgorithmReleaseSummary[]>([]);
  readonly loadingReleases = signal(false);
  readonly savingRelease = signal(false);
  readonly selectedModelForDetail = signal<ModelVersionSummary | null>(null);
  readonly activeTab = signal<
    'overview' | 'contract' | 'training' | 'versions' | 'documents' | 'usage'
  >('overview');
  readonly message = signal('');
  readonly trainingSelection = signal<DataAssetSelection | null>(null);
  readonly trainingBusy = signal(false);
  readonly trainingSuccess = signal(false);
  readonly trainingMessage = signal('');
  readonly filtersOpen = signal(false);
  readonly listWidth = signal(catalogWidthDefault);
  readonly editingDefaults = signal(false);
  readonly defaultParamsFormModel = signal<Record<string, unknown>>({});
  readonly defaultParamsValid = signal(true);
  readonly savingDefaults = signal(false);
  readonly viewedVersion = signal<string | null>(null);
  trainingSeasonality = 'auto';
  trainingMinimumCycles = 3;
  trainingMadFloor = 0.000001;
  query = '';
  kind = '';
  maturity = '';
  status = '';
  runtimeType = '';
  businessDomain = '';
  task = '';
  learning = '';
  trainingRequirement = '';
  modelStrategy = '';
  private resizeCleanup: (() => void) | null = null;
  private lastCatalogLayout: HTMLElement | null = null;
  private selectionRequestGeneration = 0;
  private documentRequestGeneration = 0;
  private releaseRequestGeneration = 0;

  constructor() {
    this.kind = this.route.snapshot.queryParamMap.get('kind') || '';
    this.viewedVersion.set(this.route.snapshot.queryParamMap.get('version'));
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (
      ['overview', 'contract', 'training', 'versions', 'documents', 'usage'].includes(tab || '')
    ) {
      this.activeTab.set(
        tab as 'overview' | 'contract' | 'training' | 'versions' | 'documents' | 'usage',
      );
    }
    this.listWidth.set(this.readStoredListWidth());
    this.loadFacets();
    this.load();
    this.loadTemplates();
  }
  ngOnDestroy(): void {
    this.stopListResize();
  }
  load(): void {
    this.message.set('');
    this.api
      .get<{ items: OperatorSummary[] }>('/api/v1/operators', {
        kind: this.kind || undefined,
        status: this.status || undefined,
        maturity: this.maturity || undefined,
        runtime_type: this.runtimeType || undefined,
        business_domain: this.businessDomain || undefined,
        task: this.task || undefined,
        learning: this.learning || undefined,
        training_requirement: this.trainingRequirement || undefined,
        model_strategy: this.modelStrategy || undefined,
        query: this.query || undefined,
        page: 1,
        page_size: 100,
      })
      .subscribe({
        next: (result) => {
          this.operators.set(result.items || []);
          const current = this.selected();
          const target =
            this.operators().find((item) => item.code === current?.code) ||
            this.operators()[0] ||
            null;
          if (!target) {
            this.selected.set(null);
            return;
          }
          const preserveVersion =
            current?.code === target.code || (!current && !!this.viewedVersion());
          this.select(target, !preserveVersion);
        },
        error: () => this.message.set('算子目录加载失败，请检查权限或服务状态。'),
      });
  }
  loadFacets(): void {
    this.api.get<OperatorFacetResponse>('/api/v1/operator-facets').subscribe({
      next: (result) => this.facets.set(result.facets || {}),
      error: () => this.facets.set({}),
    });
  }
  facetOptions(dimension: string): OperatorFacetOption[] {
    return this.facets()[dimension] || [];
  }
  activeFilterCount(): number {
    return countActiveOperatorFilters({
      kind: this.kind,
      maturity: this.maturity,
      status: this.status,
      runtimeType: this.runtimeType,
      businessDomain: this.businessDomain,
      task: this.task,
      learning: this.learning,
      trainingRequirement: this.trainingRequirement,
      modelStrategy: this.modelStrategy,
    });
  }
  resetFilters(): void {
    this.kind = '';
    this.maturity = '';
    this.status = '';
    this.runtimeType = '';
    this.businessDomain = '';
    this.task = '';
    this.learning = '';
    this.trainingRequirement = '';
    this.modelStrategy = '';
    this.load();
  }
  loadTemplates(): void {
    this.api
      .get<WorkflowTemplateSummary[]>('/api/v1/workflow-templates')
      .subscribe({ next: (items) => this.templates.set(items || []) });
  }
  select(operator: OperatorSummary, resetVersion = true): void {
    const selectionGeneration = ++this.selectionRequestGeneration;
    this.documentRequestGeneration += 1;
    if (resetVersion) this.syncViewedVersion(operator, true);
    const selectedVersion = this.findViewedVersion(operator);
    const selectedOperator = this.withViewedVersion(operator, selectedVersion);
    this.selected.set(selectedOperator);
    this.documents.set([]);
    this.documentMessage.set('');
    this.models.set([]);
    this.trainingSelection.set(null);
    this.trainingMessage.set('');
    this.trainingSuccess.set(false);
    this.releases.set([]);
    this.loadReleases(selectedOperator);
    if (this.activeTab() === 'documents') this.loadDocuments(selectedOperator);
    if (this.activeTab() === 'training') this.loadModels(selectedOperator);
    this.api.get<OperatorSummary>(`/api/v1/operators/${operator.code}`).subscribe({
      next: (detail) => {
        if (selectionGeneration !== this.selectionRequestGeneration) return;
        const version = this.findViewedVersion(detail);
        const viewed = this.withViewedVersion(detail, version);
        this.viewedVersion.set(version?.version || null);
        this.selected.set(viewed);
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { version: version?.version || null, tab: this.activeTab() },
          queryParamsHandling: 'merge',
        });
        this.loadReleases(viewed);
        if (this.activeTab() === 'documents') this.loadDocuments(viewed);
        if (this.activeTab() === 'training') this.loadModels(viewed);
      },
    });
  }
  setTrainingSelection(selection: DataAssetSelection | null): void {
    this.trainingSelection.set(selection);
  }
  loadModels(operator: OperatorSummary): void {
    const code = this.algorithmCode(operator);
    if (!code || !this.auth.hasPermission('model:read')) {
      this.models.set([]);
      return;
    }
    this.loadingModels.set(true);
    const algorithm = operator.active_version?.algorithm as
      Record<string, unknown> | null | undefined;
    const rawVersionId = algorithm?.['algorithm_version_id'] ?? algorithm?.['id'] ?? null;
    this.api
      .get<ModelVersionSummary[]>(
        '/api/v1/model-versions',
        rawVersionId === null || rawVersionId === undefined || rawVersionId === ''
          ? { algorithm_code: code }
          : { algorithm_version_id: String(rawVersionId) },
      )
      .subscribe({
        next: (items) => {
          this.models.set(items || []);
          this.loadingModels.set(false);
        },
        error: () => {
          this.models.set([]);
          this.loadingModels.set(false);
        },
      });
  }
  toggleVisibility(operator: OperatorSummary, model: ModelVersionSummary): void {
    const nextVis = model.visibility === 'public' ? 'private' : 'public';
    this.api
      .post<ModelVersionSummary, { visibility: string }>(
        `/api/v1/model-versions/${model.model_version_id}/visibility`,
        { visibility: nextVis },
      )
      .subscribe({
        next: () => {
          this.notice.success(`模型可见性已更新为：${nextVis === 'public' ? '公开' : '私有'}`);
          this.loadModels(operator);
        },
        error: () => this.notice.error('修改模型可见性失败，请检查权限。'),
      });
  }
  openModelDetail(model: ModelVersionSummary): void {
    this.selectedModelForDetail.set(model);
  }
  copyModelId(id: string): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(id).then(() => this.notice.success('模型 ID 已复制到剪贴板'));
    } else {
      this.notice.success(`模型 ID: ${id}`);
    }
  }
  startTraining(operator: OperatorSummary): void {
    const selection = this.trainingSelection();
    if (!selection || this.trainingBusy()) return;
    const algorithmCode = this.algorithmCode(operator);
    if (!algorithmCode) {
      this.trainingMessage.set('该算子没有关联可训练的算法资产。');
      return;
    }
    this.trainingBusy.set(true);
    this.trainingSuccess.set(false);
    this.trainingMessage.set('正在创建并调度训练任务…');
    const exactVersion = operator.active_version?.version;
    const trainingPath = `/api/v1/algorithms/${algorithmCode}/training-runs${
      exactVersion ? `?algorithm_version=${encodeURIComponent(exactVersion)}` : ''
    }`;
    this.api
      .post<Record<string, unknown>, Record<string, unknown>>(trainingPath, {
        dataset_version_id: selection.version.id,
        monitor_point_id: selection.channel?.monitor_point_id ?? null,
        metric_code: selection.channel?.metric_code || 'flow',
        value_source: selection.value_source,
        training_params: {
          seasonality: this.trainingSeasonality,
          minimum_cycles: Number(this.trainingMinimumCycles),
          mad_floor: Number(this.trainingMadFloor),
        },
        random_seed: 42,
      })
      .subscribe({
        next: (run) => {
          const runId = String(run['training_run_id'] || run['task_id'] || '');
          this.trainingMessage.set(`训练任务已提交 (ID: ${runId})，正在后台执行并拟合模型…`);
          const taskId = String(run['task_id'] || '');
          if (taskId) {
            this.pollTrainingTask(taskId, operator);
          } else {
            this.trainingBusy.set(false);
            this.trainingSuccess.set(true);
            this.loadModels(operator);
          }
        },
        error: () => {
          this.trainingBusy.set(false);
          this.trainingSuccess.set(false);
          this.trainingMessage.set('训练任务提交失败，请检查数据版本、权限和服务状态。');
        },
      });
  }
  private pollTrainingTask(taskId: string, operator: OperatorSummary, attempts = 0): void {
    if (attempts > 30) {
      this.trainingBusy.set(false);
      this.trainingMessage.set('训练任务在后台继续运行中，请稍后刷新模型列表。');
      this.loadModels(operator);
      return;
    }
    setTimeout(() => {
      this.api.get<Record<string, unknown>>(`/api/v1/tasks/${taskId}`).subscribe({
        next: (task) => {
          const status = String(task['status'] || '');
          if (status === 'success') {
            this.trainingBusy.set(false);
            this.trainingSuccess.set(true);
            this.trainingMessage.set('训练成功完成！新模型已生成并已加入下方模型资产库。');
            this.notice.success('算法在线训练完成，新模型已就绪！');
            this.loadModels(operator);
          } else if (status === 'failed' || status === 'cancelled') {
            this.trainingBusy.set(false);
            this.trainingSuccess.set(false);
            this.trainingMessage.set(
              `训练任务已${status === 'failed' ? '失败' : '取消'}：${String(task['error_message'] || task['message'] || '')}`,
            );
          } else {
            const progress = Number(task['progress'] || 0);
            this.trainingMessage.set(`正在训练中 (${progress}%)… ${String(task['message'] || '')}`);
            this.pollTrainingTask(taskId, operator, attempts + 1);
          }
        },
        error: () => {
          this.trainingBusy.set(false);
          this.loadModels(operator);
        },
      });
    }, 1500);
  }
  setTab(tab: 'overview' | 'contract' | 'training' | 'versions' | 'documents' | 'usage'): void {
    this.activeTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { version: this.viewedVersion(), tab },
      queryParamsHandling: 'merge',
    });
    if (this.selected()) {
      if (tab === 'documents') this.loadDocuments(this.selected()!);
      if (tab === 'training') this.loadModels(this.selected()!);
    }
  }
  algorithmTags(operator: OperatorSummary): Array<{ code: string; name: string }> {
    const tags =
      operator.active_version?.algorithm?.['tags'] ||
      operator.active_version?.tags ||
      operator.tags;
    return Array.isArray(tags)
      ? tags.map((tag) => ({
          code: String((tag as Record<string, unknown>)['code'] || ''),
          name: String((tag as Record<string, unknown>)['name'] || ''),
        }))
      : [];
  }
  algorithmDescription(operator: OperatorSummary): string {
    const manifest = operator.active_version?.algorithm?.['capability_manifest'];
    return manifest && typeof manifest === 'object'
      ? String((manifest as Record<string, unknown>)['description'] || '')
      : '';
  }
  activeRelease(operator: OperatorSummary): { version: string; status: string } | null {
    const releaseId = operator.active_version?.default_release_id;
    if (!releaseId) return null;
    const release = this.releases().find((item) => item.release_id === String(releaseId));
    return release
      ? { version: release.version, status: release.status }
      : { version: String(releaseId), status: '已绑定' };
  }
  versionUnavailableReason(version: OperatorVersionSummary): string {
    const algorithm = version.algorithm as Record<string, unknown> | null;
    return String(algorithm?.['reason'] || '不可用');
  }
  private syncViewedVersion(operator: OperatorSummary, reset = false): void {
    const versions = operator.versions || [];
    const current = this.viewedVersion();
    if (!reset && current && versions.some((item) => item.version === current)) return;
    this.viewedVersion.set(
      operator.default_version?.version ||
        operator.active_version?.version ||
        versions[0]?.version ||
        null,
    );
  }
  selectVersion(operator: OperatorSummary, version: string): void {
    const selected = (operator.versions || []).find((item) => item.version === version);
    if (!selected) return;
    this.viewedVersion.set(version);
    const viewed = this.withViewedVersion(operator, selected);
    this.selected.set(viewed);
    this.editingDefaults.set(false);
    this.models.set([]);
    this.documents.set([]);
    this.loadReleases(viewed);
    if (this.activeTab() === 'documents') this.loadDocuments(viewed);
    if (this.activeTab() === 'training') this.loadModels(viewed);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { version, tab: this.activeTab() },
      queryParamsHandling: 'merge',
    });
  }
  private findViewedVersion(operator: OperatorSummary): OperatorVersionSummary | null {
    const requested = this.viewedVersion();
    return (
      (operator.versions || []).find((item) => item.version === requested) ||
      operator.default_version ||
      operator.active_version ||
      operator.versions?.[0] ||
      null
    );
  }
  private withViewedVersion(
    operator: OperatorSummary,
    version: OperatorVersionSummary | null,
  ): OperatorSummary {
    if (!version) return operator;
    return {
      ...operator,
      active_version: version,
      available: version.available,
      unavailable_reason: version.unavailable_reasons?.[0] || null,
      unavailable_reasons: version.unavailable_reasons || [],
      installed: version.installed,
      lifecycle: version.lifecycle,
      runtime_ready: version.runtime_ready,
      runnable_with_defaults: version.runnable_with_defaults,
      default_parameters: version.default_parameters,
      default_release_id: version.default_release_id,
      default_model_version_id: version.default_model_version_id,
    };
  }
  loadReleases(operator: OperatorSummary): void {
    const requestGeneration = ++this.releaseRequestGeneration;
    const code = this.algorithmCode(operator);
    const rawVersionId = operator.active_version?.algorithm?.['id'];
    if (!code || rawVersionId === null || rawVersionId === undefined) {
      this.releases.set([]);
      return;
    }
    const algorithmVersionId = Number(rawVersionId);
    this.loadingReleases.set(true);
    this.api.get<AlgorithmReleaseSummary[]>(`/api/v1/algorithms/${code}/releases`).subscribe({
      next: (items) => {
        if (requestGeneration !== this.releaseRequestGeneration) return;
        this.releases.set(
          (items || []).filter(
            (item) =>
              item.algorithm_version_id === algorithmVersionId &&
              ['approved', 'active'].includes(item.status),
          ),
        );
        this.loadingReleases.set(false);
      },
      error: () => {
        if (requestGeneration !== this.releaseRequestGeneration) return;
        this.releases.set([]);
        this.loadingReleases.set(false);
      },
    });
  }
  saveDefaultRelease(
    operator: OperatorSummary,
    version: OperatorVersionSummary,
    releaseId: string,
  ): void {
    if (this.savingRelease()) return;
    this.savingRelease.set(true);
    this.api
      .put<
        { default_release_id: string | null; default_model_version_id: string | null },
        { release_id: string | null }
      >(`/api/v1/operators/${operator.code}/versions/${version.version}/default-release`, {
        release_id: releaseId || null,
      })
      .subscribe({
        next: (result) => {
          this.savingRelease.set(false);
          const updated = {
            ...version,
            default_release_id: result.default_release_id,
            default_model_version_id: result.default_model_version_id,
          };
          const versions = (operator.versions || []).map((item) =>
            item.version === version.version ? updated : item,
          );
          this.selected.set(this.withViewedVersion({ ...operator, versions }, updated));
          this.notice.success('当前版本的新建节点默认发布包已更新。');
        },
        error: () => {
          this.savingRelease.set(false);
          this.notice.error('公共发布包更新失败，请确认发布包已通过审核且属于当前算法版本。');
        },
      });
  }
  algorithmCode(operator: OperatorSummary): string | null {
    return linkedAlgorithmCode(operator);
  }
  documentScopeKey(operator: OperatorSummary | null): string | null {
    return operatorDocumentScopeKey(operator);
  }
  loadDocuments(operator: OperatorSummary): void {
    const documentGeneration = ++this.documentRequestGeneration;
    const code = this.documentScopeKey(operator);
    if (!code || !this.auth.hasPermission('algorithm:read')) {
      this.documents.set([]);
      this.documentMessage.set('');
      this.loadingDocuments.set(false);
      return;
    }
    this.documentMessage.set('');
    this.loadingDocuments.set(true);
    this.operatorDocuments
      .documentsForOperator(code)
      .pipe(
        switchMap((documents) =>
          documents.length
            ? forkJoin(
                documents.map((document) =>
                  this.operatorDocuments.loadMarkdown(document).pipe(
                    map((markdown) => ({ ...document, markdown })),
                    catchError(() => of({ ...document, markdown: null, markdownError: true })),
                  ),
                ),
              )
            : of([]),
        ),
      )
      .subscribe({
        next: (documents) => {
          if (documentGeneration !== this.documentRequestGeneration) return;
          this.documents.set(documents);
          this.documentMessage.set(
            documents.some((document) => document.markdownError)
              ? '部分算子文档暂时无法读取。'
              : '',
          );
          this.loadingDocuments.set(false);
        },
        error: () => {
          if (documentGeneration !== this.documentRequestGeneration) return;
          this.documents.set([]);
          this.documentMessage.set('算子文档索引暂时无法加载。');
          this.loadingDocuments.set(false);
        },
      });
  }
  startListResize(event: PointerEvent, layout: HTMLElement): void {
    if (window.innerWidth <= 900) return;
    event.preventDefault();
    this.stopListResize();
    this.lastCatalogLayout = layout;
    const startX = event.clientX;
    const startWidth = this.listWidth();
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const move = (next: PointerEvent) => {
      this.listWidth.set(this.clampListWidth(startWidth + next.clientX - startX, layout));
    };
    const stop = () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      this.resizeCleanup = null;
      this.storeListWidth();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
    this.resizeCleanup = stop;
  }
  resizeListWithKeyboard(event: KeyboardEvent, layout: HTMLElement): void {
    const step = event.shiftKey ? 40 : 16;
    let next = this.listWidth();
    if (event.key === 'ArrowLeft') next -= step;
    else if (event.key === 'ArrowRight') next += step;
    else if (event.key === 'Home') next = catalogWidthMin;
    else if (event.key === 'End') next = layout.clientWidth * catalogWidthRatioMax;
    else return;
    event.preventDefault();
    this.lastCatalogLayout = layout;
    this.listWidth.set(this.clampListWidth(next, layout));
    this.storeListWidth();
  }
  resetListWidth(layout: HTMLElement): void {
    this.lastCatalogLayout = layout;
    this.listWidth.set(this.clampListWidth(catalogWidthDefault, layout));
    this.storeListWidth();
  }
  @HostListener('window:resize')
  onViewportResize(): void {
    if (window.innerWidth <= 900) return;
    this.listWidth.set(this.clampListWidth(this.listWidth(), this.lastCatalogLayout));
  }
  private clampListWidth(value: number, layout?: HTMLElement | null): number {
    const availableWidth = layout?.clientWidth || window.innerWidth;
    return clampOperatorCatalogWidth(value, availableWidth);
  }
  private stopListResize(): void {
    this.resizeCleanup?.();
    this.resizeCleanup = null;
  }
  private listWidthStorageKey(): string {
    return `smart-water.operator-catalog.width.v1:${this.auth.user()?.id ?? 'anonymous'}`;
  }
  private readStoredListWidth(): number {
    try {
      const value = Number(window.localStorage.getItem(this.listWidthStorageKey()));
      return Number.isFinite(value) && value > 0 ? this.clampListWidth(value) : catalogWidthDefault;
    } catch {
      return catalogWidthDefault;
    }
  }
  private storeListWidth(): void {
    try {
      window.localStorage.setItem(this.listWidthStorageKey(), String(this.listWidth()));
    } catch {
      // Local UI preferences are optional.
    }
  }
  renderMarkdown(markdown: string): SafeHtml {
    return this.documentRenderer.render(markdown);
  }
  getParameterSpecs(version: OperatorVersionSummary): ParameterSpecItem[] {
    return extractParameterSpecs(version);
  }

  formatParamValue(value: unknown): string {
    if (value === null || value === undefined) return '未设定';
    if (typeof value === 'boolean') return value ? '是 (true)' : '否 (false)';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  openEditDefaults(version: OperatorVersionSummary): void {
    const currentDefaults =
      version.default_parameters ||
      (version.algorithm?.['default_params'] as Record<string, unknown>) ||
      {};
    this.defaultParamsFormModel.set(structuredClone(currentDefaults));
    this.defaultParamsValid.set(true);
    this.editingDefaults.set(true);
  }

  cancelEditDefaults(): void {
    this.editingDefaults.set(false);
  }

  onDefaultParamsChange(updated: Record<string, unknown>): void {
    this.defaultParamsFormModel.set(updated);
  }

  onDefaultParamsValidityChange(valid: boolean): void {
    this.defaultParamsValid.set(valid);
  }

  asUiSchema(
    uiSchema: Record<string, unknown> | undefined,
  ): Record<string, Record<string, unknown>> {
    return (uiSchema ?? {}) as Record<string, Record<string, unknown>>;
  }

  resetToSchemaDefaults(version: OperatorVersionSummary): void {
    const schema = version.parameter_schema || {};
    const properties = (schema['properties'] as Record<string, Record<string, unknown>>) || {};
    const initial: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties)) {
      if (prop['default'] !== undefined) {
        initial[key] = prop['default'];
      }
    }
    this.defaultParamsFormModel.set(initial);
    this.notice.success('已还原为 Schema 预设默认值，请点击保存生效。');
  }

  saveDefaultParameters(operator: OperatorSummary, version: OperatorVersionSummary): void {
    if (!this.defaultParamsValid() || this.savingDefaults()) return;
    this.savingDefaults.set(true);
    const params = this.defaultParamsFormModel();

    this.api
      .patch<
        { operator: OperatorSummary; version: OperatorVersionSummary },
        { default_parameters: Record<string, unknown> }
      >(`/api/v1/operators/${operator.code}/versions/${version.version}/default-parameters`, {
        default_parameters: params,
      })
      .subscribe({
        next: (res) => {
          this.savingDefaults.set(false);
          this.editingDefaults.set(false);
          this.notice.success(`算子 ${operator.name} (v${version.version}) 默认参数已成功更新！`);
          if (res?.operator) {
            this.selected.set(res.operator);
          } else {
            this.select(operator, false);
          }
        },
        error: (err) => {
          this.savingDefaults.set(false);
          const detailMsg = err?.error?.detail?.message || err?.message || '未知错误';
          this.notice.error(`更新默认参数失败: ${detailMsg}`);
        },
      });
  }
}
