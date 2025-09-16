import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

// --- 配置常量 ---
const CENTER_GAP_PIXELS = 32; // 中心空隙大小 (单边)
const DASH_ZONE_PIXELS = 128; // 从中心点到虚线末端的距离
const HOT_ZONE_PADDING = 10; // 虚线抓手的像素范围 (单边)
const LINE_WIDTH = 2;

// 定义每个视图的配置信息
type ViewConfig = {
  element: HTMLElement;
  name: 'Axial' | 'Coronal' | 'Sagittal';
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  uiScene: THREE.Scene;
  uiCamera: THREE.OrthographicCamera;
  // 实线部分被拆分为独立的线段
  horizontalSolidLeft: Line2;
  horizontalSolidRight: Line2;
  verticalSolidTop: Line2;
  verticalSolidBottom: Line2;
  horizontalDashedLeft: Line2;
  horizontalDashedRight: Line2;
  verticalDashedTop: Line2;
  verticalDashedBottom: Line2;
  // 对应的热区线
  horizontalSolidLeftHitbox: Line2;
  horizontalSolidRightHitbox: Line2;
  verticalSolidTopHitbox: Line2;
  verticalSolidBottomHitbox: Line2;
  horizontalDashedLeftHitbox: Line2;
  horizontalDashedRightHitbox: Line2;
  verticalDashedTopHitbox: Line2;
  verticalDashedBottomHitbox: Line2;
};

class LinkedCrosshairsApp {
  private views: ViewConfig[] = [];
  // 核心状态变更为一个4x4矩阵
  private mprMatrix = new THREE.Matrix4();
  private rotationAngle = 0; // 新增：存储十字线的旋转角度 (弧度)
  private raycaster = new THREE.Raycaster(); // 新增 Raycaster 实例
  private isDragging = false;
  private dragMode: 'center' | 'horizontal' | 'vertical' | 'rotate' = 'center'; // 新增 'rotate'
  private startDragAngle = 0; // 新增：开始拖拽时鼠标与中心的角度
  private startRotation = 0; // 新增：开始拖拽时十字线的角度
  private lastMousePosition = new THREE.Vector2(); // 新增：用于计算拖拽增量

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
      Axial: new THREE.Color(0x3f87f5), // 蓝色
      Coronal: new THREE.Color(0x26d070), // 绿色
      Sagittal: new THREE.Color(0xf7a927), // 黄色
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

      // --- 创建材质 ---
      // 可见线材质
      let hMat: LineMaterial, vMat: LineMaterial;

      switch (config.name) {
        case 'Axial':
          hMat = new LineMaterial({ color: colors.Coronal, linewidth: LINE_WIDTH, dashed: false });
          vMat = new LineMaterial({ color: colors.Sagittal, linewidth: LINE_WIDTH, dashed: false });
          break;
        case 'Coronal':
          hMat = new LineMaterial({ color: colors.Axial, linewidth: LINE_WIDTH, dashed: false });
          vMat = new LineMaterial({ color: colors.Sagittal, linewidth: LINE_WIDTH, dashed: false });
          break;
        case 'Sagittal':
          hMat = new LineMaterial({ color: colors.Axial, linewidth: LINE_WIDTH, dashed: false });
          vMat = new LineMaterial({ color: colors.Coronal, linewidth: LINE_WIDTH, dashed: false });
          break;
      }
      hMat.resolution.set(element.clientWidth, element.clientHeight);
      vMat.resolution.set(element.clientWidth, element.clientHeight);

      const hMatDashed = hMat.clone();
      hMatDashed.dashed = true;
      hMatDashed.dashSize = 4;
      hMatDashed.gapSize = 4;

      const vMatDashed = vMat.clone();
      vMatDashed.dashed = true;
      vMatDashed.dashSize = 4;
      vMatDashed.gapSize = 4;

