import * as THREE from 'three';
// 移除 OrbitControls，我们不再需要3D旋转
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GUI } from 'dat.gui';
import dicomParser from 'dicom-parser';

// --- 类型定义 (保持不变) ---
interface DicomSlice {
  index: number;
  dataSet: dicomParser.DataSet;
  imagePosition: number[];
}

interface DicomVolume {
  volumeData: Float32Array;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
}

interface DicomMetaData {
  imageOrientationPatient: number[];
  imagePositionPatient: number[];
  pixelSpacing: number[];
  sliceThickness: number;
  windowWidth: number;
  windowCenter: number;
  rescaleSlope: number;
  rescaleIntercept: number;
}

// --- 新增：视图配置接口 ---
// 用于管理每个视图的状态
interface ViewConfig {
  name: 'Axial' | 'Sagittal' | 'Coronal'; // 视图名称
  element: HTMLElement; // 容器DOM元素
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  normal: THREE.Vector3; // 视图平面的法向量
}

// --- 着色器 (保持不变) ---
const vertexShader = `
  varying vec2 vUv;
  void main() {
    // 将uv坐标中心从(0.5, 0.5)移到(0,0)，范围从[-0.5, 0.5]
    vUv = uv - 0.5; 
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  precision highp sampler3D;
  varying vec2 vUv;
  uniform sampler3D uTexture;
  uniform float uWindowWidth;
  uniform float uWindowCenter;
  uniform float uRescaleSlope;
  uniform float uRescaleIntercept;
  uniform vec3 uTextureSize;
  uniform vec3 uOrigin; // 切片平面中心点 (病人坐标系)
  uniform vec3 uXAxis;  // 切片平面X轴方向向量 (病人坐标系)
  uniform vec3 uYAxis;  // 切片平面Y轴方向向量 (病人坐标系)
  uniform float uPlaneWidth; // 平面宽度 (mm)
  uniform float uPlaneHeight; // 平面高度 (mm)
  uniform mat4 uPatientToVoxelMatrix;

  void main() {
    // 从vUv和uniforms计算当前片元在病人坐标系下的位置
    vec3 patientPos = uOrigin + vUv.x * uXAxis * uPlaneWidth + vUv.y * uYAxis * uPlaneHeight;
    
    // 将病人坐标转换为体素坐标
    vec4 voxelPos4 = uPatientToVoxelMatrix * vec4(patientPos, 1.0);
    vec3 voxelPos = voxelPos4.xyz / voxelPos4.w;

    // 边界检查，超出体数据范围则丢弃
    if (voxelPos.x < 0.0 || voxelPos.x > uTextureSize.x - 1.0 ||
        voxelPos.y < 0.0 || voxelPos.y > uTextureSize.y - 1.0 ||
        voxelPos.z < 0.0 || voxelPos.z > uTextureSize.z - 1.0) {
      discard;
    }
    
    // 将体素坐标归一化到[0, 1]范围，用于纹理采样
    vec3 sampleCoord = voxelPos / uTextureSize;
    float intensity = texture(uTexture, sampleCoord).r;

    // 应用rescale slope/intercept
    intensity = intensity * uRescaleSlope + uRescaleIntercept;
    
    // 应用窗宽窗位
    float lower = uWindowCenter - uWindowWidth / 2.0;
    float upper = uWindowCenter + uWindowWidth / 2.0;
    intensity = (intensity - lower) / (upper - lower);
    intensity = clamp(intensity, 0.0, 1.0);
    
    gl_FragColor = vec4(vec3(intensity), 1.0);
  }
`;

// --- DICOM 处理辅助函数 (保持不变) ---
function sortSlices(slices: DicomSlice[]): DicomSlice[] {
  const firstSlice = slices[0];
  const imageOrientation = firstSlice.dataSet.string('x00200037')!.split('\\').map(Number);
  // 修正：修复 ReferenceError 错误，'imageorientation' -> 'imageOrientation'
  const rowCosines = new THREE.Vector3(imageOrientation[0], imageOrientation[1], imageOrientation[2]);
  const colCosines = new THREE.Vector3(imageOrientation[3], imageOrientation[4], imageOrientation[5]);
  const normal = new THREE.Vector3().crossVectors(rowCosines, colCosines);

  slices.sort((a, b) => {
    const posA = new THREE.Vector3().fromArray(a.imagePosition);
    const posB = new THREE.Vector3().fromArray(b.imagePosition);
    return posA.dot(normal) - posB.dot(normal);
  });
  return slices;
}

