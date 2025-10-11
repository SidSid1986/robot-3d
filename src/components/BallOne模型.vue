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
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

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
  z: 0, // 小球当前坐标（目标坐标系：X右、Y前、Z上）
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
// let sphere, trajectoryLine, tempTrajectoryLine;//小球
let model, trajectoryLine, tempTrajectoryLine; // 222新增模型变量
let transformHelper = null;
let playInterval = null;
let lastEmitTime = 0; // 用于控制数据发送频率

// 坐标转换工具函数（核心:目标坐标系 ↔ Three.js原始坐标系)
// 目标坐标系定义:X右正、Y前正(屏幕内)、Z上正
const targetToThree = (targetX, targetY, targetZ) => {
  // 目标坐标 → Three.js原始坐标(渲染用)
  return new THREE.Vector3(
    targetX, // X轴:直接映射（右正）
    targetZ, // Z轴:目标Z(上)→ Three.js Y(上)
    -targetY // Y轴:目标Y(前)→ Three.js Z(向内=前正，故取负）
  );
};

const threeToTarget = (threeVec3) => {
  // Three.js原始坐标 → 目标坐标（逻辑/显示用）
  return {
    x: threeVec3.x, // X轴:直接映射
    y: -threeVec3.z, // Y轴:Three.js Z(向内）→ 目标Y(前正）
    z: threeVec3.y, // Z轴:Three.js Y(上）→ 目标Z(上正）
  };
};

// 初始化场景 小球
// const initThree = () => {
//   scene = new THREE.Scene();
//   scene.background = new THREE.Color(0xb1b1b1);

//   camera = new THREE.PerspectiveCamera(
//     75,
//     canvasContainer.value.clientWidth / canvasContainer.value.clientHeight,
//     0.1,
//     1000
//   );

//   // 相机初始位置:右5、上8、后5(从斜上方观察,清晰展示三轴方向)
//   camera.position.set(3.26, 2.89, 9.75);
//   camera.lookAt(0, 0, 0);

//   renderer = new THREE.WebGLRenderer({ antialias: true });
//   renderer.setSize(
//     canvasContainer.value.clientWidth,
//     canvasContainer.value.clientHeight
//   );
//   canvasContainer.value.appendChild(renderer.domElement);

//   labelRenderer = new CSS2DRenderer();
//   labelRenderer.setSize(
//     canvasContainer.value.clientWidth,
//     canvasContainer.value.clientHeight
//   );
//   labelRenderer.domElement.style.position = "absolute";
//   labelRenderer.domElement.style.top = "0";
//   labelRenderer.domElement.style.pointerEvents = "none";
//   canvasContainer.value.appendChild(labelRenderer.domElement);

//   // 添加网格辅助线
//   const grid = new THREE.GridHelper(10, 10, 0x9b9b9b, 0x8b8b8b);
//   scene.add(grid);

//   // 添加带标签的坐标轴
//   addAxesWithLabels();

//   // 创建小球（末端模拟）
//   const sphereGeo = new THREE.SphereGeometry(0.25);
//   const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
//   sphere = new THREE.Mesh(sphereGeo, sphereMat);
//   // 初始位置：目标坐标(0,0,0) → 转换为Three.js坐标
//   const initialThreePos = targetToThree(2, 2, 0);
//   sphere.position.copy(initialThreePos);
//   // 同步初始坐标到状态
//   const initialTargetPos = threeToTarget(sphere.position);
//   state.x = initialTargetPos.x;
//   state.y = initialTargetPos.y;
//   state.z = initialTargetPos.z;
//   scene.add(sphere);

//   // 轨道控制器（旋转/缩放视角）
//   orbitControls = new OrbitControls(camera, renderer.domElement);
//   orbitControls.enableDamping = true;
//   orbitControls.mouseButtons = {
//     LEFT: THREE.MOUSE.NONE, // 左键禁用(留给TransformControls）
//     RIGHT: THREE.MOUSE.ROTATE, // 右键旋转
//     MIDDLE: THREE.MOUSE.DOLLY, // 中键缩放
//   };

//   // 初始化变换控制器（拖拽小球）
//   initTransformControls();

//   // 启动渲染循环
//   animate();
// };

