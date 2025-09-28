/* eslint-disable @typescript-eslint/no-unused-vars */
import { MPRViewer } from './mpr-viewer';
import { loadDicomSeries } from './loader';
import { GUI } from 'dat.gui';
import { CrossLine } from './cross-line';
import { Euler, Vector2 } from 'three';

const guiState = {
  windowWidth: 1200,
  windowCenter: -600,
  axialOffset: 0,
  coronalOffset: 0,
  sagittalOffset: 0,
};

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

const lastTranslates = {
  Axial: 0,
  Coronal: 0,
  Sagittal: 0,
};
document.addEventListener('mouseup', e => {
  lastTranslates.Axial = 0;
  lastTranslates.Coronal = 0;
  lastTranslates.Sagittal = 0;
  lastAngles.Axial = 0;
  lastAngles.Coronal = 0;
  lastAngles.Sagittal = 0;
});
document.addEventListener('DOMContentLoaded', async () => {
  const axialElement = document.getElementById('axial-view') as HTMLElement;
  const coronalElement = document.getElementById('coronal-view') as HTMLElement;
  const sagittalElement = document.getElementById('sagittal-view') as HTMLElement;

  const axialSliceSlider = document.getElementById('axial-slice-slider') as HTMLInputElement;
  const axialMipThicknessSlider = document.getElementById('axial-mip-thickness-slider') as HTMLInputElement;
  const sagittalSliceSlider = document.getElementById('sagittal-slice-slider') as HTMLInputElement;
  const coronalSliceSlider = document.getElementById('coronal-slice-slider') as HTMLInputElement;

  let crossLine: CrossLine | null = null;
  const onResize = (name: 'Axial' | 'Sagittal' | 'Coronal', planePixelSize: Vector2, totalCount: number) => {
    Promise.resolve().then(() => {
      const config = crossLine!.crossConfigs.find(c => c.name === name)!;
      config.planePixelSize = planePixelSize;
      config.totalCount = totalCount;
    });
  };
  const viewer = new MPRViewer(axialElement, coronalElement, sagittalElement, onResize);
  const { texture, metaData } = await loadDicomSeries();
  if (!texture) {
    return;
  }
  console.log('metaData', metaData);
  (window as any).viewer = viewer;
  viewer.init(texture, metaData);

  axialSliceSlider.max = sagittalSliceSlider.max = coronalSliceSlider.max = `${metaData.zLength - 1}`;
  axialMipThicknessSlider.min = '0';
  axialMipThicknessSlider.max = `${metaData.zLength / 2}`;
  axialMipThicknessSlider.step = '1';
  axialMipThicknessSlider.value = '0';

  axialMipThicknessSlider.addEventListener('input', () => {
    const thickness = parseFloat(axialMipThicknessSlider.value);
    viewer.setMIPThickness(thickness);
  });

  axialSliceSlider.addEventListener('input', () => {
    const slice = parseInt(axialSliceSlider.value, 10);
    viewer.changeSlice(slice, 'axial');
  });

  sagittalSliceSlider.addEventListener('input', () => {
    const slice = parseInt(sagittalSliceSlider.value, 10);
    viewer.changeSlice(slice, 'sagittal');
  });

  coronalSliceSlider.addEventListener('input', () => {
    const slice = parseInt(coronalSliceSlider.value, 10);
    viewer.changeSlice(slice, 'coronal');
  });

  // setupGui(viewer, metaData.windowWidth, metaData.windowCenter, axialCount, coronalCount, sagittalCount);
  const onChange = (action: string, name: 'Axial' | 'Sagittal' | 'Coronal', value: any) => {
    if (action === 'rotate') {
      const currentAngle = value;
      const deltaAngle = currentAngle - lastAngles[name];
      const axialMatrix = crossLine?.crossConfigs.find(c => c.name === 'Axial')?.matrix;
      const coronalMatrix = crossLine?.crossConfigs.find(c => c.name === 'Coronal')?.matrix;
      const sagittalMatrix = crossLine?.crossConfigs.find(c => c.name === 'Sagittal')?.matrix;
      if (name === 'Axial') {
        const tiltAngle = new Euler().setFromRotationMatrix(coronalMatrix!).z;
        viewer.rotateView('Coronal', 'y', tiltAngle, -deltaAngle);
        const tiltAngle2 = new Euler().setFromRotationMatrix(sagittalMatrix!).z;
        viewer.rotateView('Sagittal', 'y', -tiltAngle2, -deltaAngle);
      } else if (name === 'Coronal') {
        const tiltAngle = new Euler().setFromRotationMatrix(axialMatrix!).z;
        viewer.rotateView('Axial', 'y', -tiltAngle, deltaAngle);
        const tiltAngle2 = new Euler().setFromRotationMatrix(sagittalMatrix!).z;
        viewer.rotateView('Sagittal', 'x', tiltAngle2, -deltaAngle);
      } else if (name === 'Sagittal') {
        const tiltAngle = new Euler().setFromRotationMatrix(axialMatrix!).z;
        viewer.rotateView('Axial', 'x', -tiltAngle, deltaAngle);
        const tiltAngle2 = new Euler().setFromRotationMatrix(coronalMatrix!).z;
        viewer.rotateView('Coronal', 'x', tiltAngle2, deltaAngle);
      }
      lastAngles[name] = currentAngle;
    } else {
      if (name === 'Axial') {
        const coronalDelta = Math.floor(value.y) - lastTranslates['Coronal'];
        const sagittalDelta = Math.floor(value.x) - lastTranslates['Sagittal'];
        viewer.changeSliceDelta(coronalDelta, 'coronal');
        viewer.changeSliceDelta(sagittalDelta, 'sagittal');
        lastTranslates['Coronal'] = Math.floor(value.y);
        lastTranslates['Sagittal'] = Math.floor(value.x);
      } else if (name === 'Coronal') {
        const sagittalDelta = Math.floor(value.x) - lastTranslates['Sagittal'];
        const axialDelta = Math.floor(value.y) - lastTranslates['Axial'];
        viewer.changeSliceDelta(axialDelta, 'axial');
        viewer.changeSliceDelta(sagittalDelta, 'sagittal');
        lastTranslates['Sagittal'] = Math.floor(value.x);
        lastTranslates['Axial'] = Math.floor(value.y);
      } else if (name === 'Sagittal') {
        const axialDelta = Math.floor(value.y) - lastTranslates['Axial'];
        const coronalDelta = Math.floor(value.x) - lastTranslates['Coronal'];
        viewer.changeSliceDelta(axialDelta, 'axial');
        viewer.changeSliceDelta(coronalDelta, 'coronal');
        lastTranslates['Axial'] = Math.floor(value.y);
        lastTranslates['Coronal'] = Math.floor(value.x);
      }
    }
  };
  crossLine = new CrossLine(axialElement, coronalElement, sagittalElement, onChange);
  (window as any).crossLine = crossLine;
});
