import { CrossLine } from './cross-line';

const axialElement = document.getElementById('axial-view') as HTMLElement;
const coronalElement = document.getElementById('coronal-view') as HTMLElement;
const sagittalElement = document.getElementById('sagittal-view') as HTMLElement;

document.addEventListener('DOMContentLoaded', () => {
  new CrossLine(axialElement, coronalElement, sagittalElement);
});
