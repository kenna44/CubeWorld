#version 300 es
precision highp float;
in vec3 vDir;
uniform samplerCube uSkybox;
out vec4 outColor;

void main() {
    outColor = texture(uSkybox, normalize(vDir));
}