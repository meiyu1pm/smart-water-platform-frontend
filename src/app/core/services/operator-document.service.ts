import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, defer, map, shareReplay } from 'rxjs';

export interface StaticOperatorDocument {
  id: string;
  title: string;
  version: string;
  document_type: string;
  status: string;
  locale: string;
  related_operators: string[];
  markdown_path: string;
  markdown?: string | null;
  markdownError?: boolean;
}

interface StaticOperatorDocsIndex {
  schema_version: string;
  source_commit: string;
  documents: Array<
    Omit<StaticOperatorDocument, 'markdown_path' | 'markdown' | 'markdownError'> & {
      markdown_path?: string;
      source_path?: string;
    }
  >;
}

@Injectable({ providedIn: 'root' })
export class StaticOperatorDocumentService {
  private readonly http = inject(HttpClient);
  private readonly index$ = defer(() =>
    this.http.get<StaticOperatorDocsIndex>('/operator-docs/index.json'),
  ).pipe(
    map((index) => this.normalizeIndex(index)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  documentsForOperator(operatorCode: string): Observable<StaticOperatorDocument[]> {
    return this.index$.pipe(
      map((documents) =>
        documents.filter((document) => document.related_operators.includes(operatorCode)),
      ),
    );
  }

  loadMarkdown(document: StaticOperatorDocument): Observable<string> {
    return this.http.get(document.markdown_path, { responseType: 'text' });
  }

  private normalizeIndex(index: StaticOperatorDocsIndex): StaticOperatorDocument[] {
    if (!index || !Array.isArray(index.documents)) {
      throw new Error('operator documentation index is invalid');
    }
    return index.documents.map((document) => {
      const rawPath = String(document.markdown_path || document.source_path || '').trim();
      if (!rawPath) throw new Error(`operator documentation ${document.id} has no Markdown path`);
      return {
        id: String(document.id),
        title: String(document.title),
        version: String(document.version),
        document_type: String(document.document_type || 'algorithm'),
        status: String(document.status || 'published'),
        locale: String(document.locale || 'zh-CN'),
        related_operators: Array.isArray(document.related_operators)
          ? document.related_operators.map(String)
          : [],
        markdown_path: this.publicPath(rawPath),
      };
    });
  }

  private publicPath(path: string): string {
    if (!path || path.includes('\\') || path.includes('?') || path.includes('#')) {
      throw new Error(`operator documentation path is unsafe: ${path}`);
    }
    if (path.includes('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) {
      throw new Error(`operator documentation path is unsafe: ${path}`);
    }
    let normalized = path.startsWith('/')
      ? path
      : `/operator-docs/${path.replace(/^operator-docs\//, '')}`;
    if (!normalized.startsWith('/operator-docs/')) {
      throw new Error(`operator documentation path is outside the static bundle: ${path}`);
    }
    try {
      if (decodeURIComponent(normalized) !== normalized) {
        throw new Error(`operator documentation path is not canonical: ${path}`);
      }
    } catch {
      throw new Error(`operator documentation path is not canonical: ${path}`);
    }
    const segments = normalized.slice('/operator-docs/'.length).split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error(`operator documentation path is unsafe: ${path}`);
    }
    return normalized;
  }
}
