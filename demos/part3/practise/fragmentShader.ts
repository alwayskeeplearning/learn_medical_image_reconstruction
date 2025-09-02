const fragmentShader = `
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uTexture3D;
  uniform float uSliceIndex;
  uniform float uSliceCount;
  uniform float uWindowWidth;
  uniform float uWindowLevel;

  // 从顶点着色器传入的 UV 坐标
  in vec2 vUv;

  // 定义输出变量
  out vec4 outColor;

  void main() {
    // 反转 UV 坐标
    vec2 flippedUv = vec2(vUv.x, 1.0 - vUv.y);

    // 在着色器内部进行归一化，以获得正确的纹理 z 坐标
    // (index + 0.5) / count 的方式可以更精确地采样到体素中心
    float sliceZ = (uSliceIndex + 0.5) / uSliceCount;
    float ctValue = texture(uTexture3D, vec3(flippedUv, sliceZ)).r;
    
    // 应用窗宽窗位逻辑
    float lower = uWindowLevel - uWindowWidth / 2.0;
    float upper = uWindowLevel + uWindowWidth / 2.0;

    ctValue = (ctValue - lower) / uWindowWidth;
    ctValue = clamp(ctValue, 0.0, 1.0);

    outColor = vec4(ctValue, ctValue, ctValue, 1.0);
  }
`;

export { fragmentShader };
