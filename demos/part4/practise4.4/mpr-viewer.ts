import type {
  Data3DTexture as TData3DTexture,
  Scene as TScene,
  OrthographicCamera as TOrthographicCamera,
  WebGLRenderer as TWebGLRenderer,
  Mesh as TMesh,
  Matrix4 as TMatrix4,
  ShaderMaterial as TShaderMaterial,
} from 'three';
import { GLSL3, Mesh, PlaneGeometry, DoubleSide, ShaderMaterial, Vector3, Scene, OrthographicCamera, WebGLRenderer, AxesHelper, Matrix4 } from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { vertexShader } from './vertexShader';
import { fragmentShader } from './fragmentShader';

type TSizeInfo = {
  size: number;
  totalThickness: number;
  samplingInterval: number;
};

class MPRViewer {
  private container: HTMLElement;
  private scene: TScene;
  private mprCamera: TOrthographicCamera;
  private renderer: TWebGLRenderer;
  private controls: TrackballControls;
  private patientToVoxelMatrix: TMatrix4;
  private centerPatient: Vector3;
  private axialPlane?: TMesh;
  private coronalPlane?: TMesh;
  private sagittalPlane?: TMesh;
  private axialSizeInfo: TSizeInfo;
  private coronalSizeInfo: TSizeInfo;
  private sagittalSizeInfo: TSizeInfo;
  constructor(element: HTMLElement) {
    this.container = element;
    this.axialSizeInfo = {
      size: 0,
      totalThickness: 0,
      samplingInterval: 0,
    };
    this.coronalSizeInfo = {
      size: 0,
      totalThickness: 0,
      samplingInterval: 0,
    };
    this.sagittalSizeInfo = {
      size: 0,
      totalThickness: 0,
      samplingInterval: 0,
    };
    this.patientToVoxelMatrix = new Matrix4();
    this.centerPatient = new Vector3();
    this.scene = new Scene();

    // MPR业务相机
    this.mprCamera = new OrthographicCamera(
      this.container.clientWidth / -2,
      this.container.clientWidth / 2,
      this.container.clientHeight / 2,
      this.container.clientHeight / -2,
      0.1,
      1000,
    );
    this.mprCamera.up.set(0, -1, 0);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
    // 控制器现在控制调试相机
    this.controls = new TrackballControls(this.mprCamera, this.renderer.domElement);
    this.controls.noPan = true;
    this.controls.rotateSpeed = 5.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.staticMoving = false;
    this.controls.dynamicDampingFactor = 0.3;
    this.controls.update();
    this.addHelper();
    this.animate();
    this.attachEvent();
  }
  animate() {
    // 使用调试相机进行渲染
    this.renderer.render(this.scene, this.mprCamera);
    this.controls.update();
    requestAnimationFrame(this.animate.bind(this));
  }
  addHelper() {
    const axesHelper = new AxesHelper(500);
    this.scene.add(axesHelper);
  }
  attachEvent() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.mprCamera.left = this.container.clientWidth / -2;
      this.mprCamera.right = this.container.clientWidth / 2;
      this.mprCamera.top = this.container.clientHeight / 2;
      this.mprCamera.bottom = this.container.clientHeight / -2;
      this.mprCamera.updateProjectionMatrix();
    });
  }
  calculateMatrices(metaData: any) {
    const voxelToPatientMatrix = new Matrix4();
    const xCos = metaData.imageOrientationPatient.slice(0, 3);
    const yCos = metaData.imageOrientationPatient.slice(3, 6);
    const zCos = new Vector3().crossVectors(new Vector3(...xCos), new Vector3(...yCos));
    const T = metaData.imagePositionPatient;
    const S = metaData.pixelSpacing;
    const Z = metaData.sliceThickness;
    voxelToPatientMatrix.set(
      xCos[0] * S[0],
      yCos[0] * S[1],
      zCos.x * Z,
      T[0],
      xCos[1] * S[0],
      yCos[1] * S[1],
      zCos.y * Z,
      T[1],
      xCos[2] * S[0],
      yCos[2] * S[1],
      zCos.z * Z,
      T[2],
      0,
      0,
      0,
      1,
    );
    this.patientToVoxelMatrix = new Matrix4().copy(voxelToPatientMatrix).invert();
  }
  getSliceCountForDirection(normal: Vector3, metaData: any) {
    const {
      pixelSpacing: [xSpacing, ySpacing],
      sliceThickness: zSpacing,
      width,
      height,
      depth,
    } = metaData;

    const physicalSize = new Vector3(xSpacing * width, ySpacing * height, zSpacing * depth);

    // 1. 定义包围盒的8个顶点
    const halfSize = physicalSize.clone().multiplyScalar(0.5);
    const corners = [
      new Vector3(-halfSize.x, -halfSize.y, -halfSize.z),
      new Vector3(halfSize.x, -halfSize.y, -halfSize.z),
      new Vector3(halfSize.x, halfSize.y, -halfSize.z),
      new Vector3(-halfSize.x, halfSize.y, -halfSize.z),
      new Vector3(-halfSize.x, -halfSize.y, halfSize.z),
      new Vector3(halfSize.x, -halfSize.y, halfSize.z),
      new Vector3(halfSize.x, halfSize.y, halfSize.z),
      new Vector3(-halfSize.x, halfSize.y, halfSize.z),
    ];

    const normalizedNormal = normal.clone().normalize();

    // 2. 计算总厚度 (这部分逻辑是正确的)
    let minProjection = Infinity;
    let maxProjection = -Infinity;
    corners.forEach(corner => {
      const projection = corner.dot(normalizedNormal);
      minProjection = Math.min(minProjection, projection);
      maxProjection = Math.max(maxProjection, projection);
    });
    const totalThickness = maxProjection - minProjection;

    // 3. 【修正后的】计算采样间隔
    const absNx = Math.abs(normalizedNormal.x);
    const absNy = Math.abs(normalizedNormal.y);
    const absNz = Math.abs(normalizedNormal.z);

    // 基于我们在2D示例中推导的正确逻辑
    const stepX = absNx < 1e-6 ? Infinity : xSpacing / absNx;
    const stepY = absNy < 1e-6 ? Infinity : ySpacing / absNy;
    const stepZ = absNz < 1e-6 ? Infinity : zSpacing / absNz;

    const samplingInterval = Math.min(stepX, stepY, stepZ);

    // 4. 计算总张数
    if (samplingInterval === 0 || samplingInterval === Infinity) {
      return {
        size: 0,
        totalThickness: 0,
        samplingInterval: 0,
      }; // 如果间隔无效，返回0
    }
    console.log('totalThickness', totalThickness);
    console.log('samplingInterval', samplingInterval);

    return {
      size: Math.floor(totalThickness / samplingInterval),
      totalThickness,
      samplingInterval,
    };
  }
  init(texture: TData3DTexture, metaData: any) {
    this.calculateMatrices(metaData);
    const {
      pixelSpacing: [xSpacing, ySpacing],
      sliceThickness: zSpacing,
      width,
      height,
      depth,
    } = metaData;
    const physicalSize = new Vector3(xSpacing * width, ySpacing * height, zSpacing * depth);
    const diagonalSize = physicalSize.length();
    const safeSize = diagonalSize * 1.5;
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.mprCamera.left = (safeSize * aspect) / -2;
    this.mprCamera.right = (safeSize * aspect) / 2;
    this.mprCamera.top = safeSize / 2;
    this.mprCamera.bottom = safeSize / -2;
    this.mprCamera.near = 0.1;
    this.mprCamera.far = diagonalSize * 4;
    this.mprCamera.updateProjectionMatrix();

    // 使用矩阵精确计算体素中心对应的病人坐标（(w-1)/2, (h-1)/2, (d-1)/2）
    const centerVoxel = new Vector3((width - 1) / 2, (height - 1) / 2, (depth - 1) / 2);
    const voxelToPatientMatrix = new Matrix4().copy(this.patientToVoxelMatrix).invert();
    const centerPatient = centerVoxel.clone().applyMatrix4(voxelToPatientMatrix);
    this.mprCamera.position.copy(centerPatient).add(new Vector3(250, -250, diagonalSize * 1.5));
    this.controls.target.copy(centerPatient);
    this.controls.update();
    this.centerPatient = centerPatient;
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uWindowWidth: { value: metaData.windowWidth },
        uWindowCenter: { value: metaData.windowCenter },
        uRescaleSlope: { value: metaData.rescaleSlope },
        uRescaleIntercept: { value: metaData.rescaleIntercept },
        uTextureSize: { value: new Vector3(width, height, depth) },
        uOrigin: { value: centerPatient },
        uXAxis: { value: new Vector3(1, 0, 0) },
        uYAxis: { value: new Vector3(0, 1, 0) },
        uPlaneWidth: { value: diagonalSize },
        uPlaneHeight: { value: diagonalSize },
        uPatientToVoxelMatrix: { value: this.patientToVoxelMatrix },
      },
      side: DoubleSide,
    });

    const planeGeometry = new PlaneGeometry(diagonalSize, diagonalSize);

    const axialNormal = new Vector3(0, 0, 1);
    const axialMaterial = material.clone();
    axialMaterial.uniforms.uXAxis.value.set(1, 0, 0);
    axialMaterial.uniforms.uYAxis.value.set(0, 1, 0);
    const axialPlane = new Mesh(planeGeometry, axialMaterial);
    this.scene.add(axialPlane);
    const coronalNormal = new Vector3(0, 1, 0);
    const coronalMaterial = material.clone();
    coronalMaterial.uniforms.uXAxis.value.set(1, 0, 0);
    coronalMaterial.uniforms.uYAxis.value.set(0, 0, -1);
    const coronalPlane = new Mesh(planeGeometry, coronalMaterial);
    this.scene.add(coronalPlane);
    const sagittalNormal = new Vector3(1, 0, 0);
    const sagittalMaterial = material.clone();
    sagittalMaterial.uniforms.uXAxis.value.set(0, 0, -1);
    sagittalMaterial.uniforms.uYAxis.value.set(0, 1, 0);
    const sagittalPlane = new Mesh(planeGeometry, sagittalMaterial);
    this.scene.add(sagittalPlane);
    axialPlane.position.copy(centerPatient);
    coronalPlane.position.copy(centerPatient);
    sagittalPlane.position.copy(centerPatient);
    axialPlane.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axialNormal);
    coronalPlane.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), coronalNormal);
    sagittalPlane.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), sagittalNormal);
    this.axialPlane = axialPlane;
    this.coronalPlane = coronalPlane;
    this.sagittalPlane = sagittalPlane;
    this.axialSizeInfo = this.getSliceCountForDirection(axialNormal, metaData);
    this.coronalSizeInfo = this.getSliceCountForDirection(coronalNormal, metaData);
    this.sagittalSizeInfo = this.getSliceCountForDirection(sagittalNormal, metaData);
    return {
      axialSize: this.axialSizeInfo.size,
      coronalSize: this.coronalSizeInfo.size,
      sagittalSize: this.sagittalSizeInfo.size,
    };
  }
  setWWWC(windowWidth: number, windowCenter: number) {
    const axialMaterial = this.axialPlane?.material as TShaderMaterial;
    const coronalMaterial = this.coronalPlane?.material as TShaderMaterial;
    const sagittalMaterial = this.sagittalPlane?.material as TShaderMaterial;
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
    let size = 0;
    let samplingInterval = 0;
    let plane = null;
    let material = null;
    if (orientation === 'sagittal') {
      size = this.sagittalSizeInfo.size;
      samplingInterval = this.sagittalSizeInfo.samplingInterval;
      normal.copy(new Vector3(1, 0, 0));
      plane = this.sagittalPlane;
      material = this.sagittalPlane?.material as TShaderMaterial;
    } else if (orientation === 'coronal') {
      size = this.coronalSizeInfo.size;
      samplingInterval = this.coronalSizeInfo.samplingInterval;
      normal.copy(new Vector3(0, 1, 0));
      plane = this.coronalPlane;
      material = this.coronalPlane?.material as TShaderMaterial;
    } else {
      size = this.axialSizeInfo.size;
      samplingInterval = this.axialSizeInfo.samplingInterval;
      normal.copy(new Vector3(0, 0, 1));
      plane = this.axialPlane;
      material = this.axialPlane?.material as TShaderMaterial;
    }

    const i = index - 1 - (size - 1) / 2;
    tempOrigin.copy(this.centerPatient).add(normal.multiplyScalar(i * samplingInterval));
    plane?.position.copy(tempOrigin);
    material?.uniforms.uOrigin.value.copy(tempOrigin);
  }
}

export { MPRViewer };
