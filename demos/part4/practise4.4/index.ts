import type { Scene as TScene, OrthographicCamera as TOrthographicCamera, WebGLRenderer as TWebGLRenderer, Mesh as TMesh } from 'three';
import { Scene, OrthographicCamera, WebGLRenderer } from 'three';

class MPRViewer {
  private container: HTMLElement;
  private scene: TScene;
  private camera: TOrthographicCamera;
  private renderer: TWebGLRenderer;
  private plane?: TMesh;
  constructor(element: HTMLElement) {
    this.container = element;
    this.scene = new Scene();
    this.camera = new OrthographicCamera(this.container.clientWidth / -2, this.container.clientWidth / 2, this.container.clientHeight / 2, this.container.clientHeight / -2, -5000, 5000);
    this.camera.position.set(0, 0, 10);
    this.renderer = new WebGLRenderer();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
  }
}

export { MPRViewer };
