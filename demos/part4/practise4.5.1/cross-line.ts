import type {
  WebGLRenderer as TWebGLRenderer,
  Scene as TScene,
  OrthographicCamera as TOrthographicCamera,
  Matrix4 as TMatrix4,
  Raycaster as TRaycaster,
  Vector3 as TVector3,
  Mesh as TMesh,
} from 'three';
import {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  Matrix4,
  Vector3,
  Vector2,
  Raycaster,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

type TCrossConfig = {
  name: 'Axial' | 'Sagittal' | 'Coronal';
  element: HTMLElement;
  matrix: TMatrix4;
  renderer: TWebGLRenderer;
  scene: TScene;
  camera: TOrthographicCamera;
  horizontalSolidLeft: Line2;
  horizontalSolidRight: Line2;
  verticalSolidTop: Line2;
  verticalSolidBottom: Line2;
  horizontalDashedLeft: Line2;
  horizontalDashedRight: Line2;
  verticalDashedTop: Line2;
  verticalDashedBottom: Line2;
  horizontalSolidLeftHitbox: Line2;
  horizontalSolidRightHitbox: Line2;
  verticalSolidTopHitbox: Line2;
  verticalSolidBottomHitbox: Line2;
  horizontalDashedLeftHitbox: Line2;
  horizontalDashedRightHitbox: Line2;
  verticalDashedTopHitbox: Line2;
  verticalDashedBottomHitbox: Line2;
  centerHitbox: TMesh;
};

type TDragMode = 'center' | 'horizontal' | 'vertical' | 'rotate' | 'none';

const COLORS = {
  AXIAL: '#3f87f5',
  CORONAL: '#26d070',
  SAGITTAL: '#f7a927',
} as const;

type TColors = (typeof COLORS)[keyof typeof COLORS];

const CENTER_GAP_SIZE = 32;
const DASH_ZONE_SIZE = 128;
const HOT_ZONE_PADDING = 8;
const LINE_WIDTH = 2;
const DASH_SIZE = 6;
const GAP_SIZE = 6;

class CrossLine {
  private axialElement: HTMLElement;
  private coronalElement: HTMLElement;
  private sagittalElement: HTMLElement;
  private crossConfigs: TCrossConfig[];
  private centerPoint: TVector3;
  private raycaster: TRaycaster;
  private isDragging: boolean;
  private dragMode: TDragMode;
  constructor(axialElement: HTMLElement, coronalElement: HTMLElement, sagittalElement: HTMLElement) {
    this.axialElement = axialElement;
    this.coronalElement = coronalElement;
    this.sagittalElement = sagittalElement;
    this.crossConfigs = [];
    this.centerPoint = new Vector3();
    this.raycaster = new Raycaster();
    this.isDragging = false;
    this.dragMode = 'center';
    this.init();
    this.attachEvent();
    this.animate();
  }
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.crossConfigs.forEach(config => {
      const { renderer, scene, camera } = config;
      // renderer.autoClear = false;
      // renderer.clear();
      // renderer.render(scene, camera);
      // renderer.clearDepth();
      renderer.render(scene, camera);
    });
  }
  attachEvent() {
    window.addEventListener('resize', this.handleResize.bind(this));
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      // 鼠标抬起时，恢复grab相关的cursor状态
      this.crossConfigs.forEach(config => {
        config.element.style.cursor = 'auto';
      });
    });
    this.crossConfigs.forEach(config => {
      // 鼠标按下时，开始拖拽并确定拖拽模式
      config.element.addEventListener('mousedown', e => {
        this.isDragging = true;
        this.dragMode = this.getDragMode(e, config);
        console.log(this.dragMode);
      });

      // 鼠标移动时，根据情况更新十字线或鼠标样式
      config.element.addEventListener('mousemove', e => {
        // if (this.isDragging) {
        //   this.updateDragState(e, view);
        // } else {
        const mode = this.getDragMode(e, config);
        switch (mode) {
          case 'horizontal':
          case 'vertical':
            config.element.style.cursor = 'pointer';
            break;
          case 'rotate':
            config.element.style.cursor = 'grab'; // 旋转
            break;
          case 'center':
            config.element.style.cursor = 'move';
            break;
          default:
            config.element.style.cursor = 'auto'; // 移动
            break;
          // }
        }
      });

      // 鼠标移出视图时，恢复默认鼠标样式
      config.element.addEventListener('mouseleave', () => {
        config.element.style.cursor = 'auto';
        this.isDragging = false;
      });
    });
  }
  private getDragMode(e: MouseEvent, view: TCrossConfig): 'center' | 'horizontal' | 'vertical' | 'rotate' | 'none' {
    const rect = view.element.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 1. 将鼠标位置转换为标准化设备坐标 (NDC)
    const mouseNDC = new Vector2();
    mouseNDC.x = (mouseX / rect.width) * 2 - 1;
    mouseNDC.y = -(mouseY / rect.height) * 2 + 1;

    // 2. 从 UI 相机发射射线
    this.raycaster.setFromCamera(mouseNDC, view.camera);

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
      view.centerHitbox,
    ];

    // 5. 执行相交检测
    const intersects = this.raycaster.intersectObjects(linesToCheck);

    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;

      // 6. 根据相交的 *热区线* 判断模式
      switch (intersectedObject) {
        case view.centerHitbox:
          return 'center';
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
        default:
          return 'none';
      }
    }
    return 'none';
  }
  handleResize() {
    this.crossConfigs.forEach(config => {
      const { element, renderer, camera, scene } = config;
      const { clientWidth, clientHeight } = element;
      // 1. 更新渲染器尺寸
      renderer.setSize(clientWidth, clientHeight);
      // 2. 更新相机视锥
      camera.left = 0;
      camera.right = clientWidth;
      camera.top = clientHeight;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
      // 3. 更新所有线条材质的分辨率
      scene.children.forEach(child => {
        if (child instanceof Line2) {
          const lineMaterial = child.material as LineMaterial;
          lineMaterial.resolution.set(clientWidth, clientHeight);
        }
      });
    });
    this.updateAllCrosshairs();
  }
  init() {
    this.initcrossConfigs();
    this.updateAllCrosshairs();
  }
  createLine(element: HTMLElement, color: TColors, dashed: boolean) {
    const lineGeometry = new LineGeometry();
    const lineMaterial = new LineMaterial({ color: color, linewidth: LINE_WIDTH, dashed: false });
    lineMaterial.resolution.set(element.clientWidth, element.clientHeight);
    if (dashed) {
      lineMaterial.dashed = true;
      lineMaterial.dashSize = DASH_SIZE;
      lineMaterial.gapSize = GAP_SIZE;
    }
    const line = new Line2(lineGeometry, lineMaterial);
    return line;
  }
  createHitboxLine(element: HTMLElement) {
    const lineGeometry = new LineGeometry();
    const hitboxMaterial = new LineMaterial({
      linewidth: HOT_ZONE_PADDING * 2,
      transparent: true,
      opacity: 0.5, // 暂时设为半透明以便观察
      color: 0xff0000, // 暂时设为红色以便观察
      dashed: false,
    });
    hitboxMaterial.resolution.set(element.clientWidth, element.clientHeight);
    const lineHitbox = new Line2(lineGeometry, hitboxMaterial);
    return lineHitbox;
  }
  createConfig(element: HTMLElement, name: 'Axial' | 'Sagittal' | 'Coronal') {
    let horizontalColor: TColors = COLORS.CORONAL;
    let verticalColor: TColors = COLORS.SAGITTAL;
    if (name === 'Coronal') {
      horizontalColor = COLORS.AXIAL;
      verticalColor = COLORS.SAGITTAL;
    } else if (name === 'Sagittal') {
      horizontalColor = COLORS.AXIAL;
      verticalColor = COLORS.CORONAL;
    }
    const { clientWidth, clientHeight } = element;
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(clientWidth, clientHeight);
    element.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new OrthographicCamera(0, clientWidth, clientHeight, 0, 0.1, 1);
    camera.position.z = 1;
    const horizontalSolidLeft = this.createLine(element, horizontalColor, false);
    const horizontalSolidRight = this.createLine(element, horizontalColor, false);
    const verticalSolidTop = this.createLine(element, verticalColor, false);
    const verticalSolidBottom = this.createLine(element, verticalColor, false);
    const horizontalDashedLeft = this.createLine(element, horizontalColor, true);
    const horizontalDashedRight = this.createLine(element, horizontalColor, true);
    const verticalDashedTop = this.createLine(element, verticalColor, true);
    const verticalDashedBottom = this.createLine(element, verticalColor, true);

    const horizontalSolidLeftHitbox = this.createHitboxLine(element);
    const horizontalSolidRightHitbox = this.createHitboxLine(element);
    const verticalSolidTopHitbox = this.createHitboxLine(element);
    const verticalSolidBottomHitbox = this.createHitboxLine(element);
    const horizontalDashedLeftHitbox = this.createHitboxLine(element);
    const horizontalDashedRightHitbox = this.createHitboxLine(element);
    const verticalDashedTopHitbox = this.createHitboxLine(element);
    const verticalDashedBottomHitbox = this.createHitboxLine(element);

    const centerHitboxGeometry = new PlaneGeometry(CENTER_GAP_SIZE * 2, CENTER_GAP_SIZE * 2);
    const centerHitboxMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.5, color: 0xff0000 });
    const centerHitbox = new Mesh(centerHitboxGeometry, centerHitboxMaterial);

    scene.add(
      horizontalSolidLeft,
      horizontalSolidRight,
      verticalSolidTop,
      verticalSolidBottom,
      horizontalDashedLeft,
      horizontalDashedRight,
      verticalDashedTop,
      verticalDashedBottom,
      horizontalSolidLeftHitbox,
      horizontalSolidRightHitbox,
      verticalSolidTopHitbox,
      verticalSolidBottomHitbox,
      horizontalDashedLeftHitbox,
      horizontalDashedRightHitbox,
      verticalDashedTopHitbox,
      verticalDashedBottomHitbox,
      centerHitbox,
    );
    const config: TCrossConfig = {
      name,
      element,
      matrix: new Matrix4().setPosition(0.5, 0.5, 0.5),
      renderer: renderer,
      scene: scene,
      camera: camera,
      horizontalSolidLeft,
      horizontalSolidRight,
      verticalSolidTop,
      verticalSolidBottom,
      horizontalDashedLeft,
      horizontalDashedRight,
      verticalDashedTop,
      verticalDashedBottom,
      horizontalSolidLeftHitbox,
      horizontalSolidRightHitbox,
      verticalSolidTopHitbox,
      verticalSolidBottomHitbox,
      horizontalDashedLeftHitbox,
      horizontalDashedRightHitbox,
      verticalDashedTopHitbox,
      verticalDashedBottomHitbox,
      centerHitbox,
    };

    return config;
  }
  initcrossConfigs() {
    const axialConfig = this.createConfig(this.axialElement, 'Axial');
    const coronalConfig = this.createConfig(this.coronalElement, 'Coronal');
    const sagittalConfig = this.createConfig(this.sagittalElement, 'Sagittal');
    this.crossConfigs.push(axialConfig, coronalConfig, sagittalConfig);
  }
  rotatePoint(x: number, y: number, cx: number, cy: number, radian: number) {
    const cos = Math.cos(radian);
    const sin = Math.sin(radian);
    const npx = cx + (x - cx) * cos - (y - cy) * sin;
    const npy = cy + (x - cx) * sin + (y - cy) * cos;
    return [npx, npy];
  }
  updateAllCrosshairs() {
    this.crossConfigs.forEach(config => {
      const { element, matrix } = config;
      const { clientWidth, clientHeight } = element;
      const centerPoint = this.centerPoint.setFromMatrixPosition(matrix);

      let xPixel: number, yPixel: number;
      // 根据视图类型，从 sharedPoint 映射到像素坐标
      switch (config.name) {
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

      const correctedY = clientHeight - yPixel;

      const diagonal = Math.sqrt(clientWidth ** 2 + clientHeight ** 2);

      const hLeft = xPixel - diagonal;
      const hRight = xPixel + diagonal;
      const hDashedLeftStart = xPixel - DASH_ZONE_SIZE;
      const hDashedLeftEnd = xPixel - CENTER_GAP_SIZE;
      const hDashedRightStart = xPixel + CENTER_GAP_SIZE;
      const hDashedRightEnd = xPixel + DASH_ZONE_SIZE;

      const vTop = correctedY + diagonal;
      const vBottom = correctedY - diagonal;
      const vDashedTopStart = correctedY + DASH_ZONE_SIZE;
      const vDashedTopEnd = correctedY + CENTER_GAP_SIZE;
      const vDashedBottomStart = correctedY - CENTER_GAP_SIZE;
      const vDashedBottomEnd = correctedY - DASH_ZONE_SIZE;

      const p = (x: number, y: number) => this.rotatePoint(x, y, xPixel, correctedY, 0);

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

      const hSolidLeftGeom = config.horizontalSolidLeft.geometry as LineGeometry;
      const hSolidRightGeom = config.horizontalSolidRight.geometry as LineGeometry;
      const hDashedLeftGeom = config.horizontalDashedLeft.geometry as LineGeometry;
      const hDashedRightGeom = config.horizontalDashedRight.geometry as LineGeometry;
      const vSolidTopGeom = config.verticalSolidTop.geometry as LineGeometry;
      const vSolidBottomGeom = config.verticalSolidBottom.geometry as LineGeometry;
      const vDashedTopGeom = config.verticalDashedTop.geometry as LineGeometry;
      const vDashedBottomGeom = config.verticalDashedBottom.geometry as LineGeometry;

      hSolidLeftGeom.setPositions([hSolidLeftStart_x, hSolidLeftStart_y, 0, hSolidLeftEnd_x, hSolidLeftEnd_y, 0]);
      hSolidRightGeom.setPositions([hSolidRightStart_x, hSolidRightStart_y, 0, hSolidRightEnd_x, hSolidRightEnd_y, 0]);
      hDashedLeftGeom.setPositions([hDashedLeftStart_x, hDashedLeftStart_y, 0, hDashedLeftEnd_x, hDashedLeftEnd_y, 0]);
      hDashedRightGeom.setPositions([hDashedRightStart_x, hDashedRightStart_y, 0, hDashedRightEnd_x, hDashedRightEnd_y, 0]);
      vSolidTopGeom.setPositions([vSolidTopStart_x, vSolidTopStart_y, 0, vSolidTopEnd_x, vSolidTopEnd_y, 0]);
      vSolidBottomGeom.setPositions([vSolidBottomStart_x, vSolidBottomStart_y, 0, vSolidBottomEnd_x, vSolidBottomEnd_y, 0]);
      vDashedTopGeom.setPositions([vDashedTopStart_x, vDashedTopStart_y, 0, vDashedTopEnd_x, vDashedTopEnd_y, 0]);
      vDashedBottomGeom.setPositions([vDashedBottomStart_x, vDashedBottomStart_y, 0, vDashedBottomEnd_x, vDashedBottomEnd_y, 0]);

      config.horizontalSolidLeft.computeLineDistances();
      config.horizontalSolidRight.computeLineDistances();
      config.horizontalDashedLeft.computeLineDistances();
      config.horizontalDashedRight.computeLineDistances();
      config.verticalSolidTop.computeLineDistances();
      config.verticalSolidBottom.computeLineDistances();
      config.verticalDashedTop.computeLineDistances();
      config.verticalDashedBottom.computeLineDistances();

      const hSolidLeftHitboxGeom = config.horizontalSolidLeftHitbox.geometry as LineGeometry;
      const hSolidRightHitboxGeom = config.horizontalSolidRightHitbox.geometry as LineGeometry;
      const vSolidTopHitboxGeom = config.verticalSolidTopHitbox.geometry as LineGeometry;
      const vSolidBottomHitboxGeom = config.verticalSolidBottomHitbox.geometry as LineGeometry;
      const hDashedLeftHitboxGeom = config.horizontalDashedLeftHitbox.geometry as LineGeometry;
      const hDashedRightHitboxGeom = config.horizontalDashedRightHitbox.geometry as LineGeometry;
      const vDashedTopHitboxGeom = config.verticalDashedTopHitbox.geometry as LineGeometry;
      const vDashedBottomHitboxGeom = config.verticalDashedBottomHitbox.geometry as LineGeometry;

      hSolidLeftHitboxGeom.setPositions([hSolidLeftStart_x, hSolidLeftStart_y, 0, hSolidLeftEnd_x, hSolidLeftEnd_y, 0]);
      hSolidRightHitboxGeom.setPositions([hSolidRightStart_x, hSolidRightStart_y, 0, hSolidRightEnd_x, hSolidRightEnd_y, 0]);
      vSolidTopHitboxGeom.setPositions([vSolidTopStart_x, vSolidTopStart_y, 0, vSolidTopEnd_x, vSolidTopEnd_y, 0]);
      vSolidBottomHitboxGeom.setPositions([vSolidBottomStart_x, vSolidBottomStart_y, 0, vSolidBottomEnd_x, vSolidBottomEnd_y, 0]);
      hDashedLeftHitboxGeom.setPositions([hDashedLeftStart_x, hDashedLeftStart_y, 0, hDashedLeftEnd_x, hDashedLeftEnd_y, 0]);
      hDashedRightHitboxGeom.setPositions([hDashedRightStart_x, hDashedRightStart_y, 0, hDashedRightEnd_x, hDashedRightEnd_y, 0]);
      vDashedTopHitboxGeom.setPositions([vDashedTopStart_x, vDashedTopStart_y, 0, vDashedTopEnd_x, vDashedTopEnd_y, 0]);
      vDashedBottomHitboxGeom.setPositions([
        vDashedBottomStart_x,
        vDashedBottomStart_y,
        0,
        vDashedBottomEnd_x,
        vDashedBottomEnd_y,
        0,
      ]);

      config.horizontalSolidLeftHitbox.computeLineDistances();
      config.horizontalSolidRightHitbox.computeLineDistances();
      config.verticalSolidTopHitbox.computeLineDistances();
      config.verticalSolidBottomHitbox.computeLineDistances();
      config.horizontalDashedLeftHitbox.computeLineDistances();
      config.horizontalDashedRightHitbox.computeLineDistances();
      config.verticalDashedTopHitbox.computeLineDistances();
      config.verticalDashedBottomHitbox.computeLineDistances();
      config.centerHitbox.position.set(xPixel, correctedY, 0);
    });
  }
}

export { CrossLine };
