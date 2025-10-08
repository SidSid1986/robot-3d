<template>
  <div class="robot-model-container">
    <!-- 用于承载 Three.js 渲染画布的容器 -->
    <div ref="container" class="canvas-container"></div>

    <!-- 控制面板组合：机械臂控制 + 轨迹记录控制 -->
    <div class="control-panels">
      <!-- 机械臂控制面板 -->
      <RobotControl
        @joint-change="handleJointChange"
        @gripper-change="handleGripperChange"
        @reset-all="resetAllJoints"
      />

      <!-- 轨迹记录控制面板 -->
      <div class="trajectory-controls">
        <div class="controls-title">轨迹控制</div>
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
        <div class="info">
          末端坐标: X: {{ endX.toFixed(2) }}, Y: {{ endY.toFixed(2) }}, Z:
          {{ endZ.toFixed(2) }}<br />
          状态: {{ statusText }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  onMounted,
  onBeforeUnmount,
  reactive,
  computed,
  watch,
} from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer";
import URDFLoader from "urdf-loader";
import RobotControl from "./RobotControl.vue"; // 确保该组件路径正确

// 容器引用
const container = ref(null);

// 轨迹记录相关状态
const state = reactive({
  isRecording: false,
  isPlaying: false,
  trajectory: [],
  tempTrajectory: [],
  endX: 0,
  endY: 0,
  endZ: 0,
  lastRecordedPoint: null,
});

// 计算属性
const isRecording = computed(() => state.isRecording);
const isPlaying = computed(() => state.isPlaying);
const hasRecord = computed(() => state.trajectory.length > 0);
const endX = computed(() => state.endX);
const endY = computed(() => state.endY);
const endZ = computed(() => state.endZ);

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

// Three.js 核心对象
let scene, camera, renderer, labelRenderer, controls;
let robot, endEffector, transformControls;
let trajectoryLine, tempTrajectoryLine, originSphere;
let playInterval = null;
let lastEmitTime = 0;

// 坐标转换工具函数（统一坐标系：X右、Y前、Z上）
const targetToThree = (targetX, targetY, targetZ) => {
  return new THREE.Vector3(
    targetX, // X轴: 直接映射（右正）
    targetZ, // Z轴: 目标Z(上) → Three.js Y(上)
    -targetY // Y轴: 目标Y(前) → Three.js Z(向内，取负)
  );
};

const threeToTarget = (threeVec3) => {
  return {
    x: threeVec3.x,
    y: -threeVec3.z,
    z: threeVec3.y,
  };
};

/**
 * 初始化3D场景
 */
const initScene = () => {
  // 创建场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee);

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    85,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  );

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  container.value.appendChild(renderer.domElement);

  // 创建标签渲染器（用于坐标轴标签）
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(
    container.value.clientWidth,
    container.value.clientHeight
  );
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.value.appendChild(labelRenderer.domElement);

  // 光源配置
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  scene.add(directionalLight);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight2.position.set(-8, 15, -8);
  scene.add(directionalLight2);

  const ambientLight = new THREE.AmbientLight(0x606060, 1.3);
  scene.add(ambientLight);

  // 网格地面
  const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x888888);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);

  // 添加带标签的坐标轴
  addAxesWithLabels();

  // 轨道控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // 变换控制器（用于拖拽末端执行器）
  initTransformControls();

  // 加载机器人模型
  loadRobotModel();
};

/**
 * 添加带标签的坐标轴
 */
const addAxesWithLabels = () => {
  const axisLength = 5;

  // X轴（红）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        targetToThree(0, 0, 0),
        targetToThree(axisLength, 0, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
    )
  );

  // Y轴（绿）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        targetToThree(0, 0, 0),
        targetToThree(0, axisLength, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
    )
  );

  // Z轴（蓝）
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        targetToThree(0, 0, 0),
        targetToThree(0, 0, axisLength),
      ]),
      new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 })
    )
  );

  // 坐标轴标签
  const createAxisLabel = (text, color, targetPos) => {
    const div = document.createElement("div");
    div.textContent = text;
    div.style = `color: ${color}; font-family: Arial; font-size: 14px; font-weight: bold; background: rgba(	211,211,211,0.7); padding: 2px 6px; border-radius: 3px;`;
    const label = new CSS2DObject(div);
    label.position.copy(targetToThree(targetPos.x, targetPos.y, targetPos.z));
    scene.add(label);
  };

  createAxisLabel("X", "#ff0000", { x: axisLength + 0.3, y: 0, z: 0 });
  createAxisLabel("Y", "#00ff00", { x: 0, y: axisLength + 0.3, z: 0 });
  createAxisLabel("Z", "#0000ff", { x: 0, y: 0, z: axisLength + 0.3 });
};