//222新增模型初始化
const initThree = () => {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb1b1b1);

  camera = new THREE.PerspectiveCamera(
    75,
    canvasContainer.value.clientWidth / canvasContainer.value.clientHeight,
    0.1,
    1000
  );

  // 相机初始位置:右5、上8、后5(从斜上方观察,清晰展示三轴方向)
  camera.position.set(3.26, 2.89, 9.75);
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

  // 添加网格辅助线
  const grid = new THREE.GridHelper(10, 10, 0x9b9b9b, 0x8b8b8b);
  scene.add(grid);

  // 添加带标签的坐标轴
  addAxesWithLabels();

  const loader = new GLTFLoader();

  // 2. 加载模型（替换为你的模型路径，如"./models/robot.glb"）
  loader.load(
    "/public/model/4.glb", // 模型文件路径（必填）
    (gltf) => {
      // 加载成功：获取模型主体
      model = gltf.scene;

      // 3. 调整模型大小（根据模型实际尺寸缩放，示例为0.5倍）
      model.scale.set(5, 5, 5);

      // 4. 设置初始位置（与原小球初始位置一致：targetToThree(2,2,0)）
      const initialThreePos = targetToThree(2, 2, 0);
      model.position.copy(initialThreePos);

      // 5. 将模型添加到场景
      scene.add(model);

      // 6. 同步初始坐标到状态（与原小球逻辑一致）
      const initialTargetPos = threeToTarget(model.position);
      state.x = initialTargetPos.x;
      state.y = initialTargetPos.y;
      state.z = initialTargetPos.z;

      // 7. 将模型绑定到变换控制器（关键：让模型可拖拽）
      transformControls.attach(model);
    },
    (xhr) => {
      // 加载进度（可选）
      console.log(`模型加载中：${Math.round((xhr.loaded / xhr.total) * 100)}%`);
    },
    (error) => {
      // 加载失败提示（可选）
      console.error("模型加载失败：", error);
    }
  );

  // 轨道控制器（旋转/缩放视角）
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.NONE, // 左键禁用(留给TransformControls）
    RIGHT: THREE.MOUSE.ROTATE, // 右键旋转
    MIDDLE: THREE.MOUSE.DOLLY, // 中键缩放
  };

  // 初始化变换控制器（拖拽小球）
  initTransformControls();

  // 启动渲染循环
  animate();
};

// 添加带标签的坐标轴（视觉对齐目标坐标系）
const addAxesWithLabels = () => {
  const axisLength = 5;

  // X轴：右正（红色）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(axisLength, 0, 0), // 原始X轴正方向(右)
      ]),
      new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
    )
  );

  // Y轴：前正（绿色，对应原始Z轴向内）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -axisLength), // 原始Z轴负方向（向内=前）
      ]),
      new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
    )
  );

  // Z轴：上正（蓝色，对应原始Y轴向上）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, axisLength, 0), // 原始Y轴正方向(上)
      ]),
      new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 })
    )
  );

  // 创建坐标轴标签
  const createAxisLabel = (text, color, position) => {
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
  };

  // 标签位置与轴的正方向对齐
  createAxisLabel("X", "#ff0000", new THREE.Vector3(axisLength + 0.3, 0, 0));
  createAxisLabel("Y", "#00ff00", new THREE.Vector3(0, 0, -axisLength - 0.3)); // Y轴(前)标签
  createAxisLabel("Z", "#0000ff", new THREE.Vector3(0, axisLength + 0.3, 0)); // Z轴(上)标签
};

// 初始化变换控制器（拖拽小球逻辑）
// const initTransformControls = () => {
//   transformControls = new TransformControls(camera, renderer.domElement);
//   transformControls.mode = "translate"; // 仅允许平移

//   transformHelper = transformControls.getHelper();
//   if (transformHelper) scene.add(transformHelper);

//   transformControls.attach(sphere); // 将控制器绑定到小球

//   // 监听小球位置变化（实时更新坐标和轨迹）
//   transformControls.addEventListener("change", () => {
//     // 转换原始坐标为目标坐标（更新显示）
//     const targetPos = threeToTarget(sphere.position);
//     state.x = targetPos.x;
//     state.y = targetPos.y;
//     state.z = targetPos.z;

//     // 记录状态时添加轨迹点
//     if (state.isRecording) {
//       const currentPoint = { ...targetPos };

//       // 去重处理（避免微小移动重复记录）
//       const isSameAsLast =
//         state.lastRecordedPoint &&
//         Math.abs(currentPoint.x - state.lastRecordedPoint.x) < 0.01 &&
//         Math.abs(currentPoint.y - state.lastRecordedPoint.y) < 0.01 &&
//         Math.abs(currentPoint.z - state.lastRecordedPoint.z) < 0.01;

//       if (!isSameAsLast) {
//         state.tempTrajectory.push(currentPoint);
//         state.lastRecordedPoint = currentPoint;
//         updateTempTrajectoryLine();

//         // 控制发送频率（每50ms最多一次）
//         const now = Date.now();
//         if (now - lastEmitTime > 50) {
//           emits("getTrajectory", [...state.tempTrajectory]);
//           lastEmitTime = now;
//         }
//       }
//     }
//   });

//   // 拖拽开始/结束时禁用/启用轨道控制器
//   transformControls.addEventListener("start", () => {
//     orbitControls.enabled = false;
//   });
//   transformControls.addEventListener("end", () => {
//     orbitControls.enabled = true;
//   });
// };

