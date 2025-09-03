import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GUI } from 'dat.gui';
import dicomParser from 'dicom-parser';

// --- 类型定义 ---
// 为了代码清晰，我们先定义好会用到的类型
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

// 顶点着色器 (与之前一致)
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv - 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 片元着色器 (与之前一致)
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
  uniform vec3 uOrigin;
  uniform vec3 uXAxis;
  uniform vec3 uYAxis;
  uniform float uPlaneWidth;
  uniform float uPlaneHeight;
  uniform mat4 uPatientToVoxelMatrix;

  void main() {
    vec3 patientPos = uOrigin + vUv.x * uXAxis * uPlaneWidth + vUv.y * uYAxis * uPlaneHeight;
    vec4 voxelPos4 = uPatientToVoxelMatrix * vec4(patientPos, 1.0);
    vec3 voxelPos = voxelPos4.xyz / voxelPos4.w;

    if (voxelPos.x < 0.0 || voxelPos.x > uTextureSize.x - 1.0 ||
        voxelPos.y < 0.0 || voxelPos.y > uTextureSize.y - 1.0 ||
        voxelPos.z < 0.0 || voxelPos.z > uTextureSize.z - 1.0) {
      discard;
    }
    
    vec3 sampleCoord = voxelPos / uTextureSize;
    float intensity = texture(uTexture, sampleCoord).r;
    intensity = intensity * uRescaleSlope + uRescaleIntercept;
    
    float lower = uWindowCenter - uWindowWidth / 2.0;
    float upper = uWindowCenter + uWindowWidth / 2.0;
    intensity = (intensity - lower) / (upper - lower);
    intensity = clamp(intensity, 0.0, 1.0);
    
    gl_FragColor = vec4(vec3(intensity), 1.0);
  }