function getVolume(sortedSlices: DicomSlice[]): DicomVolume {
  const firstDataSet = sortedSlices[0].dataSet;
  const width = firstDataSet.uint16('x00280011')!;
  const height = firstDataSet.uint16('x00280010')!;
  const depth = sortedSlices.length;
  const bitsAllocated = firstDataSet.uint16('x00280100')!;
  const pixelRepresentation = firstDataSet.uint16('x00280103')!;

  const volumeData = new Float32Array(width * height * depth);

  sortedSlices.forEach((slice, i) => {
    const pixelDataElement = slice.dataSet.elements.x7fe00010;
    let rawPixelData: Int16Array | Uint16Array | Uint8Array;

    if (bitsAllocated === 16) {
      rawPixelData = pixelRepresentation === 1 ? new Int16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2) : new Uint16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
    } else {
      rawPixelData = new Uint8Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length);
    }

    const sliceOffset = i * width * height;
    for (let j = 0; j < rawPixelData.length; j++) {
      volumeData[sliceOffset + j] = rawPixelData[j];
    }
  });

  return { volumeData, dimensions: { width, height, depth } };
}

function getDicomMetaData(dataSet: dicomParser.DataSet): DicomMetaData {
  const windowWidthStr = dataSet.string('x00281051');
  const windowCenterStr = dataSet.string('x00281050');
  const windowWidth = windowWidthStr ? Number(windowWidthStr.split('\\')[0]) : 400;
  const windowCenter = windowCenterStr ? Number(windowCenterStr.split('\\')[0]) : 40;

  return {
    imageOrientationPatient: dataSet.string('x00200037')!.split('\\').map(Number),
    imagePositionPatient: dataSet.string('x00200032')!.split('\\').map(Number),
    pixelSpacing: dataSet.string('x00280030')!.split('\\').map(Number),
    sliceThickness: Number(dataSet.string('x00180050')),
    windowWidth: isNaN(windowWidth) ? 400 : windowWidth,
    windowCenter: isNaN(windowCenter) ? 40 : windowCenter,
    rescaleSlope: Number(dataSet.string('x00281053') || '1'),
    rescaleIntercept: Number(dataSet.string('x00281052') || '0'),
  };
}

function calculateMatrices(metaData: DicomMetaData, zSpacing: number): { patientToVoxelMatrix: THREE.Matrix4 } {
  const voxelToPatientMatrix = new THREE.Matrix4();
  const xCos = metaData.imageOrientationPatient.slice(0, 3);
  const yCos = metaData.imageOrientationPatient.slice(3, 6);
  const zCos = new THREE.Vector3().crossVectors(new THREE.Vector3(...xCos), new THREE.Vector3(...yCos));
  const T = metaData.imagePositionPatient;
  const S = metaData.pixelSpacing;
  // 修正：使用传入的、精确计算的zSpacing，而不是元数据中的sliceThickness
  const Z = zSpacing;

  voxelToPatientMatrix.set(xCos[0] * S[0], yCos[0] * S[1], zCos.x * Z, T[0], xCos[1] * S[0], yCos[1] * S[1], zCos.y * Z, T[1], xCos[2] * S[0], yCos[2] * S[1], zCos.z * Z, T[2], 0, 0, 0, 1);

  const patientToVoxelMatrix = new THREE.Matrix4().copy(voxelToPatientMatrix).invert();
  return { patientToVoxelMatrix };
}

// --- Three.js 场景设置 (重构) ---
const renderer = new THREE.WebGLRenderer();
// 我们让canvas占据整个页面，然后通过viewport/scissor控制渲染区域
const canvas = renderer.domElement;
document.body.appendChild(canvas);

// 全局变量，用于存储每个视图的配置
const views: ViewConfig[] = [];

