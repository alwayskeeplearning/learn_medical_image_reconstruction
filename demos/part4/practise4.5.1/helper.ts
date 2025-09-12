import { Matrix4, Vector3, Vector2, Box3 } from 'three';

// 计算体素到病人的矩阵和病人到体素的矩阵
const calculateMatrix = (
  imageOrientationPatient: number[],
  imagePositionPatient: number[],
  pixelSpacing: number[],
  spacingBetweenSlices: number,
) => {
  const voxelToPatientMatrix = new Matrix4();
  const xCos = imageOrientationPatient.slice(0, 3);
  const yCos = imageOrientationPatient.slice(3, 6);
  const zCos = new Vector3().crossVectors(new Vector3(...xCos), new Vector3(...yCos));
  const T = imagePositionPatient;
  const S = pixelSpacing;
  const Z = spacingBetweenSlices;
  voxelToPatientMatrix.set(
    xCos[0] * S[0],
    yCos[0] * S[1],
    zCos.x * Z,
    T[0],
    xCos[1] * S[0],
    yCos[1] * S[1],
    zCos.y * Z,
    T[1],
    xCos[2] * S[0],
    yCos[2] * S[1],
    zCos.z * Z,
    T[2],
    0,
    0,
    0,
    1,
  );
  const patientToVoxelMatrix = new Matrix4().copy(voxelToPatientMatrix).invert();
  return { voxelToPatientMatrix, patientToVoxelMatrix };
};

// 计算给定法向量的切面的精确物理尺寸和像素尺寸
const calculateSliceInfoForDirection = (
  uAxis: Vector3,
  vAxis: Vector3,
  width: number,
  height: number,
  depth: number,
  pixelSpacing: number[],
  spacingBetweenSlices: number,
  voxelToPatientMatrix: Matrix4,
) => {
  const [xSpacing, ySpacing] = pixelSpacing;
  const zSpacing = spacingBetweenSlices;

  // 1. 获取数据体在体素坐标系下的8个顶点, 并变换到世界坐标
  const voxelBox = new Box3(new Vector3(0, 0, 0), new Vector3(width, height, depth));

  const worldVertex = [
    new Vector3(voxelBox.min.x, voxelBox.min.y, voxelBox.min.z),
    new Vector3(voxelBox.max.x, voxelBox.min.y, voxelBox.min.z),
    new Vector3(voxelBox.min.x, voxelBox.max.y, voxelBox.min.z),
    new Vector3(voxelBox.min.x, voxelBox.min.y, voxelBox.max.z),
    new Vector3(voxelBox.max.x, voxelBox.max.y, voxelBox.min.z),
    new Vector3(voxelBox.max.x, voxelBox.min.y, voxelBox.max.z),
    new Vector3(voxelBox.min.x, voxelBox.max.y, voxelBox.max.z),
    new Vector3(voxelBox.max.x, voxelBox.max.y, voxelBox.max.z),
  ].map(p => p.applyMatrix4(voxelToPatientMatrix));

  // 2. 将8个顶点投影到MPR平面上
  // u和v现在作为参数直接传入，不再进行计算
  let uMin = Infinity,
    uMax = -Infinity,
    vMin = Infinity,
    vMax = -Infinity;

  worldVertex.forEach(point => {
    const uCoord = point.dot(uAxis);
    const vCoord = point.dot(vAxis);
    uMin = Math.min(uMin, uCoord);
    uMax = Math.max(uMax, uCoord);
    vMin = Math.min(vMin, vCoord);
    vMax = Math.max(vMax, vCoord);
  });

  // 3. 计算物理尺寸 (mm)
  const widthMM = uMax - uMin;
  const heightMM = vMax - vMin;

  // 4. 从物理尺寸转换为像素尺寸
  const reconPixelSpacing = Math.min(xSpacing, ySpacing);
  const widthPX = Math.ceil(widthMM / reconPixelSpacing);
  const heightPX = Math.ceil(heightMM / reconPixelSpacing);

  const size = new Vector2(widthMM, heightMM);
  const pixelSize = new Vector2(widthPX, heightPX);

  const normalizedNormal = new Vector3().crossVectors(new Vector3(...uAxis), new Vector3(...vAxis));

  // 2. 计算总厚度 (这部分逻辑是正确的)
  let minProjection = Infinity;
  let maxProjection = -Infinity;
  worldVertex.forEach(point => {
    const projection = point.dot(normalizedNormal);
    minProjection = Math.min(minProjection, projection);
    maxProjection = Math.max(maxProjection, projection);
  });

  const totalThickness = maxProjection - minProjection;

  // 3. 【修正后的】计算采样间隔
  const absNx = Math.abs(normalizedNormal.x);
  const absNy = Math.abs(normalizedNormal.y);
  const absNz = Math.abs(normalizedNormal.z);

  const stepX = absNx < 1e-6 ? Infinity : xSpacing / absNx;
  const stepY = absNy < 1e-6 ? Infinity : ySpacing / absNy;
  const stepZ = absNz < 1e-6 ? Infinity : zSpacing / absNz;

  const samplingInterval = Math.min(stepX, stepY, stepZ);
  let count = 0;
  // 4. 计算总张数
  if (samplingInterval !== 0 && samplingInterval !== Infinity) {
    count = Math.floor(totalThickness / samplingInterval);
  }

  return {
    size,
    pixelSize,
    count,
    totalThickness,
    samplingInterval,
  };
};

export { calculateMatrix, calculateSliceInfoForDirection };
