import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { StaticOperatorDocument, StaticOperatorDocumentService } from './operator-document.service';

describe('StaticOperatorDocumentService', () => {
  let service: StaticOperatorDocumentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StaticOperatorDocumentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('filters the static index by related operators and normalizes Markdown paths', () => {
    let documents: StaticOperatorDocument[] | undefined;
    service
      .documentsForOperator('chronos2_flow_forecast')
      .subscribe((value) => (documents = value));

    const request = http.expectOne('/operator-docs/index.json');
    request.flush({
      schema_version: '1.0',
      source_commit: 'a'.repeat(40),
      documents: [
        {
          id: 'chronos-reference',
          title: 'Chronos-2 参考',
          version: '1.1.0',
          document_type: 'algorithm',
          status: 'published',
          locale: 'zh-CN',
          related_operators: ['chronos2_flow_forecast'],
          source_path: 'docs/05-algorithms/chronos.md',
        },
        {
          id: 'chronos-architecture',
          title: 'Chronos-2 架构',
          version: '1.0.0',
          document_type: 'algorithm',
          status: 'published',
          locale: 'zh-CN',
          related_operators: ['chronos2_flow_forecast'],
          markdown_path: '/operator-docs/docs/05-algorithms/architecture.md',
        },
      ],
    });

    expect(documents).toHaveLength(2);
    expect(documents?.map((document) => document.id)).toEqual([
      'chronos-reference',
      'chronos-architecture',
    ]);
    expect(documents?.[0].markdown_path).toBe('/operator-docs/docs/05-algorithms/chronos.md');
    expect(documents?.[1].markdown_path).toBe('/operator-docs/docs/05-algorithms/architecture.md');
  });

  it('loads each document from its normalized Markdown path', () => {
    const document = {
      id: 'chronos-reference',
      title: 'Chronos-2 参考',
      version: '1.1.0',
      document_type: 'algorithm',
      status: 'published',
      locale: 'zh-CN',
      related_operators: ['chronos2_flow_forecast'],
      markdown_path: '/operator-docs/docs/05-algorithms/chronos.md',
    };
    let markdown = '';

    service.loadMarkdown(document).subscribe((value) => (markdown = value));
    const request = http.expectOne('/operator-docs/docs/05-algorithms/chronos.md');
    expect(request.request.responseType).toBe('text');
    request.flush('# Chronos-2');

    expect(markdown).toBe('# Chronos-2');
  });

  it('surfaces an invalid index as a document-source error', () => {
    let error: unknown;
    service
      .documentsForOperator('chronos2_flow_forecast')
      .subscribe({ error: (value) => (error = value) });

    http.expectOne('/operator-docs/index.json').flush({ documents: null });

    expect(error).toBeInstanceOf(Error);
  });

  it('rejects traversal paths before issuing a Markdown request', () => {
    let error: unknown;
    service.documentsForOperator('chronos2_flow_forecast').subscribe({
      error: (value) => (error = value),
    });

    http.expectOne('/operator-docs/index.json').flush({
      documents: [
        {
          id: 'escape',
          title: 'Escape',
          version: '1.0.0',
          document_type: 'algorithm',
          status: 'published',
          locale: 'zh-CN',
          related_operators: ['chronos2_flow_forecast'],
          markdown_path: '../escape.md',
        },
      ],
    });

    expect(error).toBeInstanceOf(Error);
    http.expectNone((request) => request.url !== '/operator-docs/index.json');
  });

  it('rejects business API paths before issuing a Markdown request', () => {
    let error: unknown;
    service.documentsForOperator('chronos2_flow_forecast').subscribe({
      error: (value) => (error = value),
    });

    http.expectOne('/operator-docs/index.json').flush({
      documents: [
        {
          id: 'api-path',
          title: 'API path',
          version: '1.0.0',
          document_type: 'algorithm',
          status: 'published',
          locale: 'zh-CN',
          related_operators: ['chronos2_flow_forecast'],
          markdown_path: '/api/v1/algorithms/chronos2_flow_forecast/documents',
        },
      ],
    });

    expect(error).toBeInstanceOf(Error);
    http.expectNone((request) => request.url !== '/operator-docs/index.json');
  });
});