      // 热区线材质 (半透明、红色、更宽，用于调试)
      const hitboxMaterial = new LineMaterial({
        linewidth: HOT_ZONE_PADDING * 2,
        transparent: true,
        opacity: 0.5, // 暂时设为半透明以便观察
        color: 0xff0000, // 暂时设为红色以便观察
        dashed: false,
      });
      hitboxMaterial.resolution.set(element.clientWidth, element.clientHeight);

      // --- 创建几何体与线对象 ---
      // 为每条线创建一个 LineGeometry
      const geometries = {
        horizontalSolidLeft: new LineGeometry(),
        horizontalSolidRight: new LineGeometry(),
        verticalSolidTop: new LineGeometry(),
        verticalSolidBottom: new LineGeometry(),
        horizontalDashedLeft: new LineGeometry(),
        horizontalDashedRight: new LineGeometry(),
        verticalDashedTop: new LineGeometry(),
        verticalDashedBottom: new LineGeometry(),
      };

      // 创建可见线
      const horizontalSolidLeft = new Line2(geometries.horizontalSolidLeft, hMat);
      const horizontalSolidRight = new Line2(geometries.horizontalSolidRight, hMat);
      const verticalSolidTop = new Line2(geometries.verticalSolidTop, vMat);
      const verticalSolidBottom = new Line2(geometries.verticalSolidBottom, vMat);
      const horizontalDashedLeft = new Line2(geometries.horizontalDashedLeft, hMatDashed);
      const horizontalDashedRight = new Line2(geometries.horizontalDashedRight, hMatDashed);
      const verticalDashedTop = new Line2(geometries.verticalDashedTop, vMatDashed);
      const verticalDashedBottom = new Line2(geometries.verticalDashedBottom, vMatDashed);

      // 创建热区线 (共享几何体)
      const horizontalSolidLeftHitbox = new Line2(geometries.horizontalSolidLeft, hitboxMaterial);
      const horizontalSolidRightHitbox = new Line2(geometries.horizontalSolidRight, hitboxMaterial);
      const verticalSolidTopHitbox = new Line2(geometries.verticalSolidTop, hitboxMaterial);
      const verticalSolidBottomHitbox = new Line2(geometries.verticalSolidBottom, hitboxMaterial);
      const horizontalDashedLeftHitbox = new Line2(geometries.horizontalDashedLeft, hitboxMaterial);
      const horizontalDashedRightHitbox = new Line2(geometries.horizontalDashedRight, hitboxMaterial);
      const verticalDashedTopHitbox = new Line2(geometries.verticalDashedTop, hitboxMaterial);
      const verticalDashedBottomHitbox = new Line2(geometries.verticalDashedBottom, hitboxMaterial);

      uiScene.add(
        // 可见线
        horizontalSolidLeft,
        horizontalSolidRight,
        verticalSolidTop,
        verticalSolidBottom,
        horizontalDashedLeft,
        horizontalDashedRight,
        verticalDashedTop,
        verticalDashedBottom,
        // 热区线
        horizontalSolidLeftHitbox,
        horizontalSolidRightHitbox,
        verticalSolidTopHitbox,
        verticalSolidBottomHitbox,
        horizontalDashedLeftHitbox,
        horizontalDashedRightHitbox,
        verticalDashedTopHitbox,
        verticalDashedBottomHitbox,
      );

