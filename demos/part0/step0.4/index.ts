import * as THREE from 'three';

const work = () => {
  // 1. 创建场景 (Scene)
  // 场景是所有物体的容器
  const scene = new THREE.Scene();

  // 2. 创建透视相机 (PerspectiveCamera)
  // fov: 视场角, aspect: 宽高比, near: 近裁剪面, far: 远裁剪面
  const camera = new THREE.PerspectiveCamera(75, document.body.clientWidth / document.body.clientHeight, 0.1, 1000);
  // 设置相机位置
  camera.position.z = 5;

  // 3. 创建渲染器 (WebGLRenderer)
  // 获取HTML中的canvas元素
  const canvas = document.getElementById('webgl') as HTMLCanvasElement;
  // 基于canvas元素创建渲染器
  const renderer = new THREE.WebGLRenderer({ canvas });
  // 设置渲染器尺寸为窗口大小
  renderer.setSize(document.body.clientWidth, document.body.clientHeight);

  // 4. 创建几何体 (BoxGeometry)
  // 定义一个1x1x1的立方体
  const geometry = new THREE.BoxGeometry(1, 1, 1);

  // 5. 创建材质 (MeshNormalMaterial)
  // 法向材质会根据面的朝向显示不同颜色，无需灯光
  const material = new THREE.MeshNormalMaterial();

  // 6. 创建网格 (Mesh)
  // 网格由几何体和材质组成
  const cube = new THREE.Mesh(geometry, material);
  // 将立方体添加到场景中
  scene.add(cube);

  // 7. 创建渲染循环 (Animation Loop)
  function animate() {
    // 请求下一帧动画
    requestAnimationFrame(animate);

    // 使立方体旋转
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;

    // 使用渲染器，通过相机将场景渲染出来
    renderer.render(scene, camera);
  }

  // 启动渲染循环
  animate();

  // 8. 监听窗口大小变化，实现响应式
  window.addEventListener('resize', () => {
    // 更新相机宽高比
    camera.aspect = document.body.clientWidth / document.body.clientHeight;
    // 更新相机的投影矩阵
    camera.updateProjectionMatrix();
    // 更新渲染器尺寸
    renderer.setSize(document.body.clientWidth, document.body.clientHeight);
  });

  // 打印当前使用的WebGL版本
  if (renderer.capabilities.isWebGL2) {
    console.log('成功创建 WebGL2 上下文!');
  } else {
    console.log('当前为 WebGL1 上下文。');
  }
};

document.addEventListener('DOMContentLoaded', work);
