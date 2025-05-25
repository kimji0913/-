"use strict";

let gl, program;
let stack = [];
let root;

let modelViewMatrix, projectionMatrix;
let uModelViewMatrix, uProjectionMatrix, uNormalMatrix;
let vNormal;

let eye = vec3(0.0, 0.3, 2.5);
let at = vec3(0.0, 0.1, 0.0);
let up = vec3(0.0, 1.0, 0.0);

let sphereBuffer, cylinderBuffer;
let sphereIndexBuffer, cylinderIndexBuffer;
let sphereNormalBuffer, cylinderNormalBuffer;
let sphereData, cylinderData;

// Texture
let texturedSphereData;
let texturedSphereBuffer, texturedSphereIndexBuffer, texturedSphereNormalBuffer, texturedSphereTexCoordBuffer;
let uTexture, uUseTexture, texture;

let uLightPosition, uLightColor, uAmbientLight, uDiffuseStrength;

let lastTime = 0;
let currentEnvironment = 'earth';

function createNode(name, translation, render, sibling = null, child = null) {
    let node = {
        name: name,
        translation: translation,
        rotation: vec3(0.0, 0.0, 0.0),
        transform: mat4(),
        worldMatrix: mat4(),
        render: render,
        sibling: sibling,
        child: child
    }
    return node;
}

function buildTreeFromHierarchy(joints, hierarchy, render) {
    const nodes = {};

    for (let name in joints) {
        nodes[name] = createNode(name, vec3(0, 0, 0), render);
    }

    function setLocalTranslation(name, parentPos) {
        const globalPos = vec3(joints[name][0], joints[name][1], joints[name][2]);
        const localPos = subtract(globalPos, parentPos);

        nodes[name].translation = localPos;

        const children = hierarchy[name];
        if (children.length === 0) return;

        nodes[name].child = nodes[children[0]];
        for (let i = 0; i < children.length - 1; i++) {
            nodes[children[i]].sibling = nodes[children[i + 1]];
        }

        for (let child of children) {
            setLocalTranslation(child, globalPos);
        }
    }

    const hipsPos = vec3(joints["HIPS"][0], joints["HIPS"][1], joints["HIPS"][2]);
    nodes["HIPS"].translation = hipsPos;

    if (hierarchy["HIPS"].length > 0) {
        nodes["HIPS"].child = nodes[hierarchy["HIPS"][0]];

        for (let i = 0; i< hierarchy["HIPS"].length - 1; i++) {
            nodes[hierarchy["HIPS"][i]].sibling = nodes[hierarchy["HIPS"][i + 1]];
        }
    }

    for (let child of hierarchy["HIPS"]) {
        setLocalTranslation(child, hipsPos);
    }

    return nodes["HIPS"];
}

function traverse(root) {
    if (root === null) return;
    
    stack = [];
    stack.push({ node: root, parentMatrix: mat4(), parentNode: null });

    while (stack.length > 0) {
        const current = stack.pop();
        const node = current.node;
        const parentMatrix = current.parentMatrix;
        const parentNode = current.parentNode;

        if (!node) continue;

        const t = translate(node.translation[0], node.translation[1], node.translation[2]);
        const rx = rotate(node.rotation[0], vec3(1, 0, 0));
        const ry = rotate(node.rotation[1], vec3(0, 1, 0));
        const rz = rotate(node.rotation[2], vec3(0, 0, 1));

        node.transform = mult(t, mult(rz, mult(ry, rx)));
        node.worldMatrix = mult(parentMatrix, node.transform);

        renderJoint(node.worldMatrix, node.name);

        if (parentNode) {
            const fromVec = mult(parentMatrix, vec4(0, 0, 0, 1));
            const toVec = mult(node.worldMatrix, vec4(0, 0, 0, 1));
            renderBone(fromVec, toVec, parentNode.name, node.name);
        }

        if (node.sibling) {
            stack.push({ 
                node: node.sibling, 
                parentMatrix: parentMatrix, 
                parentNode: parentNode 
            });
        }

        if (node.child) {
            stack.push({ 
                node: node.child, 
                parentMatrix: node.worldMatrix, 
                parentNode: node 
            });
        }
    }
}

function changeEnvironment(environment) {
    currentEnvironment = environment;
    setSpaceEnvironment(currentEnvironment);
}

