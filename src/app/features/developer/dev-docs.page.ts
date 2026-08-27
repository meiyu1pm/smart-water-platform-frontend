import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface DocLink {
  title: string;
  description: string;
  url: string;
  icon: string;
  type: 'external' | 'swagger';
}

@Component({
  selector: 'app-dev-docs-page',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>开发文档</h1>
        <p>平台 API 接口、算法 SDK 和集成指南</p>
      </div>

      <div class="doc-grid">
        @for (doc of docs; track doc.title) {
          <a class="doc-card" [href]="doc.url" target="_blank" rel="noopener noreferrer">
            <div class="doc-icon">
              <mat-icon>{{ doc.icon }}</mat-icon>
            </div>
            <div class="doc-content">
              <strong>{{ doc.title }}</strong>
              <p>{{ doc.description }}</p>
              <span class="doc-link">
                打开文档 <mat-icon>open_in_new</mat-icon>
              </span>
            </div>
          </a>
        }
      </div>

      <div class="api-note">
        <mat-icon>info</mat-icon>
        <div>
          <strong>本地 Swagger 文档</strong>
          <p>
            后端启动后可访问 <code>http://127.0.0.1:18000/docs</code> 查看交互式 API 文档，
            OpenAPI JSON 位于 <code>http://127.0.0.1:18000/openapi.json</code>。
          </p>
        </div>
      </div>
    </div>
  `,
  styles: `
    .page { max-width: 960px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 {
      font-size: 24px;
      margin: 0 0 6px;
      color: var(--sw-text-primary);
    }
    .page-header p {
      margin: 0;
      color: var(--sw-text-muted);
      font-size: 14px;
    }
    .doc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .doc-card {
      display: flex;
      gap: 14px;
      padding: 20px;
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
    }
    .doc-card:hover {
      border-color: var(--sw-color-primary);
      box-shadow: var(--sw-shadow-sm);
      transform: translateY(-2px);
    }
    .doc-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--sw-color-info-soft);
      color: var(--sw-color-primary);
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .doc-icon mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .doc-content { flex: 1; min-width: 0; }
    .doc-content strong {
      display: block;
      font-size: 15px;
      font-weight: 700;
      color: var(--sw-text-primary);
    }
    .doc-content p {
      margin: 4px 0 10px;
      font-size: 13px;
      color: var(--sw-text-secondary);
      line-height: 1.5;
    }
    .doc-link {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 12px;
      font-weight: 600;
      color: var(--sw-color-primary);
    }
    .doc-link mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .api-note {
      display: flex;
      gap: 12px;
      padding: 18px 20px;
      background: var(--sw-surface-muted);
      border-radius: var(--sw-radius-md);
      border-left: 3px solid var(--sw-color-info);
    }
    .api-note mat-icon {
      color: var(--sw-color-info);
      font-size: 22px;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .api-note strong {
      display: block;
      font-size: 14px;
      color: var(--sw-text-primary);
      margin-bottom: 4px;
    }
    .api-note p {
      margin: 0;
      font-size: 13px;
      color: var(--sw-text-secondary);
      line-height: 1.6;
    }
    .api-note code {
      background: var(--sw-surface);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'Cascadia Code', monospace;
      color: var(--sw-color-primary-strong);
    }
  `,
})
export class DevDocsPage {
  readonly docs: DocLink[] = [
    {
      title: '平台文档中心',
      description: '完整的用户指南、功能说明和操作手册。',
      url: 'https://schwarz-hal.github.io/smart-water-platform-docs/',
      icon: 'menu_book',
      type: 'external',
    },
    {
      title: 'API 契约文档',
      description: 'V1 接口请求/响应格式、权限说明和错误码。',
      url: 'https://github.com/Schwarz-Hal/smart-water-platform-backend/blob/main/docs/API_CONTRACT_V1.md',
      icon: 'api',
      type: 'external',
    },
    {
      title: '后端仓库',
      description: 'FastAPI 后端源码、部署脚本和贡献指南。',
      url: 'https://github.com/Schwarz-Hal/smart-water-platform-backend',
      icon: 'storage',
      type: 'external',
    },
    {
      title: '算法上手指南',
      description: '外部算法导入、环境制备和算子契约编写。',
      url: 'https://github.com/Schwarz-Hal/smart-water-platform-backend/blob/main/docs/ALGORITHM_ONBOARDING_GUIDE.md',
      icon: 'psychology',
      type: 'external',
    },
  ];
}