// --- 主逻辑 ---
async function main() {
  // 获取容器元素
  const axialElement = document.getElementById('axial-view')!;
  const sagittalElement = document.getElementById('sagittal-view')!;
  const coronalElement = document.getElementById('coronal-view')!;

  // DICOM 数据加载 (与之前一致)
  const baseUrl = '/static/dicoms/CW023001-P001566398/';
  const fileCount = 462;
  const urls = Array.from({ length: fileCount }, (_, i) => baseUrl + `CW023001-P001566398-CT20200727153936_${String(i + 1).padStart(4, '0')}.dcm`);
  const arrayBuffers = await Promise.all(urls.map(url => fetch(url).then(res => res.arrayBuffer())));
  const dicomSlices = arrayBuffers.map((buffer, index) => {
    const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
    const imagePosition = dataSet.string('x00200032')!.split('\\').map(Number);
    return { index, dataSet, imagePosition };
  });
  const sortedSlices = sortSlices(dicomSlices);
  const metaData = getDicomMetaData(sortedSlices[0].dataSet);
  const { volumeData, dimensions } = getVolume(sortedSlices);

  // 创建3D纹理 (与之前一致)
  const texture = new THREE.Data3DTexture(volumeData, dimensions.width, dimensions.height, dimensions.depth);
  texture.format = THREE.RedFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  // --- 核心修正：计算精确的Z轴间距 ---
  const accurateZSpacing = sortedSlices.length > 1 ? new THREE.Vector3().fromArray(sortedSlices[0].imagePosition).distanceTo(new THREE.Vector3().fromArray(sortedSlices[1].imagePosition)) : metaData.sliceThickness;

  // --- 核心修正：将 centerPatient 提升为可变状态 ---
  const centerPatient = new THREE.Vector3();

  // 状态对象，用于GUI控制
  const guiState = {
    axialOffset: 0,
    coronalOffset: 0,
    sagittalOffset: 0,
    useAccurateZSpacing: true,
  };

  // --- 初始化和更新函数 ---
  // 将几何体、矩阵和GUI的更新逻辑封装起来
  let guiControllers: any = {};
  const updateGeometriesAndMatrices = (useAccurate: boolean) => {
    const zSpacing = useAccurate ? accurateZSpacing : metaData.sliceThickness;

    const physicalSize = new THREE.Vector3(metaData.pixelSpacing[0] * dimensions.width, metaData.pixelSpacing[1] * dimensions.height, zSpacing * dimensions.depth);
    const { patientToVoxelMatrix } = calculateMatrices(metaData, zSpacing);

    // --- 核心修正：实时更新 centerPatient ---
    centerPatient.fromArray(metaData.imagePositionPatient).add(new THREE.Vector3(physicalSize.x / 2, physicalSize.y / 2, physicalSize.z / 2));

    // 更新所有视图的变换矩阵
    views.forEach(v => {
      v.mesh.material.uniforms.uPatientToVoxelMatrix.value.copy(patientToVoxelMatrix);
      // 确保初始origin也更新
      v.mesh.material.uniforms.uOrigin.value.copy(centerPatient);
    });
    // 重置滑块的初始值
    guiState.axialOffset = 0;
    guiState.coronalOffset = 0;
    guiState.sagittalOffset = 0;

    // 更新矢状位视图
    const sagittalView = views.find(v => v.name === 'Sagittal')!;
    sagittalView.mesh.geometry.dispose();
    sagittalView.mesh.geometry = new THREE.PlaneGeometry(physicalSize.y, physicalSize.z);
    sagittalView.mesh.material.uniforms.uPlaneWidth.value = physicalSize.y;
    sagittalView.mesh.material.uniforms.uPlaneHeight.value = physicalSize.z;

    // 更新冠状位视图
    const coronalView = views.find(v => v.name === 'Coronal')!;
    coronalView.mesh.geometry.dispose();
    coronalView.mesh.geometry = new THREE.PlaneGeometry(physicalSize.x, physicalSize.z);
    coronalView.mesh.material.uniforms.uPlaneWidth.value = physicalSize.x;
    coronalView.mesh.material.uniforms.uPlaneHeight.value = physicalSize.z;

    // 更新GUI滑块范围
    if (guiControllers.axial) {
      guiControllers.axial
        .max(physicalSize.z / 2)
        .min(-physicalSize.z / 2)
        .updateDisplay();
      guiControllers.coronal
        .max(physicalSize.y / 2)
        .min(-physicalSize.y / 2)
        .updateDisplay();
      guiControllers.sagittal
        .max(physicalSize.x / 2)
        .min(-physicalSize.x / 2)
        .updateDisplay();
    }

    // 触发相机更新
    handleResize();
  };

  // --- 初始创建 ---
  // 注意：初始创建时的值都会被首次调用 updateGeometriesAndMatrices 覆盖，所以这里的计算可以简化或移除
  const { patientToVoxelMatrix } = calculateMatrices(metaData, metaData.sliceThickness);
  const initialPhysicalSize = new THREE.Vector3(metaData.pixelSpacing[0] * dimensions.width, metaData.pixelSpacing[1] * dimensions.height, metaData.sliceThickness * dimensions.depth);

  // --- 核心改造: 为每个视图创建独立的场景和相机 ---

  // 基础材质，后续会为每个视图克隆
  const baseMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uWindowWidth: { value: metaData.windowWidth },
      uWindowCenter: { value: metaData.windowCenter },
      uRescaleSlope: { value: metaData.rescaleSlope },
      uRescaleIntercept: { value: metaData.rescaleIntercept },
      uTextureSize: { value: new THREE.Vector3(dimensions.width, dimensions.height, dimensions.depth) },
      uOrigin: { value: new THREE.Vector3().copy(centerPatient) }, // 每个视图的uOrigin会独立控制
      uXAxis: { value: new THREE.Vector3(1, 0, 0) },
      uYAxis: { value: new THREE.Vector3(0, 1, 0) },
      uPlaneWidth: { value: 0 }, // 待计算
      uPlaneHeight: { value: 0 }, // 待计算
      uPatientToVoxelMatrix: { value: patientToVoxelMatrix },
    },
    side: THREE.DoubleSide,
  });

  // 1. 轴位 (Axial)
  const axialConfig: Partial<ViewConfig> = {
    name: 'Axial',
    element: axialElement,
    scene: new THREE.Scene(),
    normal: new THREE.Vector3(0, 0, 1),
  };
  axialConfig.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  // 修正：简化相机设置，使用标准 Y-up
  axialConfig.camera.position.set(0, 0, 10);
  axialConfig.camera.lookAt(0, 0, 0);

  const axialMaterial = baseMaterial.clone();
  axialMaterial.uniforms.uXAxis.value.set(1, 0, 0); // X+ -> Left
  axialMaterial.uniforms.uYAxis.value.set(0, -1, 0); // Y- -> Anterior
  axialMaterial.uniforms.uPlaneWidth.value = initialPhysicalSize.x;
  axialMaterial.uniforms.uPlaneHeight.value = initialPhysicalSize.y;
  const axialPlane = new THREE.PlaneGeometry(initialPhysicalSize.x, initialPhysicalSize.y);
  axialConfig.mesh = new THREE.Mesh(axialPlane, axialMaterial);
  axialConfig.scene!.add(axialConfig.mesh);
  views.push(axialConfig as ViewConfig);

  // 2. 矢状位 (Sagittal)
  const sagittalConfig: Partial<ViewConfig> = {
    name: 'Sagittal',
    element: sagittalElement,
    scene: new THREE.Scene(),
    normal: new THREE.Vector3(1, 0, 0),
  };
  sagittalConfig.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  // 修正：修复 up 向量与视线平行的问题，并简化
  sagittalConfig.camera.position.set(0, 0, 10);
  sagittalConfig.camera.lookAt(0, 0, 0);

  const sagittalMaterial = baseMaterial.clone();
  sagittalMaterial.uniforms.uXAxis.value.set(0, -1, 0); // Y- -> Anterior
  sagittalMaterial.uniforms.uYAxis.value.set(0, 0, 1); // Z+ -> Superior
  sagittalMaterial.uniforms.uPlaneWidth.value = initialPhysicalSize.y;
  sagittalMaterial.uniforms.uPlaneHeight.value = initialPhysicalSize.z;
  const sagittalPlane = new THREE.PlaneGeometry(initialPhysicalSize.y, initialPhysicalSize.z);
  sagittalConfig.mesh = new THREE.Mesh(sagittalPlane, sagittalMaterial);
  sagittalConfig.scene!.add(sagittalConfig.mesh);
  views.push(sagittalConfig as ViewConfig);

  // 3. 冠状位 (Coronal)
  const coronalConfig: Partial<ViewConfig> = {
    name: 'Coronal',
    element: coronalElement,
    scene: new THREE.Scene(),
    normal: new THREE.Vector3(0, 1, 0),
  };
  coronalConfig.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  // 修正：修复 up 向量与视线平行的问题，并简化
  coronalConfig.camera.position.set(0, 0, 10);
  coronalConfig.camera.lookAt(0, 0, 0);

  const coronalMaterial = baseMaterial.clone();
  coronalMaterial.uniforms.uXAxis.value.set(1, 0, 0); // X+ -> Left
  coronalMaterial.uniforms.uYAxis.value.set(0, 0, 1); // Z+ -> Superior
  coronalMaterial.uniforms.uPlaneWidth.value = initialPhysicalSize.x;
  coronalMaterial.uniforms.uPlaneHeight.value = initialPhysicalSize.z;
  const coronalPlane = new THREE.PlaneGeometry(initialPhysicalSize.x, initialPhysicalSize.z);
  coronalConfig.mesh = new THREE.Mesh(coronalPlane, coronalMaterial);
  coronalConfig.scene!.add(coronalConfig.mesh);
  views.push(coronalConfig as ViewConfig);

  // 初始化GUI
  guiControllers = setupGui(baseMaterial, guiState, updateGeometriesAndMatrices, () => centerPatient);

  // 首次调用，确保初始状态正确
  updateGeometriesAndMatrices(guiState.useAccurateZSpacing);

  // 首次调用，设置初始相机和渲染器尺寸
  handleResize();
}