function setMercury() { changeEnvironment('mercury'); }
function setVenus() { changeEnvironment('venus'); }
function setEarth() { changeEnvironment('earth'); }
function setMoon() { changeEnvironment('moon'); }
function setMars() { changeEnvironment('mars'); }
function setJupiter() { changeEnvironment('jupiter'); }
function setSaturn() { changeEnvironment('saturn'); }
function setUranus() { changeEnvironment('uranus'); }
function setNeptune() { changeEnvironment('neptune'); }

// Texture
function addTexturedSphereInit() {
    texturedSphereData = createTexturedSphere(0.3, 24, 24);

    texturedSphereBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texturedSphereBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texturedSphereData.vertices), gl.STATIC_DRAW);

    texturedSphereIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, texturedSphereIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(texturedSphereData.indices), gl.STATIC_DRAW);

    texturedSphereNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texturedSphereNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texturedSphereData.normals), gl.STATIC_DRAW);

    texturedSphereTexCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texturedSphereTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texturedSphereData.texCoords), gl.STATIC_DRAW);

    createCheckTexture();

    uTexture = gl.getUniformLocation(program, "uTexture");
    uUseTexture = gl.getUniformLocation(program, "uUseTexture");
}

function createCheckTexture() {
    const size = 64;
    const data = new Uint8Array(size * size * 4);

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const index = (i * size + j) * 4;
            const tmp = (Math.floor(i / 8) + Math.floor(j / 8)) % 2;

            if (tmp) {
                data[index] = 100;
                data[index + 1] = 100;
                data[index + 2] = 100;
            } else {
                data[index] = 250;
                data[index + 1] = 250;
                data[index + 2] = 10;
            }
            data[index + 3] = 255; 
        }
    }

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
}

function renderTexturedSphere() {
    gl.useProgram(program);

    const spherePosition = translate(1.0, 0.3, 0.0);
    const mvMatrix = mult(modelViewMatrix, spherePosition);
    
    gl.uniformMatrix4fv(uModelViewMatrix, false, flatten(mvMatrix));
    gl.uniformMatrix4fv(uProjectionMatrix, false, flatten(projectionMatrix));
    
    const normalMatrix = transpose(inverse4(mvMatrix));
    gl.uniformMatrix4fv(uNormalMatrix, false, flatten(normalMatrix));

    gl.uniform1i(uUseTexture, 1); // Enable texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uTexture, 0);

    const vPosition = gl.getAttribLocation(program, "vPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, texturedSphereBuffer);
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    const vNormal = gl.getAttribLocation(program, "vNormal");
    gl.bindBuffer(gl.ARRAY_BUFFER, texturedSphereNormalBuffer);
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);

    const vTexCoord = gl.getAttribLocation(program, "vTexCoord");
    if (vTexCoord !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, texturedSphereTexCoordBuffer);
        gl.vertexAttribPointer(vTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vTexCoord);
    }

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, texturedSphereIndexBuffer);
    gl.drawElements(gl.TRIANGLES, texturedSphereData.indices.length, gl.UNSIGNED_SHORT, 0);
    
    // Disable texture for next renders
    gl.uniform1i(uUseTexture, 0);
}

window.onload = function init() {
    const canvas = document.getElementById("glCanvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) alert("WebGL is not available");

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    uModelViewMatrix = gl.getUniformLocation(program, "uModelViewMatrix");
    uProjectionMatrix = gl.getUniformLocation(program, "uProjectionMatrix");
    uNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");

    uLightPosition = gl.getUniformLocation(program, "uLightPosition");
    uLightColor = gl.getUniformLocation(program, "uLightColor");
    uAmbientLight = gl.getUniformLocation(program, "uAmbientLight");
    uDiffuseStrength = gl.getUniformLocation(program, "uDiffuseStrength");

    gl.uniform3fv(uLightPosition, flatten(vec3(1.0, 2.0, 2.0)));
    gl.uniform3fv(uLightColor, flatten(vec3(1.0, 1.0, 1.0)));
    gl.uniform3fv(uAmbientLight, flatten(vec3(0.2, 0.2, 0.2)));
    gl.uniform1f(uDiffuseStrength, 0.8);

    sphereData = createSphere(0.05, 12, 12);
    cylinderData = createClosedCylinder(0.05, 0.05, 1.0, 8, 1);

    sphereBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereData.vertices), gl.STATIC_DRAW);

    sphereNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereData.normals), gl.STATIC_DRAW);

    sphereIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sphereData.indices), gl.STATIC_DRAW);

    cylinderBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cylinderBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cylinderData.vertices), gl.STATIC_DRAW);

    cylinderNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cylinderNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cylinderData.normals), gl.STATIC_DRAW);

    cylinderIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cylinderIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cylinderData.indices), gl.STATIC_DRAW);

    // Textured sphere
    addTexturedSphereInit();

    root = buildTreeFromHierarchy(JOINTS, hierarchy, renderJoint);

    modelViewMatrix = lookAt(eye, at, up);
    projectionMatrix = perspective(60, canvas.width / canvas.height, 0.1, 10.0);

    setEarth();
    animationSystem.startAnimation("frontFlip", null, false);

    render();
}

