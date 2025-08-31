import * as THREE from 'three';
import dicomParser from 'dicom-parser';

// =================================================================
// GLSL 着色器代码 (使用兼容性最好的 GLSL 1.0 语法)
// =================================================================

const vertexShader = `
    // varying 变量，用于将 UV 坐标从顶点着色器传递到片元着色器
    varying vec2 vUv;

    void main() {
        // 将几何体自带的 uv 属性(attribute)赋值给 varying 变量 vUv
        vUv = uv;

        // gl_Position 是一个内置的特殊变量，表示顶点的最终裁剪空间坐标
        // projectionMatrix 和 modelViewMatrix 是 Three.js 自动传入的 uniform 矩阵
        // position 是几何体自带的 attribute 顶点位置
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    // 从顶点着色器传入的、经过插值的 UV 坐标
    varying vec2 vUv;

    // 我们自定义的 uniform 变量
    uniform sampler2D u_dicomTexture; // DICOM 纹理采样器
    
    // 新增: 接收窗宽和窗位
    uniform float u_windowWidth;
    uniform float u_windowLevel;

    void main() {
        float ctValue = texture2D(u_dicomTexture, vUv).r;

        // 计算窗宽定义的 CT 值下限和上限
        float lower = u_windowLevel - u_windowWidth / 2.0;
        
        // 应用窗宽窗位公式
        float normalizedValue = (ctValue - lower) / u_windowWidth;

        // 使用 clamp 函数将结果严格限制在 [0.0, 1.0] 范围内
        normalizedValue = clamp(normalizedValue, 0.0, 1.0);

        gl_FragColor = vec4(normalizedValue, normalizedValue, normalizedValue, 1.0);
    }
`;

// =================================================================
// 核心要素 1: 场景 (Scene)
// 这是所有物体的容器，是我们的虚拟“世界”。
// =================================================================
const scene = new THREE.Scene();
// 为了能看清物体，我们给场景设置一个深灰色的背景。
scene.background = new THREE.Color(0x202020);

// =================================================================
// 核心要素 2: 相机 (Camera)
// 这是我们的“眼睛”，决定了我们从哪个角度、以什么方式观察世界。
// 我们使用正交相机(OrthographicCamera)，它没有透视效果，非常适合2D展示。
// 参数 (-1, 1, 1, -1) 定义了相机的可视范围，分别是左、右、上、下。
// 这意味着相机能看到的区域高度是2个单位(从-1到1)，宽度也是2个单位(从-1到1)。
// =================================================================
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
// 我们把相机放在Z轴正方向上，让它朝向原点(0,0,0)进行观察。
camera.position.z = 1;

// =================================================================
// 核心要素 3: 物体 (Mesh)
// 这是场景中的“演员”，由形状(Geometry)和外观(Material)组成。
// =================================================================

// 3.1 几何体 (Geometry): 定义物体的形状。
// PlaneGeometry 用于创建一个矩形平面。参数 (width, height)。
// 我们创建一个 1x1 大小的正方形。
const geometry = new THREE.PlaneGeometry(1, 1);

// 3.2 材质 (Material): 定义物体的外观。
// MeshBasicMaterial 是一种不受光照影响的基础材质。
// 我们设置它的颜色为白色 (0xffffff)。
const material = new THREE.ShaderMaterial({
  vertexShader: vertexShader,
  fragmentShader: fragmentShader,
  uniforms: {
    u_dicomTexture: { value: null },
    // 新增: 初始化窗宽窗位 uniform
    u_windowWidth: { value: 400.0 },
    u_windowLevel: { value: 40.0 },
  },
  side: THREE.DoubleSide,
});

// 3.3 网格 (Mesh): 组合几何体和材质，创建一个完整的可见物体。
const plane = new THREE.Mesh(geometry, material);

// 最后，将这个物体添加到我们的场景中。
scene.add(plane);

// =================================================================
// 核心要素 4: 渲染器 (Renderer)
// 这是“放映员”，负责将相机“拍摄”到的场景画面绘制到浏览器上。
// =================================================================
const renderer = new THREE.WebGLRenderer();
// 设置渲染器的大小，通常是整个窗口的宽高。
renderer.setSize(window.innerWidth, window.innerHeight);
// 将渲染器生成的 <canvas> 元素添加到页面的 <body> 中。
document.body.appendChild(renderer.domElement);

// =================================================================
// 新增: UI 交互逻辑
// =================================================================
const wwSlider = document.getElementById('window-width') as HTMLInputElement;
const wlSlider = document.getElementById('window-level') as HTMLInputElement;
const wwValueSpan = document.getElementById('ww-value')!;
const wlValueSpan = document.getElementById('wl-value')!;

wwSlider.addEventListener('input', event => {
  const newWidth = parseFloat((event.target as HTMLInputElement).value);
  material.uniforms.u_windowWidth.value = newWidth;
  wwValueSpan.textContent = newWidth.toFixed(0);
});

