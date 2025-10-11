<template>
  <div class="container">
    <!-- 控制面板 -->
    <div class="controls">
      <div class="trajectory-controls">
        <button
          @click="toggleRecord"
          :disabled="isPlaying"
          :class="{ active: isRecording }"
        >
          {{ isRecording ? "停止记录" : "开始记录" }}
        </button>
        <button
          @click="playRecord"
          :disabled="!hasRecord || isRecording || isPlaying"
        >
          回放轨迹
        </button>
        <button
          @click="clearRecord"
          :disabled="!hasRecord || isRecording || isPlaying"
        >
          清除记录
        </button>
      </div>

      <div class="info">
        坐标: X: {{ x.toFixed(2) }}, Y: {{ y.toFixed(2) }}, Z: {{ z.toFixed(2)
        }}<br />
        状态: {{ statusText }}<br />
        操作: 左键拖拽小球 | 右键旋转视角 | 滚轮缩放
      </div>
    </div>

    <!-- Three.js 渲染容器 -->
    <div ref="canvasContainer" class="canvas-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, reactive, computed } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer";

// 定义事件，实时传递轨迹数据
const emits = defineEmits(["getTrajectory"]);

// 响应式状态
const state = reactive({
  isRecording: false, // 是否正在记录
  isPlaying: false, // 是否正在回放
  trajectory: [], // 完整轨迹数据
  tempTrajectory: [], // 实时记录的临时轨迹
  x: 0,
  y: 0,
  z: 0, // 小球当前坐标
  lastRecordedPoint: null, // 上一个记录的点（用于去重）
});

// 计算属性
const isRecording = computed(() => state.isRecording);
const isPlaying = computed(() => state.isPlaying);
const hasRecord = computed(() => state.trajectory.length > 0);
const x = computed(() => state.x);
const y = computed(() => state.y);
const z = computed(() => state.z);

const statusText = computed(() => {
  if (state.isRecording)
    return `正在记录（${state.tempTrajectory.length}个点）`;
  if (state.isPlaying)
    return `正在回放（${Math.round(playProgress.value * 100)}%）`;
  if (hasRecord.value) return `已记录轨迹（${state.trajectory.length}个点）`;
  return "就绪（可开始记录轨迹）";
});

// 回放进度
const playProgress = ref(0);
const canvasContainer = ref(null);

// Three.js 核心对象
let scene, camera, renderer, labelRenderer;
let orbitControls, transformControls;
let sphere, trajectoryLine, tempTrajectoryLine;
let transformHelper = null;
let playInterval = null;
let lastEmitTime = 0; // 用于控制数据发送频率（避免性能问题）

// 初始化场景
function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  camera = new THREE.PerspectiveCamera(
    75,
    canvasContainer.value.clientWidth / canvasContainer.value.clientHeight,
    0.1,
    1000
  );
  camera.position.set(8, 8, 8);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(
    canvasContainer.value.clientWidth,
    canvasContainer.value.clientHeight
  );
  canvasContainer.value.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(
    canvasContainer.value.clientWidth,
    canvasContainer.value.clientHeight
  );
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  canvasContainer.value.appendChild(labelRenderer.domElement);

  const grid = new THREE.GridHelper(10, 10, 0x333333, 0x222222);
  scene.add(grid);

  addAxesWithLabels();

  const sphereGeo = new THREE.SphereGeometry(0.25);
  const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.set(0, 0, 0);
  scene.add(sphere);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.NONE,
    RIGHT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
  };

  initTransformControls();
  animate();
}

// 添加坐标轴标签
function addAxesWithLabels() {
  const axisLength = 5;

  // X轴
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(axisLength, 0, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
    )
  );

  // Y轴
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, axisLength, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
    )
  );

  // Z轴
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, axisLength),
      ]),
      new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 })
    )
  );

  function createAxisLabel(text, color, position) {
    const div = document.createElement("div");
    div.textContent = text;
    div.style.color = color;
    div.style.fontFamily = "Arial, sans-serif";
    div.style.fontSize = "14px";
    div.style.fontWeight = "bold";
    div.style.background = "rgba(0, 0, 0, 0.7)";
    div.style.padding = "2px 6px";
    div.style.borderRadius = "3px";

    const label = new CSS2DObject(div);
    label.position.copy(position);
    scene.add(label);
  }

  createAxisLabel("X", "#ff0000", new THREE.Vector3(axisLength + 0.3, 0, 0));
  createAxisLabel("Y", "#00ff00", new THREE.Vector3(0, axisLength + 0.3, 0));
  createAxisLabel("Z", "#0000ff", new THREE.Vector3(0, 0, axisLength + 0.3));
}

