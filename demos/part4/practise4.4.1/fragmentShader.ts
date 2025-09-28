const fragmentShader = `
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uTexture;
  uniform float uWindowWidth;
  uniform float uWindowCenter;
  uniform vec3 uTextureSize;
  uniform vec3 uOrigin;
  uniform vec3 uXAxis;
  uniform vec3 uYAxis;
  uniform float uPlaneWidth;
  uniform float uPlaneHeight;
  uniform mat4 uPatientToVoxelMatrix;
  uniform float uSamplingInterval;
  uniform int uSampleCount;

  // 从顶点着色器传入的 UV 坐标
  in vec2 vUv;

  layout(location = 0) out vec4 outColor;

  void main() {
    vec3 patientPos = uOrigin + vUv.x * uXAxis * uPlaneWidth + vUv.y * uYAxis * uPlaneHeight;
    vec4 voxelPos4 = uPatientToVoxelMatrix * vec4(patientPos, 1.0);
    vec3 voxelPos = voxelPos4.xyz / voxelPos4.w;

    if (voxelPos.x < -0.001 || voxelPos.x > uTextureSize.x - 1.0 + 0.001 ||
        voxelPos.y < -0.001 || voxelPos.y > uTextureSize.y - 1.0 + 0.001 ||
        voxelPos.z < -0.001 || voxelPos.z > uTextureSize.z - 1.0 + 0.001) {
      discard;
    }
    
    vec3 sampleCoord = (voxelPos + vec3(0.5)) / uTextureSize;
    float intensity = 0.0;
    if (uSampleCount > 0) {
      float slabThickness = uSamplingInterval * float(uSampleCount);
      vec3 rayDir = normalize(cross(uXAxis, uYAxis));
      
      // 1. 在患者坐标系下计算光线起点和终点
      vec3 startPatient = patientPos - rayDir * slabThickness / 2.0;
      vec3 endPatient = patientPos + rayDir * slabThickness / 2.0;

      // 2. 将起点和终点转换到纹理坐标系
      vec4 startVoxel4 = uPatientToVoxelMatrix * vec4(startPatient, 1.0);
      vec3 startTex = (startVoxel4.xyz / startVoxel4.w + vec3(0.5)) / uTextureSize;

      vec4 endVoxel4 = uPatientToVoxelMatrix * vec4(endPatient, 1.0);
      vec3 endTex = (endVoxel4.xyz / endVoxel4.w + vec3(0.5)) / uTextureSize;

      // 3. 计算总步进向量和每一步的步长
      vec3 slabVec = endTex - startTex;
      vec3 step = slabVec / float(uSampleCount - 1);
      
      float maxVal = -3000.0;

      for (int i = 0; i < uSampleCount; i++) {
        vec3 coord = startTex + float(i) * step;
        if (coord.x >= 0.0 && coord.x <= 1.0 &&
            coord.y >= 0.0 && coord.y <= 1.0 &&
            coord.z >= 0.0 && coord.z <= 1.0)
        {
            maxVal = max(maxVal, texture(uTexture, coord).r);
        }
      }
      intensity = maxVal;
    } else {
      intensity = texture(uTexture, sampleCoord).r;
    }
    
    float lower = uWindowCenter - uWindowWidth / 2.0;
    float upper = uWindowCenter + uWindowWidth / 2.0;
    intensity = (intensity - lower) / uWindowWidth;
    intensity = clamp(intensity, 0.0, 1.0);

    outColor = vec4(vec3(intensity), 1.0);
  }
`;

export { fragmentShader };