`;

// --- DICOM 处理辅助函数 (恢复我们自己的实现) ---

function sortSlices(slices: DicomSlice[]): DicomSlice[] {
  const firstSlice = slices[0];
  const imageOrientation = firstSlice.dataSet.string('x00200037')!.split('\\').map(Number);
  const rowCosines = new THREE.Vector3(imageOrientation[0], imageOrientation[1], imageOrientation[2]);
  const colCosines = new THREE.Vector3(imageOrientation[3], imageOrientation[4], imageOrientation[5]);
  const normal = new THREE.Vector3().crossVectors(rowCosines, colCosines);

  slices.sort((a, b) => {
    const posA = new THREE.Vector3().fromArray(a.imagePosition);
    const posB = new THREE.Vector3().fromArray(b.imagePosition);
    // 根本修正: 恢复正确的切片排序，确保三维数据本身是正的
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
  // 健壮性处理：检查窗宽窗位是否存在，并处理多值情况
  const windowWidthStr = dataSet.string('x00281051');
  const windowCenterStr = dataSet.string('x00281050');

  // 如果标签存在，则取第一个值；否则使用默认值
  const windowWidth = windowWidthStr ? Number(windowWidthStr.split('\\')[0]) : 400;
  const windowCenter = windowCenterStr ? Number(windowCenterStr.split('\\')[0]) : 40;

  return {
    imageOrientationPatient: dataSet.string('x00200037')!.split('\\').map(Number),
    imagePositionPatient: dataSet.string('x00200032')!.split('\\').map(Number),
    pixelSpacing: dataSet.string('x00280030')!.split('\\').map(Number),
    sliceThickness: Number(dataSet.string('x00180050')),
    // 确保最终结果不是 NaN
    windowWidth: isNaN(windowWidth) ? 400 : windowWidth,
    windowCenter: isNaN(windowCenter) ? 40 : windowCenter,
    rescaleSlope: Number(dataSet.string('x00281053') || '1'),
    rescaleIntercept: Number(dataSet.string('x00281052') || '0'),
  };
}

// --- Three.js 场景设置 ---

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(window.innerWidth / -2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / -2, -5000, 5000);

// --- 核心修正：将 frustumSize 声明在外部，以便 resize 事件处理器可以访问 ---
let frustumSize = 0;

// 核心修正: 移除静态的相机位置，后续会动态设置
// camera.position.set(0, 0, 1000); // 初始位置
// camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
const container = document.getElementById('dicom-viewer')!;
container.appendChild(renderer.domElement);
camera.up.set(0, -1, 0); // Example: Z-axis as up
const controls = new OrbitControls(camera, renderer.domElement);
// --- 新增：禁用平移功能 ---
controls.enablePan = false;

// --- 主逻辑 ---
async function main() {
  // 恢复 fetch 加载逻辑
  const baseUrl = '/static/dicoms/CW023001-P001566398/';
  const fileCount = 462;
  const urls = Array.from({ length: fileCount }, (_, i) => baseUrl + `CW023001-P001566398-CT20200727153936_${String(i + 1).padStart(4, '0')}.dcm`);

  const arrayBuffers = await Promise.all(
    urls.map(url =>
      fetch(url).then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status} for URL ${url}`);
        }
        return res.arrayBuffer();
      }),
    ),
  );

  const dicomSlices = arrayBuffers.map((buffer, index) => {
    const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
    const imagePosition = dataSet.string('x00200032')!.split('\\').map(Number);
    return { index, dataSet, imagePosition };
  });

  const sortedSlices = sortSlices(dicomSlices);
  const metaData = getDicomMetaData(sortedSlices[0].dataSet);
  const { volumeData, dimensions } = getVolume(sortedSlices);

  // --- 核心改造部分 (与之前预览一致) ---

  const texture = new THREE.Data3DTexture(volumeData, dimensions.width, dimensions.height, dimensions.depth);
  texture.format = THREE.RedFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  const { patientToVoxelMatrix } = calculateMatrices(metaData);

  const physicalSize = new THREE.Vector3(metaData.pixelSpacing[0] * dimensions.width, metaData.pixelSpacing[1] * dimensions.height, metaData.sliceThickness * dimensions.depth);
  const diagonal = physicalSize.length();

  // --- 核心修正：根据数据大小调整相机视锥体 ---
  frustumSize = diagonal * 1.5; // 乘以1.5作为安全边距
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (frustumSize * aspect) / -2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;
  // 核心修正: 调整近/远裁剪面以完全包裹物体
  // near值需要是一个小的正数，以看到物体的前半部分
  // far值需要足够大以包含从相机到物体最远端的完整距离
  camera.near = 0.1;
  camera.far = diagonal * 4; // (相机距离1.5d + 物体半径0.5d) * 2倍安全边距
  camera.updateProjectionMatrix();

  const centerPatient = new THREE.Vector3(0, 0, 0).fromArray(metaData.imagePositionPatient).add(new THREE.Vector3(physicalSize.x / 2, physicalSize.y / 2, physicalSize.z / 2));

  // --- 核心修正：根据数据大小和中心点，重新定位相机和控制器 ---
  // 我们将相机放置在影像中心Z轴"头顶"方向的一个合适距离外，并看向影像中心
  camera.position.copy(centerPatient).add(new THREE.Vector3(0, 0, -diagonal * 1.5));
  controls.target.copy(centerPatient);
  controls.position0.copy(camera.position); // 设置reset位置
  controls.update(); // 让控制器更新其内部状态

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTexture: { value: texture },
      uWindowWidth: { value: metaData.windowWidth },
      uWindowCenter: { value: metaData.windowCenter },
      uRescaleSlope: { value: metaData.rescaleSlope },
      uRescaleIntercept: { value: metaData.rescaleIntercept },
      uTextureSize: { value: new THREE.Vector3(dimensions.width, dimensions.height, dimensions.depth) },
      uOrigin: { value: centerPatient },
      uXAxis: { value: new THREE.Vector3(1, 0, 0) },
      uYAxis: { value: new THREE.Vector3(0, 1, 0) },
      uPlaneWidth: { value: diagonal },
      uPlaneHeight: { value: diagonal },
      uPatientToVoxelMatrix: { value: patientToVoxelMatrix },
    },
    side: THREE.DoubleSide,
  });

  const planeGeometry = new THREE.PlaneGeometry(diagonal, diagonal);

  // --- 轴位 (Axial) ---
  const axialNormal = new THREE.Vector3(0, 0, 1);
  const axialMaterial = material.clone();
  axialMaterial.uniforms.uXAxis.value.set(1, 0, 0); // +X (Left)
  axialMaterial.uniforms.uYAxis.value.set(0, 1, 0); // -Y (Anterior)
  const axialPlane = new THREE.Mesh(planeGeometry, axialMaterial);
  scene.add(axialPlane);

  // --- 冠状位 (Coronal) ---
  const coronalNormal = new THREE.Vector3(0, 1, 0);
  const coronalMaterial = material.clone();
  coronalMaterial.uniforms.uXAxis.value.set(1, 0, 0); // +X (Left)
  coronalMaterial.uniforms.uYAxis.value.set(0, 0, -1); // +Z (Superior)
  const coronalPlane = new THREE.Mesh(planeGeometry, coronalMaterial);
  scene.add(coronalPlane);

  // --- 矢状位 (Sagittal) ---
  const sagittalNormal = new THREE.Vector3(1, 0, 0);
  const sagittalMaterial = material.clone();
  sagittalMaterial.uniforms.uXAxis.value.set(0, 0, -1); // +Y (Posterior)
  sagittalMaterial.uniforms.uYAxis.value.set(0, 1, 0); // +Z (Superior)
  const sagittalPlane = new THREE.Mesh(planeGeometry, sagittalMaterial);
  scene.add(sagittalPlane);

  axialPlane.position.copy(centerPatient);
  coronalPlane.position.copy(centerPatient);
  sagittalPlane.position.copy(centerPatient);

  // 使用四元数将几何法线对齐到期望法线方向
  axialPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axialNormal);
  coronalPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), coronalNormal);
  sagittalPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sagittalNormal);

  const guiState = {
    axialOffset: 0,
    coronalOffset: 0,
    sagittalOffset: 0,
  };

  setupGui(
    guiState,
    {
      axial: axialPlane,
      coronal: coronalPlane,
      sagittal: sagittalPlane,
    },
    centerPatient,
    {
      axial: axialNormal,
      coronal: coronalNormal,
      sagittal: sagittalNormal,
    },
    diagonal,
  );
}

