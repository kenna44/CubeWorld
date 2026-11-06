#version 300 es
precision mediump float;

uniform vec3 uColor;
uniform vec3 uLightPos;
uniform bool uUnlit;

in vec3 vNormal;
in vec3 vWorldPos;

out vec4 fragColor;

void main() {
    if (uUnlit) {
        fragColor = vec4(uColor, 1.0);
        return;
    }

    vec3 lightDir = normalize(uLightPos - vWorldPos);
    float brightness = max(dot(normalize(vNormal), lightDir), 0.0);

    float light = 0.15 + 0.85 * brightness;
    fragColor = vec4(uColor * light, 1.0);
}