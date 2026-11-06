const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext('webgl2');

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const {mat4, vec4, vec3} = glMatrix;

const vrtxShdrSrcPth = 'src/shaders/vertex.glsl';
const fragShdrSrcPth = 'src/shaders/fragment.glsl';
const cubeSrcPth = 'assets/models/cube.obj';
const wtrImgPth = 'assets/imgs/waterImg.png';
const fishSrcPth = 'assets/models/fish.obj';

const vrtxShdr = gl.createShader(gl.VERTEX_SHADER);
const fragShdr = gl.createShader(gl.FRAGMENT_SHADER);

//cubes are 2 x 2 x 2
const cubeGrdW = 200;
const cubeGrdH = 200;
const cubeGrdCntr = [cubeGrdW, 100, cubeGrdH]; 

//perspective matrix settings
const FOV = degToRad(70);
const aspect = canvas.width / canvas.height;
const near = 0.1;
const far = 1000.0;

//glu lookAt settings, will be changed frequently in render loop
let eye = [0, 0, 0];
let cntr = [0, 0, 0];
let up = [0, 1, 0];


let modelMat, modelMatShdrLoc, 
    viewMat, viewMatShdrLoc, 
    projMat, projMatShdrLoc,
    cubeVrtxBuff, cubeNrmlBuff, 
    cubeVrtxCnt,
    moonVrtxBuff, moonNrmlBuff, 
    moonVrtxCnt, moonPos,
    fishVrtxBuff, fishNrmlBuff,
    fishVrtxCnt,
    colorVec, colorVecShdrLoc,
    unlitShdrLoc,
    lightPosShdrLoc,
    height,
    vrtxPosAttrbLoc, nrmlPosAttrbLoc,
    imgData,
    program;

let cubeColors = [];

async function fileSourceParse(filePath) {
    try {
        const response = await fetch(filePath);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const fileSource = await response.text();
        return fileSource;
    }

    catch (error) {
        console.error("Could not load file: ", error);
    }
}

async function imgColors(imageSourcePath) {
    const response = await fetch(imageSourcePath);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bitmap.width;
    tempCanvas.height = bitmap.height;

    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);

    const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;

    const colors = [];
    for (let i = 0; i < pixels.length; i += 4) {
        colors.push(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
    }

    return {
        colors: new Float32Array(colors),
        width: bitmap.width,
        height: bitmap.height,
    };
}

function initObjArrays(objSource) {
    try {
        const srcPositions = [];
        const srcNormals = [];

        const positions = [];
        const normals = [];
        
        for (const line of objSource.split('\n')) {
            const trimmedLine = line.trim();
            if (trimmedLine === '' || trimmedLine.startsWith('#')) continue;

            const parts = trimmedLine.split(/\s+/);

            if (parts[0] === 'v') {
                srcPositions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            } 
            
            else if (parts[0] === 'vn') {
                srcNormals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            } 
            
            else if (parts[0] === 'f') {
             
                for (let c = 2; c < parts.length - 1; c++) {
                    for (const cornerIdx of [1, c, c + 1]) {
                        const [v, , vn] = parts[cornerIdx].split('/');

                        positions.push(...srcPositions[parseInt(v, 10) - 1]);

                        normals.push(...(vn ? srcNormals[parseInt(vn, 10) - 1] : [0, 1, 0]));
                    }
                }
            }
        }

        return {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            vertexCount: positions.length / 3
        };
    }
    
    catch (error) {
        console.error("Could not initialize OBJ arrays: ", error);
    }
}

function createAndFillBufferObj(data, modelName) {
    try {
        var bufferId = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return bufferId;
    }
    catch (error) {
        console.error("Could not create buffer object for : " + modelName, error);
    }
}

function shaderErrorCheck(shader) {
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const errorMessage = gl.getShaderInfoLog(shader);
        console.error(`Failed to compile vertex shader: ${errorMessage}`);
        return;
    }
}

function createShdrPrgrm(vrtxShdrSrc, fragShdrSrc) {
    gl.shaderSource(vrtxShdr, vrtxShdrSrc);
    gl.compileShader(vrtxShdr);

    shaderErrorCheck(vrtxShdr);

    gl.shaderSource(fragShdr, fragShdrSrc);
    gl.compileShader(fragShdr);

    shaderErrorCheck(fragShdr);

    program = gl.createProgram();
    gl.attachShader(program, vrtxShdr);
    gl.attachShader(program, fragShdr);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const errorMessage = gl.getProgramInfoLog(program);
        console.error(`Failed to link GPU program: ${errorMessage}`);
    }
}