//222 初始变换控制器模型
// 初始化变换控制器（拖拽模型逻辑）
const initTransformControls = () => {
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.mode = "translate"; // 仅允许平移

  transformHelper = transformControls.getHelper();
  if (transformHelper) scene.add(transformHelper);

  // 注意：这里暂时不绑定对象，等模型加载成功后再绑定（在loader的回调中）
  // 原代码：transformControls.attach(sphere);

  // 监听模型位置变化（实时更新坐标和轨迹）
  transformControls.addEventListener("change", () => {
    // 转换原始坐标为目标坐标（更新显示）
    const targetPos = threeToTarget(model.position); // 替换sphere为model
    state.x = targetPos.x;
    state.y = targetPos.y;
    state.z = targetPos.z;

    // 记录状态时添加轨迹点（逻辑不变，仅操作对象从sphere变为model）
    if (state.isRecording) {
      const currentPoint = { ...targetPos };

      // 去重处理（不变）
      const isSameAsLast =
        state.lastRecordedPoint &&
        Math.abs(currentPoint.x - state.lastRecordedPoint.x) < 0.01 &&
        Math.abs(currentPoint.y - state.lastRecordedPoint.y) < 0.01 &&
        Math.abs(currentPoint.z - state.lastRecordedPoint.z) < 0.01;

      if (!isSameAsLast) {
        state.tempTrajectory.push(currentPoint);
        state.lastRecordedPoint = currentPoint;
        updateTempTrajectoryLine();

        // 控制发送频率（不变）
        const now = Date.now();
        if (now - lastEmitTime > 50) {
          emits("getTrajectory", [...state.tempTrajectory]);
          lastEmitTime = now;
        }
      }
    }
  });

  // 拖拽开始/结束时禁用/启用轨道控制器（不变）
  transformControls.addEventListener("start", () => {
    orbitControls.enabled = false;
  });
  transformControls.addEventListener("end", () => {
    orbitControls.enabled = true;
  });
};
// 更新实时轨迹线（黄色）
const updateTempTrajectoryLine = () => {
  if (tempTrajectoryLine) {
    scene.remove(tempTrajectoryLine);
    tempTrajectoryLine.geometry.dispose();
  }

  if (state.tempTrajectory.length > 1) {
    // 目标坐标转换为Three.js坐标用于渲染
    const points = state.tempTrajectory.map((p) =>
      targetToThree(p.x, p.y, p.z)
    );
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    tempTrajectoryLine = new THREE.Line(geo, mat);
    scene.add(tempTrajectoryLine);
  }
};

// 更新已保存轨迹线（青色）
const updateSavedTrajectoryLine = () => {
  if (trajectoryLine) {
    scene.remove(trajectoryLine);
    trajectoryLine.geometry.dispose();
  }

  if (state.trajectory.length > 1) {
    // 目标坐标转换为Three.js坐标用于渲染
    const points = state.trajectory.map((p) => targetToThree(p.x, p.y, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    trajectoryLine = new THREE.Line(geo, mat);
    scene.add(trajectoryLine);
  }
};

// 渲染循环
const animate = () => {
  requestAnimationFrame(animate);
  orbitControls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
};

// 窗口大小调整
const onWindowResize = () => {
  if (!camera || !renderer || !labelRenderer) return;

  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
};

// 切换记录状态（开始/停止）
const toggleRecord = () => {
  if (state.isRecording) {
    // 停止记录：保存临时轨迹
    state.isRecording = false;
    state.trajectory = [...state.tempTrajectory];
    emits("getTrajectory", state.trajectory); // 发送完整轨迹
    updateSavedTrajectoryLine();
  } else {
    // 开始记录：初始化临时轨迹
    state.tempTrajectory = [];
    state.lastRecordedPoint = null;
    // 添加初始点（当前目标坐标）
    // const initialPoint = threeToTarget(sphere.position);//小球
    const initialPoint = threeToTarget(model.position); //222 model

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
  transformControls.enabled = false; // 回放时禁用拖拽
  let index = 0;
  const totalPoints = state.trajectory.length;

  playInterval = setInterval(() => {
    if (index >= totalPoints) {
      // 回放结束
      clearInterval(playInterval);
      state.isPlaying = false;
      transformControls.enabled = true;
      playProgress.value = 0;
      return;
    }

    // 目标坐标转换为Three.js坐标，设置小球位置
    const point = state.trajectory[index];
    const threePos = targetToThree(point.x, point.y, point.z);
    // sphere.position.copy(threePos);//小球
    model.position.copy(threePos); //模型

    // 更新显示坐标
    state.x = point.x;
    state.y = point.y;
    state.z = point.z;

    // 发送当前回放进度的轨迹
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

  emits("getTrajectory", []); // 通知父组件清空

  // 移除轨迹线
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
  // 延迟初始化，确保DOM已加载
  setTimeout(() => {
    if (canvasContainer.value) initThree();
  }, 50);
});

onUnmounted(() => {
  if (playInterval) clearInterval(playInterval);
  window.removeEventListener("resize", onWindowResize);

  // 清理Three.js资源
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
.container {
  height: 100vh;
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
