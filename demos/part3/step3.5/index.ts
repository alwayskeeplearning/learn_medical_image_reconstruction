import * as THREE from 'three';
import dicomParser from 'dicom-parser';
import WebGL from 'three/addons/capabilities/WebGL.js';

// 首先，进行 WebGL2 能力检测
if (WebGL.isWebGL2Available() === false) {
  document.body.appendChild(WebGL.getWebGL2ErrorMessage());
  throw new Error('您的浏览器或设备不支持WebGL2');
}

// --- 全局变量 ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;

/**
 * 加载并解析一个 DICOM 序列
 * @param urls DICOM 文件 URL 列表
 * @returns 返回一个 Promise，该 Promise 解析为一个包含 Data3DTexture 和元数据的对象
 */
async function loadDicomSeries(urls: string[]): Promise<THREE.Data3DTexture> {
  console.log(`开始加载 ${urls.length} 个 DICOM 文件...`);

  try {
    // 1. 并行加载所有文件
    const responses = await Promise.all(urls.map(url => fetch(url)));
    const arrayBuffers = await Promise.all(responses.map(res => res.arrayBuffer()));

    console.log('所有文件加载完毕，开始解析...');

    // 2. 解析每个文件并提取元数据
    const slices = arrayBuffers.map((buffer, index) => {
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      // 提取排序所需的 ImagePositionPatient
      const imagePosition = dataSet.string('x00200032')!.split('\\').map(Number);

      return {
        index,
        dataSet,
        imagePosition,
      };
    });

    // 3. 空间排序
    // a. 获取第一张切片的方向向量，并计算法向量
    const firstSlice = slices[0];
    const imageOrientation = firstSlice.dataSet.string('x00200037')!.split('\\').map(Number);
    const rowCosines = new THREE.Vector3(imageOrientation[0], imageOrientation[1], imageOrientation[2]);
    const colCosines = new THREE.Vector3(imageOrientation[3], imageOrientation[4], imageOrientation[5]);
    const normal = new THREE.Vector3().crossVectors(rowCosines, colCosines);

    // b. 计算每个切片沿法向量的投影距离并排序
    slices.sort((a, b) => {
      const posA = new THREE.Vector3(a.imagePosition[0], a.imagePosition[1], a.imagePosition[2]);
      const posB = new THREE.Vector3(b.imagePosition[0], b.imagePosition[1], b.imagePosition[2]);
      return posA.dot(normal) - posB.dot(normal);
    });
    console.log(slices);

    console.log('DICOM 切片已根据空间位置排序。');

    // 4. 构建三维数据体
    const firstDataSet = slices[0].dataSet;
    const width = firstDataSet.uint16('x00280011')!; // Columns
    const height = firstDataSet.uint16('x00280010')!; // Rows
    const depth = slices.length;
    const bitsAllocated = firstDataSet.uint16('x00280100');

    // 根据 bitsAllocated 创建合适的数组
    // 注意：我们直接创建 Float32Array，因为最终传给 GPU 的很可能是浮点类型
    const volumeData = new Float32Array(width * height * depth);

    console.log(`数据体尺寸: ${width}x${height}x${depth}`);

    slices.forEach((slice, i) => {
      const pixelDataElement = slice.dataSet.elements.x7fe00010;
      // 根据 bitsAllocated 确定正确的数据类型视图
      let rawPixelData;
      if (bitsAllocated === 16) {
        rawPixelData = new Int16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
      } else {
        // 假设为 8
        rawPixelData = new Uint8Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length);
      }

      const rescaleSlope = parseFloat(slice.dataSet.string('x00281053') || '1');
      const rescaleIntercept = parseFloat(slice.dataSet.string('x00281052') || '0');

      const sliceOffset = i * width * height;
      for (let j = 0; j < rawPixelData.length; j++) {
        volumeData[sliceOffset + j] = rawPixelData[j] * rescaleSlope + rescaleIntercept;
      }
    });

    console.log('三维数据体构建完毕。');

    // 5. 创建 Data3DTexture
    const texture = new THREE.Data3DTexture(volumeData, width, height, depth);
    texture.format = THREE.RedFormat;
    texture.type = THREE.FloatType; // 我们已经将数据转为 Float32Array
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    console.log('Data3DTexture 创建成功。');

    return texture;
  } catch (error) {
    console.error('加载或处理 DICOM 序列时出错:', error);
    throw error;
  }
}

function initThree() {
  const container = document.getElementById('dicom-viewer');
  if (!container) return;

  // 场景
  scene = new THREE.Scene();

  // 相机
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const aspect = container.clientWidth / container.clientHeight;
  // 注意：我们创建一个足够大的正交相机来容纳图像平面
  camera = new THREE.OrthographicCamera(container.clientWidth / -2, container.clientWidth / 2, container.clientHeight / 2, container.clientHeight / -2, 0.1, 100);
  camera.position.set(0, 0, 10);

  // 渲染器
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
}

async function main() {
  initThree();

  // 构建文件 URL 列表
  const baseUrl = '/static/dicoms/CW023001-P001566398/';
  const fileCount = 462;
  const urls = [];
  for (let i = 1; i <= fileCount; i++) {
    const filename = `CW023001-P001566398-CT20200727153936_${String(i).padStart(4, '0')}.dcm`;
    urls.push(baseUrl + filename);
  }

  // 加载序列并创建 3D 纹理
  const volumeTexture = await loadDicomSeries(urls);

  // 打印纹理对象以验证
  console.log('最终生成的 3D 纹理对象:', volumeTexture);

  // 我们将在下一步中使用这个纹理来渲染一个切片
}

main().catch(console.error);