function setupGui(
  baseMaterial: THREE.ShaderMaterial,
  guiState: any,
  onSpacingChange: (useAccurate: boolean) => void,
  getCenter: () => THREE.Vector3, // 核心修正：使用函数获取最新的center
) {
  const gui = new GUI();

  const wwControl = gui.add(baseMaterial.uniforms.uWindowWidth, 'value', 1, 1000).name('窗宽');
  const wcControl = gui.add(baseMaterial.uniforms.uWindowCenter, 'value', -500, 500).name('窗位');

  // 修改一个材质的uniform，所有克隆体都会同步变化
  wwControl.onChange(value => {
    views.forEach(v => (v.mesh.material.uniforms.uWindowWidth.value = value));
  });
  wcControl.onChange(value => {
    views.forEach(v => (v.mesh.material.uniforms.uWindowCenter.value = value));
  });

  // --- 新增：添加 Z-Spacing 切换控件 ---
  gui.add(guiState, 'useAccurateZSpacing').name('精确层间距').onChange(onSpacingChange);

  const tempOrigin = new THREE.Vector3();

  const axialController = gui
    .add(guiState, 'axialOffset', -1, 1, 0.1) // 范围将在 updateGeometriesAndMatrices 中动态设置
    .name('轴位切片')
    .onChange(offset => {
      const view = views.find(v => v.name === 'Axial')!;
      tempOrigin.copy(getCenter()).add(view.normal.clone().multiplyScalar(offset));
      view.mesh.material.uniforms.uOrigin.value.copy(tempOrigin);
    });

  const coronalController = gui
    .add(guiState, 'coronalOffset', -1, 1, 0.1)
    .name('冠状位切片')
    .onChange(offset => {
      const view = views.find(v => v.name === 'Coronal')!;
      tempOrigin.copy(getCenter()).add(view.normal.clone().multiplyScalar(offset));
      view.mesh.material.uniforms.uOrigin.value.copy(tempOrigin);
    });

  const sagittalController = gui
    .add(guiState, 'sagittalOffset', -1, 1, 0.1)
    .name('矢状位切片')
    .onChange(offset => {
      const view = views.find(v => v.name === 'Sagittal')!;
      tempOrigin.copy(getCenter()).add(view.normal.clone().multiplyScalar(offset));
      view.mesh.material.uniforms.uOrigin.value.copy(tempOrigin);
    });

  return {
    axial: axialController,
    coronal: coronalController,
    sagittal: sagittalController,
  };
}

