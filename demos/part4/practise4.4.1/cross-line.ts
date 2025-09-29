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
  Euler,
  Group,
  Quaternion,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

type TCrossConfig = {
  name: 'Axial' | 'Sagittal' | 'Coronal';
  element: HTMLElement;
  totalCount: number;
  planePixelSize: Vector2;
  rect: DOMRect;
  dragStartMatrix: Matrix4;
  matrix: Matrix4;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  crosshairGroup: Group;
  horizontalSolidLeft: Line2;
  horizontalSolidRight: Line2;
  verticalSolidTop: Line2;
  verticalSolidBottom: Line2;
  horizontalDashedLeft: Line2;
  horizontalDashedRight: Line2;
  verticalDashedTop: Line2;
  verticalDashedBottom: Line2;
  horizontalDashedTop: Line2;
  horizontalDashedBottom: Line2;
  verticalDashedLeft: Line2;
  verticalDashedRight: Line2;
  horizontalSolidLeftHitbox: Line2;
  horizontalSolidRightHitbox: Line2;
  verticalSolidTopHitbox: Line2;
  verticalSolidBottomHitbox: Line2;
  horizontalDashedLeftHitbox: Line2;
  horizontalDashedRightHitbox: Line2;
  verticalDashedTopHitbox: Line2;
  verticalDashedBottomHitbox: Line2;
  horizontalDashedTopHitbox: Line2;
  horizontalDashedBottomHitbox: Line2;
  verticalDashedLeftHitbox: Line2;
  verticalDashedRightHitbox: Line2;
  horizontalHandleTopLeft: Mesh;
  horizontalHandleTopRight: Mesh;
  horizontalHandleBottomLeft: Mesh;
  horizontalHandleBottomRight: Mesh;
  verticalHandleLeftTop: Mesh;
  verticalHandleLeftBottom: Mesh;
  verticalHandleRightTop: Mesh;
  verticalHandleRightBottom: Mesh;
  horizontalHandleTopLeftHitbox: Mesh;
  horizontalHandleTopRightHitbox: Mesh;
  horizontalHandleBottomLeftHitbox: Mesh;
  horizontalHandleBottomRightHitbox: Mesh;
  verticalHandleLeftTopHitbox: Mesh;
  verticalHandleLeftBottomHitbox: Mesh;
  verticalHandleRightTopHitbox: Mesh;
  verticalHandleRightBottomHitbox: Mesh;
  centerHitbox: Mesh;
  horizontalRange: number;
  verticalRange: number;
};

type TDragMode = 'center' | 'horizontal' | 'vertical' | 'rotate' | 'none' | 'horizontalHandle' | 'verticalHandle';

const COLORS = {
  AXIAL: '#3f87f5',
  CORONAL: '#26d070',
  SAGITTAL: '#f7a927',
} as const;

type TColors = (typeof COLORS)[keyof typeof COLORS];

const CENTER_GAP_SIZE = 32;
const HANDLE_BOX_SIZE = 8;
const DASH_ZONE_SIZE = 128;
const HOT_ZONE_PADDING = 10;
const LINE_WIDTH = 2;
const DASH_SIZE = 6;
const GAP_SIZE = 6;
const DEBUGGER_OPACITY = 0.0;

export class CrossLine {
  private axialElement: HTMLElement;
  private coronalElement: HTMLElement;
  private sagittalElement: HTMLElement;
  crossConfigs: TCrossConfig[];
  private raycaster: Raycaster;
  private isDragging: boolean;
  private dragMode: TDragMode;
  private dragStartPosition: Vector2;
  private rotationCenter: Vector2 = new Vector2();
  onChange: (action: string, name: 'Axial' | 'Sagittal' | 'Coronal', value: any) => void;

