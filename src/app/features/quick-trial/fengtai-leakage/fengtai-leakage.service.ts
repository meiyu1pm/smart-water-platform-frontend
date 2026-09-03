import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../../core/services/api-client.service';
import {
  FengtaiAnalysis,
  FengtaiAnalyzeRequest,
  FengtaiLeakageManifest,
  FengtaiNetworkFrames,
  FengtaiTopology,
  FengtaiRawTopologyResponse,
  FengtaiAssetDetail,
} from './fengtai-leakage.models';

@Injectable({ providedIn: 'root' })
export class FengtaiLeakageService {
  private readonly api = inject(ApiClient);
  private readonly basePath = '/api/v1/demos/fengtai-leakage';

  getManifest(): Observable<FengtaiLeakageManifest> {
    return this.api.get<FengtaiLeakageManifest>(`${this.basePath}/manifest`);
  }

  getTopology(): Observable<FengtaiTopology> {
    return this.api
      .get<FengtaiRawTopologyResponse>(`${this.basePath}/topology`)
      .pipe(map((response) => this.normalizeTopology(response)));
  }

  analyze(request: FengtaiAnalyzeRequest): Observable<FengtaiAnalysis> {
    return this.api.post<FengtaiAnalysis, FengtaiAnalyzeRequest>(
      `${this.basePath}/analyze`,
      request,
    );
  }

  getAssetDetail(
    analysisId: string,
    assetId: string,
    startDate: string,
    endDate: string,
    preset: string,
  ): Observable<FengtaiAssetDetail> {
    return this.api.get<FengtaiAssetDetail>(
      `${this.basePath}/analyses/${encodeURIComponent(analysisId)}/assets/${encodeURIComponent(assetId)}`,
      {
        start_date: startDate,
        end_date: endDate,
        preset,
      },
    );
  }

  getNetworkFrames(
    analysisId: string,
    startDate: string,
    endDate: string,
    preset: string,
  ): Observable<FengtaiNetworkFrames> {
    return this.api.get<FengtaiNetworkFrames>(
      `${this.basePath}/analyses/${encodeURIComponent(analysisId)}/frames`,
      {
        start_date: startDate,
        end_date: endDate,
        preset,
      },
    );
  }

  private normalizeTopology(response: FengtaiRawTopologyResponse): FengtaiTopology {
    const network = response.network ?? {};
    const nodes = [
      ...(network.nodes ?? []).map((node) => ({
        id: node.node_id,
        name: node.name ?? node.node_id,
        type: 'node',
        nodeType: node.node_type ?? '节点',
        x: node.x,
        y: node.y,
      })),
      ...(network.valves ?? []).map((valve) => ({
        id: valve.asset_id,
        name: valve.name ?? valve.asset_id,
        type: 'valve',
        x: valve.x,
        y: valve.y,
      })),
      ...(network.hydrants ?? []).map((hydrant) => ({
        id: hydrant.asset_id,
        name: hydrant.name ?? hydrant.asset_id,
        type: 'hydrant',
        x: hydrant.x,
        y: hydrant.y,
      })),
    ];
    return {
      nodes,
      pipes: (network.pipes ?? [])
        .filter((pipe) => !!pipe.start_node_id && !!pipe.end_node_id)
        .map((pipe) => ({
          id: pipe.pipe_id,
          name: pipe.name ?? pipe.pipe_id,
          source: pipe.start_node_id,
          target: pipe.end_node_id,
        })),
      geojson: response.geojson,
    };
  }
}
