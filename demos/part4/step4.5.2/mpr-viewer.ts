/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  Data3DTexture as TData3DTexture,
  Scene as TScene,
  OrthographicCamera as TOrthographicCamera,
  WebGLRenderer as TWebGLRenderer,
  Mesh as TMesh,
  Matrix4 as TMatrix4,
  ShaderMaterial as TShaderMaterial,
  LineSegments as TLineSegments,
} from 'three';
import {
  Vector2,
  GLSL3,
  Mesh,
  PlaneGeometry,
  DoubleSide,
  ShaderMaterial,
  Vector3,
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  Matrix4,
  Color,
  LineBasicMaterial,
  LineDashedMaterial,
  BufferGeometry,
  LineSegments,
  Float32BufferAttribute,
} from 'three';
import { vertexShader } from './vertexShader';
import { fragmentShader } from './fragmentShader';
import { calculateMatrix, calculateSliceInfoForDirection } from './helper';

// --- 配置常量 ---
const CENTER_GAP_PIXELS = 32; // 中心空隙大小 (单边)
const DASH_ZONE_PIXELS = 128; // 从中心点到虚线末端的距离
const HOT_ZONE_PADDING = 4; // 虚线抓手的像素范围 (单边)

type TViewConfig = {
  name: 'Axial' | 'Sagittal' | 'Coronal';
  element: HTMLElement;
  scene: TScene;
  camera: TOrthographicCamera;
  mesh: TMesh;
  renderer: TWebGLRenderer;
  // --- UI ---
  uiScene: TScene;
  uiCamera: TOrthographicCamera;
  horizontalSolid: TLineSegments;
  horizontalDashed: TLineSegments;
  verticalSolid: TLineSegments;
  verticalDashed: TLineSegments;
};

type TSizeInfo = {
  size: Vector2;
  pixelSize: Vector2;
  count: number;
  totalThickness: number;
  samplingInterval: number;
};

class MPRViewer {
  private container: HTMLElement;
  private axialElement: HTMLElement;
  private coronalElement: HTMLElement;
  private sagittalElement: HTMLElement;
  private voxelToPatientMatrix: TMatrix4;
  private patientToVoxelMatrix: TMatrix4;
  private viewConfigs: TViewConfig[];
  private centerPatient: Vector3;
  private metaData: any;
  // --- 联动状态 ---
  private mprMatrix = new Matrix4();
  private isDragging = false;
  private dragMode: 'center' | 'horizontal' | 'vertical' = 'center';
  private lastMousePos = { x: 0, y: 0 };

  constructor(container: HTMLElement, axialElement: HTMLElement, coronalElement: HTMLElement, sagittalElement: HTMLElement) {
    this.viewConfigs = [];
    this.voxelToPatientMatrix = new Matrix4();
    this.patientToVoxelMatrix = new Matrix4();
    this.centerPatient = new Vector3();
    this.container = container;
    this.axialElement = axialElement;
    this.coronalElement = coronalElement;
    this.sagittalElement = sagittalElement;

    this.animate();
    // this.attachEvent(); // 从构造函数中移除
  }

