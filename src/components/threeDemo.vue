<template>
  <div ref="container" class="three-container"></div>
  <div class="info-tooltip" @click.stop>
    点击对象: {{ clickedObject?.name || "未选中" }} <br />
    类型: {{ clickedObject?.type || "无" }} <br />
    状态: {{ isHighlighted ? "已选中" : "未选中" }}
    <div v-if="animationInfo" class="animation-controls">
      <button @click.stop="toggleAnimation">
        {{ isPlaying ? "暂停" : "播放" }}
      </button>
      <input
        type="range"
        min="0.1"
        max="2"
        step="0.1"
        v-model="animationSpeed"
        @input.stop="updateAnimationSpeed"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import gsap from "gsap";

// DOM容器和交互状态
const container = ref(null);
const clickedObject = ref(null);
const isHighlighted = ref(false);
const animationInfo = ref(null);
const animationSpeed = ref(1);
let scene, camera, renderer, controls;
let currentHighlighted = null;
let mixer, clock, modelCenter, modelSize;
const isPlaying = ref(true); // 增加

// 交互工具
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

// 材质管理器
const materialManager = {
  originalMaterials: new WeakMap(),

  cloneMaterials(object) {
    object.traverse((obj) => {
      if (obj.isMesh) {
        this.originalMaterials.set(obj, {
          material: obj.material.clone(),
          color: obj.material.color.clone(),
        });
        obj.material = obj.material.clone();
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  },

  highlight(obj) {
    if (!this.originalMaterials.has(obj)) return;
    obj.material.color.setHex(0xff0000);
    obj.material.emissive && obj.material.emissive.setHex(0x333300);
  },

  restore(obj) {
    if (this.originalMaterials.has(obj)) {
      const original = this.originalMaterials.get(obj);
      obj.material.color.copy(original.color);
      obj.material.emissive && obj.material.emissive.setHex(0x000000);
    }
  },
};

// 动画控制方法
const toggleAnimation = () => {
  if (mixer) {
    if (isPlaying.value) {
      mixer.timeScale = 0;
      isPlaying.value = false;
    } else {
      mixer.timeScale = animationSpeed.value;
      isPlaying.value = true;
    }
  }
};

const updateAnimationSpeed = () => {
  if (mixer && mixer.timeScale !== 0) mixer.timeScale = animationSpeed.value;
};

onMounted(() => {
  // 初始化场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x333333);
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  container.value.appendChild(renderer.domElement);

  // 场景光照
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
  scene.add(ambientLight);

  // 加载模型
  const loader = new GLTFLoader();
  loader.load(
    // new URL("../assets/1.glb", import.meta.url).href,
    // new URL("../assets/2.glb", import.meta.url).href,
    // new URL("../assets/3.glb", import.meta.url).href,
    new URL("../assets/4.glb", import.meta.url).href,
    // new URL("../assets/5.glb", import.meta.url).href,
    (gltf) => {
      materialManager.cloneMaterials(gltf.scene);
      scene.add(gltf.scene);

      // 计算模型中心和尺寸
      const bbox = new THREE.Box3().setFromObject(gltf.scene);
      modelCenter = bbox.getCenter(new THREE.Vector3());
      modelSize = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);

      // 相机初始化到斜视角
      camera.position.set(
        modelCenter.x + maxDim * 1.2,
        modelCenter.y + maxDim * 0.5,
        modelCenter.z + maxDim * 1.5
      );

      // 控制器设置
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(modelCenter);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI * 0.6;
      controls.minDistance = maxDim * 0.5;
      controls.maxDistance = maxDim * 3;

      // 相机过渡动画
      gsap.to(camera.position, {
        duration: 1.5,
        x: modelCenter.x + maxDim * 1.2,
        y: modelCenter.y + maxDim * 0.5,
        z: modelCenter.z + maxDim * 1.5,
        ease: "power2.out",
        onUpdate: () => controls && controls.update(),
      });

      // 动画系统初始化
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        const actions = {};
        gltf.animations.forEach((clip) => {
          actions[clip.name] = mixer.clipAction(clip);
          actions[clip.name].play();
        });
        animationInfo.value = {
          names: gltf.animations.map((a) => a.name),
          actions,
        };
        isPlaying.value = true;
      }

      // 辅助元素
      scene.add(new THREE.AxesHelper(maxDim));
      const gridHelper = new THREE.GridHelper(
        maxDim * 2,
        20,
        0x555555,
        0x333333
      );
      gridHelper.position.y = bbox.min.y;
      scene.add(gridHelper);
    },
    undefined,
    (error) => console.error("模型加载失败:", error)
  );

  // 交互事件
  const onMouseClick = (event) => {
    const rect = container.value.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    scene.traverse((obj) => obj.updateMatrixWorld());
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster
      .intersectObjects(scene.children, true)
      .filter((item) => item.object.visible && item.object.isMesh);

    if (intersects.length > 0) {
      const clickedObj = intersects[0].object;

      clickedObject.value = {
        name: clickedObj.name,
        type: clickedObj.type,
      };

      if (currentHighlighted === clickedObj) {
        materialManager.restore(clickedObj);
        currentHighlighted = null;
        isHighlighted.value = false;
      } else {
        if (currentHighlighted) materialManager.restore(currentHighlighted);
        materialManager.highlight(clickedObj);
        currentHighlighted = clickedObj;
        isHighlighted.value = true;
      }
    } else {
      // 只取消高亮，不清空info区域
      isHighlighted.value = false;
      if (currentHighlighted) {
        materialManager.restore(currentHighlighted);
        currentHighlighted = null;
      }
    }
  };

  container.value.addEventListener("click", onMouseClick);

  // 动画循环
  const animate = () => {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (controls) controls.update();
    renderer.render(scene, camera);
  };
  animate();

  // 调试界面
  const initGUI = () => {
    const gui = new GUI({ width: 300 });
    const cameraFolder = gui.addFolder("相机控制");
    cameraFolder.add(camera.position, "x", -50, 50).name("位置X");
    cameraFolder.add(camera.position, "y", 0, 100).name("位置Y");
    cameraFolder.add(camera.position, "z", -50, 50).name("位置Z");
    cameraFolder.open();

    if (animationInfo.value) {
      const animFolder = gui.addFolder("动画控制");
      animFolder
        .add({ speed: 1 }, "speed", 0.1, 2)
        .name("播放速度")
        .onChange((v) => {
          if (mixer) mixer.timeScale = v;
        });
      animFolder
        .add({ pause: false }, "pause")
        .name("暂停")
        .onChange((v) => {
          if (mixer) mixer.timeScale = v ? 0 : 1;
        });
      animFolder.open();
    }
  };
  initGUI();

  // 窗口响应
  const onWindowResize = () => {
    camera.aspect = container.value.clientWidth / container.value.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  };
  window.addEventListener("resize", onWindowResize);

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onWindowResize);
    container.value?.removeEventListener("click", onMouseClick);
    if (mixer) mixer.stopAllAction();
  });
});
</script>

<style scoped>
.three-container {
  width: 100%;
  height: 80vh;
  border: 1px solid #444;
  cursor: pointer;
  box-sizing: border-box;
  background: linear-gradient(to bottom, #1a1a1a, #333);
}

.info-tooltip {
  position: fixed;
  top: 20px;
  left: 20px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 12px;
  border-radius: 4px;
  font-family: "Arial", sans-serif;
  font-size: 14px;
  /* pointer-events: none;  这一行一定要去掉！！ */
  border-left: 3px solid #0099ff;
  z-index: 99;
  pointer-events: auto;
}

.animation-controls {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #555;
}

.animation-controls button {
  background: #0099ff;
  color: white;
  border: none;
  padding: 4px 8px;
  margin-right: 8px;
  border-radius: 3px;
  cursor: pointer;
}

.animation-controls input[type="range"] {
  width: 100px;
  vertical-align: middle;
}
</style>
