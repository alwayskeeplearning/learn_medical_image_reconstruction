import { MPRViewer } from './mpr-viewer';
import { loadDicomSeries } from './loader';

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
  // const { axialSize, coronalSize, sagittalSize } = viewer.init(texture, metaData);
  // setupGui(viewer, metaData.windowWidth, metaData.windowCenter, axialSize, coronalSize, sagittalSize);
});