      this.views.push({
        element,
        name: config.name,
        renderer,
        scene,
        camera,
        uiScene,
        uiCamera,
        // 可见线
        horizontalSolidLeft,
        horizontalSolidRight,
        verticalSolidTop,
        verticalSolidBottom,
        horizontalDashedLeft,
        horizontalDashedRight,
        verticalDashedTop,
        verticalDashedBottom,
        // 热区线
        horizontalSolidLeftHitbox,
        horizontalSolidRightHitbox,
        verticalSolidTopHitbox,
        verticalSolidBottomHitbox,
        horizontalDashedLeftHitbox,
        horizontalDashedRightHitbox,
        verticalDashedTopHitbox,
        verticalDashedBottomHitbox,
      });
    }
  }

  private attachEvents() {
    window.addEventListener('resize', this.handleResize.bind(this));

    // 全局监听 mouseup，确保在任何地方松开都能停止拖拽
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      // 鼠标抬起时，恢复grab相关的cursor状态
      this.views.forEach(view => {
        if (view.element.style.cursor === 'grabbing') {
          view.element.style.cursor = 'grab';
        }
      });
    });

    this.views.forEach(view => {
      // 鼠标按下时，开始拖拽并确定拖拽模式
      view.element.addEventListener('mousedown', e => {
        this.isDragging = true;
        this.dragMode = this.getDragMode(e, view);
        // console.log(this.dragMode);

        // 记录拖拽起始点
        this.lastMousePosition.set(e.clientX, e.clientY);

        if (this.dragMode === 'rotate') {
          const rect = view.element.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const centerPoint = this.getCenterPoint();
          let xPixel: number, yPixel: number;

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

          // 修正：使用正确的 atan2 参数，基于像素坐标计算初始角度
          this.startDragAngle = Math.atan2(mouseY - yPixel, mouseX - xPixel);
          this.startRotation = this.rotationAngle;
          view.element.style.cursor = 'grabbing';
        }

        // 只有在中心模式下，单击才会立即定位
        if (this.dragMode === 'center') {
          const rect = view.element.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const y = (e.clientY - rect.top) / rect.height;
          this.updateCenter(x, y, view.name);
          this.updateAllCrosshairs();
        }
      });

      // 鼠标移动时，根据情况更新十字线或鼠标样式
      view.element.addEventListener('mousemove', e => {
        if (this.isDragging) {
          this.updateDragState(e, view);
        } else {
          // 如果没在拖拽，就只更新鼠标样式
          const mode = this.getDragMode(e, view);
          switch (mode) {
            case 'horizontal':
            case 'vertical':
              view.element.style.cursor = 'pointer';
              break;
            case 'rotate':
              view.element.style.cursor = 'grab'; // 旋转
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
  private getDragMode(e: MouseEvent, view: ViewConfig): 'center' | 'horizontal' | 'vertical' | 'rotate' {
    const rect = view.element.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 1. 将鼠标位置转换为标准化设备坐标 (NDC)
    const mouseNDC = new THREE.Vector2();
    mouseNDC.x = (mouseX / rect.width) * 2 - 1;
    mouseNDC.y = -(mouseY / rect.height) * 2 + 1;

    // 2. 移除不再需要的 threshold 设置
    // this.raycaster.params.Line.threshold = HOT_ZONE_PADDING;

    // 3. 从 UI 相机发射射线
    this.raycaster.setFromCamera(mouseNDC, view.uiCamera);

    // 4. 获取所有需要检测的 *热区线*
    const linesToCheck = [
      view.horizontalSolidLeftHitbox,
      view.horizontalSolidRightHitbox,
      view.verticalSolidTopHitbox,
      view.verticalSolidBottomHitbox,
      view.horizontalDashedLeftHitbox,
      view.horizontalDashedRightHitbox,
      view.verticalDashedTopHitbox,
      view.verticalDashedBottomHitbox,
    ];

    // 5. 执行相交检测
    const intersects = this.raycaster.intersectObjects(linesToCheck);

    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;

      // 6. 根据相交的 *热区线* 判断模式
      switch (intersectedObject) {
        case view.horizontalDashedLeftHitbox:
        case view.horizontalDashedRightHitbox:
          return 'horizontal';
        case view.verticalDashedTopHitbox:
        case view.verticalDashedBottomHitbox:
          return 'vertical';
        case view.horizontalSolidLeftHitbox:
        case view.horizontalSolidRightHitbox:
        case view.verticalSolidTopHitbox:
        case view.verticalSolidBottomHitbox:
          return 'rotate';
      }
    }

    return 'center';
  }

  // 根据拖拽来更新状态
  private updateDragState(e: MouseEvent, activeView: ViewConfig) {
    const rect = activeView.element.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.dragMode === 'rotate') {
      const centerPoint = this.getCenterPoint();
      let xPixel: number, yPixel: number;

      switch (activeView.name) {
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

      // 修正：使用正确的 atan2 参数，基于像素坐标计算当前角度
      const currentAngle = Math.atan2(mouseY - yPixel, mouseX - xPixel);
      this.rotationAngle = this.startRotation - (currentAngle - this.startDragAngle);
    } else {
      // --- 统一处理所有位移拖拽 ---
      const deltaX = e.clientX - this.lastMousePosition.x; // 屏幕坐标，右为正
      const deltaY = e.clientY - this.lastMousePosition.y; // 屏幕坐标，下为正

      let dxPixels = 0;
      let dyPixels = 0;

      if (this.dragMode === 'center') {
        // 中心拖拽，直接使用屏幕坐标系的增量
        dxPixels = deltaX;
        dyPixels = deltaY;
      } else {
        // 水平/垂直拖拽：将增量投影到“线的法向方向”上，使拖拽总是沿着线的法向移动
        const angle = this.rotationAngle;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // 在像素坐标(y向下)下：
        // - 水平线方向向量 dH = (cos, -sin)，其法向 nH = (sin, cos)
        // - 垂直线方向向量 dV = (sin, cos)，其法向 nV = (cos, -sin)
        let nx = 0;
        let ny = 0;
        if (this.dragMode === 'horizontal') {
          nx = sin;
          ny = cos;
        } else if (this.dragMode === 'vertical') {
          nx = cos;
          ny = -sin;
        }
        // 投影到法向
        const proj = deltaX * nx + deltaY * ny; // 标量
        dxPixels = nx * proj;
        dyPixels = ny * proj;
      }

      const normalizedDeltaX = dxPixels / rect.width;
      const normalizedDeltaY = dyPixels / rect.height;
      this.updateByDelta(normalizedDeltaX, normalizedDeltaY, activeView.name);
    }

    this.lastMousePosition.set(e.clientX, e.clientY);
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

  // 新增：根据增量来更新中心点
  private updateByDelta(normalizedDeltaX: number, normalizedDeltaY: number, viewName: ViewConfig['name']) {
    const centerPoint = this.getCenterPoint();
    switch (viewName) {
      case 'Axial': // XY 平面
        centerPoint.x += normalizedDeltaX;
        centerPoint.y += normalizedDeltaY;
        break;
      case 'Coronal': // XZ 平面
        centerPoint.x += normalizedDeltaX;
        centerPoint.z += normalizedDeltaY;
        break;
      case 'Sagittal': // YZ 平面
        centerPoint.y += normalizedDeltaX;
        centerPoint.z += normalizedDeltaY;
        break;
    }
    this.mprMatrix.setPosition(centerPoint);
  }

  // 使用共享点来更新所有三个视图的十字线
  private updateAllCrosshairs() {
    const centerPoint = this.getCenterPoint();

    // 辅助函数：绕中心点旋转一个点
    const rotatePoint = (px: number, py: number, cx: number, cy: number, angle: number): [number, number] => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const npx = cx + (px - cx) * cos - (py - cy) * sin;
      const npy = cy + (px - cx) * sin + (py - cy) * cos;
      return [npx, npy];
    };

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

      // --- 核心改动：使用对角线长度确保线足够长 ---
      const diagonal = Math.sqrt(clientWidth ** 2 + clientHeight ** 2);

      // --- 定义未旋转时的线段端点 ---
      // 水平线
      const hLeft = xPixel - diagonal;
      const hRight = xPixel + diagonal;
      const hDashedLeftStart = xPixel - DASH_ZONE_PIXELS;
      const hDashedLeftEnd = xPixel - CENTER_GAP_PIXELS;
      const hDashedRightStart = xPixel + CENTER_GAP_PIXELS;
      const hDashedRightEnd = xPixel + DASH_ZONE_PIXELS;

      // 垂直线
      const vTop = correctedY + diagonal;
      const vBottom = correctedY - diagonal;
      const vDashedTopStart = correctedY + DASH_ZONE_PIXELS;
      const vDashedTopEnd = correctedY + CENTER_GAP_PIXELS;
      const vDashedBottomStart = correctedY - CENTER_GAP_PIXELS;
      const vDashedBottomEnd = correctedY - DASH_ZONE_PIXELS;

      // --- 对所有端点应用旋转 ---
      const p = (x: number, y: number) => rotatePoint(x, y, xPixel, correctedY, this.rotationAngle);

      const [hSolidLeftStart_x, hSolidLeftStart_y] = p(hLeft, correctedY);
      const [hSolidLeftEnd_x, hSolidLeftEnd_y] = p(hDashedLeftStart, correctedY);
      const [hSolidRightStart_x, hSolidRightStart_y] = p(hDashedRightEnd, correctedY);
      const [hSolidRightEnd_x, hSolidRightEnd_y] = p(hRight, correctedY);

      const [hDashedLeftStart_x, hDashedLeftStart_y] = p(hDashedLeftStart, correctedY);
      const [hDashedLeftEnd_x, hDashedLeftEnd_y] = p(hDashedLeftEnd, correctedY);
      const [hDashedRightStart_x, hDashedRightStart_y] = p(hDashedRightStart, correctedY);
      const [hDashedRightEnd_x, hDashedRightEnd_y] = p(hDashedRightEnd, correctedY);

      const [vSolidTopStart_x, vSolidTopStart_y] = p(xPixel, vTop);
      const [vSolidTopEnd_x, vSolidTopEnd_y] = p(xPixel, vDashedTopStart);
      const [vSolidBottomStart_x, vSolidBottomStart_y] = p(xPixel, vDashedBottomEnd);
      const [vSolidBottomEnd_x, vSolidBottomEnd_y] = p(xPixel, vBottom);

      const [vDashedTopStart_x, vDashedTopStart_y] = p(xPixel, vDashedTopStart);
      const [vDashedTopEnd_x, vDashedTopEnd_y] = p(xPixel, vDashedTopEnd);
      const [vDashedBottomStart_x, vDashedBottomStart_y] = p(xPixel, vDashedBottomStart);
      const [vDashedBottomEnd_x, vDashedBottomEnd_y] = p(xPixel, vDashedBottomEnd);

      // --- 更新水平线 ---
      const hSolidLeftGeom = view.horizontalSolidLeft.geometry as LineGeometry;
      const hSolidRightGeom = view.horizontalSolidRight.geometry as LineGeometry;
      const hDashedLeftGeom = view.horizontalDashedLeft.geometry as LineGeometry;
      const hDashedRightGeom = view.horizontalDashedRight.geometry as LineGeometry;

      // 左侧实线
      hSolidLeftGeom.setPositions([hSolidLeftStart_x, hSolidLeftStart_y, 0, hSolidLeftEnd_x, hSolidLeftEnd_y, 0]);

      // 右侧实线
      hSolidRightGeom.setPositions([hSolidRightStart_x, hSolidRightStart_y, 0, hSolidRightEnd_x, hSolidRightEnd_y, 0]);

      // 左侧虚线
      hDashedLeftGeom.setPositions([hDashedLeftStart_x, hDashedLeftStart_y, 0, hDashedLeftEnd_x, hDashedLeftEnd_y, 0]);

      // 右侧虚线
      hDashedRightGeom.setPositions([hDashedRightStart_x, hDashedRightStart_y, 0, hDashedRightEnd_x, hDashedRightEnd_y, 0]);

      view.horizontalSolidLeft.computeLineDistances();
      view.horizontalSolidRight.computeLineDistances();
      view.horizontalDashedLeft.computeLineDistances();
      view.horizontalDashedRight.computeLineDistances();

      // --- 更新垂直线 ---
      const vSolidTopGeom = view.verticalSolidTop.geometry as LineGeometry;
      const vSolidBottomGeom = view.verticalSolidBottom.geometry as LineGeometry;
      const vDashedTopGeom = view.verticalDashedTop.geometry as LineGeometry;
      const vDashedBottomGeom = view.verticalDashedBottom.geometry as LineGeometry;

      // 顶部实线
      vSolidTopGeom.setPositions([vSolidTopStart_x, vSolidTopStart_y, 0, vSolidTopEnd_x, vSolidTopEnd_y, 0]);

      // 底部实线
      vSolidBottomGeom.setPositions([vSolidBottomStart_x, vSolidBottomStart_y, 0, vSolidBottomEnd_x, vSolidBottomEnd_y, 0]);

      // 顶部虚线
      vDashedTopGeom.setPositions([vDashedTopStart_x, vDashedTopStart_y, 0, vDashedTopEnd_x, vDashedTopEnd_y, 0]);

      // 底部虚线
      vDashedBottomGeom.setPositions([vDashedBottomStart_x, vDashedBottomStart_y, 0, vDashedBottomEnd_x, vDashedBottomEnd_y, 0]);

      view.verticalSolidTop.computeLineDistances();
      view.verticalSolidBottom.computeLineDistances();
      view.verticalDashedTop.computeLineDistances();
      view.verticalDashedBottom.computeLineDistances();
    });
  }

  private handleResize() {
    this.views.forEach(view => {
      const {
        element,
        renderer,
        uiCamera,
        horizontalSolidLeft,
        horizontalSolidRight,
        verticalSolidTop,
        verticalSolidBottom,
        horizontalDashedLeft,
        horizontalDashedRight,
        verticalDashedTop,
        verticalDashedBottom,
        // 热区线也需要更新材质
        horizontalSolidLeftHitbox,
        horizontalSolidRightHitbox,
        verticalSolidTopHitbox,
        verticalSolidBottomHitbox,
        horizontalDashedLeftHitbox,
        horizontalDashedRightHitbox,
        verticalDashedTopHitbox,
        verticalDashedBottomHitbox,
      } = view;
      const { clientWidth, clientHeight } = element;

      renderer.setSize(clientWidth, clientHeight);
      uiCamera.left = 0;
      uiCamera.right = clientWidth;
      uiCamera.top = clientHeight;
      uiCamera.bottom = 0;
      uiCamera.updateProjectionMatrix();

      // 更新 LineMaterial 的 resolution
      const resolution = new THREE.Vector2(clientWidth, clientHeight);
      (horizontalSolidLeft.material as LineMaterial).resolution = resolution;
      (horizontalSolidRight.material as LineMaterial).resolution = resolution;
      (verticalSolidTop.material as LineMaterial).resolution = resolution;
      (verticalSolidBottom.material as LineMaterial).resolution = resolution;
      (horizontalDashedLeft.material as LineMaterial).resolution = resolution;
      (horizontalDashedRight.material as LineMaterial).resolution = resolution;
      (verticalDashedTop.material as LineMaterial).resolution = resolution;
      (verticalDashedBottom.material as LineMaterial).resolution = resolution;
      // 热区线的材质也需要更新 resolution
      (horizontalSolidLeftHitbox.material as LineMaterial).resolution = resolution;
      (horizontalSolidRightHitbox.material as LineMaterial).resolution = resolution;
      (verticalSolidTopHitbox.material as LineMaterial).resolution = resolution;
      (verticalSolidBottomHitbox.material as LineMaterial).resolution = resolution;
      (horizontalDashedLeftHitbox.material as LineMaterial).resolution = resolution;
      (horizontalDashedRightHitbox.material as LineMaterial).resolution = resolution;
      (verticalDashedTopHitbox.material as LineMaterial).resolution = resolution;
      (verticalDashedBottomHitbox.material as LineMaterial).resolution = resolution;
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
