import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  AssetSelection,
  FengtaiNetworkLayer,
  FengtaiTopology,
  FengtaiTopologyNode,
  FengtaiTopologyPipe,
} from './fengtai-leakage.models';

export type LeakageCameraMode = 'perspective' | 'top';

export interface LeakageSceneAsset {
  id: string;
  name: string;
  type: AssetSelection['type'];
  kind: 'node' | 'pipe';
  position: THREE.Vector3;
  source?: string;
  target?: string;
}

export interface LeakageNetworkSceneCallbacks {
  hover: (asset: LeakageSceneAsset | null, x: number, y: number) => void;
  select: (asset: LeakageSceneAsset) => void;
  clearSelection: () => void;
}

interface NodeBatch {
  mesh: THREE.InstancedMesh;
  assets: LeakageSceneAsset[];
}

interface ViewState {
  target: THREE.Vector3;
  distance: number;
}

/**
 * Three.js 管网场景内核。只管理渲染、相机、拾取索引和 GPU 资源，不感知 Angular
 * 页面状态，也不发起 API 请求。使用按需渲染而非永久动画循环。
 */
export class LeakageNetwork3dScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly batches: NodeBatch[] = [];
  private readonly assets = new Map<string, LeakageSceneAsset>();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly fallbackBounds = new THREE.Box3(
    new THREE.Vector3(-50, 0, -50),
    new THREE.Vector3(50, 20, 50),
  );
  private pipeMesh: THREE.LineSegments | null = null;
  private pipeAssets: LeakageSceneAsset[] = [];
  private selectionMarker: THREE.Mesh | THREE.LineSegments | null = null;
  private hoverMarker: THREE.Mesh | THREE.LineSegments | null = null;
  private sceneBounds = this.fallbackBounds.clone();
  private preferredView: ViewState = { target: new THREE.Vector3(), distance: 220 };
  private activeLayer: FengtaiNetworkLayer | null = null;
  private activeFrameValues: Record<string, number | null> = {};
  private lockedLayerCodes = new Set<string>();
  private selectedAsset: AssetSelection | null = null;
  private pointerDownPosition: { x: number; y: number } | null = null;

  readonly counts = { nodes: 0, pipes: 0 };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDownPosition = { x: event.clientX, y: event.clientY };
  };
  private readonly onPointerMove = (event: PointerEvent): void => this.handlePointer(event, false);
  private readonly onPointerClick = (event: PointerEvent): void => {
    const start = this.pointerDownPosition;
    this.pointerDownPosition = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    this.handlePointer(event, true);
  };
  private readonly onPointerLeave = (): void => {
    this.setHoverMarker(null);
    this.callbacks.hover(null, 0, 0);
  };
  private readonly onControlChange = (): void => this.render();

  constructor(
    private readonly host: HTMLDivElement,
    private readonly callbacks: LeakageNetworkSceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '交互式三维管网。可拖动旋转并滚轮缩放；也可使用页面中的资产搜索进行键盘选择。',
    );
    host.appendChild(this.renderer.domElement);

    this.camera.up.set(0, 1, 0);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.minPolarAngle = 0.03;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.addEventListener('change', this.onControlChange);

    this.scene.add(new THREE.HemisphereLight(0xdff7fb, 0x2d4854, 2.15));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.65);
    keyLight.position.set(100, 160, 90);
    this.scene.add(keyLight);

    this.raycaster.params.Line = { threshold: 2.3 };
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove, { passive: true });
    this.renderer.domElement.addEventListener('click', this.onPointerClick);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  setTopology(topology: FengtaiTopology | undefined): void {
    this.clearTopologyObjects();
    const nodes = topology?.nodes ?? [];
    const pipes = topology?.pipes ?? topology?.links ?? [];
    this.counts.nodes = nodes.length;
    this.counts.pipes = pipes.length;
    if (!nodes.length) {
      this.render();
      return;
    }

    const rawBounds = new THREE.Box3();
    for (const node of nodes) {
      rawBounds.expandByPoint(new THREE.Vector3(node.x, this.nodeElevation(node), node.y));
    }
    const rawCenter = rawBounds.getCenter(new THREE.Vector3());
    const minimumElevation = rawBounds.min.y;
    const positionById = new Map<string, THREE.Vector3>();
    const groupedNodes = new Map<AssetSelection['type'], LeakageSceneAsset[]>();

    for (const node of nodes) {
      const position = new THREE.Vector3(
        node.x - rawCenter.x,
        this.nodeElevation(node) - minimumElevation,
        -(node.y - rawCenter.z),
      );
      positionById.set(node.id, position);
      const asset: LeakageSceneAsset = {
        id: node.id,
        name: node.name ?? node.id,
        type: this.nodeAssetType(node),
        kind: 'node',
        position,
      };
      this.assets.set(this.assetKey(asset), asset);
      const group = groupedNodes.get(asset.type) ?? [];
      group.push(asset);
      groupedNodes.set(asset.type, group);
    }

    for (const [type, assets] of groupedNodes) this.createNodeBatch(type, assets);
    this.createPipeBatch(pipes, positionById);

    this.sceneBounds = new THREE.Box3();
    for (const position of positionById.values()) this.sceneBounds.expandByPoint(position);
    if (this.sceneBounds.isEmpty()) this.sceneBounds.copy(this.fallbackBounds);
    this.addGroundGrid(this.sceneBounds);
    this.calculatePreferredView();
    this.applyCamera('perspective');
    this.updateLayerColors();
    this.updateSelectionMarker();
  }

  setLayer(
    layer: FengtaiNetworkLayer | null,
    values: Record<string, number | null>,
    lockedLayerCodes: string[],
  ): void {
    this.activeLayer = layer;
    this.activeFrameValues = values;
    this.lockedLayerCodes = new Set(lockedLayerCodes);
    this.updateLayerColors();
  }

  setSelection(selection: AssetSelection | null): void {
    this.selectedAsset = selection;
    this.updateSelectionMarker();
  }

  setCameraMode(mode: LeakageCameraMode): void {
    this.applyCamera(mode);
  }

  resetCamera(mode: LeakageCameraMode): void {
    this.applyCamera(mode);
  }

  search(query: string): LeakageSceneAsset[] {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalized) return [];
    return [...this.assets.values()]
      .filter((asset) =>
        `${asset.name} ${asset.id}`.toLocaleLowerCase('zh-CN').includes(normalized),
      )
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      .slice(0, 8);
  }

  focus(asset: LeakageSceneAsset): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = THREE.MathUtils.clamp(offset.length(), 30, this.preferredView.distance);
    const direction = offset.lengthSq()
      ? offset.normalize()
      : new THREE.Vector3(1, 0.82, 1).normalize();
    this.controls.target.copy(asset.position);
    this.camera.position.copy(asset.position).add(direction.multiplyScalar(distance));
    this.controls.update();
    this.render();
  }

  dispose(): void {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('click', this.onPointerClick);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.onControlChange);
    this.controls.dispose();
    this.disposeSceneObjects();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }

  private createNodeBatch(type: AssetSelection['type'], assets: LeakageSceneAsset[]): void {
    const geometry = this.geometryForType(type);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.64,
      metalness: 0.05,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, assets.length);
    mesh.name = `network-${type}-batch`;
    mesh.userData['pickKind'] = 'node-batch';
    const matrix = new THREE.Matrix4();
    const scale = this.nodeScale(type);
    for (let index = 0; index < assets.length; index += 1) {
      matrix.compose(
        assets[index].position,
        new THREE.Quaternion(),
        new THREE.Vector3(scale, scale, scale),
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, this.nodeColor(assets[index]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    this.pickables.push(mesh);
    this.batches.push({ mesh, assets });
  }

  private createPipeBatch(
    pipes: FengtaiTopologyPipe[],
    positionById: Map<string, THREE.Vector3>,
  ): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const pipeAssets: LeakageSceneAsset[] = [];
    for (const pipe of pipes) {
      const source = positionById.get(pipe.source);
      const target = positionById.get(pipe.target);
      if (!source || !target) continue;
      const id = pipe.id ?? `${pipe.source}-${pipe.target}`;
      const asset: LeakageSceneAsset = {
        id,
        name: pipe.name ?? id,
        type: 'pipe',
        kind: 'pipe',
        position: source.clone().add(target).multiplyScalar(0.5),
        source: pipe.source,
        target: pipe.target,
      };
      pipeAssets.push(asset);
      this.assets.set(this.assetKey(asset), asset);
      positions.push(source.x, source.y, source.z, target.x, target.y, target.z);
      const color = this.pipeColor(asset);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    });
    this.pipeMesh = new THREE.LineSegments(geometry, material);
    this.pipeMesh.name = 'network-pipe-batch';
    this.pipeMesh.userData['pickKind'] = 'pipe-batch';
    this.pipeAssets = pipeAssets;
    this.scene.add(this.pipeMesh);
    this.pickables.push(this.pipeMesh);
  }

  private addGroundGrid(bounds: THREE.Box3): void {
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 40) * 1.32;
    const grid = new THREE.GridHelper(span, 24, 0x89aab4, 0xcbdde2);
    grid.name = 'network-ground-grid';
    grid.position.y = Math.min(0, bounds.min.y) - 0.25;
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.34;
    }
    this.scene.add(grid);
  }

  private calculatePreferredView(): void {
    const sphere = this.sceneBounds.getBoundingSphere(new THREE.Sphere());
    const target = sphere.center.clone();
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const fitFov = Math.max(0.1, Math.min(verticalFov, horizontalFov));
    const distance = Math.max(60, (sphere.radius / Math.sin(fitFov / 2)) * 1.18);
    this.preferredView = { target, distance };
    this.camera.near = Math.max(0.1, distance / 500);
    this.camera.far = Math.max(2500, distance * 12);
    this.camera.updateProjectionMatrix();
  }

  private applyCamera(mode: LeakageCameraMode): void {
    const { target, distance } = this.preferredView;
    this.camera.up.set(0, 1, 0);
    if (mode === 'top') {
      this.camera.position.copy(target).add(new THREE.Vector3(0, distance, 0.001));
      this.camera.up.set(0, 0, -1);
    } else {
      const direction = new THREE.Vector3(1, 0.82, 1).normalize();
      this.camera.position.copy(target).add(direction.multiplyScalar(distance));
    }
    this.controls.target.copy(target);
    this.controls.update();
    this.render();
  }

  private updateLayerColors(): void {
    for (const batch of this.batches) {
      for (let index = 0; index < batch.assets.length; index += 1) {
        batch.mesh.setColorAt(index, this.nodeColor(batch.assets[index]));
      }
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    if (this.pipeMesh) {
      const attribute = this.pipeMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let index = 0; index < this.pipeAssets.length; index += 1) {
        const color = this.pipeColor(this.pipeAssets[index]);
        attribute.setXYZ(index * 2, color.r, color.g, color.b);
        attribute.setXYZ(index * 2 + 1, color.r, color.g, color.b);
      }
      attribute.needsUpdate = true;
    }
    this.render();
  }

  private nodeColor(asset: LeakageSceneAsset): THREE.Color {
    const active = this.layerColor(asset);
    if (active) return active;
    switch (asset.type) {
      case 'valve':
        return new THREE.Color(0x0f8a83);
      case 'hydrant':
        return new THREE.Color(0xd74d4d);
      case 'meter':
        return new THREE.Color(0x2784b8);
      default:
        return new THREE.Color(0x3f6274);
    }
  }

  private pipeColor(asset: LeakageSceneAsset): THREE.Color {
    return this.layerColor(asset) ?? new THREE.Color(0x6b8997);
  }

  private layerColor(asset: LeakageSceneAsset): THREE.Color | null {
    const layer = this.activeLayer;
    if (!layer || this.lockedLayerCodes.has(layer.code) || !this.layerAppliesTo(asset)) return null;
    const value = this.activeFrameValues[asset.id];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return new THREE.Color(0x9aacb5);
    }
    const min = typeof layer.min === 'number' ? layer.min : value;
    const max = typeof layer.max === 'number' ? layer.max : value;
    const ratio = max > min ? THREE.MathUtils.clamp((value - min) / (max - min), 0, 1) : 0.5;
    if (ratio < 0.5) {
      return new THREE.Color(0x0f8a83).lerp(new THREE.Color(0xd99a17), ratio * 2);
    }
    return new THREE.Color(0xd99a17).lerp(new THREE.Color(0xd84a4a), (ratio - 0.5) * 2);
  }

  private layerAppliesTo(asset: LeakageSceneAsset): boolean {
    if (!this.activeLayer) return false;
    if (this.activeLayer.asset_type === 'pipe') return asset.kind === 'pipe';
    if (this.activeLayer.asset_type === 'valve') return asset.type === 'valve';
    return asset.kind === 'node';
  }

  private updateSelectionMarker(): void {
    const selection = this.selectedAsset;
    if (!selection) {
      this.setSelectionMarker(null);
      return;
    }
    const kind = selection.type === 'pipe' ? 'pipe' : 'node';
    this.setSelectionMarker(this.assets.get(`${kind}:${selection.id}`) ?? null);
  }

  private setSelectionMarker(asset: LeakageSceneAsset | null): void {
    this.replaceMarker('selection', asset, 0xf0a018);
  }

  private setHoverMarker(asset: LeakageSceneAsset | null): void {
    if (asset?.id === this.selectedAsset?.id) {
      this.replaceMarker('hover', null, 0x3ba7ca);
      return;
    }
    this.replaceMarker('hover', asset, 0x3ba7ca);
  }

  private replaceMarker(
    kind: 'selection' | 'hover',
    asset: LeakageSceneAsset | null,
    color: number,
  ): void {
    const current = kind === 'selection' ? this.selectionMarker : this.hoverMarker;
    if (current) {
      this.scene.remove(current);
      this.disposeRenderable(current);
    }
    const marker = asset ? this.createMarker(asset, color) : null;
    if (kind === 'selection') this.selectionMarker = marker;
    else this.hoverMarker = marker;
    if (marker) this.scene.add(marker);
    this.render();
  }

  private createMarker(asset: LeakageSceneAsset, color: number): THREE.Mesh | THREE.LineSegments {
    if (asset.kind === 'pipe') {
      const source = this.findNodePosition(asset.source) ?? asset.position;
      const target = this.findNodePosition(asset.target) ?? asset.position;
      const marker = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([source, target]),
        new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 1 }),
      );
      marker.renderOrder = 20;
      return marker;
    }
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(this.nodeScale(asset.type) * 1.75, 12, 8),
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        depthTest: false,
        transparent: true,
        opacity: 0.96,
      }),
    );
    marker.position.copy(asset.position);
    marker.renderOrder = 20;
    return marker;
  }

  private findNodePosition(id: string | undefined): THREE.Vector3 | null {
    return id ? (this.assets.get(`node:${id}`)?.position ?? null) : null;
  }

  private handlePointer(event: PointerEvent, activate: boolean): void {
    if (!this.pickables.length) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const asset = this.assetFromIntersection(
      this.raycaster.intersectObjects(this.pickables, false)[0],
    );
    if (activate) {
      if (asset) this.callbacks.select(asset);
      else this.callbacks.clearSelection();
      return;
    }
    this.setHoverMarker(asset);
    this.renderer.domElement.style.cursor = asset ? 'pointer' : 'grab';
    this.callbacks.hover(asset, event.clientX - bounds.left, event.clientY - bounds.top);
  }

  private assetFromIntersection(
    intersection: THREE.Intersection | undefined,
  ): LeakageSceneAsset | null {
    if (!intersection) return null;
    const pickKind = intersection.object.userData['pickKind'];
    if (pickKind === 'node-batch' && intersection.instanceId !== undefined) {
      return (
        this.batches.find((batch) => batch.mesh === intersection.object)?.assets[
          intersection.instanceId
        ] ?? null
      );
    }
    if (pickKind === 'pipe-batch' && intersection.index !== undefined) {
      return this.pipeAssets[Math.floor(intersection.index / 2)] ?? null;
    }
    return null;
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.calculatePreferredView();
    this.render();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private clearTopologyObjects(): void {
    const objects: THREE.Object3D[] = this.batches.map((batch) => batch.mesh);
    if (this.pipeMesh) objects.push(this.pipeMesh);
    const grid = this.scene.getObjectByName('network-ground-grid');
    if (grid) objects.push(grid);
    for (const object of objects) {
      this.scene.remove(object);
      this.disposeObject(object);
    }
    this.batches.length = 0;
    this.pickables.length = 0;
    this.assets.clear();
    this.pipeAssets = [];
    this.pipeMesh = null;
    this.setSelectionMarker(null);
    this.setHoverMarker(null);
  }

  private disposeSceneObjects(): void {
    this.clearTopologyObjects();
    for (const child of [...this.scene.children]) {
      this.scene.remove(child);
      this.disposeObject(child);
    }
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => this.disposeRenderable(child));
  }

  private disposeRenderable(object: THREE.Object3D): void {
    const renderable = object as THREE.Mesh;
    renderable.geometry?.dispose();
    if (!renderable.material) return;
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    materials.forEach((material) => material.dispose());
  }

  private geometryForType(type: AssetSelection['type']): THREE.BufferGeometry {
    switch (type) {
      case 'valve':
        return new THREE.OctahedronGeometry(1, 0);
      case 'hydrant':
        return new THREE.ConeGeometry(0.82, 1.8, 6);
      case 'meter':
        return new THREE.BoxGeometry(1.35, 1.35, 1.35);
      default:
        return new THREE.SphereGeometry(1, 8, 6);
    }
  }

  private nodeScale(type: AssetSelection['type']): number {
    return type === 'valve' || type === 'hydrant' ? 1.6 : type === 'meter' ? 1.35 : 1.05;
  }

  private nodeAssetType(node: FengtaiTopologyNode): AssetSelection['type'] {
    return node.type === 'valve' || node.type === 'hydrant' || node.type === 'meter'
      ? node.type
      : 'node';
  }

  private nodeElevation(node: FengtaiTopologyNode): number {
    for (const key of ['elevation', 'elevation_m', 'z']) {
      const value = node[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  private assetKey(asset: LeakageSceneAsset): string {
    return `${asset.kind}:${asset.id}`;
  }
}
