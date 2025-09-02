import type { Scene as TScene, OrthographicCamera as TOrthographicCamera, WebGLRenderer as TWebGLRenderer, Mesh as TMesh, Data3DTexture as TData3DTexture } from 'three';
import { Vector3, Scene, OrthographicCamera, WebGLRenderer, Mesh, PlaneGeometry, RawShaderMaterial, GLSL3 } from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { loadDicomSeries } from './loader';
import { vertexShader } from './vertexShader';
import { fragmentShader } from './fragmentShader';

class DicomViewer {
  private container: HTMLElement;
  private scene: TScene;
  private camera: TOrthographicCamera;
  private renderer: TWebGLRenderer;
  private plane?: TMesh;
  private currentSliceIndex: number;
  private sliceCount: number;
  private dragState: {
    isDragging: boolean;
    previousMouseY: number;
    accumulatedDelta: number;
    pixelsPerSlice: number;
  };
  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.renderer = new WebGLRenderer();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.currentSliceIndex = 0;
    this.sliceCount = 0;
    this.dragState = {
      isDragging: false,
      previousMouseY: 0,
      accumulatedDelta: 0,
      pixelsPerSlice: 2,
    };
    this.attachEvents();
  }

  private onWindowResize() {
    const { container, renderer, camera, plane } = this;
    if (!container || !renderer || !camera || !plane) {
      return;
    }
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    renderer.setSize(containerWidth, containerHeight);
    const size = new Vector3();
    plane.geometry.computeBoundingBox();
    plane.geometry.boundingBox!.getSize(size);
    const imageWidth = size.x;
    const imageHeight = size.y;
    const imageAspect = imageWidth / imageHeight;
    const windowAspect = containerWidth / containerHeight;
    if (windowAspect > imageAspect) {
      // 窗口比图像更宽：以图像高度为基准，拉伸相机视口的宽度
      const newCameraHeight = imageHeight;
      const newCameraWidth = newCameraHeight * windowAspect;
      console.log('windowAspect > imageAspect', newCameraWidth, newCameraHeight);

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
      console.log('windowAspect < imageAspect', newCameraWidth, newCameraHeight);
    }
    camera.updateProjectionMatrix();
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();

    // event.deltaY > 0 表示向下滚动, 增加索引
    // event.deltaY < 0 表示向上滚动, 减少索引
    const direction = event.deltaY > 0 ? 1 : -1;
    this.currentSliceIndex += direction;

    // 确保索引在有效范围内 [0, sliceCount - 1]
    this.currentSliceIndex = Math.max(0, Math.min(this.sliceCount - 1, this.currentSliceIndex));
    this.currentSliceIndex = Math.min(this.sliceCount - 1, this.currentSliceIndex);
    // 更新着色器中的 uSliceIndex
    if (this.plane?.material) {
      (this.plane.material as RawShaderMaterial).uniforms.uSliceIndex.value = this.currentSliceIndex;
    }
    // console.log(`当前切片索引: ${this.currentSliceIndex}`);
  }

  private attachEvents() {
    if (!this.container) {
      return;
    }
    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.container.addEventListener('wheel', this.onWheel.bind(this));
    this.container.addEventListener('mousedown', event => {
      // 只响应鼠标左键
      if (event.button === 0) {
        this.dragState.isDragging = true;
        this.dragState.previousMouseY = event.clientY;
        this.dragState.accumulatedDelta = 0; // 重置累加器
      }
    });
    // 2. 鼠标移动：执行拖拽
    this.container.addEventListener('mousemove', event => {
      if (!this.dragState.isDragging) {
        return;
      }

      const deltaY = event.clientY - this.dragState.previousMouseY;
      this.dragState.previousMouseY = event.clientY;

      this.dragState.accumulatedDelta += deltaY;

      const sliceChange = Math.floor(this.dragState.accumulatedDelta / this.dragState.pixelsPerSlice);

      if (sliceChange !== 0) {
        // 从累加器中减去已经处理掉的部分
        this.dragState.accumulatedDelta -= sliceChange * this.dragState.pixelsPerSlice;

        // 更新当前切片索引
        // 注意：您已将排序反转，切片0为头顶。
        // 鼠标向下拖动 (deltaY > 0) 应该使我们朝脚的方向移动，即增加索引。
        this.currentSliceIndex += sliceChange;

        // 钳制索引在有效范围内
        this.currentSliceIndex = Math.max(0, this.currentSliceIndex);
        this.currentSliceIndex = Math.min(this.sliceCount - 1, this.currentSliceIndex);

        // 更新 shader uniform
        if (this.plane?.material) {
          (this.plane.material as RawShaderMaterial).uniforms.uSliceIndex.value = this.currentSliceIndex;
        }
        // console.log(`拖拽更新切片索引: ${currentSliceIndex}`);
      }
    });
    this.container.addEventListener('mouseup', event => {
      if (event.button === 0) {
        this.dragState.isDragging = false;
      }
    });
    this.container.addEventListener('mouseleave', () => {
      this.dragState.isDragging = false;
    });
  }

  init(texture3D: TData3DTexture) {
    const sliceWidth = texture3D.image.width;
    const sliceHeight = texture3D.image.height;
    const sliceDepth = texture3D.image.depth;
    this.sliceCount = sliceDepth;
    const geometry = new PlaneGeometry(sliceWidth, sliceHeight);
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture3D: { value: texture3D },
        uSliceIndex: { value: this.currentSliceIndex },
        uSliceCount: { value: sliceDepth },
        uWindowWidth: { value: 1200.0 },
        uWindowLevel: { value: -600.0 },
      },
    });
    const plane = new Mesh(geometry, material);
    this.plane = plane;
    this.scene.add(plane);
    this.onWindowResize();
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (WebGL.isWebGL2Available() === false) {
    document.body.appendChild(WebGL.getWebGL2ErrorMessage());
    throw new Error('您的浏览器或设备不支持WebGL2');
  }
  const texture = await loadDicomSeries();
  if (!texture) {
    return;
  }
  const container = document.getElementById('dicom-viewer');
  if (!container) {
    return;
  }
  const dicomViewer = new DicomViewer(container);
  dicomViewer.init(texture);
  dicomViewer.animate();
});
