<template>
  <div class="container">
    <!-- 播放控制按钮 -->
    <div class="controls">
      <button @click="togglePlay" :disabled="!trajectory.length">
        {{ isPlaying ? "停止播放" : "播放轨迹" }}
      </button>
    </div>

    <!-- Three.js 渲染容器 -->
    <div ref="canvasContainer" class="canvas-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer";

// 接收外部轨迹数据（基于X右、Y前、Z上坐标系）
const props = defineProps({
  trajectory: {
    type: Array,
    default: () => [],
  },
});

// 状态管理
const isPlaying = ref(false);
const currentIndex = ref(0);

// DOM引用
const canvasContainer = ref(null);

// Three.js核心对象
let scene, camera, renderer, labelRenderer;
let orbitControls, sphere, trajectoryLine;
let playInterval = null;

// 坐标转换工具函数（核心：目标坐标系 ↔ Three.js原始坐标系）
// 目标坐标系定义：X右正、Y前正（屏幕内）、Z上正
function targetToThree(targetX, targetY, targetZ) {
  return new THREE.Vector3(
    targetX, // X轴：直接映射（右正）
    targetZ, // Z轴：目标Z（上）→ Three.js Y（上）
    -targetY // Y轴：目标Y（前）→ Three.js Z（向内=前正，取负）
  );
}

// 初始化场景
function initThree() {
  // 创建场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  // 创建相机（调整位置更贴合新坐标系视角）
  camera = new THREE.PerspectiveCamera(
    75,
    canvasContainer.value.clientWidth / canvasContainer.value.clientHeight,
    0.1,
    1000
  );

  console.log('two');
  console.log(canvasContainer.value.clientWidth);
  console.log(canvasContainer.value.clientHeight);

  camera.position.set(3.26, 2.89, 9.75);
  camera.lookAt(0, 0, 0);

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(
    canvasContainer.value.clientWidth,
    canvasContainer.value.clientHeight
  );
  canvasContainer.value.appendChild(renderer.domElement);

  // 文字标签渲染器
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(
    canvasContainer.value.clientWidth,
    canvasContainer.value.clientHeight
  );
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  canvasContainer.value.appendChild(labelRenderer.domElement);

  // 添加网格地面
  const grid = new THREE.GridHelper(10, 10, 0x333333, 0x222222);
  scene.add(grid);

  // 添加带标签的坐标轴（符合目标坐标系）
  addAxesWithLabels();

  // 创建小球
  const sphereGeo = new THREE.SphereGeometry(0.25);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  sphere = new THREE.Mesh(sphereGeo, sphereMat);
  scene.add(sphere);

  // 初始化轨道控制器
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.NONE,
    RIGHT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
  };

  // 初始渲染轨迹
  updateTrajectoryLine(props.trajectory);

  // 启动渲染循环
  animate();
}

// 添加带文字标签的坐标轴（视觉对齐目标坐标系）
function addAxesWithLabels() {
  const axisLength = 5;

  // X轴：右正（红色）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(axisLength, 0, 0), // 原始X轴正方向（右）
      ]),
      new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
    )
  );

  // Y轴：前正（绿色，指向屏幕内）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -axisLength), // 原始Z轴负方向（向内=前）
      ]),
      new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
    )
  );

  // Z轴：上正（蓝色）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, axisLength, 0), // 原始Y轴正方向（上）
      ]),
      new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 })
    )
  );

  // 创建标签（与轴的正方向对齐）
  function createLabel(text, color, position) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.color = color;
    div.style.fontFamily = "Arial";
    div.style.fontSize = "14px";
    div.style.background = "rgba(0,0,0,0.7)";
    div.style.padding = "2px 6px";
    div.style.borderRadius = "3px";

    const label = new CSS2DObject(div);
    label.position.copy(position);
    scene.add(label);
  }

  createLabel("X", "#ff0000", new THREE.Vector3(axisLength + 0.3, 0, 0));
  createLabel("Y", "#00ff00", new THREE.Vector3(0, 0, -axisLength - 0.3)); // Y轴前向标签
  createLabel("Z", "#0000ff", new THREE.Vector3(0, axisLength + 0.3, 0)); // Z轴上向标签
}

// 更新轨迹线（转换目标坐标为Three.js坐标）
function updateTrajectoryLine(points) {
  // 移除旧轨迹线
  if (trajectoryLine) {
    scene.remove(trajectoryLine);
    trajectoryLine.geometry.dispose();
  }

  // 实时更新轨迹线
  if (points.length >= 1) {
    // 转换目标坐标系的点为Three.js渲染坐标
    const vertices = points.map((p) => targetToThree(p.x, p.y, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(vertices);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 2,
    });
    trajectoryLine = new THREE.Line(geo, mat);
    scene.add(trajectoryLine);

    // 非播放状态下同步小球到最后一点
    if (points.length > 0 && !isPlaying.value) {
      const lastPoint = points[points.length - 1];
      const threePos = targetToThree(lastPoint.x, lastPoint.y, lastPoint.z);
      sphere.position.copy(threePos);
      currentIndex.value = points.length - 1;
    }
  }
}

// 渲染循环
function animate() {
  requestAnimationFrame(animate);
  orbitControls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// 窗口大小调整
function onWindowResize() {
  if (!camera || !renderer) return;

  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

// 播放/停止轨迹（使用坐标转换确保运动正确）
const togglePlay = () => {
  if (isPlaying.value) {
    clearInterval(playInterval);
    isPlaying.value = false;
    return;
  }

  if (props.trajectory.length < 2) return;

  isPlaying.value = true;
  currentIndex.value = 0;

  playInterval = setInterval(() => {
    if (currentIndex.value >= props.trajectory.length) {
      clearInterval(playInterval);
      isPlaying.value = false;
      currentIndex.value = 0;
      // 回到起点（转换坐标）
      const firstPoint = props.trajectory[0];
      const threePos = targetToThree(firstPoint.x, firstPoint.y, firstPoint.z);
      sphere.position.copy(threePos);
      return;
    }

    // 转换目标坐标为Three.js坐标并设置小球位置
    const point = props.trajectory[currentIndex.value];
    const threePos = targetToThree(point.x, point.y, point.z);
    sphere.position.copy(threePos);
    currentIndex.value++;
  }, 50);
};

// 监听轨迹数据变化（实时更新）
watch(
  () => props.trajectory,
  (newVal) => {
    updateTrajectoryLine(newVal);
  },
  { deep: true, immediate: true }
);

// 生命周期
onMounted(() => {
  window.addEventListener("resize", onWindowResize);
  if (canvasContainer.value) initThree();
});

onUnmounted(() => {
  if (playInterval) clearInterval(playInterval);
  window.removeEventListener("resize", onWindowResize);

  renderer.dispose();
  if (labelRenderer?.domElement?.parentElement) {
    labelRenderer.domElement.parentElement.removeChild(
      labelRenderer.domElement
    );
  }
});
</script>

<style scoped>
.container {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  position: relative;
}

.controls {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 100;
}

button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: rgba(20, 20, 20, 0.9);
  color: white;
  font-size: 14px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.canvas-container {
  width: 100%;
  height: 100%;
  pointer-events: auto;
}
</style>
