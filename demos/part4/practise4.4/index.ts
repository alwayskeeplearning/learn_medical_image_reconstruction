import { GUI } from 'dat.gui';
import { MPRViewer } from './mpr-viewer';
import { loadDicomSeries } from './loader';

const guiState = {
  windowWidth: 1200,
  windowCenter: -600,
  axialOffset: 0,
  coronalOffset: 0,
  sagittalOffset: 0,
};

const setupGui = (viewer: MPRViewer, windowWidth: number, windowCenter: number, axialSize: number, coronalSize: number, sagittalSize: number) => {
  const gui = new GUI();
  guiState.windowWidth = windowWidth;
  guiState.windowCenter = windowCenter;
  guiState.axialOffset = axialSize / 2;
  guiState.coronalOffset = coronalSize / 2;
  guiState.sagittalOffset = sagittalSize / 2;
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
    .add(guiState, 'axialOffset', 1, axialSize, 1)
    .name('轴位切片')
    .onChange(() => {
      viewer.changeSlice(guiState.axialOffset, 'axial');
    });
  gui
    .add(guiState, 'coronalOffset', 1, coronalSize, 1)
    .name('冠状位切片')
    .onChange(() => {
      viewer.changeSlice(guiState.coronalOffset, 'coronal');
    });
  gui
    .add(guiState, 'sagittalOffset', 1, sagittalSize, 1)
    .name('矢状位切片')
    .onChange(() => {
      viewer.changeSlice(guiState.sagittalOffset, 'sagittal');
    });
};

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('dicom-viewer') as HTMLElement;
  const viewer = new MPRViewer(container);
  const { texture, metaData } = await loadDicomSeries();
  if (!texture) {
    return;
  }
  const { axialSize, coronalSize, sagittalSize } = viewer.init(texture, metaData);
  setupGui(viewer, metaData.windowWidth, metaData.windowCenter, axialSize, coronalSize, sagittalSize);
});