// 初始化变换控制器（核心拖拽逻辑）
function initTransformControls() {
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.mode = "translate";

  transformHelper = transformControls.getHelper();
  if (transformHelper) scene.add(transformHelper);

  transformControls.attach(sphere);

  // 监听小球位置变化（实时更新坐标和轨迹）
  transformControls.addEventListener("change", () => {
    // 更新坐标显示
    state.x = sphere.position.x;
    state.y = sphere.position.y;
    state.z = sphere.position.z;

    // 记录过程中，实时添加轨迹点并传递给父组件
    if (state.isRecording) {
      const currentPoint = {
        x: sphere.position.x,
        y: sphere.position.y,
        z: sphere.position.z,
      };

      // 去重处理（避免相同位置重复记录）
      const isSameAsLast =
        state.lastRecordedPoint &&
        Math.abs(currentPoint.x - state.lastRecordedPoint.x) < 0.01 &&
        Math.abs(currentPoint.y - state.lastRecordedPoint.y) < 0.01 &&
        Math.abs(currentPoint.z - state.lastRecordedPoint.z) < 0.01;

      if (!isSameAsLast) {
        state.tempTrajectory.push(currentPoint);
        state.lastRecordedPoint = currentPoint;
        updateTempTrajectoryLine();

        // 控制发送频率（每50ms最多发送一次，避免性能问题）
        const now = Date.now();
        if (now - lastEmitTime > 50) {
          emits("getTrajectory", [...state.tempTrajectory]);
          lastEmitTime = now;
        }
      }
    }
  });

  // 拖拽开始/结束时禁用/启用轨道控制器
  transformControls.addEventListener("start", () => {
    orbitControls.enabled = false;
  });
  transformControls.addEventListener("end", () => {
    orbitControls.enabled = true;
  });
}

// 更新实时轨迹线
function updateTempTrajectoryLine() {
  if (tempTrajectoryLine) {
    scene.remove(tempTrajectoryLine);
    tempTrajectoryLine.geometry.dispose();
  }

  if (state.tempTrajectory.length > 1) {
    const points = state.tempTrajectory.map(
      (p) => new THREE.Vector3(p.x, p.y, p.z)
    );
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    tempTrajectoryLine = new THREE.Line(geo, mat);
    scene.add(tempTrajectoryLine);
  }
}

// 更新已保存轨迹线
function updateSavedTrajectoryLine() {
  if (trajectoryLine) {
    scene.remove(trajectoryLine);
    trajectoryLine.geometry.dispose();
  }

  if (state.trajectory.length > 1) {
    const points = state.trajectory.map(
      (p) => new THREE.Vector3(p.x, p.y, p.z)
    );
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    trajectoryLine = new THREE.Line(geo, mat);
    scene.add(trajectoryLine);
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
  if (!camera || !renderer || !labelRenderer) return;

  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

// 切换记录状态（开始/停止）
const toggleRecord = () => {
  if (state.isRecording) {
    // 停止记录
    state.isRecording = false;
    state.trajectory = [...state.tempTrajectory];
    emits("getTrajectory", state.trajectory); // 最后一次完整发送
    updateSavedTrajectoryLine();
  } else {
    // 开始记录
    state.tempTrajectory = [];
    state.lastRecordedPoint = null;
    // 添加初始点
    const initialPoint = {
      x: sphere.position.x,
      y: sphere.position.y,
      z: sphere.position.z,
    };
    state.tempTrajectory.push(initialPoint);
    state.lastRecordedPoint = initialPoint;
    state.isRecording = true;
    emits("getTrajectory", [initialPoint]); // 发送初始点
    updateTempTrajectoryLine();
  }
};

// 回放轨迹
const playRecord = () => {
  if (state.trajectory.length < 2) return;

  state.isPlaying = true;
  transformControls.enabled = false;
  let index = 0;
  const totalPoints = state.trajectory.length;

  playInterval = setInterval(() => {
    if (index >= totalPoints) {
      clearInterval(playInterval);
      state.isPlaying = false;
      transformControls.enabled = true;
      playProgress.value = 0;
      return;
    }

    const point = state.trajectory[index];
    sphere.position.set(point.x, point.y, point.z);
    state.x = point.x;
    state.y = point.y;
    state.z = point.z;

    // 回放时也实时更新给父组件
    emits("getTrajectory", state.trajectory.slice(0, index + 1));
    playProgress.value = index / totalPoints;
    index++;
  }, 50);
};

// 清除记录
const clearRecord = () => {
  state.trajectory = [];
  state.tempTrajectory = [];
  state.lastRecordedPoint = null;

  // 通知父组件清空轨迹
  emits("getTrajectory", []);

  if (trajectoryLine) {
    scene.remove(trajectoryLine);
    trajectoryLine = null;
  }
  if (tempTrajectoryLine) {
    scene.remove(tempTrajectoryLine);
    tempTrajectoryLine = null;
  }
};

// 生命周期
onMounted(() => {
  window.addEventListener("resize", onWindowResize);
  setTimeout(() => {
    if (canvasContainer.value) initThree();
  }, 50);
});

onUnmounted(() => {
  if (playInterval) clearInterval(playInterval);
  window.removeEventListener("resize", onWindowResize);

  renderer.dispose();
  if (labelRenderer && labelRenderer.domElement.parentElement) {
    labelRenderer.domElement.parentElement.removeChild(
      labelRenderer.domElement
    );
  }
  if (transformHelper) scene.remove(transformHelper);
});
</script>

<style scoped>
/* 样式保持不变 */
.container {
  height: 100%;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.controls {
  position: fixed;
  top: 10px;
  left: 10px;
  background: rgba(20, 20, 20, 0.9);
  padding: 12px;
  border-radius: 6px;
  color: #fff;
  font-family: Arial, sans-serif;
  z-index: 100;
}

.trajectory-controls {
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #444;
  color: white;
  font-size: 14px;
}

button:hover:not(:disabled) {
  background: #666;
}

button.active {
  background: #2196f3;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.info {
  font-size: 13px;
  line-height: 1.6;
  color: #eee;
}

.canvas-container {
  width: 100%;
  height: 100%;
  pointer-events: auto;
}
</style>