  initViewConfig(baseMaterial: TShaderMaterial, physicalSize: Vector3) {
    const viewConfigs: { name: 'Axial' | 'Coronal' | 'Sagittal'; element: HTMLElement }[] = [
      { name: 'Axial', element: this.axialElement },
      { name: 'Coronal', element: this.coronalElement },
      { name: 'Sagittal', element: this.sagittalElement },
    ];

    const colors = {
      Axial: new Color(0x00ff00), // 绿色
      Coronal: new Color(0x0000ff), // 蓝色
      Sagittal: new Color(0xffff00), // 黄色
    };

    for (const config of viewConfigs) {
      const { name, element } = config;

      // 1. 创建主场景的物体
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      camera.position.set(0, 0, 1);
      const material = baseMaterial.clone();
      let planeGeometry: PlaneGeometry;

      if (name === 'Axial') {
        material.uniforms.uXAxis.value.set(1, 0, 0);
        material.uniforms.uYAxis.value.set(0, -1, 0); // DICOM LPS vs Three.js screen space
        material.uniforms.uPlaneWidth.value = physicalSize.x;
        material.uniforms.uPlaneHeight.value = physicalSize.y;
        planeGeometry = new PlaneGeometry(physicalSize.x, physicalSize.y);
      } else if (name === 'Coronal') {
        material.uniforms.uXAxis.value.set(1, 0, 0);
        material.uniforms.uYAxis.value.set(0, 0, -1);
        material.uniforms.uPlaneWidth.value = physicalSize.x;
        material.uniforms.uPlaneHeight.value = physicalSize.z;
        planeGeometry = new PlaneGeometry(physicalSize.x, physicalSize.z);
      } else {
        // Sagittal
        material.uniforms.uXAxis.value.set(0, 1, 0);
        material.uniforms.uYAxis.value.set(0, 0, -1);
        material.uniforms.uPlaneWidth.value = physicalSize.y;
        material.uniforms.uPlaneHeight.value = physicalSize.z;
        planeGeometry = new PlaneGeometry(physicalSize.y, physicalSize.z);
      }

      const mesh = new Mesh(planeGeometry, material);
      const scene = new Scene();
      scene.add(mesh);

      // 2. 创建UI场景
      const uiScene = new Scene();
      const uiCamera = new OrthographicCamera(0, element.clientWidth, element.clientHeight, 0, 0.1, 1000);
      uiCamera.position.z = 1;

      let hMatSolid: LineBasicMaterial,
        vMatSolid: LineBasicMaterial,
        hMatDashed: LineDashedMaterial,
        vMatDashed: LineDashedMaterial;

      switch (name) {
        case 'Axial':
          hMatSolid = new LineBasicMaterial({ color: colors.Coronal });
          vMatSolid = new LineBasicMaterial({ color: colors.Sagittal });
          hMatDashed = new LineDashedMaterial({ color: colors.Coronal, dashSize: 4, gapSize: 4 });
          vMatDashed = new LineDashedMaterial({ color: colors.Sagittal, dashSize: 4, gapSize: 4 });
          break;
        case 'Coronal':
          hMatSolid = new LineBasicMaterial({ color: colors.Axial });
          vMatSolid = new LineBasicMaterial({ color: colors.Sagittal });
          hMatDashed = new LineDashedMaterial({ color: colors.Axial, dashSize: 4, gapSize: 4 });
          vMatDashed = new LineDashedMaterial({ color: colors.Sagittal, dashSize: 4, gapSize: 4 });
          break;
        default: // Sagittal
          hMatSolid = new LineBasicMaterial({ color: colors.Axial });
          vMatSolid = new LineBasicMaterial({ color: colors.Coronal });
          hMatDashed = new LineDashedMaterial({ color: colors.Axial, dashSize: 4, gapSize: 4 });
          vMatDashed = new LineDashedMaterial({ color: colors.Coronal, dashSize: 4, gapSize: 4 });
          break;
      }

      const hSolidGeom = new BufferGeometry();
      hSolidGeom.setAttribute('position', new Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const horizontalSolid = new LineSegments(hSolidGeom, hMatSolid);

      const hDashedGeom = new BufferGeometry();
      hDashedGeom.setAttribute('position', new Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const horizontalDashed = new LineSegments(hDashedGeom, hMatDashed);

      const vSolidGeom = new BufferGeometry();
      vSolidGeom.setAttribute('position', new Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const verticalSolid = new LineSegments(vSolidGeom, vMatSolid);

      const vDashedGeom = new BufferGeometry();
      vDashedGeom.setAttribute('position', new Float32BufferAttribute(new Float32Array(4 * 3), 3));
      const verticalDashed = new LineSegments(vDashedGeom, vMatDashed);

      uiScene.add(horizontalSolid, horizontalDashed, verticalSolid, verticalDashed);

      // 3. 创建渲染器并整合
      const renderer = new WebGLRenderer({ antialias: true });
      renderer.setSize(element.clientWidth, element.clientHeight);
      element.appendChild(renderer.domElement);

      this.viewConfigs.push({
        name,
        element,
        scene,
        camera,
        mesh,
        renderer,
        uiScene,
        uiCamera,
        horizontalSolid,
        horizontalDashed,
        verticalSolid,
        verticalDashed,
      });
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.viewConfigs.forEach(view => {
      const { renderer, scene, camera, uiScene, uiCamera } = view;
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(uiScene, uiCamera);
    });
  }

  handleResize() {
    // 更新每个视图的相机
    this.viewConfigs.forEach(view => {
      const { element, camera, mesh, renderer, uiCamera } = view;
      const rect = element.getBoundingClientRect();

      // 检查尺寸是否为0，避免无效计算
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setSize(rect.width, rect.height);

      // --- 更新主相机 ---
      const planeWidth = (mesh.material as TShaderMaterial).uniforms.uPlaneWidth.value;
      const planeHeight = (mesh.material as TShaderMaterial).uniforms.uPlaneHeight.value;
      const planeAspect = planeWidth / planeHeight;
      const elementAspect = rect.width / rect.height;

      let viewWidth, viewHeight;
      if (elementAspect > planeAspect) {
        viewHeight = planeHeight;
        viewWidth = viewHeight * elementAspect;
      } else {
        viewWidth = planeWidth;
        viewHeight = viewWidth / elementAspect;
      }

      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();

      // --- 更新UI相机 ---
      uiCamera.left = 0;
      uiCamera.right = rect.width;
      uiCamera.top = rect.height;
      uiCamera.bottom = 0;
      uiCamera.updateProjectionMatrix();
    });
    this.updateAllCrosshairs(); // 稍后添加
  }

  attachEvent() {
    window.addEventListener('resize', this.handleResize.bind(this));

    // 全局监听 mouseup，确保在任何地方松开都能停止拖拽
    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.viewConfigs.forEach(view => {
      // 鼠标按下时，开始拖拽并确定拖拽模式
      view.element.addEventListener('mousedown', e => {
        this.isDragging = true;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.dragMode = this.getDragMode(e, view);
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
              view.element.style.cursor = 'ns-resize';
              break;
            case 'vertical':
              view.element.style.cursor = 'ew-resize';
              break;
            default:
              view.element.style.cursor = 'move';
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
  private getDragMode(e: MouseEvent, view: TViewConfig): 'center' | 'horizontal' | 'vertical' {
    const rect = view.element.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 病人空间中心点 -> NDC -> 像素坐标
    const centerPoint = new Vector3().setFromMatrixPosition(this.mprMatrix);
    const ndc = centerPoint.clone().project(view.camera);
    const xPixel = ((ndc.x + 1) / 2) * rect.width;
    const yPixel = ((-ndc.y + 1) / 2) * rect.height;

    const distToHorizontal = Math.abs(mouseY - yPixel);
    const distToVertical = Math.abs(mouseX - xPixel);

    if (distToHorizontal <= HOT_ZONE_PADDING && distToVertical >= CENTER_GAP_PIXELS && distToVertical <= DASH_ZONE_PIXELS) {
      return 'horizontal';
    }

    if (distToVertical <= HOT_ZONE_PADDING && distToHorizontal >= CENTER_GAP_PIXELS && distToHorizontal <= DASH_ZONE_PIXELS) {
      return 'vertical';
    }

    return 'center';
  }

  // 根据在哪个视图中操作，来更新共享点
  private updateSharedPoint(e: MouseEvent, activeView: TViewConfig) {
    const deltaX = e.clientX - this.lastMousePos.x;
    const deltaY = e.clientY - this.lastMousePos.y;

    const { camera, mesh } = activeView;
    const rect = activeView.element.getBoundingClientRect();

    const mmPerPixelX = (camera.right - camera.left) / rect.width;
    const mmPerPixelY = (camera.top - camera.bottom) / rect.height;

    const deltaWorldX = deltaX * mmPerPixelX;
    const deltaWorldY = deltaY * mmPerPixelY;

    const material = mesh.material as TShaderMaterial;
    const { uXAxis, uYAxis } = material.uniforms;
    const deltaPatient = new Vector3();

    // 1. 根据拖拽模式，计算出物理位移，并更新 mprMatrix
    switch (this.dragMode) {
      case 'horizontal':
        deltaPatient.add(uYAxis.value.clone().multiplyScalar(deltaWorldY));
        break;
      case 'vertical':
        deltaPatient.add(uXAxis.value.clone().multiplyScalar(deltaWorldX));
        break;
      default:
        deltaPatient.add(uXAxis.value.clone().multiplyScalar(deltaWorldX)).add(uYAxis.value.clone().multiplyScalar(deltaWorldY));
        break;
    }
    const translationMatrix = new Matrix4().makeTranslation(deltaPatient.x, deltaPatient.y, deltaPatient.z);
    this.mprMatrix.premultiply(translationMatrix);

    // 2. (最终修正逻辑) 根据交互，精确更新需要改变的视图影像
    const newCenter = new Vector3().setFromMatrixPosition(this.mprMatrix);

    if (this.dragMode === 'center') {
      // 中心拖拽：更新另外两个视图
      this.viewConfigs.forEach(view => {
        if (view.name !== activeView.name) {
          (view.mesh.material as TShaderMaterial).uniforms.uOrigin.value.copy(newCenter);
        }
      });
    } else {
      // 单轴拖拽：更新对应的那个视图
      const targetViewName = this.getTargetViewName(this.dragMode, activeView.name);
      const targetView = this.viewConfigs.find(v => v.name === targetViewName);
      if (targetView) {
        (targetView.mesh.material as TShaderMaterial).uniforms.uOrigin.value.copy(newCenter);
      }
    }

    // 3. 更新所有视图的十字线UI
    this.updateAllCrosshairs();

    // 4. 更新下一次计算的起始点
    this.lastMousePos = { x: e.clientX, y: e.clientY };
  }

  // 辅助函数，根据当前操作的视图和模式，判断哪个视图的影像需要更新
  private getTargetViewName(
    dragMode: 'center' | 'horizontal' | 'vertical',
    activeViewName: 'Axial' | 'Coronal' | 'Sagittal',
  ): 'Axial' | 'Coronal' | 'Sagittal' | null {
    if (dragMode === 'center') return null; // Center模式下所有视图都更新

    if (activeViewName === 'Axial') {
      return dragMode === 'horizontal' ? 'Coronal' : 'Sagittal';
    }
    if (activeViewName === 'Coronal') {
      return dragMode === 'horizontal' ? 'Axial' : 'Sagittal';
    }
    if (activeViewName === 'Sagittal') {
      return dragMode === 'horizontal' ? 'Axial' : 'Coronal';
    }
    return null;
  }

  // 使用 mprMatrix 更新所有三个视图的十字线
  private updateAllCrosshairs() {
    const centerPoint = new Vector3().setFromMatrixPosition(this.mprMatrix);

    this.viewConfigs.forEach(view => {
      const { camera, element, horizontalSolid, horizontalDashed, verticalSolid, verticalDashed } = view;
      const rect = element.getBoundingClientRect();

      // 1. 病人空间 -> NDC
      const ndc = centerPoint.clone().project(camera);

      // 2. NDC -> 像素坐标 (原点在左上角)
      const xPixel = ((ndc.x + 1) / 2) * rect.width;
      const yPixel = ((-ndc.y + 1) / 2) * rect.height;

      // 3. 将yPixel翻转为UI相机坐标 (原点在左下角)
      const correctedY = rect.height - yPixel;

      // --- 更新水平线 ---
      const hSolidPos = horizontalSolid.geometry.attributes.position as Float32BufferAttribute;
      const hDashedPos = horizontalDashed.geometry.attributes.position as Float32BufferAttribute;

      hSolidPos.setXYZ(0, 0, correctedY, 0);
      hSolidPos.setXYZ(1, xPixel - DASH_ZONE_PIXELS, correctedY, 0);
      hSolidPos.setXYZ(2, xPixel + DASH_ZONE_PIXELS, correctedY, 0);
      hSolidPos.setXYZ(3, rect.width, correctedY, 0);

      hDashedPos.setXYZ(0, xPixel - DASH_ZONE_PIXELS, correctedY, 0);
      hDashedPos.setXYZ(1, xPixel - CENTER_GAP_PIXELS, correctedY, 0);
      hDashedPos.setXYZ(2, xPixel + CENTER_GAP_PIXELS, correctedY, 0);
      hDashedPos.setXYZ(3, xPixel + DASH_ZONE_PIXELS, correctedY, 0);

      horizontalSolid.geometry.attributes.position.needsUpdate = true;
      horizontalDashed.geometry.attributes.position.needsUpdate = true;
      horizontalDashed.computeLineDistances();

      // --- 更新垂直线 ---
      const vSolidPos = verticalSolid.geometry.attributes.position as Float32BufferAttribute;
      const vDashedPos = verticalDashed.geometry.attributes.position as Float32BufferAttribute;

      vSolidPos.setXYZ(0, xPixel, rect.height, 0);
      vSolidPos.setXYZ(1, xPixel, correctedY + DASH_ZONE_PIXELS, 0);
      vSolidPos.setXYZ(2, xPixel, correctedY - DASH_ZONE_PIXELS, 0);
      vSolidPos.setXYZ(3, xPixel, 0, 0);

      vDashedPos.setXYZ(0, xPixel, correctedY + DASH_ZONE_PIXELS, 0);
      vDashedPos.setXYZ(1, xPixel, correctedY + CENTER_GAP_PIXELS, 0);
      vDashedPos.setXYZ(2, xPixel, correctedY - CENTER_GAP_PIXELS, 0);
      vDashedPos.setXYZ(3, xPixel, correctedY - DASH_ZONE_PIXELS, 0);

      verticalSolid.geometry.attributes.position.needsUpdate = true;
      verticalDashed.geometry.attributes.position.needsUpdate = true;
      verticalDashed.computeLineDistances();
    });
  }

  init(texture: TData3DTexture, metaData: any) {
    this.metaData = metaData;
    const {
      pixelSpacing: [xSpacing, ySpacing],
      sliceThickness,
      spacingBetweenSlices: zSpacing,
      imageOrientationPatient,
      imagePositionPatient,
      width,
      height,
      depth,
    } = this.metaData;
    const { voxelToPatientMatrix, patientToVoxelMatrix } = calculateMatrix(
      imageOrientationPatient,
      imagePositionPatient,
      [xSpacing, ySpacing],
      zSpacing,
    );
    this.voxelToPatientMatrix.copy(voxelToPatientMatrix);
    this.patientToVoxelMatrix.copy(patientToVoxelMatrix);

    const centerVoxel = new Vector3((width - 1) / 2, (height - 1) / 2, (depth - 1) / 2);
    this.centerPatient = centerVoxel.clone().applyMatrix4(this.voxelToPatientMatrix);
    const physicalSize = new Vector3(xSpacing * width, ySpacing * height, zSpacing * (depth - 1) + sliceThickness);

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uWindowWidth: { value: metaData.windowWidth },
        uWindowCenter: { value: metaData.windowCenter },
        uTextureSize: { value: new Vector3(width, height, depth) },
        uOrigin: { value: this.centerPatient.clone() },
        uXAxis: { value: new Vector3(0, 0, 0) },
        uYAxis: { value: new Vector3(0, 0, 0) },
        uPlaneWidth: { value: 0 },
        uPlaneHeight: { value: 0 },
        uPatientToVoxelMatrix: { value: this.patientToVoxelMatrix },
      },
      side: DoubleSide,
    });

    this.initViewConfig(material, physicalSize);
    this.handleResize();

    // --- 核心状态初始化 ---
    this.mprMatrix.setPosition(this.centerPatient);
    this.updateAllCrosshairs(); // 初始化时也调用

    // 临时保留旧的返回值结构以兼容UI，但数据已无实际作用
    const axialSliceInfo = calculateSliceInfoForDirection(
      (this.viewConfigs[0].mesh.material as TShaderMaterial).uniforms.uXAxis.value,
      (this.viewConfigs[0].mesh.material as TShaderMaterial).uniforms.uYAxis.value,
      width,
      height,
      depth,
      [xSpacing, ySpacing],
      zSpacing,
      this.voxelToPatientMatrix,
    );
    const coronalSliceInfo = calculateSliceInfoForDirection(
      (this.viewConfigs[1].mesh.material as TShaderMaterial).uniforms.uXAxis.value,
      (this.viewConfigs[1].mesh.material as TShaderMaterial).uniforms.uYAxis.value,
      width,
      height,
      depth,
      [xSpacing, ySpacing],
      zSpacing,
      this.voxelToPatientMatrix,
    );
    const sagittalSliceInfo = calculateSliceInfoForDirection(
      (this.viewConfigs[2].mesh.material as TShaderMaterial).uniforms.uXAxis.value,
      (this.viewConfigs[2].mesh.material as TShaderMaterial).uniforms.uYAxis.value,
      width,
      height,
      depth,
      [xSpacing, ySpacing],
      zSpacing,
      this.voxelToPatientMatrix,
    );

    this.attachEvent(); // 移动到这里，确保 viewConfigs 已被填充

    return {
      axialCount: axialSliceInfo.count,
      coronalCount: coronalSliceInfo.count,
      sagittalCount: sagittalSliceInfo.count,
    };
  }
  setWWWC(windowWidth: number, windowCenter: number) {
    const axialMaterial = this.viewConfigs[0].mesh.material as TShaderMaterial;
    const coronalMaterial = this.viewConfigs[1].mesh.material as TShaderMaterial;
    const sagittalMaterial = this.viewConfigs[2].mesh.material as TShaderMaterial;
    axialMaterial.uniforms.uWindowWidth.value = windowWidth;
    axialMaterial.uniforms.uWindowCenter.value = windowCenter;
    coronalMaterial.uniforms.uWindowWidth.value = windowWidth;
    coronalMaterial.uniforms.uWindowCenter.value = windowCenter;
    sagittalMaterial.uniforms.uWindowWidth.value = windowWidth;
    sagittalMaterial.uniforms.uWindowCenter.value = windowCenter;
  }
}

export { MPRViewer };