function degToRad(valInDeg) {
    return valInDeg * (Math.PI / 180);
}

function bindMesh(vrtxBuffer, nrmlBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vrtxBuffer);
    gl.enableVertexAttribArray(vrtxPosAttrbLoc);
    gl.vertexAttribPointer(vrtxPosAttrbLoc, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, nrmlBuffer);
    gl.enableVertexAttribArray(nrmlPosAttrbLoc);
    gl.vertexAttribPointer(nrmlPosAttrbLoc, 3, gl.FLOAT, false, 0, 0);
}

function initShdrCmpnts() {
    modelMatShdrLoc = gl.getUniformLocation(program, 'uModel');
    viewMatShdrLoc = gl.getUniformLocation(program, 'uView');
    projMatShdrLoc = gl.getUniformLocation(program, 'uProjection');
    colorVecShdrLoc = gl.getUniformLocation(program, 'uColor');
    lightPosShdrLoc = gl.getUniformLocation(program, 'uLightPos');
    unlitShdrLoc = gl.getUniformLocation(program, 'uUnlit');

    modelMat = mat4.create();
    viewMat = mat4.create();
    projMat = mat4.create();

    mat4.perspective(projMat, FOV, aspect, near, far);
    mat4.identity(modelMat);
    mat4.lookAt(viewMat, eye, cntr, up);

    gl.uniformMatrix4fv(modelMatShdrLoc, false, modelMat);
    gl.uniformMatrix4fv(viewMatShdrLoc, false, viewMat);
    gl.uniformMatrix4fv(projMatShdrLoc, false, projMat);
}

//cube grid stuff 

function randCubeColors() {
    for (let i = 0; i < cubeGridWidth * cubeGridHeight; i++) {
        cubeColors.push([Math.random(), Math.random(), Math.random()]);
    }
}

function genRandCubes() {
    let colorIdx = 0;
    let trnslVec = [0, 0, 0];
    randCubeColors();

    for (let wIdx = 0; wIdx <= cubeGrdW; wIdx++) {
        for (let hIdx = 0; hIdx <= cubeGrdH; hIdx++) {
            mat4.identity(modelMat);
            
            trnslVec = [x * 2, (x + z)/2 * Math.sin(z * x), z * 2];
            mat4.translate(modelMat, modelMat, trnslVec);

            gl.uniformMatrix4fv(modelMatShaderLocation, false, modelMat);
            gl.uniform3fv(colorVecShaderLocation, cubeColors[colorIdx++]);

            gl.drawArrays(gl.TRIANGLES, 0, cubeVrtxCnt);
        }
    }
}

//with texturing! ... kind of
function genImgCubeGrd() {
    let colorIdx = 0;
    let trnslVec = [0, 0, 0];

    for (let wIdx = 0; wIdx <= cubeGrdW; wIdx++) {
        for (let hIdx = 0; hIdx <= cubeGrdH; hIdx++) {
            mat4.identity(modelMat);

            const grdIdx = (hIdx * imgData.width + wIdx) * 3;

            let pixColor = imgData.colors.subarray(grdIdx, grdIdx + 3);
            let hMapCoord = (pixColor[0] + pixColor[1] + pixColor[2]) / 3;
            
            trnslVec = [wIdx * 2, (hMapCoord * 14) + 100, hIdx * 2]
            
            mat4.translate(modelMat, modelMat, trnslVec); 
            gl.uniformMatrix4fv(modelMatShdrLoc, false, modelMat);
            gl.uniform3fv(colorVecShdrLoc, pixColor);

            gl.drawArrays(gl.TRIANGLES, 0, cubeVrtxCnt);
        }
    }
}

//moon that looks like the sun, I promise its the moon!!!
function getMoonPosition(time) {

    const orbitRadius = 250;
    return [
        
        cubeGrdCntr[0] + 100,
        cubeGrdCntr[1] + Math.sin(time * 0.5) * orbitRadius,
        cubeGrdCntr[2] + Math.cos(time * 0.5) * orbitRadius,
    ];
}

function drawMoon(time) {
    mat4.identity(modelMat);
    mat4.translate(modelMat, modelMat, moonPos);
    mat4.scale(modelMat, modelMat, [10, 10, 10]);

    gl.uniformMatrix4fv(modelMatShdrLoc, false, modelMat);
    gl.uniform3fv(colorVecShdrLoc, [0.9, 0.9, 1.0]);

    gl.drawArrays(gl.TRIANGLES, 0, moonVrtxCnt);
}

// fishies! and bezier i guess

const p0 = [-0.5, -0.5,  0.5];
const p1 = [-0.2,  0.8,  0.2];
const p2 = [ 0.2,  0.8, -0.2];
const p3 = [ 0.5, -0.5, -0.5];
let start = p0;

function bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const c0 = mt * mt * mt;
    const c1 = 3 * mt * mt * t;
    const c2 = 3 * mt * t * t;
    const c3 = t * t * t;

    return [
        c0 * p0[0] + c1 * p1[0] + c2 * p2[0] + c3 * p3[0],
        c0 * p0[1] + c1 * p1[1] + c2 * p2[1] + c3 * p3[1],
        c0 * p0[2] + c1 * p1[2] + c2 * p2[2] + c3 * p3[2],
    ];
}

const fishPthScale = 150;
const fishPthCntr = [200, 130, 200];
const fishCnt = 410;

const fishes = [];
const fishColor = [
    [1.0, 0.5, 0.2],  // orange
    [0.2, 0.7, 1.0],  // sky blue
    [1.0, 0.8, 0.2],  // yellow
    [0.9, 0.3, 0.5],  // pink
    [0.4, 0.9, 0.5],  // green
];

for (let i = 0; i < fishCnt; i++) {
    fishes.push({
        offset: [
            (Math.random() - 0.5) * 80,
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 80,
        ],
        timeOffset: Math.random() * 5,
        color: fishColor[i % fishColor.length],
    });
}

function getFishPos(time, fish) {
    const duration = 5;
    const t = ((time + fish.timeOffset) % duration) / duration;
    const p = bezierPoint(p0, p1, p2, p3, t);

    return [
        fishPthCntr[0] + p[0] * fishPthScale + fish.offset[0],
        fishPthCntr[1] + p[1] * fishPthScale + fish.offset[1],
        fishPthCntr[2] + p[2] * fishPthScale + fish.offset[2],
    ];
}

function drawFish(time) {
    for (const fish of fishes) {
        const pos = getFishPos(time, fish);

        mat4.identity(modelMat);
        mat4.translate(modelMat, modelMat, pos);
        mat4.scale(modelMat, modelMat, [2, 4, 2]);

        gl.uniformMatrix4fv(modelMatShdrLoc, false, modelMat);
        gl.uniform3fv(colorVecShdrLoc, fish.color);

        gl.drawArrays(gl.TRIANGLES, 0, fishVrtxCnt);
    }
}

//lets get to really drawing

function render(time) {
    time *= 0.001;
    
    const center = cubeGrdCntr;
    const radius = 350;
    const eye = [
        center[0] + Math.sin(time * 0.5) * radius,
        center[1] + 200,
        center[2] + Math.cos(time * 0.5) * radius,
    ];

    mat4.lookAt(viewMat, eye, center, [0, 1, 0]);
    gl.uniformMatrix4fv(viewMatShdrLoc, false, viewMat);

    draw(time);
    requestAnimationFrame(render);
}

function draw(time) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.2941, 0.1804, 0.3882, 1.0);

    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK); 

    moonPos = getMoonPosition(time);
    gl.uniform3fv(lightPosShdrLoc, moonPos);

    bindMesh(cubeVrtxBuff, cubeNrmlBuff);
    gl.uniform1i(unlitShdrLoc, 1);   
    genImgCubeGrd(time);

}

async function init() {
    const vrtxShdrSrc = await fileSourceParse(vrtxShdrSrcPth);
    const fragShdrSrc = await fileSourceParse(fragShdrSrcPth);
    const cubeSrc = await fileSourceParse(cubeSrcPth);
    const fishSrc = await fileSourceParse(fishSrcPth);

    const cubeObjectData = initObjArrays(cubeSrc);
    const moonObjectData = initObjArrays(cubeSrc);
    const fishObjectData = initObjArrays(fishSrc);
    imgData = await imgColors(wtrImgPth);

    gl.shaderSource(vrtxShdr, vrtxShdrSrc);
    gl.compileShader(vrtxShdr);

    gl.shaderSource(fragShdr, fragShdrSrc);
    gl.compileShader(fragShdr);

    createShdrPrgrm(vrtxShdrSrc, fragShdrSrc);
    gl.useProgram(program);

    vrtxPosAttrbLoc = gl.getAttribLocation(program, 'aPosition');
    nrmlPosAttrbLoc = gl.getAttribLocation(program, 'aNormal');

    cubeVrtxBuff = createAndFillBufferObj(cubeObjectData.positions, "cube");
    cubeNrmlBuff = createAndFillBufferObj(cubeObjectData.normals, "cube");

    cubeVrtxCnt = cubeObjectData.vertexCount;

    initShdrCmpnts();
    
    requestAnimationFrame(render);
}

init();