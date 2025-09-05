import dicomParser from 'dicom-parser';
import { Vector3, Data3DTexture, RedFormat, FloatType, LinearFilter } from 'three';

const generateDownloadUrls = () => {
  const baseUrl = '/static/dicoms/CW023001-P001566398/';
  const fileCount = 462;
  const urls: string[] = [];
  for (let i = 1; i <= fileCount; i++) {
    const filename = `CW023001-P001566398-CT20200727153936_${String(i).padStart(4, '0')}.dcm`;
    urls.push(baseUrl + filename);
  }

  return urls;
};

const loadDicoms = async (urls: string[]) => {
  console.log(`开始加载 ${urls.length} 个 DICOM 文件...`);
  try {
    const responses = await Promise.all(urls.map(url => fetch(url)));
    const arrayBuffers = await Promise.all(responses.map(res => res.arrayBuffer()));

    const slices = arrayBuffers.map(buffer => {
      const byteArray = new Uint8Array(buffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      const imagePositionPatient = dataSet.string('x00200032')!.split('\\').map(Number);
      return {
        dataSet,
        imagePositionPatient,
      };
    });

    const firstDataSet = slices[0].dataSet;
    const imagePositionPatient = slices[0].imagePositionPatient;
    const pixelSpacing = firstDataSet.string('x00280030')!.split('\\').map(Number);
    const sliceThickness = Number(firstDataSet.string('x00180050'));
    const spacingBetweenSlices = slices.length > 1 ? new Vector3().fromArray(slices[0].imagePositionPatient).distanceTo(new Vector3().fromArray(slices[1].imagePositionPatient)) : sliceThickness;
    // 健壮性处理：检查窗宽窗位是否存在，并处理多值情况
    const windowWidthStr = firstDataSet.string('x00281051');
    const windowCenterStr = firstDataSet.string('x00281050');
    // 如果标签存在，则取第一个值；否则使用默认值
    const windowWidth = windowWidthStr ? Number(windowWidthStr.split('\\')[0]) : 400;
    const windowCenter = windowCenterStr ? Number(windowCenterStr.split('\\')[0]) : 40;
    const imageOrientationPatient = firstDataSet.string('x00200037')!.split('\\').map(Number);
    const rowCosines = new Vector3(imageOrientationPatient[0], imageOrientationPatient[1], imageOrientationPatient[2]);
    const colCosines = new Vector3(imageOrientationPatient[3], imageOrientationPatient[4], imageOrientationPatient[5]);
    //计算法向量 确定序列的堆叠方向
    const normal = new Vector3().crossVectors(rowCosines, colCosines);

    slices.sort((a, b) => {
      const posA = new Vector3(a.imagePositionPatient[0], a.imagePositionPatient[1], a.imagePositionPatient[2]);
      const posB = new Vector3(b.imagePositionPatient[0], b.imagePositionPatient[1], b.imagePositionPatient[2]);
      return posA.dot(normal) - posB.dot(normal);
    });

    const width = firstDataSet.uint16('x00280011')!;
    const height = firstDataSet.uint16('x00280010')!;
    const depth = slices.length;
    const bitsAllocated = firstDataSet.uint16('x00280100')!;
    const pixelRepresentation = firstDataSet.uint16('x00280103')!; //0=unsigned,1=signed
    const rescaleSlope = parseFloat(firstDataSet.string('x00281053') || '1');
    const rescaleIntercept = parseFloat(firstDataSet.string('x00281052') || '0');

    console.log(`创建空体素数据体，数据体尺寸: ${width}x${height}x${depth}。开始填充。。。`);
    const volumeData = new Float32Array(width * height * depth);
    slices.forEach((slice, i) => {
      const pixelDataElement = slice.dataSet.elements.x7fe00010;
      let rawPixelData;
      if (bitsAllocated === 16) {
        if (pixelRepresentation === 1) {
          rawPixelData = new Int16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
        } else {
          rawPixelData = new Uint16Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
        }
      } else {
        rawPixelData = new Uint8Array(slice.dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length);
      }

      const sliceOffsetStart = i * width * height;
      for (let j = 0; j < rawPixelData.length; j++) {
        volumeData[sliceOffsetStart + j] = rawPixelData[j] * rescaleSlope + rescaleIntercept;
      }
    });

    console.log('体素数据体填充完毕。');

    console.log(`开始构建3D纹理...`);
    const texture = new Data3DTexture(volumeData, width, height, depth);
    texture.format = RedFormat;
    texture.type = FloatType;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    console.log('3D纹理构建完毕。');
    const metaData = {
      imageOrientationPatient,
      imagePositionPatient,
      pixelSpacing,
      sliceThickness,
      spacingBetweenSlices,
      windowWidth: isNaN(windowWidth) ? 400 : windowWidth,
      windowCenter: isNaN(windowCenter) ? 40 : windowCenter,
    };
    return { texture, metaData };
  } catch (error) {
    console.error('加载或处理 DICOM 序列时出错:', error);
  }
};

const loadDicomSeries = async () => {
  const urls = generateDownloadUrls();
  const ret = await loadDicoms(urls);
  return ret!;
};

export { loadDicomSeries };
