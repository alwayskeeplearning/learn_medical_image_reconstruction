/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { calculateMatrix } from './helper';

type TViewConfig = {
  name: 'Axial' | 'Sagittal' | 'Coronal';
  element: HTMLElement;
  scene: TScene;
  camera: TOrthographicCamera;
  mesh: TMesh;
  normal: Vector3;
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
  private renderer: TWebGLRenderer;
  private voxelToPatientMatrix: TMatrix4;
  private patientToVoxelMatrix: TMatrix4;
  private viewConfigs: TViewConfig[];
  // private axialSizeInfo: TSizeInfo;
  // private coronalSizeInfo: TSizeInfo;
  // private sagittalSizeInfo: TSizeInfo;
  private metaData: any;
  constructor(container: HTMLElement, axialElement: HTMLElement, coronalElement: HTMLElement, sagittalElement: HTMLElement) {
    this.viewConfigs = [];
    this.voxelToPatientMatrix = new Matrix4();
    this.patientToVoxelMatrix = new Matrix4();

    this.container = container;
    this.axialElement = axialElement;
    this.coronalElement = coronalElement;
    this.sagittalElement = sagittalElement;
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);

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
    const axialConfig: TViewConfig = {
      name: 'Axial',
      element: this.axialElement,
      scene: axialScene,
      camera: axialCamera,
      mesh: axialPlane,
      normal: new Vector3(0, 0, 1),
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
    const coronalConfig: TViewConfig = {
      name: 'Coronal',
      element: this.coronalElement,
      scene: coronalScene,
      camera: coronalCamera,
      mesh: coronalPlane,
      normal: new Vector3(0, 1, 0),
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
    const sagittalConfig: TViewConfig = {
      name: 'Sagittal',
      element: this.sagittalElement,
      scene: sagittalScene,
      camera: sagittalCamera,
      mesh: sagittalPlane,
      normal: new Vector3(1, 0, 0),
    };

    this.viewConfigs.push(axialConfig, coronalConfig, sagittalConfig);
  }
  animate() {
    requestAnimationFrame(this.animate.bind(this));

    //启用剪裁检测
    this.renderer.setScissorTest(true);

    this.viewConfigs.forEach(view => {
      const { element, camera, scene } = view;
      const rect = element.getBoundingClientRect();

      // 检查视图是否在屏幕外
      if (
        rect.bottom < 0 ||
        rect.top > this.renderer.domElement.clientHeight ||
        rect.right < 0 ||
        rect.left > this.renderer.domElement.clientWidth
      ) {
        return;
      }

      const width = rect.right - rect.left;
      const height = rect.bottom - rect.top;
      const left = rect.left;
      //WebGL的y = 画布总高度 - 元素底部到浏览器顶部的距离
      const bottom = this.renderer.domElement.clientHeight - rect.bottom;
      this.renderer.setViewport(left, bottom, width, height);
      this.renderer.setScissor(left, bottom, width, height);
      this.renderer.render(scene, camera);
    });
  }
  handleResize() {
    const { clientWidth, clientHeight } = this.container;

    // 更新渲染器尺寸和canvas css尺寸
    this.renderer.setSize(clientWidth, clientHeight);

    // 更新每个视图的相机
    this.viewConfigs.forEach(view => {
      const { element, camera, mesh } = view;
      const rect = element.getBoundingClientRect();

      // 检查尺寸是否为0，避免无效计算
      if (rect.width === 0 || rect.height === 0) return;

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
    });
  }
  attachEvent() {
    window.addEventListener('resize', this.handleResize.bind(this));
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
    const physicalSize = new Vector3(xSpacing * width, ySpacing * height, zSpacing * (depth - 1) + sliceThickness);
    const centerPatient = new Vector3()
      .fromArray(metaData.imagePositionPatient)
      .add(new Vector3(physicalSize.x / 2, physicalSize.y / 2, physicalSize.z / 2));
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture: { value: texture },
        uWindowWidth: { value: metaData.windowWidth },
        uWindowCenter: { value: metaData.windowCenter },
        uTextureSize: { value: new Vector3(width, height, depth) },
        uOrigin: { value: centerPatient },
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
  }
  setWWWC(windowWidth: number, windowCenter: number) {
    // const axialMaterial = this.axialPlane?.material as TShaderMaterial;
    // const coronalMaterial = this.coronalPlane?.material as TShaderMaterial;
    // const sagittalMaterial = this.sagittalPlane?.material as TShaderMaterial;
    // axialMaterial.uniforms.uWindowWidth.value = windowWidth;
    // axialMaterial.uniforms.uWindowCenter.value = windowCenter;
    // coronalMaterial.uniforms.uWindowWidth.value = windowWidth;
    // coronalMaterial.uniforms.uWindowCenter.value = windowCenter;
    // sagittalMaterial.uniforms.uWindowWidth.value = windowWidth;
    // sagittalMaterial.uniforms.uWindowCenter.value = windowCenter;
  }
  changeSlice(index: number, orientation: string) {
    // const tempOrigin = new Vector3();
    // const normal = new Vector3();
    // let size = 0;
    // let samplingInterval = 0;
    // let plane = null;
    // let material = null;
    // if (orientation === 'sagittal') {
    //   size = this.sagittalSizeInfo.size;
    //   samplingInterval = this.sagittalSizeInfo.samplingInterval;
    //   normal.copy(new Vector3(1, 0, 0));
    //   plane = this.sagittalPlane;
    //   material = this.sagittalPlane?.material as TShaderMaterial;
    // } else if (orientation === 'coronal') {
    //   size = this.coronalSizeInfo.size;
    //   samplingInterval = this.coronalSizeInfo.samplingInterval;
    //   normal.copy(new Vector3(0, 1, 0));
    //   plane = this.coronalPlane;
    //   material = this.coronalPlane?.material as TShaderMaterial;
    // } else {
    //   size = this.axialSizeInfo.size;
    //   samplingInterval = this.axialSizeInfo.samplingInterval;
    //   normal.copy(new Vector3(0, 0, 1));
    //   plane = this.axialPlane;
    //   material = this.axialPlane?.material as TShaderMaterial;
    // }
    // const i = index - 1 - (size - 1) / 2;
    // tempOrigin.copy(this.centerPatient).add(normal.multiplyScalar(i * samplingInterval));
    // plane?.position.copy(tempOrigin);
    // material?.uniforms.uOrigin.value.copy(tempOrigin);
  }
}

export { MPRViewer };
