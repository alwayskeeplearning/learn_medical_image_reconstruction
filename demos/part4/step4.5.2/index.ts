import { MPRViewer } from './mpr-viewer';
import { loadDicomSeries } from './loader';
import { GUI } from 'dat.gui';

const guiState = {
  windowWidth: 1200,
  windowCenter: -600,
};

const setupGui = (viewer: MPRViewer, windowWidth: number, windowCenter: number) => {
  const gui = new GUI();
  guiState.windowWidth = windowWidth;
  guiState.windowCenter = windowCenter;
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
};

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('mpr-container') as HTMLElement;
  const axialElement = document.getElementById('axial-view') as HTMLElement;
  const coronalElement = document.getElementById('coronal-view') as HTMLElement;
  const sagittalElement = document.getElementById('sagittal-view') as HTMLElement;
  const viewer = new MPRViewer(container, axialElement, coronalElement, sagittalElement);
  const { texture, metaData } = await loadDicomSeries();
  if (!texture) {
    return;
  }
  console.log('metaData', metaData);
  (window as any).viewer = viewer;
  viewer.init(texture, metaData);
  setupGui(viewer, metaData.windowWidth, metaData.windowCenter);
});
