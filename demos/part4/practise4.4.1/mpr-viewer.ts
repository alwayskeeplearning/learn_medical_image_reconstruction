import type {
  Data3DTexture as TData3DTexture,
  Scene as TScene,
  OrthographicCamera as TOrthographicCamera,
  WebGLRenderer as TWebGLRenderer,
  Mesh as TMesh,
  Matrix4 as TMatrix4,
  ShaderMaterial as TShaderMaterial,
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
} from 'three';
import { vertexShader } from './vertexShader';
import { fragmentShader } from './fragmentShader';
import { calculateMatrix, calculateSliceInfoForDirection } from './helper';
// window.calculateSliceInfoForDirection = calculateSliceInfoForDirection;
type TViewConfig = {
  name: 'Axial' | 'Sagittal' | 'Coronal';
  element: HTMLElement;
  scene: TScene;
  camera: TOrthographicCamera;
  mesh: TMesh;
  normal: Vector3;
  initNormal: Vector3;
  renderer: TWebGLRenderer;
};

type TSizeInfo = {
  size: Vector2;
  pixelSize: Vector2;
  count: number;
  currentCount: number;
  totalThickness: number;
  samplingInterval: number;
};

type TOnResize = (name: 'Axial' | 'Sagittal' | 'Coronal', planePixelSize: Vector2, totalCount: number) => void;

class MPRViewer {
  private axialElement: HTMLElement;
  private coronalElement: HTMLElement;
  private sagittalElement: HTMLElement;
  private voxelToPatientMatrix: TMatrix4;
  private patientToVoxelMatrix: TMatrix4;
  private viewConfigs: TViewConfig[];
  axialSliceInfo!: TSizeInfo;
  coronalSliceInfo!: TSizeInfo;
  sagittalSliceInfo!: TSizeInfo;
  private centerPatient: Vector3;
  private metaData: any;
  private onResize: TOnResize;
  constructor(axialElement: HTMLElement, coronalElement: HTMLElement, sagittalElement: HTMLElement, onResize: TOnResize) {
    this.viewConfigs = [];
    this.voxelToPatientMatrix = new Matrix4();
    this.patientToVoxelMatrix = new Matrix4();
    this.centerPatient = new Vector3();
    this.axialElement = axialElement;
    this.coronalElement = coronalElement;
    this.sagittalElement = sagittalElement;
    this.onResize = onResize;
    this.animate();
    this.attachEvent();
  }
  initViewConfig(baseMaterial: TShaderMaterial, physicalSize: Vector3) {
    const axialCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1);
    axialCamera.position.set(0, 0, 1);
    const axialMaterial = baseMaterial.clone();
    axialMaterial.uniforms.uXAxis.value.set(1, 0, 0);
    axialMaterial.uniforms.uYAxis.value.set(0, -1, 0);
    axialMaterial.uniforms.uPlaneWidth.value = physicalSize.x;
    axialMaterial.uniforms.uPlaneHeight.value = physicalSize.y;

    const axialPlaneGeometry = new PlaneGeometry(physicalSize.x, physicalSize.y);
    const axialPlane = new Mesh(axialPlaneGeometry, axialMaterial);
    const axialScene = new Scene();
    axialScene.add(axialPlane);
    const axialRenderer = new WebGLRenderer({ antialias: true });
    axialRenderer.setPixelRatio(window.devicePixelRatio);
    axialRenderer.setSize(this.axialElement.clientWidth, this.axialElement.clientHeight);
    this.axialElement.appendChild(axialRenderer.domElement);
    const axialConfig: TViewConfig = {
      name: 'Axial',
      element: this.axialElement,
      scene: axialScene,
      camera: axialCamera,
      mesh: axialPlane,
      normal: new Vector3(0, 0, 1),
      initNormal: new Vector3(0, 0, 1),
      renderer: axialRenderer,
    };

