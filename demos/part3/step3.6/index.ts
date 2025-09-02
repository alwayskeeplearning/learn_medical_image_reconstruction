import * as THREE from 'three';
import dicomParser from 'dicom-parser';
import WebGL from 'three/addons/capabilities/WebGL.js';

// --- GLSL 3.0 着色器代码 ---

const vertexShader = /* glsl */ `
  // -- 手动声明 Three.js 内置变量 ---
  // RawShaderMaterial 不会自动注入这些，需要我们自己定义
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  in vec3 position;
  in vec2 uv;
  // ------------------------------------

  // 'out' 用于将数据从顶点着色器传递到片元着色器
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  // 精确度声明
  precision highp float;
  precision highp sampler3D;

  // 从顶点着色器传入的 UV 坐标
  in vec2 vUv;

  // 自定义 uniform 变量
  uniform sampler3D u_volumeTexture;
  uniform float u_slice; // 归一化的切片索引 (0.0 to 1.0)
  uniform float u_windowWidth;
  uniform float u_windowLevel;

  // 定义输出变量
  out vec4 outColor;

  void main() {
    // 使用三维纹理坐标进行采样
    // vUv.x 是 u, vUv.y 是 v, u_slice 是 w (或 z)
    vec2 vUv = vec2(vUv.x, 1.0 - vUv.y);
    float ctValue = texture(u_volumeTexture, vec3(vUv, u_slice)).r;

    // 应用窗宽窗位逻辑
    float lower = u_windowLevel - u_windowWidth / 2.0;
    float upper = u_windowLevel + u_windowWidth / 2.0;

    ctValue = (ctValue - lower) / u_windowWidth;
    ctValue = clamp(ctValue, 0.0, 1.0);
    
    outColor = vec4(vec3(ctValue), 1.0);
  }
`;

// 首先，进行 WebGL2 能力检测
if (WebGL.isWebGL2Available() === false) {
  document.body.appendChild(WebGL.getWebGL2ErrorMessage());
  throw new Error('您的浏览器或设备不支持WebGL2');
}

// --- 全局变量 ---
let scene: THREE.Scene;
let camera: THREE.OrthographicCamera;
let renderer: THREE.WebGLRenderer;
let material: THREE.RawShaderMaterial; // <--- 修改类型
let plane: THREE.Mesh;

function onWindowResize() {
  const container = document.getElementById('dicom-viewer');
  if (!container || !renderer || !camera || !plane) return;

  const newWidth = container.clientWidth;
  const newHeight = container.clientHeight;

  renderer.setSize(newWidth, newHeight);

  // 核心逻辑：保持图像的宽高比，调整相机的视野
  const size = new THREE.Vector3();
  plane.geometry.computeBoundingBox();
  plane.geometry.boundingBox!.getSize(size);
  const imageWidth = size.x;
  const imageHeight = size.y;
  const imageAspect = imageWidth / imageHeight;
  const windowAspect = newWidth / newHeight;

  if (windowAspect > imageAspect) {
    // 窗口比图像更宽：以图像高度为基准，拉伸相机视口的宽度
    const newCameraHeight = imageHeight;
    const newCameraWidth = newCameraHeight * windowAspect;
    camera.left = -newCameraWidth / 2;
    camera.right = newCameraWidth / 2;
    camera.top = newCameraHeight / 2;
    camera.bottom = -newCameraHeight / 2;
  } else {
    // 窗口比图像更高：以图像宽度为基准，拉伸相机视口的高度
    const newCameraWidth = imageWidth;
    const newCameraHeight = newCameraWidth / windowAspect;
    camera.left = -newCameraWidth / 2;
    camera.right = newCameraWidth / 2;
    camera.top = newCameraHeight / 2;
    camera.bottom = -newCameraHeight / 2;
  }

  camera.updateProjectionMatrix();
}

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

    console.log('DICOM 切片已根据空间位置排序。');

    // 4. 构建三维数据体
    const firstDataSet = slices[0].dataSet;
    const width = firstDataSet.uint16('x00280011')!; // Columns
    const height = firstDataSet.uint16('x00280010')!; // Rows
    const depth = slices.length;
    const bitsAllocated = firstDataSet.uint16('x00280100');

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

function initThree(texture: THREE.Data3DTexture) {
  const container = document.getElementById('dicom-viewer');
  if (!container) return;

  // 场景
  scene = new THREE.Scene();

  // 相机
  const imageWidth = texture.image.width;
  const imageHeight = texture.image.height;
  camera = new THREE.OrthographicCamera(imageWidth / -2, imageWidth / 2, imageHeight / 2, imageHeight / -2, 0.1, 100);
  camera.position.set(0, 0, 10);

  // 渲染器
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // 材质
  material = new THREE.RawShaderMaterial({
    // <--- 修改为 RawShaderMaterial
    glslVersion: THREE.GLSL3, // 明确指定使用 GLSL 3.0
    vertexShader,
    fragmentShader,
    uniforms: {
      u_volumeTexture: { value: texture },
      u_slice: { value: 0.5 }, // 默认显示中间的切片
      u_windowWidth: { value: 400.0 }, // 腹窗
      u_windowLevel: { value: 40.0 },
    },
    side: THREE.DoubleSide,
  });

  // 平面
  const geometry = new THREE.PlaneGeometry(imageWidth, imageHeight);
  plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  // 添加 resize 事件监听并立即调用一次
  window.addEventListener('resize', onWindowResize);
  onWindowResize();
}

async function main() {
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

  console.log('最终生成的 3D 纹理对象:', volumeTexture);

  // 使用加载好的纹理来初始化场景
  initThree(volumeTexture);

  // 启动渲染循环
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

main().catch(console.error);
