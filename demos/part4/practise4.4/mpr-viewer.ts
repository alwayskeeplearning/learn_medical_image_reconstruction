import type {
  Data3DTexture as TData3DTexture,
  Scene as TScene,
  OrthographicCamera as TOrthographicCamera,
  WebGLRenderer as TWebGLRenderer,
  Mesh as TMesh,
  Matrix4 as TMatrix4,
} from 'three';
import { GLSL3, Mesh, PlaneGeometry, DoubleSide, ShaderMaterial, Vector3, Scene, OrthographicCamera, WebGLRenderer, AxesHelper, Matrix4 } from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { vertexShader } from './vertexShader';
import { fragmentShader } from './fragmentShader';

class MPRViewer {
  private container: HTMLElement;
  private scene: TScene;
  private mprCamera: TOrthographicCamera;
  private renderer: TWebGLRenderer;
  private controls: TrackballControls;
  private plane?: TMesh;
  private patientToVoxelMatrix: TMatrix4;
  constructor(element: HTMLElement) {
    this.container = element;
    this.patientToVoxelMatrix = new Matrix4();
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
  // ... inside the MPRViewer class
  getSliceCountForDirection(normal: Vector3, metaData: any): number {
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
      return 0; // 如果间隔无效，返回0
    }

    return Math.floor(totalThickness / samplingInterval);
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

    const centerPatient = new Vector3(0, 0, 0)
      .fromArray(metaData.imagePositionPatient)
      .add(new Vector3(physicalSize.x / 2, physicalSize.y / 2, physicalSize.z / 2));
    this.mprCamera.position.copy(centerPatient).add(new Vector3(250, -250, -diagonalSize * 1.5));
    this.controls.target.copy(centerPatient);
    this.controls.update();
    console.log(centerPatient);

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
    console.log(metaData.windowCenter, metaData.windowWidth);

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
    console.log(this.getSliceCountForDirection(coronalNormal, metaData));
  }
}

export { MPRViewer };
