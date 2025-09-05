import type { Data3DTexture as TData3DTexture, Scene as TScene, OrthographicCamera as TOrthographicCamera, WebGLRenderer as TWebGLRenderer, Mesh as TMesh, PerspectiveCamera as TPerspectiveCamera } from 'three';
import { Scene, OrthographicCamera, WebGLRenderer, AxesHelper, CameraHelper, PerspectiveCamera } from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';

class MPRViewer {
  private container: HTMLElement;
  private scene: TScene;
  private mprCamera: TOrthographicCamera; // MPR业务相机
  private debugCamera: TPerspectiveCamera; // 上帝视角调试相机
  private renderer: TWebGLRenderer;
  private controls: TrackballControls;
  private plane?: TMesh;
  constructor(element: HTMLElement) {
    this.container = element;
    this.scene = new Scene();

    // MPR业务相机
    this.mprCamera = new OrthographicCamera(this.container.clientWidth / -2, this.container.clientWidth / 2, this.container.clientHeight / 2, this.container.clientHeight / -2, -800, 800);
    this.mprCamera.position.set(0, 0, 0);
    const cameraHelper = new CameraHelper(this.mprCamera);
    this.scene.add(cameraHelper);

    // 上帝视角调试相机
    this.debugCamera = new PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 7000);
    this.debugCamera.position.set(100, 100, 1200);
    this.debugCamera.lookAt(this.scene.position);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
    // 控制器现在控制调试相机
    this.controls = new TrackballControls(this.debugCamera, this.renderer.domElement);
    this.controls.noPan = true;
    this.controls.rotateSpeed = 5.0;
    this.controls.zoomSpeed = 1.2;
    this.controls.staticMoving = false;
    this.controls.dynamicDampingFactor = 0.3;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.addHelper();
    this.animate();
    this.attachEvent();
  }
  animate() {
    // 使用调试相机进行渲染
    this.renderer.render(this.scene, this.debugCamera);
    this.controls.update();
    requestAnimationFrame(this.animate.bind(this));
  }
  addHelper() {
    const axesHelper = new AxesHelper(500);
    this.scene.add(axesHelper);
    const cameraHelper = new CameraHelper(this.mprCamera);
    this.scene.add(cameraHelper);
  }
  attachEvent() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.mprCamera.left = this.container.clientWidth / -2;
      this.mprCamera.right = this.container.clientWidth / 2;
      this.mprCamera.top = this.container.clientHeight / 2;
      this.mprCamera.bottom = this.container.clientHeight / -2;
      this.mprCamera.updateProjectionMatrix();
      this.debugCamera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.debugCamera.updateProjectionMatrix();
    });
  }
  init(texture: TData3DTexture) {
    console.log(texture);
  }
}

export { MPRViewer };
