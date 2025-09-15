import * as THREE from 'three';

// --- 配置常量 ---
const CENTER_GAP_PIXELS = 32; // 中心空隙大小 (单边)
const DASH_ZONE_PIXELS = 128; // 从中心点到虚线末端的距离
const HOT_ZONE_PADDING = 4; // 虚线抓手的像素范围 (单边)

// 定义每个视图的配置信息
type ViewConfig = {
  element: HTMLElement;
  name: 'Axial' | 'Coronal' | 'Sagittal';
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  uiScene: THREE.Scene;
  uiCamera: THREE.OrthographicCamera;
  horizontalSolid: THREE.LineSegments;
  horizontalDashed: THREE.LineSegments;
  verticalSolid: THREE.LineSegments;
  verticalDashed: THREE.LineSegments;
};

class LinkedCrosshairsApp {
  private views: ViewConfig[] = [];
  // 核心状态变更为一个4x4矩阵
  private mprMatrix = new THREE.Matrix4();
  private isDragging = false;
  private dragMode: 'center' | 'horizontal' | 'vertical' = 'center';

  constructor() {
    // 初始化矩阵，使其位置在中心点
    this.mprMatrix.setPosition(0.5, 0.5, 0.5);
    this.initViews();
    this.attachEvents();
    this.updateAllCrosshairs();
    this.animate();
  }

