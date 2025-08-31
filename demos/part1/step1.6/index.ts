import * as dicomParser from 'dicom-parser';

// 定义一个接口来更好地组织解析出的DICOM信息
interface DicomInfo {
  patientName: string;
  width: number;
  height: number;
  windowCenter: number;
  windowWidth: number;
  rescaleSlope: number;
  rescaleIntercept: number;
  photometricInterpretation: string;
  pixelData: Int16Array | Uint16Array | Uint8Array;
}

// 获取 DOM 元素
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const infoDump = document.getElementById('info-dump') as HTMLPreElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

// --- 主逻辑：监听文件选择 ---
fileInput.addEventListener('change', event => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    infoDump.textContent = '没有文件选择。';
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) throw new Error('无法读取文件缓冲区。');

      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      // 1. 解析DICOM数据并存储到我们的接口对象中
      const dicomInfo = parseDicomInfo(dataSet, byteArray);

      // 2. 将解析出的信息显示在页面上
      displayInfo(dicomInfo);

      // 3. 渲染图像
      renderImage(dicomInfo);
    } catch (error) {
      handleError(error);
    }
  };
  reader.readAsArrayBuffer(file);
});

/**
 * 从 dataSet 中解析出我们需要的所有信息
 * @param dataSet dicom-parser 解析后的数据集
 * @param byteArray 原始文件字节数组
 * @returns 解析并结构化的 DicomInfo 对象
 */
function parseDicomInfo(dataSet: dicomParser.DataSet, byteArray: Uint8Array): DicomInfo {
  // 读取窗宽窗位，注意它可能是多值的，我们取第一个
  const windowCenterStr = dataSet.string('x00281050') || '0';
  const windowWidthStr = dataSet.string('x00281051') || '0';

  const width = dataSet.uint16('x00280011') ?? 512;
  const height = dataSet.uint16('x00280010') ?? 512;

  // 处理可能的多值情况
  const windowCenter = parseFloat(windowCenterStr.split('\\')[0]);
  const windowWidth = parseFloat(windowWidthStr.split('\\')[0]);

  // 获取像素数据元素
  const pixelDataElement = dataSet.elements.x7fe00010;
  if (!pixelDataElement) throw new Error('像素数据元素未找到。');

  // 根据元数据创建正确的 TypedArray 视图
  const pixelData = createPixelDataArray(dataSet, byteArray.buffer, pixelDataElement);

  return {
    patientName: dataSet.string('x00100010') || '未知',
    width,
    height,
    windowCenter,
    windowWidth,
    rescaleSlope: dataSet.floatString('x00281053', 0) ?? 1.0,
    rescaleIntercept: dataSet.floatString('x00281052', 0) ?? 0.0,
    photometricInterpretation: dataSet.string('x00280004') || 'MONOCHROME2',
    pixelData,
  };
}

/**
 * 根据DICOM头信息创建正确的像素数据数组
 */
function createPixelDataArray(dataSet: dicomParser.DataSet, buffer: ArrayBuffer, pixelDataElement: dicomParser.Element): DicomInfo['pixelData'] {
  const pixelRepresentation = dataSet.uint16('x00280103'); // 0 = unsigned, 1 = signed
  const bitsAllocated = dataSet.uint16('x00280100');

  if (bitsAllocated === 16) {
    if (pixelRepresentation === 1) {
      return new Int16Array(buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
    } else {
      return new Uint16Array(buffer, pixelDataElement.dataOffset, pixelDataElement.length / 2);
    }
  } else if (bitsAllocated === 8) {
    return new Uint8Array(buffer, pixelDataElement.dataOffset, pixelDataElement.length);
  } else {
    throw new Error(`Unsupported bits allocated: ${bitsAllocated}`);
  }
}

/**
 * 在页面上显示影像信息
 */
function displayInfo(info: DicomInfo) {
  const output = `
    患者姓名: ${info.patientName}
    图像尺寸: ${info.width} x ${info.height}
    窗位: ${info.windowCenter}
    窗宽: ${info.windowWidth}
    斜率: ${info.rescaleSlope}
    截距: ${info.rescaleIntercept}
    颜色模式: ${info.photometricInterpretation}
  `;
  infoDump.textContent = output.trim();
}

/**
 * 核心渲染函数
 */
function renderImage(info: DicomInfo) {
  if (!ctx) return;

  // 设置canvas尺寸与图像一致
  canvas.width = info.width;
  canvas.height = info.height;

  // 创建一个 ImageData 对象，用于存放最终的RGBA像素值
  const imageData = ctx.createImageData(info.width, info.height);
  const imageDataArray = imageData.data; // 这是一个 Uint8ClampedArray

  // 计算窗宽窗位定义的观察范围
  const lower = info.windowCenter - info.windowWidth / 2;
  const upper = info.windowCenter + info.windowWidth / 2;

  let pixelIndex = 0;
  // 遍历每一个像素
  for (let i = 0; i < info.pixelData.length; i++) {
    // 1. 读取原始像素值
    const storedValue = info.pixelData[i];

    // 2. Rescale 变换，得到真实物理值 (例如 HU 值)
    const realValue = storedValue * info.rescaleSlope + info.rescaleIntercept;

    // 3. 应用窗宽窗位，将真实值映射到 0-255 的灰度范围
    let grayValue = 0;
    if (realValue <= lower) {
      grayValue = 0;
    } else if (realValue >= upper) {
      grayValue = 255;
    } else {
      grayValue = ((realValue - lower) / info.windowWidth) * 255;
    }

    // 4. 处理 MONOCHROME1 (负片)
    if (info.photometricInterpretation === 'MONOCHROME1') {
      grayValue = 255 - grayValue;
    }

    // 5. 将计算出的灰度值写入 ImageData 的 RGBA 通道
    // imageDataArray 的索引是像素索引的4倍
    imageDataArray[pixelIndex] = grayValue; // R
    imageDataArray[pixelIndex + 1] = grayValue; // G
    imageDataArray[pixelIndex + 2] = grayValue; // B
    imageDataArray[pixelIndex + 3] = 255; // A (不透明)

    pixelIndex += 4;
  }

  // 6. 将最终的 ImageData 绘制到 canvas 上
  ctx.putImageData(imageData, 0, 0);
}

/**
 * 统一的错误处理函数
 */
function handleError(error: unknown) {
  let message = '发生未知错误。';
  if (error instanceof Error) {
    message = error.message;
  }
  infoDump.textContent = `解析或渲染时出错: ${message}`;
  console.error('DICOM Error:', error);
}
