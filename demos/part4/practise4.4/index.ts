import { MPRViewer } from './mpr-viewer';
import { loadDicomSeries } from './loader';

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('dicom-viewer') as HTMLElement;
  const viewer = new MPRViewer(container);
  const texture = await loadDicomSeries();
  if (!texture) {
    return;
  }
  viewer.init(texture);
});