  // 辅助方法：从矩阵中获取中心点
  private getCenterPoint(): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(this.mprMatrix);
  }

  private initViews() {
    const viewConfigs: { name: 'Axial' | 'Coronal' | 'Sagittal'; id: string }[] = [
      { name: 'Axial', id: 'axial-view' },
      { name: 'Coronal', id: 'coronal-view' },
      { name: 'Sagittal', id: 'sagittal-view' },
    ];

    const colors = {
      Axial: new THREE.Color(0x00ff00), // 绿色
      Coronal: new THREE.Color(0x0000ff), // 蓝色
      Sagittal: new THREE.Color(0xffff00), // 黄色
    };

    for (const config of viewConfigs) {
      const element = document.getElementById(config.id) as HTMLElement;
      if (!element) continue;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(element.clientWidth, element.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setClearColor(0x000000);
      element.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;

      const uiScene = new THREE.Scene();
      const uiCamera = new THREE.OrthographicCamera(0, element.clientWidth, element.clientHeight, 0, 0.1, 10);
      uiCamera.position.z = 1;

      let hMatSolid: THREE.LineBasicMaterial,
        vMatSolid: THREE.LineBasicMaterial,
        hMatDashed: THREE.LineDashedMaterial,
        vMatDashed: THREE.LineDashedMaterial;

      switch (config.name) {
        case 'Axial':
          hMatSolid = new THREE.LineBasicMaterial({ color: colors.Coronal });
          vMatSolid = new THREE.LineBasicMaterial({ color: colors.Sagittal });
          hMatDashed = new THREE.LineDashedMaterial({ color: colors.Coronal, dashSize: 4, gapSize: 4 });
          vMatDashed = new THREE.LineDashedMaterial({ color: colors.Sagittal, dashSize: 4, gapSize: 4 });
          break;
        case 'Coronal':
          hMatSolid = new THREE.LineBasicMaterial({ color: colors.Axial });
          vMatSolid = new THREE.LineBasicMaterial({ color: colors.Sagittal });
          hMatDashed = new THREE.LineDashedMaterial({ color: colors.Axial, dashSize: 4, gapSize: 4 });
          vMatDashed = new THREE.LineDashedMaterial({ color: colors.Sagittal, dashSize: 4, gapSize: 4 });
          break;
        case 'Sagittal':
          hMatSolid = new THREE.LineBasicMaterial({ color: colors.Axial });
          vMatSolid = new THREE.LineBasicMaterial({ color: colors.Coronal });
          hMatDashed = new THREE.LineDashedMaterial({ color: colors.Axial, dashSize: 4, gapSize: 4 });
          vMatDashed = new THREE.LineDashedMaterial({ color: colors.Coronal, dashSize: 4, gapSize: 4 });
          break;
      }

      // 每条线由4个点（2个线段）构成
      const hSolidGeom = new THREE.BufferGeometry();
      hSolidGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const horizontalSolid = new THREE.LineSegments(hSolidGeom, hMatSolid);

      const hDashedGeom = new THREE.BufferGeometry();
      hDashedGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const horizontalDashed = new THREE.LineSegments(hDashedGeom, hMatDashed);

      const vSolidGeom = new THREE.BufferGeometry();
      vSolidGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const verticalSolid = new THREE.LineSegments(vSolidGeom, vMatSolid);

      const vDashedGeom = new THREE.BufferGeometry();
      vDashedGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const verticalDashed = new THREE.LineSegments(vDashedGeom, vMatDashed);

      uiScene.add(horizontalSolid, horizontalDashed, verticalSolid, verticalDashed);

      this.views.push({
        element,
        name: config.name,
        renderer,
        scene,
        camera,
        uiScene,
        uiCamera,
        horizontalSolid,
        horizontalDashed,
        verticalSolid,
        verticalDashed,
      });
    }
  }

  private attachEvents() {
    window.addEventListener('resize', this.handleResize.bind(this));

    // 全局监听 mouseup，确保在任何地方松开都能停止拖拽
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.views.forEach(view => {
      // 鼠标按下时，开始拖拽并确定拖拽模式
      view.element.addEventListener('mousedown', e => {
        this.isDragging = true;
        this.dragMode = this.getDragMode(e, view);
        // 按下时也立即更新一次，实现点击定位
        this.updateSharedPoint(e, view);
      });

      // 鼠标移动时，根据情况更新十字线或鼠标样式
      view.element.addEventListener('mousemove', e => {
        if (this.isDragging) {
          this.updateSharedPoint(e, view);
        } else {
          // 如果没在拖拽，就只更新鼠标样式
          const mode = this.getDragMode(e, view);
          switch (mode) {
            case 'horizontal':
              view.element.style.cursor = 'ns-resize'; // 上下拖拽
              break;
            case 'vertical':
              view.element.style.cursor = 'ew-resize'; // 左右拖拽
              break;
            default:
              view.element.style.cursor = 'move'; // 移动
              break;
          }
        }
      });

      // 鼠标移出视图时，恢复默认鼠标样式
      view.element.addEventListener('mouseleave', () => {
        view.element.style.cursor = 'default';
        this.isDragging = false;
      });
    });
  }

  // 根据鼠标位置，判断当前处于哪种拖拽模式
  private getDragMode(e: MouseEvent, view: ViewConfig): 'center' | 'horizontal' | 'vertical' {
    const rect = view.element.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const centerPoint = this.getCenterPoint();

    let xPixel: number, yPixel: number;

    // 获取当前视图十字线的中心像素坐标
    switch (view.name) {
      case 'Axial':
        xPixel = centerPoint.x * rect.width;
        yPixel = centerPoint.y * rect.height;
        break;
      case 'Coronal':
        xPixel = centerPoint.x * rect.width;
        yPixel = centerPoint.z * rect.height;
        break;
      case 'Sagittal':
        xPixel = centerPoint.y * rect.width;
        yPixel = centerPoint.z * rect.height;
        break;
    }

    const distToHorizontal = Math.abs(mouseY - yPixel);
    const distToVertical = Math.abs(mouseX - xPixel);

    // 检查是否在水平虚线热区
    // 条件：鼠标离水平线很近，且离垂直线有一定距离（在虚线范围内）
    if (distToHorizontal <= HOT_ZONE_PADDING && distToVertical >= CENTER_GAP_PIXELS && distToVertical <= DASH_ZONE_PIXELS) {
      return 'horizontal';
    }

    // 检查是否在垂直虚线热区
    // 条件：鼠标离垂直线很近，且离水平线有一定距离（在虚线范围内）
    if (distToVertical <= HOT_ZONE_PADDING && distToHorizontal >= CENTER_GAP_PIXELS && distToHorizontal <= DASH_ZONE_PIXELS) {
      return 'vertical';
    }

    return 'center';
  }

  // 根据在哪个视图中操作，来更新共享点
  private updateSharedPoint(e: MouseEvent, activeView: ViewConfig) {
    const rect = activeView.element.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // 根据当前的拖拽模式来更新共享点
    switch (this.dragMode) {
      case 'horizontal':
        this.updateHorizontal(y, activeView.name);
        break;
      case 'vertical':
        this.updateVertical(x, activeView.name);
        break;
      case 'center':
      default:
        this.updateCenter(x, y, activeView.name);
        break;
    }

    this.updateAllCrosshairs();
  }

  private updateCenter(x: number, y: number, viewName: ViewConfig['name']) {
    const centerPoint = this.getCenterPoint();
    switch (viewName) {
      case 'Axial': // XY 平面
        centerPoint.x = x;
        centerPoint.y = y;
        break;
      case 'Coronal': // XZ 平面
        centerPoint.x = x;
        centerPoint.z = y;
        break;
      case 'Sagittal': // YZ 平面
        centerPoint.y = x;
        centerPoint.z = y;
        break;
    }
    this.mprMatrix.setPosition(centerPoint);
  }
  private updateHorizontal(y: number, viewName: ViewConfig['name']) {
    const centerPoint = this.getCenterPoint();
    switch (viewName) {
      case 'Axial': // 移动 Y
        centerPoint.y = y;
        break;
      case 'Coronal': // 移动 Z
        centerPoint.z = y;
        break;
      case 'Sagittal': // 移动 Z
        centerPoint.z = y;
        break;
    }
    this.mprMatrix.setPosition(centerPoint);
  }

  private updateVertical(x: number, viewName: ViewConfig['name']) {
    const centerPoint = this.getCenterPoint();
    switch (viewName) {
      case 'Axial': // 移动 X
        centerPoint.x = x;
        break;
      case 'Coronal': // 移动 X
        centerPoint.x = x;
        break;
      case 'Sagittal': // 移动 Y
        centerPoint.y = x;
        break;
    }
    this.mprMatrix.setPosition(centerPoint);
  }

  // 使用共享点来更新所有三个视图的十字线
  private updateAllCrosshairs() {
    const centerPoint = this.getCenterPoint();
    this.views.forEach(view => {
      const { clientWidth, clientHeight } = view.element;
      let xPixel: number, yPixel: number;

      // 根据视图类型，从 sharedPoint 映射到像素坐标
      switch (view.name) {
        case 'Axial':
          xPixel = centerPoint.x * clientWidth;
          yPixel = centerPoint.y * clientHeight;
          break;
        case 'Coronal':
          xPixel = centerPoint.x * clientWidth;
          yPixel = centerPoint.z * clientHeight;
          break;
        case 'Sagittal':
          xPixel = centerPoint.y * clientWidth;
          yPixel = centerPoint.z * clientHeight;
          break;
      }

      const correctedY = clientHeight - yPixel; // Y 轴翻转

      // --- 更新水平线 ---
      const hSolidPos = view.horizontalSolid.geometry.attributes.position as THREE.BufferAttribute;
      const hDashedPos = view.horizontalDashed.geometry.attributes.position as THREE.BufferAttribute;

      // 左侧实线
      hSolidPos.setXYZ(0, 0, correctedY, 0);
      hSolidPos.setXYZ(1, xPixel - DASH_ZONE_PIXELS, correctedY, 0);
      // 右侧实线
      hSolidPos.setXYZ(2, xPixel + DASH_ZONE_PIXELS, correctedY, 0);
      hSolidPos.setXYZ(3, clientWidth, correctedY, 0);

      // 左侧虚线
      hDashedPos.setXYZ(0, xPixel - DASH_ZONE_PIXELS, correctedY, 0);
      hDashedPos.setXYZ(1, xPixel - CENTER_GAP_PIXELS, correctedY, 0);
      // 右侧虚线
      hDashedPos.setXYZ(2, xPixel + CENTER_GAP_PIXELS, correctedY, 0);
      hDashedPos.setXYZ(3, xPixel + DASH_ZONE_PIXELS, correctedY, 0);

      view.horizontalSolid.geometry.computeBoundingSphere();
      view.horizontalDashed.computeLineDistances(); // 虚线需要计算
      hSolidPos.needsUpdate = true;
      hDashedPos.needsUpdate = true;

      // --- 更新垂直线 ---
      const vSolidPos = view.verticalSolid.geometry.attributes.position as THREE.BufferAttribute;
      const vDashedPos = view.verticalDashed.geometry.attributes.position as THREE.BufferAttribute;

      // 顶部实线
      vSolidPos.setXYZ(0, xPixel, clientHeight, 0);
      vSolidPos.setXYZ(1, xPixel, correctedY + DASH_ZONE_PIXELS, 0);
      // 底部实线
      vSolidPos.setXYZ(2, xPixel, correctedY - DASH_ZONE_PIXELS, 0);
      vSolidPos.setXYZ(3, xPixel, 0, 0);

      // 顶部虚线
      vDashedPos.setXYZ(0, xPixel, correctedY + DASH_ZONE_PIXELS, 0);
      vDashedPos.setXYZ(1, xPixel, correctedY + CENTER_GAP_PIXELS, 0);
      // 底部虚线
      vDashedPos.setXYZ(2, xPixel, correctedY - CENTER_GAP_PIXELS, 0);
      vDashedPos.setXYZ(3, xPixel, correctedY - DASH_ZONE_PIXELS, 0);

      view.verticalSolid.geometry.computeBoundingSphere();
      view.verticalDashed.computeLineDistances(); // 虚线需要计算
      vSolidPos.needsUpdate = true;
      vDashedPos.needsUpdate = true;
    });
  }

  private handleResize() {
    this.views.forEach(view => {
      const { element, renderer, uiCamera } = view;
      const { clientWidth, clientHeight } = element;

      renderer.setSize(clientWidth, clientHeight);
      uiCamera.left = 0;
      uiCamera.right = clientWidth;
      uiCamera.top = clientHeight;
      uiCamera.bottom = 0;
      uiCamera.updateProjectionMatrix();
    });
    this.updateAllCrosshairs();
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.views.forEach(view => {
      const { renderer, scene, camera, uiScene, uiCamera } = view;
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(uiScene, uiCamera);
    });
  }
}

new LinkedCrosshairsApp();
