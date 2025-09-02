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
  uniform sampler3D uTexture; // <-- 重命名
  uniform float uSlice;      // <-- 重命名 (现在是原始索引)
  uniform float uSliceCount; // <-- 新增: 总切片数
  uniform float uWindowWidth;  // <-- 重命名
  uniform float uWindowLevel;  // <-- 重命名

  // 定义输出变量
  out vec4 outColor;

  void main() {
    // 使用三维纹理坐标进行采样
    vec2 flippedUv = vec2(vUv.x, 1.0 - vUv.y);

    // 在着色器内部进行归一化，以获得正确的纹理 z 坐标
    float sliceZ = uSlice / uSliceCount;
    float ctValue = texture(uTexture, vec3(flippedUv, sliceZ)).r;

    // 应用窗宽窗位逻辑
    float lower = uWindowLevel - uWindowWidth / 2.0;
    float upper = uWindowLevel + uWindowWidth / 2.0;

    ctValue = (ctValue - lower) / uWindowWidth;
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
let currentSliceIndex: number; // <--- 新增: 用于跟踪当前切片索引
const dicomState = {
  // 用于存储与 DICOM 数据相关的状态
  totalSlices: 0,
};

// --- 新增: 用于跟踪鼠标拖拽状态 ---
const dragState = {
  isDragging: false,
  previousMouseY: 0,
  accumulatedDelta: 0,
  // 速度/灵敏度因子：数值越小，滚动越快。
  // 它代表了“拖拽多少像素才切换一张切片”
  pixelsPerSlice: 2,
};

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
 * 设置拖拽事件监听器
 */
function setupDragControls() {
  const container = document.getElementById('dicom-viewer');
  if (!container) return;

  // 1. 鼠标按下：开始拖拽
  container.addEventListener('mousedown', event => {
    // 只响应鼠标左键
    if (event.button === 0) {
      dragState.isDragging = true;
      dragState.previousMouseY = event.clientY;
      dragState.accumulatedDelta = 0; // 重置累加器
    }
  });

  // 2. 鼠标移动：执行拖拽
  container.addEventListener('mousemove', event => {
    if (!dragState.isDragging) {
      return;
    }

    const deltaY = event.clientY - dragState.previousMouseY;
    dragState.previousMouseY = event.clientY;

    dragState.accumulatedDelta += deltaY;

    const sliceChange = Math.floor(dragState.accumulatedDelta / dragState.pixelsPerSlice);

    if (sliceChange !== 0) {
      // 从累加器中减去已经处理掉的部分
      dragState.accumulatedDelta -= sliceChange * dragState.pixelsPerSlice;

      // 更新当前切片索引
      // 注意：您已将排序反转，切片0为头顶。
      // 鼠标向下拖动 (deltaY > 0) 应该使我们朝脚的方向移动，即增加索引。
      currentSliceIndex += sliceChange;

      // 钳制索引在有效范围内
      currentSliceIndex = Math.max(0, currentSliceIndex);
      currentSliceIndex = Math.min(dicomState.totalSlices - 1, currentSliceIndex);

      // 更新 shader uniform
      if (material) {
        material.uniforms.uSlice.value = currentSliceIndex;
      }
      // console.log(`拖拽更新切片索引: ${currentSliceIndex}`);
    }
  });

  // 3. 鼠标松开：结束拖拽 (在 window 上监听以防鼠标在画布外松开)
  window.addEventListener('mouseup', event => {
    if (event.button === 0) {
      dragState.isDragging = false;
    }
  });

  // 4. 鼠标移出画布：同样结束拖拽
  container.addEventListener('mouseleave', () => {
    dragState.isDragging = false;
  });
}

/**
 * 设置滚轮事件监听器
 */
function setupWheelListener() {
  const container = document.getElementById('dicom-viewer');
  if (!container) return;

  container.addEventListener(
    'wheel',
    event => {
      // 阻止页面滚动等默认行为
      event.preventDefault();

      // event.deltaY > 0 表示向下滚动, 增加索引
      // event.deltaY < 0 表示向上滚动, 减少索引
      const direction = event.deltaY > 0 ? 1 : -1;
      currentSliceIndex += direction;

      // 使用 Math.max 和 Math.min 来确保索引在有效范围内
      currentSliceIndex = Math.max(0, currentSliceIndex);
      currentSliceIndex = Math.min(dicomState.totalSlices - 1, currentSliceIndex);

      // 更新 shader uniform
      if (material) {
        material.uniforms.uSlice.value = currentSliceIndex;
      }

      console.log(`当前切片索引: ${currentSliceIndex}`);
    },
    { passive: false }, // passive: false 是为了允许 preventDefault
  );
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
      return posB.dot(normal) - posA.dot(normal);
    });

    console.log('DICOM 切片已根据空间位置排序。');

    // 4. 构建三维数据体
    const firstDataSet = slices[0].dataSet;
    const width = firstDataSet.uint16('x00280011')!; // Columns
    const height = firstDataSet.uint16('x00280010')!; // Rows
    const depth = slices.length;
    const bitsAllocated = firstDataSet.uint16('x00280100');
    const pixelRepresentation = firstDataSet.uint16('x00280103'); // 0 = unsigned, 1 = signed

    // 注意：我们直接创建 Float32Array，因为最终传给 GPU 的很可能是浮点类型
    const volumeData = new Float32Array(width * height * depth);

    console.log(`数据体尺寸: ${width}x${height}x${depth}`);

    slices.forEach((slice, i) => {
      const pixelDataElement = slice.dataSet.elements.x7fe00010;
      // 根据 bitsAllocated 确定正确的数据类型视图
      let rawPixelData;
      if (bitsAllocated === 16) {
        // 根据 Pixel Representation 判断使用有符号还是无符号数组
        if (pixelRepresentation === 1) {
          rawPixelData = new Int16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
        } else {
          rawPixelData = new Uint16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
        }
      } else {
        // 假设为 8 位，通常是无符号
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
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
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
  const imageDepth = texture.image.depth; // <--- 获取深度

  // 将总切片数存入状态对象
  dicomState.totalSlices = imageDepth;

  // 设置初始切片索引为中间值
  currentSliceIndex = Math.floor(imageDepth / 2);

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
      uTexture: { value: texture }, // <-- 重命名
      uSlice: { value: currentSliceIndex }, // <-- 使用索引
      uSliceCount: { value: imageDepth }, // <-- 新增
      uWindowWidth: { value: 1200.0 }, // <-- 重命名
      uWindowLevel: { value: -600.0 }, // <-- 重命名
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

  // 设置滚轮监听
  setupWheelListener();
  // --- 新增: 设置拖拽监听 ---
  setupDragControls();
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
