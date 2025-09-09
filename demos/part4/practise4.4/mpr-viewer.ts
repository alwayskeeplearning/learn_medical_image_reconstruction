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
  Box3,
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
  AxesHelper,
  Matrix4,
} from 'three';
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
  private voxelToPatientMatrix: TMatrix4;
  private patientToVoxelMatrix: TMatrix4;
  private centerPatient: Vector3;
  private axialPlane?: TMesh;
  private coronalPlane?: TMesh;
  private sagittalPlane?: TMesh;
  private axialSizeInfo: TSizeInfo;
  private coronalSizeInfo: TSizeInfo;
  private sagittalSizeInfo: TSizeInfo;
  private metaData: any;
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
    this.voxelToPatientMatrix = new Matrix4();
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
    this.controls.dynamicDampingFactor = 0.2;
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
    const Z = metaData.spacingBetweenSlices;
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
    this.voxelToPatientMatrix.copy(voxelToPatientMatrix);
    this.patientToVoxelMatrix = new Matrix4().copy(voxelToPatientMatrix).invert();
  }
  getSliceCountForDirection(normal: Vector3, metaData: any) {
    const {
      pixelSpacing: [xSpacing, ySpacing],
      spacingBetweenSlices: zSpacing,
      width,
      height,
      depth,
    } = metaData;

    const voxelAABB = new Box3(new Vector3(0, 0, 0), new Vector3(width, height, depth));

    const worldAABBPoints = [
      new Vector3(voxelAABB.min.x, voxelAABB.min.y, voxelAABB.min.z),
      new Vector3(voxelAABB.max.x, voxelAABB.min.y, voxelAABB.min.z),
      new Vector3(voxelAABB.min.x, voxelAABB.max.y, voxelAABB.min.z),
      new Vector3(voxelAABB.min.x, voxelAABB.min.y, voxelAABB.max.z),
      new Vector3(voxelAABB.max.x, voxelAABB.max.y, voxelAABB.min.z),
      new Vector3(voxelAABB.max.x, voxelAABB.min.y, voxelAABB.max.z),
      new Vector3(voxelAABB.min.x, voxelAABB.max.y, voxelAABB.max.z),
      new Vector3(voxelAABB.max.x, voxelAABB.max.y, voxelAABB.max.z),
    ].map(p => p.applyMatrix4(this.voxelToPatientMatrix));

    const normalizedNormal = normal.clone().normalize();

    // 2. 计算总厚度 (这部分逻辑是正确的)
    let minProjection = Infinity;
    let maxProjection = -Infinity;
    worldAABBPoints.forEach(point => {
      const projection = point.dot(normalizedNormal);
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
    // console.log('totalThickness', totalThickness);
    // console.log('samplingInterval', samplingInterval);

    return {
      size: Math.floor(totalThickness / samplingInterval),
      totalThickness,
      samplingInterval,
    };
  }
  /**
   * 计算给定法向量的切面的精确物理尺寸和像素尺寸
   * @param viewNormal - 切面法向量
   * @returns {{size: Vector2, pixelSize: Vector2}}
   */
  calculateSliceSize(uAxis: Vector3, vAxis: Vector3) {
    if (!this.metaData) {
      return {
        size: new Vector2(0, 0),
        pixelSize: new Vector2(0, 0),
      };
    }

    const { width, height, depth, pixelSpacing } = this.metaData;

    // 1. 获取数据体在体素坐标系下的8个顶点, 并变换到世界坐标
    const voxelAABB = new Box3(new Vector3(0, 0, 0), new Vector3(width, height, depth));

    const worldAABBPoints = [
      new Vector3(voxelAABB.min.x, voxelAABB.min.y, voxelAABB.min.z),
      new Vector3(voxelAABB.max.x, voxelAABB.min.y, voxelAABB.min.z),
      new Vector3(voxelAABB.min.x, voxelAABB.max.y, voxelAABB.min.z),
      new Vector3(voxelAABB.min.x, voxelAABB.min.y, voxelAABB.max.z),
      new Vector3(voxelAABB.max.x, voxelAABB.max.y, voxelAABB.min.z),
      new Vector3(voxelAABB.max.x, voxelAABB.min.y, voxelAABB.max.z),
      new Vector3(voxelAABB.min.x, voxelAABB.max.y, voxelAABB.max.z),
      new Vector3(voxelAABB.max.x, voxelAABB.max.y, voxelAABB.max.z),
    ].map(p => p.applyMatrix4(this.voxelToPatientMatrix));

    // 2. 将8个顶点投影到MPR平面上
    // u和v现在作为参数直接传入，不再进行计算
    let uMin = Infinity,
      uMax = -Infinity,
      vMin = Infinity,
      vMax = -Infinity;

    worldAABBPoints.forEach(point => {
      const uCoord = point.dot(uAxis);
      const vCoord = point.dot(vAxis);
      uMin = Math.min(uMin, uCoord);
      uMax = Math.max(uMax, uCoord);
      vMin = Math.min(vMin, vCoord);
      vMax = Math.max(vMax, vCoord);
    });

    // 3. 计算物理尺寸 (mm)
    const widthMM = uMax - uMin;
    const heightMM = vMax - vMin;

    // 4. 从物理尺寸转换为像素尺寸
    const reconPixelSpacing = Math.min(pixelSpacing[0], pixelSpacing[1]);
    const widthPX = Math.ceil(widthMM / reconPixelSpacing);
    const heightPX = Math.ceil(heightMM / reconPixelSpacing);

    return {
      size: new Vector2(widthMM, heightMM),
      pixelSize: new Vector2(widthPX, heightPX),
    };
  }
  init(texture: TData3DTexture, metaData: any) {
    this.metaData = metaData;
    this.calculateMatrices(metaData);
    const {
      pixelSpacing: [xSpacing, ySpacing],
      sliceThickness,
      spacingBetweenSlices: zSpacing,
      width,
      height,
      depth,
    } = metaData;

    // 使用矩阵精确计算体素中心对应的病人坐标（(w-1)/2, (h-1)/2, (d-1)/2）
    const centerVoxel = new Vector3((width - 1) / 2, (height - 1) / 2, (depth - 1) / 2);
    const centerPatient = centerVoxel.clone().applyMatrix4(this.voxelToPatientMatrix);
    // this.centerPatient = centerPatient;
    // 2. 创建一个“反向平移”矩阵，用于将中心点移回原点
    const centeringMatrix = new Matrix4().makeTranslation(-centerPatient.x, -centerPatient.y, -centerPatient.z);

    // 3. 将这个中心化矩阵应用到我们的核心变换矩阵上
    // premultiply是左乘: NewMatrix = CenteringMatrix * OldMatrix
    // 这意味着顶点会先应用OldMatrix, 再应用CenteringMatrix, 效果正确
    this.voxelToPatientMatrix.premultiply(centeringMatrix);

    // 4. 基于新的、已中心化的矩阵，重新计算它的逆矩阵
    this.patientToVoxelMatrix.copy(this.voxelToPatientMatrix).invert();

    // 5. 更新我们存储的中心点变量，现在它就是世界原点了
    this.centerPatient.set(0, 0, 0);

    // this.mprCamera.position.copy(centerPatient).add(new Vector3(0, 0, diagonalSize * 1.5));
    // this.controls.target.copy(centerPatient);
    // this.controls.update();
    // this.centerPatient = centerPatient;
    const physicalSize = new Vector3(xSpacing * width, ySpacing * height, zSpacing * (depth - 1) + sliceThickness);
    const diagonalSize = physicalSize.length();
    const safeSize = diagonalSize * 1.5;
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.mprCamera.left = (safeSize * aspect) / -2;
    this.mprCamera.right = (safeSize * aspect) / 2;
    this.mprCamera.top = safeSize / 2;
    this.mprCamera.bottom = safeSize / -2;
    this.mprCamera.near = 0.1;
    this.mprCamera.far = diagonalSize * 2;
    this.mprCamera.updateProjectionMatrix();
    this.mprCamera.position.set(0, 0, diagonalSize);
    this.controls.target.set(0, 0, 0);
    this.controls.update();

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
        uOrigin: { value: this.centerPatient },
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
    const axialXAxis = new Vector3(1, 0, 0);
    const axialYAxis = new Vector3(0, 1, 0);
    const axialMaterial = material.clone();
    axialMaterial.uniforms.uXAxis.value.copy(axialXAxis);
    axialMaterial.uniforms.uYAxis.value.copy(axialYAxis);
    const axialPlane = new Mesh(planeGeometry, axialMaterial);
    this.scene.add(axialPlane);
    const coronalNormal = new Vector3(0, 1, 0);
    const coronalXAxis = new Vector3(1, 0, 0);
    const coronalYAxis = new Vector3(0, 0, -1);
    const coronalMaterial = material.clone();
    coronalMaterial.uniforms.uXAxis.value.copy(coronalXAxis);
    coronalMaterial.uniforms.uYAxis.value.copy(coronalYAxis);
    const coronalPlane = new Mesh(planeGeometry, coronalMaterial);
    this.scene.add(coronalPlane);
    const sagittalNormal = new Vector3(1, 0, 0);
    const sagittalXAxis = new Vector3(0, 0, -1);
    const sagittalYAxis = new Vector3(0, 1, 0);
    const sagittalMaterial = material.clone();
    sagittalMaterial.uniforms.uXAxis.value.copy(sagittalXAxis);
    sagittalMaterial.uniforms.uYAxis.value.copy(sagittalYAxis);
    const sagittalPlane = new Mesh(planeGeometry, sagittalMaterial);
    this.scene.add(sagittalPlane);
    axialPlane.position.copy(this.centerPatient);
    coronalPlane.position.copy(this.centerPatient);
    sagittalPlane.position.copy(this.centerPatient);
    axialPlane.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), axialNormal);
    coronalPlane.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), coronalNormal);
    sagittalPlane.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), sagittalNormal);
    this.axialPlane = axialPlane;
    this.coronalPlane = coronalPlane;
    this.sagittalPlane = sagittalPlane;
    this.axialSizeInfo = this.getSliceCountForDirection(axialNormal, metaData);
    this.coronalSizeInfo = this.getSliceCountForDirection(coronalNormal, metaData);
    this.sagittalSizeInfo = this.getSliceCountForDirection(sagittalNormal, metaData);
    console.log(this.calculateSliceSize(axialXAxis, axialYAxis));
    console.log(this.calculateSliceSize(coronalXAxis, coronalYAxis));
    // 需要变换一下 要不然x和y是反的
    console.log(this.calculateSliceSize(sagittalYAxis, sagittalXAxis));
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