/**
 * 初始化变换控制器
 */
const initTransformControls = () => {
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.mode = "translate";
  scene.add(transformControls);

  // 拖拽事件
  transformControls.addEventListener("change", () => {
    if (endEffector) {
      const targetPos = threeToTarget(endEffector.position);
      state.endX = targetPos.x;
      state.endY = targetPos.y;
      state.endZ = targetPos.z;

      // 记录轨迹
      if (state.isRecording) {
        const currentPoint = { ...targetPos };
        const isSameAsLast =
          state.lastRecordedPoint &&
          Math.abs(currentPoint.x - state.lastRecordedPoint.x) < 0.01 &&
          Math.abs(currentPoint.y - state.lastRecordedPoint.y) < 0.01 &&
          Math.abs(currentPoint.z - state.lastRecordedPoint.z) < 0.01;

        if (!isSameAsLast) {
          state.tempTrajectory.push(currentPoint);
          state.lastRecordedPoint = currentPoint;
          updateTempTrajectoryLine();
        }
      }
    }
  });

  // 拖拽开始/结束
  transformControls.addEventListener("start", () => (controls.enabled = false));
  transformControls.addEventListener("end", () => (controls.enabled = true));
};

/**
 * 加载机器人模型
 */
const loadRobotModel = () => {
  const loader = new URDFLoader();
  loader.packages = { aubo_description: "/aubo_description" };

  const INITIAL_POSITIONS = {
    shoulder_joint: 0.0,
    upperArm_joint: 0.0,
    foreArm_joint: 1.57,
    wrist1_joint: 0.0,
    wrist2_joint: 1.57,
    wrist3_joint: 0.0,
    finger_joint: 0.0,
  };

  let meshNames = [];

  loader.load("./aubo_description/urdf/aubo_i5.urdf", (result) => {
    robot = result;

    //  1. 模型缩放：放大10倍（根据实际大小调整，可改为20、5等）
    // 原因：URDF模型默认单位可能是米，Three.js场景中显小，缩放后适配视野
    robot.scale.set(2, 2, 2);

    // 2. 模型位置调整：让底座贴合地面（Y=0）、居中（X/Z=0）
    // 若模型仍偏移，可微调x/y/z值（如x: 1 → 向右移1单位，y: 0.5 → 向上移0.5单位）
    robot.position.set(0, 0, 0);

    // 3  绕X轴旋转-90度，让机械臂从“躺下”变为“立起”
    // 原因：URDF模型默认Z轴朝上，与统一坐标系的Y轴朝上冲突，旋转后对齐Z上方向
    robot.rotation.x = -Math.PI / 2;
    scene.add(robot);

    robot.traverse((child) => {
      console.log(child);
      if (child instanceof THREE.Mesh) {
        // 设置Mesh名称
        child.name = "mesh_" + meshNames.length;
        meshNames.push(child.name);
        console.log(meshNames);
        // 添加点击事件
        child.onClick = () => {
          // 变色
          child.material.color.set(0xff0000);
          // 输出名称
          console.log(child.name);
        };
      }
    });

    // 找到末端执行器（根据实际URDF结构调整名称）
    endEffector = robot.getObjectByName("wrist3_link"); // 需与URDF中的末端连杆名称匹配
    if (endEffector) {
      transformControls.attach(endEffector);
      const targetPos = threeToTarget(endEffector.position);
      state.endX = targetPos.x;
      state.endY = targetPos.y;
      state.endZ = targetPos.z;
    }

    // 设置初始关节角度
    Object.entries(INITIAL_POSITIONS).forEach(([jointName, value]) => {
      if (robot.joints[jointName]) {
        robot.joints[jointName].setJointValue(value);
      }
    });

    // 调整相机位置（可选：若旋转后模型超出视野，微调相机位置）
    const box = new THREE.Box3().setFromObject(robot);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();

    // 微调相机Y轴位置（让立起的机械臂居中显示）
    camera.position.set(
      center.x + 2,
      center.y + 2, // 原5→2：降低Y轴高度，适配立起的模型
      center.z + 7
    );
    camera.lookAt(center);
    controls.update();
  });
};

/**
 * 更新临时轨迹线
 */
