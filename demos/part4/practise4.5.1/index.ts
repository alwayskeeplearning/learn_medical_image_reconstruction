import { CrossLine } from './cross-line';
import { Matrix4 } from 'three';

const axialElement = document.getElementById('axial-view') as HTMLElement;
const coronalElement = document.getElementById('coronal-view') as HTMLElement;
const sagittalElement = document.getElementById('sagittal-view') as HTMLElement;

document.addEventListener('DOMContentLoaded', () => {
  window.cl = new CrossLine(axialElement, coronalElement, sagittalElement);
  window.Matrix4 = Matrix4;
});
