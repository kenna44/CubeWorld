#version 300 es
precision mediump float;

in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

out vec3 vNormal;
out vec3 vWorldPos;

void main() {
   vec4 worldPos = uModel * vec4(aPosition, 1.0);
   vWorldPos = worldPos.xyz;
   vNormal = normalize(mat3(uModel) * aNormal);

   gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}