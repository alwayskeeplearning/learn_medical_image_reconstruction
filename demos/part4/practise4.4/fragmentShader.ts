const fragmentShader = `
  precision highp float;
  precision highp sampler3D;

  uniform sampler3D uTexture;
  uniform float uWindowWidth;
  uniform float uWindowCenter;
  uniform float uRescaleSlope;
  uniform float uRescaleIntercept;
  uniform vec3 uTextureSize;
  uniform vec3 uOrigin;
  uniform vec3 uXAxis;
  uniform vec3 uYAxis;
  uniform float uPlaneWidth;
  uniform float uPlaneHeight;
  uniform mat4 uPatientToVoxelMatrix;

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
    float intensity = texture(uTexture, sampleCoord).r;
    
    float lower = uWindowCenter - uWindowWidth / 2.0;
    float upper = uWindowCenter + uWindowWidth / 2.0;
    intensity = (intensity - lower) / uWindowWidth;
    intensity = clamp(intensity, 0.0, 1.0);

    outColor = vec4(vec3(intensity), 1.0);
  }
`;

export { fragmentShader };