function updateView(view: ViewConfig) {
  const { element, camera, mesh } = view;
  const rect = element.getBoundingClientRect();

  // 检查尺寸是否为0，避免无效计算
  if (rect.width === 0 || rect.height === 0) return;

  // 更新相机视锥体以匹配平面尺寸和元素宽高比
  const planeWidth = mesh.material.uniforms.uPlaneWidth.value;
  const planeHeight = mesh.material.uniforms.uPlaneHeight.value;
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

  // 修正：移除错误的相机定位逻辑。相机位置是固定的，只看场景原点。
  // const origin = mesh.material.uniforms.uOrigin.value;
  // camera.position.copy(origin).add(view.normal);
  // camera.lookAt(origin);
}

function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // 更新渲染器尺寸和canvas css尺寸
  renderer.setSize(w, h);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  // 更新每个视图的相机
  views.forEach(updateView);
}

function animate() {
  requestAnimationFrame(animate);

  // --- 核心渲染逻辑 ---
  renderer.setScissorTest(true); // 开启裁剪测试

  views.forEach(view => {
    const { element, camera, scene } = view;
    const rect = element.getBoundingClientRect();

    // 检查视图是否在屏幕外
    if (rect.bottom < 0 || rect.top > renderer.domElement.clientHeight || rect.right < 0 || rect.left > renderer.domElement.clientWidth) {
      return; // 不渲染
    }

    // 将视口左下角从(0,0)转换为canvas坐标
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    const left = rect.left;
    const bottom = renderer.domElement.clientHeight - rect.bottom;

    renderer.setViewport(left, bottom, width, height);
    renderer.setScissor(left, bottom, width, height);

    renderer.render(scene, camera);
  });

  renderer.setScissorTest(false); // 关闭裁剪测试
}

// --- 事件监听 ---
window.addEventListener('resize', handleResize);

// --- 启动 ---
main().catch(console.error);
animate();
