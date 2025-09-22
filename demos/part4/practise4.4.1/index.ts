import { MPRViewer } from './mpr-viewer';
import { loadDicomSeries } from './loader';
import { GUI } from 'dat.gui';
import { CrossLine } from './cross-line';
import { Euler, Matrix4, Vector2 } from 'three';

const guiState = {
  windowWidth: 1200,
  windowCenter: -600,
  axialOffset: 0,
  coronalOffset: 0,
  sagittalOffset: 0,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const setupGui = (
  viewer: MPRViewer,
  windowWidth: number,
  windowCenter: number,
  axialCount: number,
  coronalCount: number,
  sagittalCount: number,
) => {
  const gui = new GUI();
  guiState.windowWidth = windowWidth;
  guiState.windowCenter = windowCenter;
  guiState.axialOffset = axialCount / 2;
  guiState.coronalOffset = coronalCount / 2;
  guiState.sagittalOffset = sagittalCount / 2;
  gui
    .add(guiState, 'windowWidth', 1, 3000, 1)
    .name('窗宽')
    .onChange(() => {
      viewer.setWWWC(guiState.windowWidth, guiState.windowCenter);
    });
  gui
    .add(guiState, 'windowCenter', -3000, 3000, 1)
    .name('窗位')
    .onChange(() => {
      viewer.setWWWC(guiState.windowWidth, guiState.windowCenter);
    });
  gui
    .add(guiState, 'axialOffset', 1, axialCount, 1)
    .name('轴位切片')
    .onChange(() => {
      viewer.changeSlice(guiState.axialOffset, 'axial');
    });
  gui
    .add(guiState, 'coronalOffset', 1, coronalCount, 1)
    .name('冠状位切片')
    .onChange(() => {
      viewer.changeSlice(guiState.coronalOffset, 'coronal');
    });
  gui
    .add(guiState, 'sagittalOffset', 1, sagittalCount, 1)
    .name('矢状位切片')
    .onChange(() => {
      viewer.changeSlice(guiState.sagittalOffset, 'sagittal');
    });
};

const lastAngles = {
  Axial: 0,
  Coronal: 0,
  Sagittal: 0,
};

document.addEventListener('DOMContentLoaded', async () => {
  const axialElement = document.getElementById('axial-view') as HTMLElement;
  const coronalElement = document.getElementById('coronal-view') as HTMLElement;
  const sagittalElement = document.getElementById('sagittal-view') as HTMLElement;
  let crossLine: CrossLine | null = null;
  const onResize = (name: 'Axial' | 'Sagittal' | 'Coronal', pixelSize: Vector2) => {
    Promise.resolve().then(() => {
      const config = crossLine!.crossConfigs.find(c => c.name === name)!;
      config.planePixelSize = pixelSize;
    });
    console.log('xxx', name, pixelSize);
  };
  const viewer = new MPRViewer(axialElement, coronalElement, sagittalElement, onResize);
  const { texture, metaData } = await loadDicomSeries();
  if (!texture) {
    return;
  }
  console.log('metaData', metaData);
  (window as any).viewer = viewer;
  viewer.init(texture, metaData);
  // setupGui(viewer, metaData.windowWidth, metaData.windowCenter, axialCount, coronalCount, sagittalCount);
  const onChange = (action: string, name: 'Axial' | 'Sagittal' | 'Coronal', matrix: Matrix4) => {
    if (action === 'rotate') {
      const currentAngle = new Euler().setFromRotationMatrix(matrix).z;
      const deltaAngle = currentAngle - lastAngles[name];
      if (name === 'Axial') {
        viewer.rotateView('Coronal', 'y', deltaAngle);
        viewer.rotateView('Sagittal', 'y', deltaAngle);
      } else if (name === 'Coronal') {
        viewer.rotateView('Axial', 'y', -deltaAngle);
        viewer.rotateView('Sagittal', 'x', deltaAngle);
      } else if (name === 'Sagittal') {
        viewer.rotateView('Axial', 'x', -deltaAngle);
        viewer.rotateView('Coronal', 'x', -deltaAngle);
      }
      lastAngles[name] = currentAngle;
    }
  };
  crossLine = new CrossLine(axialElement, coronalElement, sagittalElement, onChange);
});