const updateTempTrajectoryLine = () => {
  if (tempTrajectoryLine) {
    scene.remove(tempTrajectoryLine);
    tempTrajectoryLine.geometry.dispose();
  }

  if (state.tempTrajectory.length > 1) {
    const points = state.tempTrajectory.map((p) =>
      targetToThree(p.x, p.y, p.z)
    );
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    tempTrajectoryLine = new THREE.Line(geo, mat);
    scene.add(tempTrajectoryLine);
  }
};

/**
 * 更新保存的轨迹线
 */
const updateSavedTrajectoryLine = () => {
  if (trajectoryLine) {
    scene.remove(trajectoryLine);
    trajectoryLine.geometry.dispose();
  }

  if (state.trajectory.length > 1) {
    const points = state.trajectory.map((p) => targetToThree(p.x, p.y, p.z));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    trajectoryLine = new THREE.Line(geo, mat);
    scene.add(trajectoryLine);
  }
};

/**
 * 动画循环
 */
const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
};

/**
 * 窗口大小调整
 */
const handleResize = () => {
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
};

/**
 * 机械臂关节控制
 */
const handleJointChange = ({ jointValues }) => {
  if (!robot) return;

  const jointOrder = [
    "shoulder_joint",
    "upperArm_joint",
    "foreArm_joint",
    "wrist1_joint",
    "wrist2_joint",
    "wrist3_joint",
  ];

  jointValues.forEach((value, index) => {
    const jointName = jointOrder[index];
    if (robot.joints[jointName]) {
      robot.joints[jointName].setJointValue(value);
      // 更新末端坐标
      if (endEffector) {
        const targetPos = threeToTarget(endEffector.position);
        state.endX = targetPos.x;
        state.endY = targetPos.y;
        state.endZ = targetPos.z;
      }
    }
  });
};

/**
 * 夹爪控制
 */
const handleGripperChange = (value) => {
  if (robot && robot.joints.finger_joint) {
    robot.joints.finger_joint.setJointValue(value);
  }
};

/**
 * 重置关节
 */
const resetAllJoints = (positions) => {
  if (!robot) return;

  Object.entries(positions).forEach(([jointName, value]) => {
    if (robot.joints[jointName]) {
      robot.joints[jointName].setJointValue(value);
    }
  });

  // 更新末端坐标
  if (endEffector) {
    const targetPos = threeToTarget(endEffector.position);
    state.endX = targetPos.x;
    state.endY = targetPos.y;
    state.endZ = targetPos.z;
  }
};

/**
 * 轨迹记录控制
 */
const toggleRecord = () => {
  if (state.isRecording) {
    state.isRecording = false;
    state.trajectory = [...state.tempTrajectory];
    updateSavedTrajectoryLine();
  } else {
    state.tempTrajectory = [];
    state.lastRecordedPoint = null;
    if (endEffector) {
      const initialPoint = threeToTarget(endEffector.position);
      state.tempTrajectory.push(initialPoint);
      state.lastRecordedPoint = initialPoint;
    }
    state.isRecording = true;
    updateTempTrajectoryLine();
  }
};

/**
 * 轨迹回放
 */
const playRecord = () => {
  if (state.trajectory.length < 2 || !endEffector) return;

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
    const threePos = targetToThree(point.x, point.y, point.z);
    endEffector.position.copy(threePos);

    state.endX = point.x;
    state.endY = point.y;
    state.endZ = point.z;

    playProgress.value = index / totalPoints;
    index++;
  }, 50);
};

/**
 * 清除轨迹
 */
const clearRecord = () => {
  state.trajectory = [];
  state.tempTrajectory = [];
  state.lastRecordedPoint = null;

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
  initScene();
  animate();
  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  if (playInterval) clearInterval(playInterval);
  if (container.value && renderer.domElement) {
    container.value.removeChild(renderer.domElement);
    container.value.removeChild(labelRenderer.domElement);
  }
  renderer.dispose();
});
</script>

<style scoped>
.robot-model-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.canvas-container {
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom right, #f0f0f0, #ffffff);
}

.control-panels {
  position: fixed;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 100;
}

.trajectory-controls {
  background: rgba(20, 20, 20, 0.9);
  padding: 12px;
  border-radius: 6px;
  color: #fff;
  font-family: Arial, sans-serif;
}

.controls-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #fff;
}

button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #444;
  color: white;
  font-size: 14px;
  margin-right: 6px;
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
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: #eee;
}
</style>
