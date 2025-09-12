import * as THREE from 'three';

// 定义每个视图的配置信息
type ViewConfig = {
  element: HTMLElement;
  name: 'Axial' | 'Coronal' | 'Sagittal';
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  uiScene: THREE.Scene;
  uiCamera: THREE.OrthographicCamera;
  horizontalLine: THREE.Line;
  verticalLine: THREE.Line;
};

class LinkedCrosshairsApp {
  private views: ViewConfig[] = [];
  // 共享的交点，使用归一化坐标 (0 to 1)
  private sharedPoint = new THREE.Vector3(0.5, 0.5, 0.5);
  private isDragging = false;

  constructor() {
    this.initViews();
    this.attachEvents();
    this.updateAllCrosshairs();
    this.animate();
  }

  private initViews() {
    const viewConfigs: { name: 'Axial' | 'Coronal' | 'Sagittal'; id: string }[] = [
      { name: 'Axial', id: 'axial-view' },
      { name: 'Coronal', id: 'coronal-view' },
      { name: 'Sagittal', id: 'sagittal-view' },
    ];

    const colors = {
      Axial: new THREE.Color(0x00ff00), // 绿色
      Coronal: new THREE.Color(0x0000ff), // 蓝色
      Sagittal: new THREE.Color(0xffff00), // 黄色
    };

    for (const config of viewConfigs) {
      const element = document.getElementById(config.id) as HTMLElement;
      if (!element) continue;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(element.clientWidth, element.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setClearColor(0x000000);
      element.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;

      const uiScene = new THREE.Scene();
      const uiCamera = new THREE.OrthographicCamera(0, element.clientWidth, element.clientHeight, 0, 0.1, 10);
      uiCamera.position.z = 1;

      let hMat: THREE.LineBasicMaterial, vMat: THREE.LineBasicMaterial;

      switch (config.name) {
        case 'Axial':
          hMat = new THREE.LineBasicMaterial({ color: colors.Coronal }); // 水平线代表冠状面
          vMat = new THREE.LineBasicMaterial({ color: colors.Sagittal }); // 垂直线代表矢状面
          break;
        case 'Coronal':
          hMat = new THREE.LineBasicMaterial({ color: colors.Axial }); // 水平线代表轴状面
          vMat = new THREE.LineBasicMaterial({ color: colors.Sagittal }); // 垂直线代表矢状面
          break;
        case 'Sagittal':
          hMat = new THREE.LineBasicMaterial({ color: colors.Axial }); // 水平线代表轴状面
          vMat = new THREE.LineBasicMaterial({ color: colors.Coronal }); // 垂直线代表冠状面
          break;
      }

      const hGeom = new THREE.BufferGeometry();
      hGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
      const horizontalLine = new THREE.Line(hGeom, hMat);

      const vGeom = new THREE.BufferGeometry();
      vGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
      const verticalLine = new THREE.Line(vGeom, vMat);

      uiScene.add(horizontalLine, verticalLine);

      this.views.push({
        element,
        name: config.name,
        renderer,
        scene,
        camera,
        uiScene,
        uiCamera,
        horizontalLine,
        verticalLine,
      });
    }
  }

  private attachEvents() {
    window.addEventListener('resize', this.handleResize.bind(this));

    this.views.forEach(view => {
      view.element.addEventListener('mousedown', e => {
        this.isDragging = true;
        this.updateSharedPoint(e, view);
      });

      view.element.addEventListener('mousemove', e => {
        if (this.isDragging) {
          this.updateSharedPoint(e, view);
        }
      });
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  // 根据在哪个视图中操作，来更新共享点
  private updateSharedPoint(e: MouseEvent, activeView: ViewConfig) {
    const rect = activeView.element.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    switch (activeView.name) {
      case 'Axial': // XY 平面
        this.sharedPoint.x = x;
        this.sharedPoint.y = y;
        break;
      case 'Coronal': // XZ 平面
        this.sharedPoint.x = x;
        this.sharedPoint.z = y;
        break;
      case 'Sagittal': // YZ 平面
        this.sharedPoint.y = x;
        this.sharedPoint.z = y;
        break;
    }
    this.updateAllCrosshairs();
  }

  // 使用共享点来更新所有三个视图的十字线
  private updateAllCrosshairs() {
    this.views.forEach(view => {
      const { clientWidth, clientHeight } = view.element;
      let xPixel: number, yPixel: number;

      // 根据视图类型，从 sharedPoint 映射到像素坐标
      switch (view.name) {
        case 'Axial':
          xPixel = this.sharedPoint.x * clientWidth;
          yPixel = this.sharedPoint.y * clientHeight;
          break;
        case 'Coronal':
          xPixel = this.sharedPoint.x * clientWidth;
          yPixel = this.sharedPoint.z * clientHeight;
          break;
        case 'Sagittal':
          xPixel = this.sharedPoint.y * clientWidth;
          yPixel = this.sharedPoint.z * clientHeight;
          break;
      }

      const correctedY = clientHeight - yPixel; // Y 轴翻转

      // 更新水平线
      const hPositions = view.horizontalLine.geometry.attributes.position as THREE.BufferAttribute;
      hPositions.setXYZ(0, 0, correctedY, 0);
      hPositions.setXYZ(1, clientWidth, correctedY, 0);
      hPositions.needsUpdate = true;

      // 更新垂直线
      const vPositions = view.verticalLine.geometry.attributes.position as THREE.BufferAttribute;
      vPositions.setXYZ(0, xPixel, 0, 0);
      vPositions.setXYZ(1, xPixel, clientHeight, 0);
      vPositions.needsUpdate = true;
    });
  }

  private handleResize() {
    this.views.forEach(view => {
      const { element, renderer, uiCamera } = view;
      const { clientWidth, clientHeight } = element;

      renderer.setSize(clientWidth, clientHeight);
      uiCamera.left = 0;
      uiCamera.right = clientWidth;
      uiCamera.top = clientHeight;
      uiCamera.bottom = 0;
      uiCamera.updateProjectionMatrix();
    });
    this.updateAllCrosshairs();
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.views.forEach(view => {
      const { renderer, scene, camera, uiScene, uiCamera } = view;
      renderer.autoClear = false;
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(uiScene, uiCamera);
    });
  }
}

new LinkedCrosshairsApp();