  constructor(
    axialElement: HTMLElement,
    coronalElement: HTMLElement,
    sagittalElement: HTMLElement,
    onChange: (action: string, name: 'Axial' | 'Sagittal' | 'Coronal', value: any) => void,
  ) {
    this.axialElement = axialElement;
    this.coronalElement = coronalElement;
    this.sagittalElement = sagittalElement;
    this.crossConfigs = [];
    this.raycaster = new Raycaster();
    this.isDragging = false;
    this.dragMode = 'none';
    this.dragStartPosition = new Vector2();
    this.onChange = onChange;
    this.init();
    this.attachEvent();
    this.animate();
  }
  callback() {}
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.crossConfigs.forEach(config => {
      if (config.planePixelSize.x === 0 || config.planePixelSize.y === 0) return;
      const { renderer, scene, camera } = config;
      renderer.autoClear = false;
      // renderer.clear();
      // renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(scene, camera);
    });
  }

  attachEvent() {
    window.addEventListener('resize', this.handleResize.bind(this));
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.crossConfigs.forEach(config => {
        config.element.style.cursor = 'auto';
      });
    });
    this.crossConfigs.forEach(config => {
      config.element.addEventListener('mousedown', e => {
        this.dragMode = this.getDragMode(e, config);
        if (this.dragMode !== 'none') {
          this.isDragging = true;
          this.dragStartPosition.set(e.clientX, e.clientY);
          this.crossConfigs.forEach(config => {
            config.dragStartMatrix.copy(config.matrix);
          });

          if (this.dragMode === 'rotate') {
            const { rect } = config;
            const centerPoint = new Vector3().setFromMatrixPosition(config.dragStartMatrix);
            // 修正：将 three.js 的 Y 坐标（原点在下）转换成屏幕 Y 坐标（原点在上）
            const screenY = rect.top + (rect.height - centerPoint.y);
            this.rotationCenter.set(rect.left + centerPoint.x, screenY);
          }
        }
      });

      config.element.addEventListener('mousemove', e => {
        if (this.isDragging) {
          this.updateDragState(e, config);
        } else {
          const mode = this.getDragMode(e, config);
          switch (mode) {
            case 'horizontal':
            case 'vertical':
            case 'horizontalHandle':
            case 'verticalHandle':
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
          }
        }
      });

      config.element.addEventListener('mouseleave', () => {
        config.element.style.cursor = 'auto';
        this.isDragging = false;
      });
    });
  }
  updateDragState(e: MouseEvent, config: TCrossConfig) {
    if (this.dragMode === 'rotate') {
      const startVec = new Vector2().subVectors(this.dragStartPosition, this.rotationCenter);
      const currentVec = new Vector2(e.clientX, e.clientY).sub(this.rotationCenter);
      const rotationAngle = currentVec.angle() - startVec.angle();
      const rotationMatrix = new Matrix4().makeRotationZ(-rotationAngle);
      // 正确的顺序是 M_new = M_start * R_delta，这代表在本地坐标系下进行旋转。
      config.matrix.multiplyMatrices(config.dragStartMatrix, rotationMatrix);

      this.onChange('rotate', config.name, rotationAngle);
    } else {
      const mouseCurrent = new Vector2(e.clientX, e.clientY);
      const mouseDelta = new Vector2().subVectors(mouseCurrent, this.dragStartPosition);
      if (this.dragMode === 'horizontalHandle' || this.dragMode === 'verticalHandle') {
        this.syncRangeHandle(config, this.dragMode, mouseCurrent);
      } else {
        this.syncMatrix(config.name, this.dragMode, mouseDelta);
      }
    }
    this.updateAllCrosshairs();
  }
  /**
   * @description 获取在拖拽对象局部坐标系下的位移
   * @param config 我们正在操作的十字线的配置 (例如 axialConfig)，因为它包含了当前的旋转矩阵。
   * @param axis 我们关心的是这个十字线的哪个局部轴？'x' 对应垂直线, 'y' 对应水平线。
   * @param mouseDelta 鼠标在屏幕空间中的原始位移向量。
   * @returns 经过计算后，在局部轴上的有效位移量（一个数字）。
   */
  private getDragDeltaInLocalSpace(matrix: Matrix4, axis: 'x' | 'y', mouseDelta: Vector2) {
    const radian = new Euler().setFromRotationMatrix(matrix).z;
    const cos = Math.cos(radian);
    const sin = Math.sin(radian);

    let normalVector: Vector2;

    if (axis === 'x') {
      // (垂直线) 的法向量是局部 X 轴
      normalVector = new Vector2(cos, -sin);
    } else {
      // (水平线) 的法向量是局部 Y 轴
      normalVector = new Vector2(sin, cos);
    }

    // 投影到法向量上的差值
    return mouseDelta.dot(normalVector);
  }
  // 获取投影长度
  getTotalProjectedLength(matrix: Matrix4, axis: 'x' | 'y', planePixelSize: Vector2) {
    // 从矩阵中获取旋转角度 theta
    const theta = new Euler().setFromRotationMatrix(matrix).z;

    // 根据我们是拖动'vertical'线还是'horizontal'线，确定投影轴的角度 alpha
    let alpha;
    if (axis === 'x') {
      // 拖动垂直线，运动轴是局部X轴
      alpha = theta;
    } else {
      // 拖动水平线，运动轴是局部Y轴
      alpha = theta + Math.PI / 2; // Y轴比X轴超前90度
    }

    // 应用公式
    const w = planePixelSize.x;
    const h = planePixelSize.y;
    const totalLength = w * Math.abs(Math.cos(alpha)) + h * Math.abs(Math.sin(alpha));

    return totalLength;
  }
  // 根据比例转换位移
  convertDeltaByRatio(
    sourceConfig: TCrossConfig,
    targetConfig: TCrossConfig,
    sourceAxis: 'x' | 'y',
    targetAxis: 'x' | 'y',
    localDelta: number,
  ) {
    const sourceTotalLength = this.getTotalProjectedLength(sourceConfig.dragStartMatrix, sourceAxis, sourceConfig.planePixelSize);
    const targetTotalLength = this.getTotalProjectedLength(targetConfig.dragStartMatrix, targetAxis, targetConfig.planePixelSize);
    const deltaRatio = localDelta / sourceTotalLength;
    const targetPixelDelta = deltaRatio * targetTotalLength;
    return targetPixelDelta;
  }
  getRatio(sourceConfig: TCrossConfig, targetConfig: TCrossConfig, targetAxis: 'x' | 'y') {
    const targetTotalLength = this.getTotalProjectedLength(targetConfig.dragStartMatrix, targetAxis, targetConfig.planePixelSize);
    const ratio = sourceConfig.totalCount / targetTotalLength;
    return ratio;
  }
  // 应用局部位移
  applyLocalTranslation(config: TCrossConfig, axis: 'x' | 'y', distance: number) {
    const translationMatrix = this.translateOnLocalAxis(config.dragStartMatrix, axis, distance);
    config.matrix.multiplyMatrices(translationMatrix, config.dragStartMatrix);
  }
  syncRangeHandle(config: TCrossConfig, dragMode: TDragMode, mouseCurrent: Vector2) {
    const axialConfig = this.crossConfigs.find(c => c.name === 'Axial')!;
    const coronalConfig = this.crossConfigs.find(c => c.name === 'Coronal')!;
    const sagittalConfig = this.crossConfigs.find(c => c.name === 'Sagittal')!;
    const rangeValue = { x: -1, y: -1 };
    if (dragMode === 'horizontalHandle') {
      // 1. 获取十字线中心点视图坐标
      const center = new Vector3().setFromMatrixPosition(config.matrix);
      // 局部X轴（水平线方向）
      const localX = new Vector3().setFromMatrixColumn(config.matrix, 0).normalize();

      // 2. 计算水平线的法向量 (二维平面中, 若d=(dx, dy), 则法向量n=(-dy, dx))
      const normal = new Vector2(-localX.y, localX.x);

      // 3. 获取鼠标在视图DOM元素中的局部坐标 (原点在左下角，Y轴向上)
      const rect = config.rect;
      const mouseLocal = new Vector2(mouseCurrent.x - rect.left, rect.height - (mouseCurrent.y - rect.top));

      // 4. 计算从中心点到鼠标的向量
      const vecToMouse = new Vector2().subVectors(mouseLocal, new Vector2(center.x, center.y));

      // 5. 将该向量投影到法向量上，得到垂直距离
      const distance = Math.abs(vecToMouse.dot(normal));
      // 6. 更新厚度 (距离是厚度的一半)
      const range = distance * 2;
      config.horizontalRange = range;
      rangeValue.y = range;
    } else if (dragMode === 'verticalHandle') {
      const center = new Vector3().setFromMatrixPosition(config.matrix);
      const localY = new Vector3().setFromMatrixColumn(config.matrix, 1).normalize();
      const normal = new Vector2(-localY.y, localY.x);
      const rect = config.rect;
      const mouseLocal = new Vector2(mouseCurrent.x - rect.left, rect.height - (mouseCurrent.y - rect.top));
      const vecToMouse = new Vector2().subVectors(mouseLocal, new Vector2(center.x, center.y));
      const distance = Math.abs(vecToMouse.dot(normal));
      const range = distance * 2;
      config.verticalRange = range;
      rangeValue.x = range;
    }
    if (config.name === 'Coronal') {
      if (dragMode === 'horizontalHandle') {
        const targetRange1 = this.convertDeltaByRatio(coronalConfig, sagittalConfig, 'y', 'y', rangeValue.y);
        sagittalConfig.horizontalRange = targetRange1;
      } else if (dragMode === 'verticalHandle') {
        const targetRange2 = this.convertDeltaByRatio(coronalConfig, axialConfig, 'x', 'x', rangeValue.x);
        axialConfig.verticalRange = targetRange2;
      }
    } else if (config.name === 'Sagittal') {
      if (dragMode === 'horizontalHandle') {
        const targetRange1 = this.convertDeltaByRatio(sagittalConfig, coronalConfig, 'y', 'y', rangeValue.y);
        coronalConfig.horizontalRange = targetRange1;
      } else if (dragMode === 'verticalHandle') {
        const targetRange2 = this.convertDeltaByRatio(sagittalConfig, axialConfig, 'x', 'y', rangeValue.x);
        axialConfig.horizontalRange = targetRange2;
      }
    } else {
      if (dragMode === 'horizontalHandle') {
        const targetRange1 = this.convertDeltaByRatio(axialConfig, sagittalConfig, 'y', 'x', rangeValue.y);
        sagittalConfig.verticalRange = targetRange1;
      } else if (dragMode === 'verticalHandle') {
        const targetRange2 = this.convertDeltaByRatio(axialConfig, coronalConfig, 'x', 'x', rangeValue.x);
        coronalConfig.verticalRange = targetRange2;
      }
    }

    this.onChange('range', config.name, rangeValue);
  }
  syncMatrix(name: 'Axial' | 'Sagittal' | 'Coronal', dragMode: TDragMode, mouseDelta: Vector2) {
    const axialConfig = this.crossConfigs.find(c => c.name === 'Axial')!;
    const coronalConfig = this.crossConfigs.find(c => c.name === 'Coronal')!;
    const sagittalConfig = this.crossConfigs.find(c => c.name === 'Sagittal')!;
    switch (name) {
      case 'Axial':
        if (dragMode === 'center') {
          const translationMatrix = new Matrix4().makeTranslation(mouseDelta.x, -mouseDelta.y, 0);
          axialConfig.matrix.multiplyMatrices(translationMatrix, axialConfig.dragStartMatrix);
          const localDeltaY = this.getDragDeltaInLocalSpace(axialConfig.dragStartMatrix, 'y', mouseDelta);
          const targetPixelDeltaY = this.convertDeltaByRatio(axialConfig, sagittalConfig, 'y', 'x', localDeltaY);
          this.applyLocalTranslation(sagittalConfig, 'x', targetPixelDeltaY);
          const localDeltaX = this.getDragDeltaInLocalSpace(axialConfig.dragStartMatrix, 'x', mouseDelta);
          const targetPixelDeltaX = this.convertDeltaByRatio(axialConfig, coronalConfig, 'x', 'x', localDeltaX);
          this.applyLocalTranslation(coronalConfig, 'x', targetPixelDeltaX);
          const ratioX = this.getRatio(sagittalConfig, axialConfig, 'x');
          const ratioY = this.getRatio(coronalConfig, axialConfig, 'y');
          this.onChange('translate', 'Axial', { x: localDeltaX * ratioX, y: localDeltaY * ratioY });
        } else if (dragMode === 'horizontal') {
          const localDeltaY = this.getDragDeltaInLocalSpace(axialConfig.dragStartMatrix, 'y', mouseDelta);
          this.applyLocalTranslation(axialConfig, 'y', -localDeltaY);
          const targetPixelDeltaY = this.convertDeltaByRatio(axialConfig, sagittalConfig, 'y', 'x', localDeltaY);
          this.applyLocalTranslation(sagittalConfig, 'x', targetPixelDeltaY);
          const ratioY = this.getRatio(coronalConfig, axialConfig, 'y');
          this.onChange('translate', 'Axial', { x: 0, y: localDeltaY * ratioY });
        } else if (dragMode === 'vertical') {
          const localDeltaX = this.getDragDeltaInLocalSpace(axialConfig.dragStartMatrix, 'x', mouseDelta);
          this.applyLocalTranslation(axialConfig, 'x', localDeltaX);
          const targetPixelDeltaX = this.convertDeltaByRatio(axialConfig, coronalConfig, 'x', 'x', localDeltaX);
          this.applyLocalTranslation(coronalConfig, 'x', targetPixelDeltaX);
          const ratioX = this.getRatio(sagittalConfig, axialConfig, 'x');
          this.onChange('translate', 'Axial', { x: localDeltaX * ratioX, y: 0 });
        }

        break;
      case 'Coronal':
        if (dragMode === 'center') {
          const translationMatrix = new Matrix4().makeTranslation(mouseDelta.x, -mouseDelta.y, 0);
          coronalConfig.matrix.multiplyMatrices(translationMatrix, coronalConfig.dragStartMatrix);
          const localDeltaY = this.getDragDeltaInLocalSpace(coronalConfig.dragStartMatrix, 'y', mouseDelta);
          const targetPixelDeltaY = this.convertDeltaByRatio(coronalConfig, sagittalConfig, 'y', 'y', localDeltaY);
          this.applyLocalTranslation(sagittalConfig, 'y', -targetPixelDeltaY);
          const localDeltaX = this.getDragDeltaInLocalSpace(coronalConfig.dragStartMatrix, 'x', mouseDelta);
          const targetPixelDeltaX = this.convertDeltaByRatio(coronalConfig, axialConfig, 'x', 'x', localDeltaX);
          this.applyLocalTranslation(axialConfig, 'x', targetPixelDeltaX);
          const ratioX = this.getRatio(sagittalConfig, coronalConfig, 'x');
          const ratioY = this.getRatio(axialConfig, coronalConfig, 'y');
          this.onChange('translate', 'Coronal', { x: localDeltaX * ratioX, y: localDeltaY * ratioY });
        } else if (dragMode === 'horizontal') {
          const localDeltaY = this.getDragDeltaInLocalSpace(coronalConfig.dragStartMatrix, 'y', mouseDelta);
          this.applyLocalTranslation(coronalConfig, 'y', -localDeltaY);
          const targetPixelDeltaY = this.convertDeltaByRatio(coronalConfig, sagittalConfig, 'y', 'y', localDeltaY);
          this.applyLocalTranslation(sagittalConfig, 'y', -targetPixelDeltaY);
          const ratioY = this.getRatio(axialConfig, coronalConfig, 'y');
          this.onChange('translate', 'Coronal', { x: 0, y: localDeltaY * ratioY });
        } else if (dragMode === 'vertical') {
          const localDeltaX = this.getDragDeltaInLocalSpace(coronalConfig.dragStartMatrix, 'x', mouseDelta);
          this.applyLocalTranslation(coronalConfig, 'x', localDeltaX);
          const targetPixelDeltaX = this.convertDeltaByRatio(coronalConfig, axialConfig, 'x', 'x', localDeltaX);
          this.applyLocalTranslation(axialConfig, 'x', targetPixelDeltaX);
          const ratioX = this.getRatio(sagittalConfig, coronalConfig, 'x');
          this.onChange('translate', 'Coronal', { x: localDeltaX * ratioX, y: 0 });
        }
        break;
      case 'Sagittal':
        if (dragMode === 'center') {
          const translationMatrix = new Matrix4().makeTranslation(mouseDelta.x, -mouseDelta.y, 0);
          sagittalConfig.matrix.multiplyMatrices(translationMatrix, sagittalConfig.dragStartMatrix);
          const localDeltaY = this.getDragDeltaInLocalSpace(sagittalConfig.dragStartMatrix, 'y', mouseDelta);
          const targetPixelDeltaY = this.convertDeltaByRatio(sagittalConfig, coronalConfig, 'y', 'y', localDeltaY);
          this.applyLocalTranslation(coronalConfig, 'y', -targetPixelDeltaY);
          const localDeltaX = this.getDragDeltaInLocalSpace(sagittalConfig.dragStartMatrix, 'x', mouseDelta);
          const targetPixelDeltaX = this.convertDeltaByRatio(sagittalConfig, axialConfig, 'x', 'y', localDeltaX);
          this.applyLocalTranslation(axialConfig, 'y', -targetPixelDeltaX);
          const ratioX = this.getRatio(coronalConfig, sagittalConfig, 'x');
          const ratioY = this.getRatio(axialConfig, sagittalConfig, 'y');
          this.onChange('translate', 'Sagittal', { x: localDeltaX * ratioX, y: localDeltaY * ratioY });
        } else if (dragMode === 'horizontal') {
          const localDeltaY = this.getDragDeltaInLocalSpace(sagittalConfig.dragStartMatrix, 'y', mouseDelta);
          this.applyLocalTranslation(sagittalConfig, 'y', -localDeltaY);
          const targetPixelDeltaY = this.convertDeltaByRatio(sagittalConfig, coronalConfig, 'y', 'y', localDeltaY);
          this.applyLocalTranslation(coronalConfig, 'y', -targetPixelDeltaY);
          const ratioY = this.getRatio(axialConfig, sagittalConfig, 'y');
          this.onChange('translate', 'Sagittal', { x: 0, y: localDeltaY * ratioY });
        } else if (dragMode === 'vertical') {
          const localDeltaX = this.getDragDeltaInLocalSpace(sagittalConfig.dragStartMatrix, 'x', mouseDelta);
          this.applyLocalTranslation(sagittalConfig, 'x', localDeltaX);
          const targetPixelDeltaX = this.convertDeltaByRatio(sagittalConfig, axialConfig, 'x', 'y', localDeltaX);
          this.applyLocalTranslation(axialConfig, 'y', -targetPixelDeltaX);
          const ratioX = this.getRatio(coronalConfig, sagittalConfig, 'x');
          this.onChange('translate', 'Sagittal', { x: localDeltaX * ratioX, y: 0 });
        }
        break;
    }
  }
  setHorizontalHandleVisible(config: TCrossConfig, visible: boolean) {
    config.horizontalHandleTopLeft.visible = visible;
    config.horizontalHandleTopRight.visible = visible;
    config.horizontalHandleBottomLeft.visible = visible;
    config.horizontalHandleBottomRight.visible = visible;
  }
  setVerticalHandleVisbile(config: TCrossConfig, visible: boolean) {
    config.verticalHandleLeftTop.visible = visible;
    config.verticalHandleLeftBottom.visible = visible;
    config.verticalHandleRightTop.visible = visible;
    config.verticalHandleRightBottom.visible = visible;
  }
  getDragMode(e: MouseEvent, config: TCrossConfig): TDragMode {
    const { rect } = config;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 1. 将鼠标位置转换为标准化设备坐标 (NDC)
    const mouseNDC = new Vector2();
    mouseNDC.x = (mouseX / rect.width) * 2 - 1;
    mouseNDC.y = -(mouseY / rect.height) * 2 + 1;

    // 2. 从 UI 相机发射射线
    this.raycaster.setFromCamera(mouseNDC, config.camera);

    const linesToCheck = [
      config.horizontalHandleTopLeftHitbox,
      config.horizontalHandleTopRightHitbox,
      config.horizontalHandleBottomLeftHitbox,
      config.horizontalHandleBottomRightHitbox,
      config.verticalHandleLeftTopHitbox,
      config.verticalHandleLeftBottomHitbox,
      config.verticalHandleRightTopHitbox,
      config.verticalHandleRightBottomHitbox,
      config.horizontalSolidLeftHitbox,
      config.horizontalSolidRightHitbox,
      config.verticalSolidTopHitbox,
      config.verticalSolidBottomHitbox,
      config.horizontalDashedLeftHitbox,
      config.horizontalDashedRightHitbox,
      config.verticalDashedTopHitbox,
      config.verticalDashedBottomHitbox,
      config.centerHitbox,
      config.horizontalDashedTopHitbox,
      config.horizontalDashedBottomHitbox,
      config.verticalDashedLeftHitbox,
      config.verticalDashedRightHitbox,
    ];

    const intersects = this.raycaster.intersectObjects(linesToCheck);

    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object;

      switch (intersectedObject) {
        case config.horizontalHandleTopLeftHitbox:
        case config.horizontalHandleTopRightHitbox:
        case config.horizontalHandleBottomLeftHitbox:
        case config.horizontalHandleBottomRightHitbox:
          this.setHorizontalHandleVisible(config, true);
          return 'horizontalHandle';
        case config.verticalHandleLeftTopHitbox:
        case config.verticalHandleLeftBottomHitbox:
        case config.verticalHandleRightTopHitbox:
        case config.verticalHandleRightBottomHitbox:
          this.setVerticalHandleVisbile(config, true);
          return 'verticalHandle';
        case config.centerHitbox:
          return 'center';
        case config.horizontalDashedLeftHitbox:
        case config.horizontalDashedRightHitbox:
          this.setHorizontalHandleVisible(config, true);
          return 'horizontal';
        case config.verticalDashedTopHitbox:
        case config.verticalDashedBottomHitbox:
          this.setVerticalHandleVisbile(config, true);
          return 'vertical';
        case config.horizontalSolidLeftHitbox:
        case config.horizontalSolidRightHitbox:
          this.setHorizontalHandleVisible(config, true);
          return 'rotate';
        case config.verticalSolidTopHitbox:
        case config.verticalSolidBottomHitbox:
          this.setVerticalHandleVisbile(config, true);
          return 'rotate';
        case config.horizontalDashedTopHitbox:
        case config.horizontalDashedBottomHitbox:
          this.setHorizontalHandleVisible(config, true);
          return 'none';
        case config.verticalDashedLeftHitbox:
        case config.verticalDashedRightHitbox:
          this.setVerticalHandleVisbile(config, true);
          return 'none';
        default:
          return 'none';
      }
    }
    return 'none';
  }
  handleResize() {
    this.crossConfigs.forEach(config => {
      const { element, renderer, camera, scene, matrix, rect: oldRect } = config;

      const oldPosition = new Vector3();
      const oldQuaternion = new Quaternion();
      const oldScale = new Vector3();
      matrix.decompose(oldPosition, oldQuaternion, oldScale);

      const xRatio = oldRect.width > 0 ? oldPosition.x / oldRect.width : 0.5;
      const yRatio = oldRect.height > 0 ? oldPosition.y / oldRect.height : 0.5;

      const newRect = element.getBoundingClientRect();
      config.rect = newRect;
      const { width: newWidth, height: newHeight } = newRect;

      // 4. 根据比例和新尺寸，计算出新的绝对位置
      const newPosition = new Vector3(xRatio * newWidth, yRatio * newHeight, oldPosition.z);

      matrix.compose(newPosition, oldQuaternion, oldScale);

      renderer.setSize(newWidth, newHeight);
      camera.left = 0;
      camera.right = newWidth;
      camera.top = newHeight;
      camera.bottom = 0;
      camera.updateProjectionMatrix();

      scene.children.forEach(child => {
        if (child instanceof Line2) {
          const lineMaterial = child.material as LineMaterial;
          lineMaterial.resolution.set(newWidth, newHeight);
        }
      });
    });
    this.updateAllCrosshairs();
  }
  init() {
    this.initcrossConfigs();
    this.updateAllCrosshairs();
  }
  createLine(element: HTMLElement, color: TColors, dashed: boolean, lineWidth: number = LINE_WIDTH) {
    const lineGeometry = new LineGeometry();
    const lineMaterial = new LineMaterial({ color: color, linewidth: LINE_WIDTH, dashed: false });
    lineMaterial.resolution.set(element.clientWidth, element.clientHeight);
    if (dashed) {
      lineMaterial.dashed = true;
      lineMaterial.dashSize = DASH_SIZE;
      lineMaterial.gapSize = GAP_SIZE;
      if (lineWidth === 1) {
        lineMaterial.transparent = true;
        lineMaterial.opacity = 0.7;
      }
    }
    const line = new Line2(lineGeometry, lineMaterial);
    return line;
  }
  createHitboxLine(element: HTMLElement) {
    const lineGeometry = new LineGeometry();
    const hitboxMaterial = new LineMaterial({
      linewidth: HOT_ZONE_PADDING * 2,
      transparent: true,
      opacity: DEBUGGER_OPACITY, // 暂时设为半透明以便观察
      color: 0xff0000, // 暂时设为红色以便观察
      dashed: false,
    });
    hitboxMaterial.resolution.set(element.clientWidth, element.clientHeight);
    const lineHitbox = new Line2(lineGeometry, hitboxMaterial);
    return lineHitbox;
  }
  createHandlePlane(color: TColors) {
    const planeGeometry = new PlaneGeometry(HANDLE_BOX_SIZE, HANDLE_BOX_SIZE);
    const planeMaterial = new MeshBasicMaterial({ color: color });
    const plane = new Mesh(planeGeometry, planeMaterial);
    plane.visible = false;
    return plane;
  }
  createHandleHitboxPlane() {
    const planeGeometry = new PlaneGeometry(HANDLE_BOX_SIZE * 2, HANDLE_BOX_SIZE * 2);
    const planeMaterial = new MeshBasicMaterial({ transparent: true, opacity: DEBUGGER_OPACITY, color: 0xff0000 });
    const plane = new Mesh(planeGeometry, planeMaterial);
    plane.visible = false;
    return plane;
  }
  createConfig(element: HTMLElement, name: 'Axial' | 'Sagittal' | 'Coronal') {
    const horizontalRange = 0;
    const verticalRange = 0;
    const rect = element.getBoundingClientRect();
    const totalCount = 0;
    const planePixelSize = new Vector2();
    const dragStartMatrix = new Matrix4();
    const matrix = new Matrix4().makeTranslation(rect.width / 2, rect.height - rect.height / 2, 0);
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

    const crosshairGroup = new Group();
    crosshairGroup.matrixAutoUpdate = false;
    const horizontalSolidLeft = this.createLine(element, horizontalColor, false);
    const horizontalSolidRight = this.createLine(element, horizontalColor, false);
    const verticalSolidTop = this.createLine(element, verticalColor, false);
    const verticalSolidBottom = this.createLine(element, verticalColor, false);
    const horizontalDashedLeft = this.createLine(element, horizontalColor, true);
    const horizontalDashedRight = this.createLine(element, horizontalColor, true);
    const verticalDashedTop = this.createLine(element, verticalColor, true);
    const verticalDashedBottom = this.createLine(element, verticalColor, true);
    const horizontalDashedTop = this.createLine(element, horizontalColor, true, 1);
    horizontalDashedTop.visible = false;
    const horizontalDashedBottom = this.createLine(element, horizontalColor, true, 1);
    horizontalDashedBottom.visible = false;
    const verticalDashedLeft = this.createLine(element, verticalColor, true, 1);
    verticalDashedLeft.visible = false;
    const verticalDashedRight = this.createLine(element, verticalColor, true, 1);
    verticalDashedRight.visible = false;

    const horizontalHandleTopLeft = this.createHandlePlane(horizontalColor);
    const horizontalHandleTopRight = this.createHandlePlane(horizontalColor);
    const horizontalHandleBottomLeft = this.createHandlePlane(horizontalColor);
    const horizontalHandleBottomRight = this.createHandlePlane(horizontalColor);
    const verticalHandleLeftTop = this.createHandlePlane(verticalColor);
    const verticalHandleLeftBottom = this.createHandlePlane(verticalColor);
    const verticalHandleRightTop = this.createHandlePlane(verticalColor);
    const verticalHandleRightBottom = this.createHandlePlane(verticalColor);

    const horizontalSolidLeftHitbox = this.createHitboxLine(element);
    const horizontalSolidRightHitbox = this.createHitboxLine(element);
    const verticalSolidTopHitbox = this.createHitboxLine(element);
    const verticalSolidBottomHitbox = this.createHitboxLine(element);
    const horizontalDashedLeftHitbox = this.createHitboxLine(element);
    const horizontalDashedRightHitbox = this.createHitboxLine(element);
    const verticalDashedTopHitbox = this.createHitboxLine(element);
    const verticalDashedBottomHitbox = this.createHitboxLine(element);
    const horizontalDashedTopHitbox = this.createHitboxLine(element);
    const horizontalDashedBottomHitbox = this.createHitboxLine(element);
    const verticalDashedLeftHitbox = this.createHitboxLine(element);
    const verticalDashedRightHitbox = this.createHitboxLine(element);
    const horizontalHandleTopLeftHitbox = this.createHandleHitboxPlane();
    const horizontalHandleTopRightHitbox = this.createHandleHitboxPlane();
    const horizontalHandleBottomLeftHitbox = this.createHandleHitboxPlane();
    const horizontalHandleBottomRightHitbox = this.createHandleHitboxPlane();
    const verticalHandleLeftTopHitbox = this.createHandleHitboxPlane();
    const verticalHandleLeftBottomHitbox = this.createHandleHitboxPlane();
    const verticalHandleRightTopHitbox = this.createHandleHitboxPlane();
    const verticalHandleRightBottomHitbox = this.createHandleHitboxPlane();

    const centerHitboxGeometry = new PlaneGeometry(CENTER_GAP_SIZE * 2, CENTER_GAP_SIZE * 2);
    const centerHitboxMaterial = new MeshBasicMaterial({ transparent: true, opacity: DEBUGGER_OPACITY, color: 0xff0000 });
    const centerHitbox = new Mesh(centerHitboxGeometry, centerHitboxMaterial);

    crosshairGroup.add(
      horizontalSolidLeft,
      horizontalSolidRight,
      verticalSolidTop,
      verticalSolidBottom,
      horizontalDashedLeft,
      horizontalDashedRight,
      verticalDashedTop,
      verticalDashedBottom,
      horizontalDashedTop,
      horizontalDashedBottom,
      verticalDashedLeft,
      verticalDashedRight,
      horizontalHandleTopLeft,
      horizontalHandleTopRight,
      horizontalHandleBottomLeft,
      horizontalHandleBottomRight,
      verticalHandleLeftTop,
      verticalHandleLeftBottom,
      verticalHandleRightTop,
      verticalHandleRightBottom,
      horizontalSolidLeftHitbox,
      horizontalSolidRightHitbox,
      verticalSolidTopHitbox,
      verticalSolidBottomHitbox,
      horizontalDashedLeftHitbox,
      horizontalDashedRightHitbox,
      verticalDashedTopHitbox,
      verticalDashedBottomHitbox,
      horizontalDashedTopHitbox,
      horizontalDashedBottomHitbox,
      verticalDashedLeftHitbox,
      verticalDashedRightHitbox,
      horizontalHandleTopLeftHitbox,
      horizontalHandleTopRightHitbox,
      horizontalHandleBottomLeftHitbox,
      horizontalHandleBottomRightHitbox,
      verticalHandleLeftTopHitbox,
      verticalHandleLeftBottomHitbox,
      verticalHandleRightTopHitbox,
      verticalHandleRightBottomHitbox,
      centerHitbox,
    );
    scene.add(crosshairGroup);

    const config: TCrossConfig = {
      name,
      element,
      totalCount,
      planePixelSize,
      rect,
      dragStartMatrix,
      matrix,
      renderer: renderer,
      scene: scene,
      camera: camera,
      crosshairGroup,
      horizontalSolidLeft,
      horizontalSolidRight,
      verticalSolidTop,
      verticalSolidBottom,
      horizontalDashedLeft,
      horizontalDashedRight,
      verticalDashedTop,
      verticalDashedBottom,
      horizontalDashedTop,
      horizontalDashedBottom,
      verticalDashedLeft,
      verticalDashedRight,
      horizontalHandleTopLeft,
      horizontalHandleTopRight,
      horizontalHandleBottomLeft,
      horizontalHandleBottomRight,
      verticalHandleLeftTop,
      verticalHandleLeftBottom,
      verticalHandleRightTop,
      verticalHandleRightBottom,
      horizontalSolidLeftHitbox,
      horizontalSolidRightHitbox,
      verticalSolidTopHitbox,
      verticalSolidBottomHitbox,
      horizontalDashedLeftHitbox,
      horizontalDashedRightHitbox,
      verticalDashedTopHitbox,
      verticalDashedBottomHitbox,
      horizontalDashedTopHitbox,
      horizontalDashedBottomHitbox,
      verticalDashedLeftHitbox,
      verticalDashedRightHitbox,
      horizontalHandleTopLeftHitbox,
      horizontalHandleTopRightHitbox,
      horizontalHandleBottomLeftHitbox,
      horizontalHandleBottomRightHitbox,
      verticalHandleLeftTopHitbox,
      verticalHandleLeftBottomHitbox,
      verticalHandleRightTopHitbox,
      verticalHandleRightBottomHitbox,
      centerHitbox,
      horizontalRange,
      verticalRange,
    };

    return config;
  }
  initcrossConfigs() {
    const axialConfig = this.createConfig(this.axialElement, 'Axial');
    const coronalConfig = this.createConfig(this.coronalElement, 'Coronal');
    const sagittalConfig = this.createConfig(this.sagittalElement, 'Sagittal');
    this.crossConfigs.push(axialConfig, coronalConfig, sagittalConfig);
  }
  translateOnLocalAxis(matrix: Matrix4, axis: 'x' | 'y', distance: number) {
    const localAxisVector = new Vector3();
    const translationMatrix = new Matrix4();
    switch (axis) {
      case 'x':
        localAxisVector.setFromMatrixColumn(matrix, 0);
        break;
      case 'y':
        localAxisVector.setFromMatrixColumn(matrix, 1);
        break;
      default:
        console.error("无效的轴参数。请使用 'x' 或 'y'。");
        return translationMatrix;
    }

    localAxisVector.normalize();
    localAxisVector.multiplyScalar(distance);

    translationMatrix.makeTranslation(localAxisVector.x, localAxisVector.y, localAxisVector.z);

    return translationMatrix;
    // matrix.premultiply(translationMatrix);
  }
  updateAllCrosshairs() {
    this.crossConfigs.forEach(config => {
      const { element, matrix, crosshairGroup, horizontalRange, verticalRange } = config;

      const { clientWidth, clientHeight } = element;

      // 1. 更新 Group 的位置和旋转
      crosshairGroup.matrix.copy(matrix);
      // 2. 更新所有线段的几何体 (现在坐标是相对于 Group 中心的)
      const diagonal = Math.sqrt(clientWidth ** 2 + clientHeight ** 2);

      // 定义相对于中心点 (0,0) 的坐标
      const hLeft = -diagonal;
      const hRight = diagonal;
      const hDashedLeftStart = -DASH_ZONE_SIZE;
      const hDashedLeftEnd = -CENTER_GAP_SIZE;
      const hDashedRightStart = CENTER_GAP_SIZE;
      const hDashedRightEnd = DASH_ZONE_SIZE;

      const vTop = diagonal;
      const vBottom = -diagonal;
      const vDashedTopStart = DASH_ZONE_SIZE;
      const vDashedTopEnd = CENTER_GAP_SIZE;
      const vDashedBottomStart = -CENTER_GAP_SIZE;
      const vDashedBottomEnd = -DASH_ZONE_SIZE;

      // 更新可见线段
      (config.horizontalSolidLeft.geometry as LineGeometry).setPositions([hLeft, 0, 0, hDashedLeftStart, 0, 0]);
      (config.horizontalSolidRight.geometry as LineGeometry).setPositions([hDashedRightEnd, 0, 0, hRight, 0, 0]);
      (config.horizontalDashedLeft.geometry as LineGeometry).setPositions([hDashedLeftStart, 0, 0, hDashedLeftEnd, 0, 0]);
      (config.horizontalDashedRight.geometry as LineGeometry).setPositions([hDashedRightStart, 0, 0, hDashedRightEnd, 0, 0]);
      (config.verticalSolidTop.geometry as LineGeometry).setPositions([0, vDashedTopStart, 0, 0, vTop, 0]);
      (config.verticalSolidBottom.geometry as LineGeometry).setPositions([0, vBottom, 0, 0, vDashedBottomEnd, 0]);
      (config.verticalDashedTop.geometry as LineGeometry).setPositions([0, vDashedTopEnd, 0, 0, vDashedTopStart, 0]);
      (config.verticalDashedBottom.geometry as LineGeometry).setPositions([0, vDashedBottomStart, 0, 0, vDashedBottomEnd, 0]);
      (config.horizontalDashedTop.geometry as LineGeometry).setPositions([
        hLeft,
        horizontalRange / 2,
        0,
        hRight,
        horizontalRange / 2,
        0,
      ]);
      (config.horizontalDashedBottom.geometry as LineGeometry).setPositions([
        hLeft,
        -horizontalRange / 2,
        0,
        hRight,
        -horizontalRange / 2,
        0,
      ]);
      if (horizontalRange > 1) {
        config.horizontalDashedTop.visible = true;
        config.horizontalDashedBottom.visible = true;
      } else {
        config.horizontalDashedTop.visible = false;
        config.horizontalDashedBottom.visible = false;
      }
      (config.verticalDashedLeft.geometry as LineGeometry).setPositions([
        verticalRange / 2,
        vTop,
        0,
        verticalRange / 2,
        vBottom,
        0,
      ]);
      (config.verticalDashedRight.geometry as LineGeometry).setPositions([
        -verticalRange / 2,
        vTop,
        0,
        -verticalRange / 2,
        vBottom,
        0,
      ]);
      if (verticalRange > 1) {
        config.verticalDashedLeft.visible = true;
        config.verticalDashedRight.visible = true;
      } else {
        config.verticalDashedLeft.visible = false;
        config.verticalDashedRight.visible = false;
      }

      config.horizontalHandleTopLeft.position.set(hDashedLeftStart - 15, horizontalRange / 2, 0);
      config.horizontalHandleTopRight.position.set(hDashedRightEnd + 15, horizontalRange / 2, 0);
      config.horizontalHandleBottomLeft.position.set(hDashedLeftStart - 15, -horizontalRange / 2, 0);
      config.horizontalHandleBottomRight.position.set(hDashedRightEnd + 15, -horizontalRange / 2, 0);
      config.verticalHandleLeftTop.position.set(verticalRange / 2, vDashedTopStart + 15, 0);
      config.verticalHandleLeftBottom.position.set(verticalRange / 2, vDashedBottomEnd - 15, 0);
      config.verticalHandleRightTop.position.set(-verticalRange / 2, vDashedTopStart + 15, 0);
      config.verticalHandleRightBottom.position.set(-verticalRange / 2, vDashedBottomEnd - 15, 0);
      // 更新热区线段
      (config.horizontalSolidLeftHitbox.geometry as LineGeometry).setPositions([hLeft, 0, 0, hDashedLeftStart, 0, 0]);
      (config.horizontalSolidRightHitbox.geometry as LineGeometry).setPositions([hDashedRightEnd, 0, 0, hRight, 0, 0]);
      (config.horizontalDashedLeftHitbox.geometry as LineGeometry).setPositions([hDashedLeftStart, 0, 0, hDashedLeftEnd, 0, 0]);
      (config.horizontalDashedRightHitbox.geometry as LineGeometry).setPositions([
        hDashedRightStart,
        0,
        0,
        hDashedRightEnd,
        0,
        0,
      ]);
      (config.verticalSolidTopHitbox.geometry as LineGeometry).setPositions([0, vDashedTopStart, 0, 0, vTop, 0]);
      (config.verticalSolidBottomHitbox.geometry as LineGeometry).setPositions([0, vBottom, 0, 0, vDashedBottomEnd, 0]);
      (config.verticalDashedTopHitbox.geometry as LineGeometry).setPositions([0, vDashedTopEnd, 0, 0, vDashedTopStart, 0]);
      (config.verticalDashedBottomHitbox.geometry as LineGeometry).setPositions([
        0,
        vDashedBottomStart,
        0,
        0,
        vDashedBottomEnd,
        0,
      ]);
      (config.horizontalDashedTopHitbox.geometry as LineGeometry).setPositions([
        hLeft,
        horizontalRange / 2,
        0,
        hRight,
        horizontalRange / 2,
        0,
      ]);
      (config.horizontalDashedBottomHitbox.geometry as LineGeometry).setPositions([
        hLeft,
        -horizontalRange / 2,
        0,
        hRight,
        -horizontalRange / 2,
        0,
      ]);
      (config.verticalDashedLeftHitbox.geometry as LineGeometry).setPositions([
        verticalRange / 2,
        vTop,
        0,
        verticalRange / 2,
        vBottom,
        0,
      ]);
      (config.verticalDashedRightHitbox.geometry as LineGeometry).setPositions([
        -verticalRange / 2,
        vTop,
        0,
        -verticalRange / 2,
        vBottom,
        0,
      ]);
      config.horizontalHandleTopLeftHitbox.position.set(hDashedLeftStart - 15, horizontalRange / 2, 0);
      config.horizontalHandleTopRightHitbox.position.set(hDashedRightEnd + 15, horizontalRange / 2, 0);
      config.horizontalHandleBottomLeftHitbox.position.set(hDashedLeftStart - 15, -horizontalRange / 2, 0);
      config.horizontalHandleBottomRightHitbox.position.set(hDashedRightEnd + 15, -horizontalRange / 2, 0);
      config.verticalHandleLeftTopHitbox.position.set(verticalRange / 2, vDashedTopStart + 15, 0);
      config.verticalHandleLeftBottomHitbox.position.set(verticalRange / 2, vDashedBottomEnd - 15, 0);
      config.verticalHandleRightTopHitbox.position.set(-verticalRange / 2, vDashedTopStart + 15, 0);
      config.verticalHandleRightBottomHitbox.position.set(-verticalRange / 2, vDashedBottomEnd - 15, 0);

      // 3. 重新计算线段距离 (Fat Lines 需要)
      config.scene.children.forEach(child => {
        if (child instanceof Group) {
          child.children.forEach(line => {
            if (line instanceof Line2) {
              line.computeLineDistances();
            }
          });
        }
      });

      // 4. 中心热区位置现在是 (0,0,0) 相对于 Group，所以不需要更新
      // config.centerHitbox.position.set(xPixel, correctedY, 0);
    });
  }
}