function renderJoint(worldMatrix, jointName) {
    gl.useProgram(program);
    gl.uniform1i(uUseTexture, 0);

    let scale = 1.0;

    if (jointName === "HEAD" || jointName.includes("LEG")) {
        scale = 2.0;
    }

    const mvMatrix = mult(modelViewMatrix, worldMatrix);
    const scaledMvMatrix = mult(mvMatrix, scalem(scale, scale, scale));

    gl.uniformMatrix4fv(uModelViewMatrix, false, flatten(scaledMvMatrix));
    gl.uniformMatrix4fv(uProjectionMatrix, false, flatten(projectionMatrix));

    const normalMatrix = transpose(inverse4(scaledMvMatrix));
    gl.uniformMatrix4fv(uNormalMatrix, false, flatten(normalMatrix));

    gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuffer);
    const vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, sphereNormalBuffer);
    const vNormal = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);

    // Disable texture coordinate attribute if it exists
    const vTexCoord = gl.getAttribLocation(program, "vTexCoord");
    if (vTexCoord !== -1) {
        gl.disableVertexAttribArray(vTexCoord);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIndexBuffer);
    gl.drawElements(gl.TRIANGLES, sphereData.indices.length, gl.UNSIGNED_SHORT, 0);
}

function renderBone(from, to, parentName, childName) {
    gl.useProgram(program);
    gl.uniform1i(uUseTexture, 0);

    const isSpine = parentName === "SPINE" || parentName === "SPINE1" || childName === "SPINE";
    const isLeg = parentName.includes("LEG") || parentName.includes("UPLEG") || childName === "NECK" || parentName === "NECK" || childName.includes("UPLEG");

    let radius = 0.05;

    if (isSpine) {
        radius = 0.2;
    }
    else if (isLeg) {
        radius = 0.1;
    }

    const customCylinder = createClosedCylinder(radius, radius, 1.0, 12, 1);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(customCylinder.vertices), gl.STATIC_DRAW);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(customCylinder.normals), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(customCylinder.indices), gl.STATIC_DRAW);

    const cylinderMatrix = calculateCylinderMatrix(from, to);
    const mvMatrix = mult(modelViewMatrix, cylinderMatrix);

    gl.uniformMatrix4fv(uModelViewMatrix, false, flatten(mvMatrix));
    gl.uniformMatrix4fv(uProjectionMatrix, false, flatten(projectionMatrix));
    const normalMatrix = transpose(inverse4(mvMatrix));
    gl.uniformMatrix4fv(uNormalMatrix, false, flatten(normalMatrix));

    const vPosition = gl.getAttribLocation(program, "vPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    const vNormal = gl.getAttribLocation(program, "vNormal");
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormal);

    // Disable texture coordinate attribute if it exists
    const vTexCoord = gl.getAttribLocation(program, "vTexCoord");
    if (vTexCoord !== -1) {
        gl.disableVertexAttribArray(vTexCoord);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, customCylinder.indices.length, gl.UNSIGNED_SHORT, 0);
}

function render(time = 0) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const deltaTime = time - lastTime;
    lastTime = time;

    const result = animationSystem.updateAnimation(deltaTime);
    if (result) animationSystem.applyAnimationToTree(root, result.rotations, result.translations);

    traverse(root);

    renderTexturedSphere();

    requestAnimationFrame(render);
}
