#version 300 es
in vec3 aPosition;
uniform mat4 uView;       
uniform mat4 uProjection;
out vec3 vDir;

void main() {
    vDir = aPosition;
    vec4 pos = uProjection * uView * vec4(aPosition, 1.0);
    gl_Position = pos.xyww;  
}