// --- MPR 辅助函数 (与之前预览一致) ---

function calculateMatrices(metaData: DicomMetaData): { patientToVoxelMatrix: THREE.Matrix4 } {
  const voxelToPatientMatrix = new THREE.Matrix4();
  const xCos = metaData.imageOrientationPatient.slice(0, 3);
  const yCos = metaData.imageOrientationPatient.slice(3, 6);
  const zCos = new THREE.Vector3().crossVectors(new THREE.Vector3(...xCos), new THREE.Vector3(...yCos));
  const T = metaData.imagePositionPatient;
  const S = metaData.pixelSpacing;
  const Z = metaData.sliceThickness;

  voxelToPatientMatrix.set(xCos[0] * S[0], yCos[0] * S[1], zCos.x * Z, T[0], xCos[1] * S[0], yCos[1] * S[1], zCos.y * Z, T[1], xCos[2] * S[0], yCos[2] * S[1], zCos.z * Z, T[2], 0, 0, 0, 1);

  const patientToVoxelMatrix = new THREE.Matrix4().copy(voxelToPatientMatrix).invert();
  return { patientToVoxelMatrix };
}

/*
function getAxes(normal: THREE.Vector3): { xAxis: THREE.Vector3; yAxis: THREE.Vector3 } {
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(up)) > 0.999) {
    up = new THREE.Vector3(1, 0, 0);
  }
  const xAxis = new THREE.Vector3().crossVectors(up, normal).normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
  return { xAxis, yAxis };
}
*/

function setupGui(
  guiState: any,
  planes: {
    axial: THREE.Mesh;
    coronal: THREE.Mesh;
    sagittal: THREE.Mesh;
  },
  center: THREE.Vector3,
  normals: {
    axial: THREE.Vector3;
    coronal: THREE.Vector3;
    sagittal: THREE.Vector3;
  },
  range: number,
) {
  const gui = new GUI();
  const axialMaterial = planes.axial.material as THREE.ShaderMaterial;
  const coronalMaterial = planes.coronal.material as THREE.ShaderMaterial;
  const sagittalMaterial = planes.sagittal.material as THREE.ShaderMaterial;

  const wwControl = gui.add(axialMaterial.uniforms.uWindowWidth, 'value', 1, 1000).name('窗宽');
  const wcControl = gui.add(axialMaterial.uniforms.uWindowCenter, 'value', -500, 500).name('窗位');

  wwControl.onChange(value => {
    axialMaterial.uniforms.uWindowWidth.value = value;
    coronalMaterial.uniforms.uWindowWidth.value = value;
    sagittalMaterial.uniforms.uWindowWidth.value = value;
  });

  wcControl.onChange(value => {
    axialMaterial.uniforms.uWindowCenter.value = value;
    coronalMaterial.uniforms.uWindowCenter.value = value;
    sagittalMaterial.uniforms.uWindowCenter.value = value;
  });

  // --- 新增切片滚动控制 ---
  const halfRange = range / 2;
  const tempOrigin = new THREE.Vector3(); // 性能优化：重用向量对象

  gui
    .add(guiState, 'axialOffset', -halfRange, halfRange, 0.1)
    .name('轴位切片')
    .onChange(offset => {
      tempOrigin.copy(center).add(normals.axial.clone().multiplyScalar(offset));
      planes.axial.position.copy(tempOrigin);
      axialMaterial.uniforms.uOrigin.value.copy(tempOrigin);
    });

  gui
    .add(guiState, 'coronalOffset', -halfRange, halfRange, 0.1)
    .name('冠状位切片')
    .onChange(offset => {
      tempOrigin.copy(center).add(normals.coronal.clone().multiplyScalar(offset));
      planes.coronal.position.copy(tempOrigin);
      coronalMaterial.uniforms.uOrigin.value.copy(tempOrigin);
    });

  gui
    .add(guiState, 'sagittalOffset', -halfRange, halfRange, 0.1)
    .name('矢状位切片')
    .onChange(offset => {
      tempOrigin.copy(center).add(normals.sagittal.clone().multiplyScalar(offset));
      planes.sagittal.position.copy(tempOrigin);
      sagittalMaterial.uniforms.uOrigin.value.copy(tempOrigin);
    });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

main().catch(console.error);
animate();

window.addEventListener('resize', () => {
  // --- 核心修正：在 resize 时也使用 frustumSize 更新相机 ---
  if (frustumSize === 0) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  camera.left = (frustumSize * aspect) / -2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = frustumSize / -2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});
