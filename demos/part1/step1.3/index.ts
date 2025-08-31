// 导入 dicom-parser 库
import * as dicomParser from 'dicom-parser';

// 获取 DOM 元素
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const metadataDump = document.getElementById('metadata-dump') as HTMLPreElement;

// 监听文件选择框的 change 事件
fileInput.addEventListener('change', event => {
  // 获取用户选择的文件
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    metadataDump.textContent = '没有文件选择。';
    return;
  }

  // 使用 FileReader API 来读取文件内容
  const reader = new FileReader();

  // 文件读取完成后的回调函数
  reader.onload = e => {
    try {
      // 1. 加载文件: 获取 ArrayBuffer 格式的文件内容
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) {
        throw new Error('无法读取文件缓冲区。');
      }

      // 将 ArrayBuffer 转换为 Uint8Array，这是 dicom-parser 需要的格式
      const byteArray = new Uint8Array(arrayBuffer);

      // 2. 解析: 调用核心函数 parseDicom
      const dataSet = dicomParser.parseDicom(byteArray);

      // 3. 读取元数据: 从 dataSet 中提取我们感兴趣的信息
      const patientName = dataSet.string('x00100010') || '未知';
      const studyDate = dataSet.string('x00080020') || '未知';
      const rows = dataSet.uint16('x00280010');
      const columns = dataSet.uint16('x00280011');
      const bitsAllocated = dataSet.uint16('x00280100');
      const bitsStored = dataSet.uint16('x00280101');
      const pixelRepresentation = dataSet.uint16('x00280103'); // 0 = unsigned, 1 = signed

      const windowCenter = dataSet.string('x00281050') || '未知';
      const windowWidth = dataSet.string('x00281051') || '未知';

      // 4. 定位像素数据: 找到像素数据元素
      const pixelDataElement = dataSet.elements.x7fe00010;

      // 5. 创建像素数组: (这里我们先不直接创建 TypedArray，只打印信息)
      // 注意: pixelDataElement.length 是字节长度
      const pixelDataInfo = pixelDataElement ? `Offset: ${pixelDataElement.dataOffset}, Length (bytes): ${pixelDataElement.length}` : '未找到';

      // 将提取的信息格式化为字符串并显示在页面上
      const output = `
        Patient Name: ${patientName}
        Study Date: ${studyDate}
        Rows: ${rows}
        Columns: ${columns}
        Bits Allocated: ${bitsAllocated}
        Bits Stored: ${bitsStored}
        Pixel Representation: ${pixelRepresentation === 1 ? 'Signed' : 'Unsigned'}
        Window Center: ${windowCenter}
        Window Width: ${windowWidth}
        Pixel Data: ${pixelDataInfo}
      `;

      metadataDump.textContent = output.trim();

      // 在控制台也打印 dataSet 对象，方便深入探索
      console.log('成功解析 DICOM 文件。完整 dataSet 对象:');
      console.log(dataSet);
    } catch (error) {
      let message = '发生未知错误。';
      if (error instanceof Error) {
        message = error.message;
      }
      metadataDump.textContent = `解析 DICOM 文件时出错: ${message}`;
      console.error('DICOM 解析错误:', error);
    }
  };

  // 启动文件读取过程
  reader.readAsArrayBuffer(file);
});