    const coronalCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1);
    coronalCamera.position.set(0, 0, 1);
    const coronalMaterial = baseMaterial.clone();
    coronalMaterial.uniforms.uXAxis.value.set(1, 0, 0);
    coronalMaterial.uniforms.uYAxis.value.set(0, 0, -1);
    coronalMaterial.uniforms.uPlaneWidth.value = physicalSize.x;
    coronalMaterial.uniforms.uPlaneHeight.value = physicalSize.z;
    const coronalPlaneGeometry = new PlaneGeometry(physicalSize.x, physicalSize.z);
    const coronalPlane = new Mesh(coronalPlaneGeometry, coronalMaterial);
    const coronalScene = new Scene();
    coronalScene.add(coronalPlane);
    const coronalRenderer = new WebGLRenderer({ antialias: true });
    coronalRenderer.setPixelRatio(window.devicePixelRatio);
    coronalRenderer.setSize(this.coronalElement.clientWidth, this.coronalElement.clientHeight);
    this.coronalElement.appendChild(coronalRenderer.domElement);
    const coronalConfig: TViewConfig = {
      name: 'Coronal',
      element: this.coronalElement,
      scene: coronalScene,
      camera: coronalCamera,
      mesh: coronalPlane,
      normal: new Vector3(0, 1, 0),
      initNormal: new Vector3(0, 1, 0),
      renderer: coronalRenderer,
    };
    const sagittalCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1);
    sagittalCamera.position.set(0, 0, 1);
    const sagittalMaterial = baseMaterial.clone();
    sagittalMaterial.uniforms.uXAxis.value.set(0, 1, 0);
    sagittalMaterial.uniforms.uYAxis.value.set(0, 0, -1);
    sagittalMaterial.uniforms.uPlaneWidth.value = physicalSize.y;
    sagittalMaterial.uniforms.uPlaneHeight.value = physicalSize.z;
    const sagittalPlaneGeometry = new PlaneGeometry(physicalSize.y, physicalSize.z);
    const sagittalPlane = new Mesh(sagittalPlaneGeometry, sagittalMaterial);
    const sagittalScene = new Scene();
    sagittalScene.add(sagittalPlane);
    const sagittalRenderer = new WebGLRenderer({ antialias: true });
    sagittalRenderer.setPixelRatio(window.devicePixelRatio);
    sagittalRenderer.setSize(this.sagittalElement.clientWidth, this.sagittalElement.clientHeight);
    this.sagittalElement.appendChild(sagittalRenderer.domElement);
    const sagittalConfig: TViewConfig = {
      name: 'Sagittal',
      element: this.sagittalElement,
      scene: sagittalScene,
      camera: sagittalCamera,
      mesh: sagittalPlane,
      normal: new Vector3(1, 0, 0),
      initNormal: new Vector3(1, 0, 0),
      renderer: sagittalRenderer,
    };

    this.viewConfigs.push(axialConfig, coronalConfig, sagittalConfig);
  }
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.viewConfigs.forEach(view => {
      const { renderer, scene, camera } = view;
      renderer.render(scene, camera);
    });
  }
  rotateView(orientation: 'Axial' | 'Sagittal' | 'Coronal', axis: 'x' | 'y', tiltAngle: number, radian: number) {
    // 1. 找到对应的视图配置
    const view = this.viewConfigs.find(v => v.name === orientation);
    if (!view) {
      console.error('未找到指定方向的视图');
      return;
    }

    const material = view.mesh.material as TShaderMaterial;
    const { uXAxis, uYAxis, uOrigin } = material.uniforms;

    // 2. 确定旋转轴
    // 我们需要复制一份原始向量作为旋转轴，避免在计算过程中被修改
    const rotationAxis = new Vector3();
    if (axis === 'x') {
      rotationAxis.copy(uXAxis.value);
    } else {
      rotationAxis.copy(uYAxis.value);
    }

    const tiltMatrix = new Matrix4();
    const tiltAroundAxis = view.normal;

    tiltMatrix.makeRotationAxis(tiltAroundAxis, tiltAngle);

    // 3. 将“倾斜”变换应用到“基础轴”上，得到最终的自定义旋转轴
    const customRotationAxis = rotationAxis.clone().applyMatrix4(tiltMatrix);
    // 3. 创建旋转矩阵
    const rotationMatrix = new Matrix4();
    rotationMatrix.makeRotationAxis(customRotationAxis.normalize(), radian);

    // 4. 应用旋转到 uXAxis, uYAxis 和 normal
    uXAxis.value.applyMatrix4(rotationMatrix);
    uYAxis.value.applyMatrix4(rotationMatrix);
    view.normal.applyMatrix4(rotationMatrix);

    // 理论上，旋转后向量长度不变，但为防止浮点数精度问题，最好进行归一化
    uXAxis.value.normalize();
    uYAxis.value.normalize();
    view.normal.normalize();
    let sliceInfo = null;
    const distance = new Vector3().subVectors(uOrigin.value, this.centerPatient).dot(view.normal);
    if (view.name === 'Coronal') {
      this.coronalSliceInfo = this.calculateSliceInfoForDirection(1);
      const startCount = this.coronalSliceInfo.currentCount;
      const count = distance / this.coronalSliceInfo.samplingInterval;
      const currentCount = startCount + count;
      this.coronalSliceInfo.currentCount = currentCount;
      sliceInfo = this.coronalSliceInfo;
      this.changeSlice(currentCount, 'coronal');
    } else if (view.name === 'Sagittal') {
      this.sagittalSliceInfo = this.calculateSliceInfoForDirection(2);
      const startCount = this.sagittalSliceInfo.currentCount;
      const count = distance / this.sagittalSliceInfo.samplingInterval;
      const currentCount = startCount + count;
      this.sagittalSliceInfo.currentCount = currentCount;
      sliceInfo = this.sagittalSliceInfo;
      this.changeSlice(currentCount, 'sagittal');
    } else {
      this.axialSliceInfo = this.calculateSliceInfoForDirection(0);
      const startCount = this.axialSliceInfo.currentCount;
      const count = distance / this.axialSliceInfo.samplingInterval;
      const currentCount = startCount + count;
      this.axialSliceInfo.currentCount = currentCount;
      sliceInfo = this.axialSliceInfo;
      this.changeSlice(currentCount, 'axial');
    }
    const planePixelSize = this.getPlanePixelSize(view);
    this.onResize(view.name, planePixelSize, sliceInfo.count);
  }
  handleResize() {
    // 更新每个视图的相机
    this.viewConfigs.forEach(view => {
      const { element, camera, mesh, renderer } = view;
      const rect = element.getBoundingClientRect();

      // 检查尺寸是否为0，避免无效计算
      if (rect.width === 0 || rect.height === 0) return;
      renderer.setSize(rect.width, rect.height);
      // 更新相机视锥体以匹配平面尺寸和元素宽高比
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
      const planePixelSize = this.getPlanePixelSize(view);
      let totalCount = 0;
      if (view.name === 'Axial') {
        totalCount = this.axialSliceInfo.count;
      } else if (view.name === 'Coronal') {
        totalCount = this.coronalSliceInfo.count;
      } else if (view.name === 'Sagittal') {
        totalCount = this.sagittalSliceInfo.count;
      }
      this.onResize(view.name, planePixelSize, totalCount);
      console.log(`${view.name} 平面的像素尺寸:`, totalCount, planePixelSize);
    });
  }
  getPlanePixelSize(view: TViewConfig) {
    const { mesh, camera, renderer } = view;
    const canvas = renderer.domElement;
    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;

    // 确保物体的世界矩阵是更新到最新的
    mesh.updateWorldMatrix(true, false);

    // 获取 PlaneGeometry 的四个角点（局部坐标）
    // PlaneGeometry 默认的顶点顺序是： bottom-left, bottom-right, top-left, top-right
    const geom = mesh.geometry as PlaneGeometry;
    const positions = geom.attributes.position;
    const corners = [
      new Vector3(positions.getX(0), positions.getY(0), positions.getZ(0)), // bl
      new Vector3(positions.getX(1), positions.getY(1), positions.getZ(1)), // br
      new Vector3(positions.getX(2), positions.getY(2), positions.getZ(2)), // tl
      new Vector3(positions.getX(3), positions.getY(3), positions.getZ(3)), // tr
    ];

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    corners.forEach(corner => {
      // 1. 从局部坐标转换到世界坐标
      const worldCorner = corner.clone().applyMatrix4(mesh.matrixWorld);

      // 2. 从世界坐标投影到 NDC 坐标 (-1 to +1)
      const ndcCorner = worldCorner.clone().project(camera);

      // 3. 从 NDC 坐标转换到屏幕像素坐标 (0 to canvas size)
      const screenX = ((ndcCorner.x + 1) / 2) * canvasWidth;
      // 注意 Y 轴方向，NDC 的 +1 是向上，而屏幕坐标的 +y 是向下
      const screenY = ((-ndcCorner.y + 1) / 2) * canvasHeight;

      // 找出四个角点在屏幕上的包围盒
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
    });

    // 计算包围盒的宽高
    const pixelWidth = maxX - minX;
    const pixelHeight = maxY - minY;

    return new Vector2(pixelWidth, pixelHeight);
  }
  attachEvent() {
    window.addEventListener('resize', this.handleResize.bind(this));
  }
  calculateSliceInfoForDirection(index: number) {
    const {
      pixelSpacing: [xSpacing, ySpacing],
      spacingBetweenSlices: zSpacing,
      width,
      height,
      depth,
    } = this.metaData;
    return calculateSliceInfoForDirection(
      (this.viewConfigs[index].mesh.material as TShaderMaterial).uniforms.uXAxis.value,
      (this.viewConfigs[index].mesh.material as TShaderMaterial).uniforms.uYAxis.value,
      width,
      height,
      depth,
      [xSpacing, ySpacing],
      zSpacing,
      this.voxelToPatientMatrix,
    );
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

    // const centerVoxel = new Vector3((width - 1) / 2, (height - 1) / 2, (depth - 1) / 2);
    // const centerPatient = centerVoxel.clone().applyMatrix4(this.voxelToPatientMatrix);
    const centerVoxel = new Vector3((width - 1) / 2, (height - 1) / 2, (depth - 1) / 2);
    this.centerPatient = centerVoxel.clone().applyMatrix4(this.voxelToPatientMatrix);
    const physicalSize = new Vector3(xSpacing * width, ySpacing * height, zSpacing * (depth - 1) + sliceThickness);
    // this.centerPatient = new Vector3()
    //   .fromArray(metaData.imagePositionPatient)
    //   .add(new Vector3(physicalSize.x / 2, physicalSize.y / 2, physicalSize.z / 2));
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uWindowWidth: { value: metaData.windowWidth },
        uWindowCenter: { value: metaData.windowCenter },
        uTextureSize: { value: new Vector3(width, height, depth) },
        uOrigin: { value: this.centerPatient },
        uXAxis: { value: new Vector3(0, 0, 0) },
        uYAxis: { value: new Vector3(0, 0, 0) },
        uPlaneWidth: { value: 0 },
        uPlaneHeight: { value: 0 },
        uPatientToVoxelMatrix: { value: this.patientToVoxelMatrix },
      },
      side: DoubleSide,
    });
    this.initViewConfig(material, physicalSize);
    this.axialSliceInfo = this.calculateSliceInfoForDirection(0);
    this.coronalSliceInfo = this.calculateSliceInfoForDirection(1);
    this.sagittalSliceInfo = this.calculateSliceInfoForDirection(2);
    this.handleResize();
    return {
      axialCount: this.axialSliceInfo.count,
      coronalCount: this.coronalSliceInfo.count,
      sagittalCount: this.sagittalSliceInfo.count,
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
  changeSlice(index: number, orientation: string) {
    const tempOrigin = new Vector3();
    const normal = new Vector3();
    let count = 0;
    let samplingInterval = 0;
    let material = null;
    if (orientation === 'sagittal') {
      count = this.sagittalSliceInfo.count;
      samplingInterval = this.sagittalSliceInfo.samplingInterval;
      normal.copy(this.viewConfigs[2].normal);
      material = this.viewConfigs[2].mesh.material as TShaderMaterial;
    } else if (orientation === 'coronal') {
      count = this.coronalSliceInfo.count;
      samplingInterval = this.coronalSliceInfo.samplingInterval;
      normal.copy(this.viewConfigs[1].normal);
      material = this.viewConfigs[1].mesh.material as TShaderMaterial;
    } else {
      count = this.axialSliceInfo.count;
      samplingInterval = this.axialSliceInfo.samplingInterval;
      normal.copy(this.viewConfigs[0].normal);
      material = this.viewConfigs[0].mesh.material as TShaderMaterial;
    }
    const i = index - 1 - (count - 1) / 2;

    tempOrigin.copy(this.centerPatient).add(normal.multiplyScalar(i * samplingInterval));

    material?.uniforms.uOrigin.value.copy(tempOrigin);
  }
  changeSliceDelta(delta: number, orientation: string) {
    if (orientation === 'sagittal') {
      this.sagittalSliceInfo.currentCount += delta;
      this.changeSlice(this.sagittalSliceInfo.currentCount, 'sagittal');
    } else if (orientation === 'coronal') {
      this.coronalSliceInfo.currentCount += delta;
      this.changeSlice(this.coronalSliceInfo.currentCount, 'coronal');
    } else {
      this.axialSliceInfo.currentCount += delta;

      this.changeSlice(this.axialSliceInfo.currentCount, 'axial');
    }
  }
}

export { MPRViewer };