wlSlider.addEventListener('input', event => {
  const newLevel = parseFloat((event.target as HTMLInputElement).value);
  material.uniforms.u_windowLevel.value = newLevel;
  wlValueSpan.textContent = newLevel.toFixed(0);
});

// =================================================================
// 新增：窗口自适应逻辑
// =================================================================
function onResize() {
  // 1. 获取当前窗口的宽高
  const newWidth = window.innerWidth;
  const newHeight = window.innerHeight;

  // 2. 更新渲染器尺寸
  renderer.setSize(newWidth, newHeight);

  // 3. 计算窗口的宽高比 和 图像的宽高比
  const windowAspect = newWidth / newHeight;
  // plane.geometry.parameters.width 是我们为 plane 设置的宽度
  const imageAspect = plane.geometry.parameters.width / plane.geometry.parameters.height;

  // 4. 核心逻辑：比较宽高比，调整相机视野
  // 我们希望相机拍摄的画面能“正好”框住我们的图像平面
  if (windowAspect > imageAspect) {
    // 情况A: 窗口比图像更“宽” (例如 宽屏显示器看一个方形图像)
    // 为了让图像在垂直方向上撑满画面，我们保持相机的 top/bottom 为 -1/1
    camera.top = 1;
    camera.bottom = -1;
    // 然后根据比例，拉伸相机的 left/right，使其视野更宽
    // 这样图像的左右两侧就会留出背景色，即“黑边”
    camera.left = -windowAspect / imageAspect;
    camera.right = windowAspect / imageAspect;
  } else {
    // 情况B: 窗口比图像更“高” (例如 手机竖屏看一个宽屏电影)
    // 为了让图像在水平方向上撑满画面，我们保持相机的 left/right 为 -1/1
    // 注意：这里left/right的值需要乘以图像的宽高比，以匹配plane的宽度
    const planeWidth = plane.geometry.parameters.width;
    camera.left = -planeWidth / 2;
    camera.right = planeWidth / 2;
    // 然后根据比例，拉伸相机的 top/bottom，使其视野更高
    // 这样图像的上下两侧就会留出背景色
    camera.top = planeWidth / 2 / windowAspect;
    camera.bottom = -(planeWidth / 2) / windowAspect;
  }

  // 5. 应用相机属性更改
  camera.updateProjectionMatrix();
}

// 监听窗口的 resize 事件
window.addEventListener('resize', onResize);

// =================================================================
// 核心要素 5: 渲染循环 (Animation Loop)
// 为了让场景能够持续显示（并在未来响应交互），我们需要一个循环函数。
// =================================================================
function animate() {
  // requestAnimationFrame 会在浏览器下一次重绘前调用 animate 函数。
  // 这形成了一个高效的循环，通常能达到 60fps。
  requestAnimationFrame(animate);

  // 在每一帧，我们都调用渲染器的 render 方法，
  // 告诉它用指定的相机(camera)来渲染指定的场景(scene)。
  renderer.render(scene, camera);
}

// 启动渲染循环！
animate();

// =================================================================
// 新增：DICOM 数据加载与处理
// =================================================================
async function loadDicom() {
  // 1. 获取 DICOM 文件数据
  const url = '/static/dicoms/CW023001-P001566398/CW023001-P001566398-CT20200727153936_0001.dcm'; // 请确保文件路径正确
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);

  // 2. 解析 DICOM 数据集
  const dataSet = dicomParser.parseDicom(byteArray);

  // 3. 提取图像信息
  const rows = dataSet.uint16('x00280010') || 512;
  const columns = dataSet.uint16('x00280011') || 512;
  // 【关键修复】使用正确的 DICOM Tag 读取斜率和截距
  const slope = dataSet.floatString('x00281053', 0) || 1;
  const intercept = dataSet.floatString('x00281052', 0) || 0;
  const pixelDataElement = dataSet.elements.x7fe00010;
  const rawPixelData = new Int16Array(dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);

  // 4. 【优化】CPU 端预处理：一步到位，直接生成半浮点格式的 Uint16Array
  const ctValuesHalf = new Uint16Array(rawPixelData.length);
  for (let i = 0; i < rawPixelData.length; i++) {
    // 4.1. 计算真实的 CT 值 (浮点数)
    const ctValue = rawPixelData[i] * slope + intercept;
    // 4.2. 立刻将其转换为半浮点格式并存入最终数组
    ctValuesHalf[i] = THREE.DataUtils.toHalfFloat(ctValue);
  }

  // 5. 创建数据纹理，现在传入转换后的数据
  const texture = new THREE.DataTexture(ctValuesHalf, columns, rows, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.flipY = true;
  texture.needsUpdate = true;

  // 6. 更新平面物体的形状和材质

  // 6.1 更新几何体 (逻辑不变)
  const imageAspect = columns / rows;
  const planeHeight = 2;
  const planeWidth = planeHeight * imageAspect;

  plane.geometry.dispose();
  plane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

  // 6.2 更新材质 (更新 uniform)
  material.uniforms.u_dicomTexture.value = texture;

  // 7. 数据加载完成后，手动调用一次 onResize
  onResize();
}

loadDicom().catch(console.error);
