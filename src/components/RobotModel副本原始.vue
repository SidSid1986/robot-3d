<template>
  <div class="robot-model-container">
    <!-- 用于承载 Three.js 渲染画布的容器 -->
    <div ref="container" class="canvas-container"></div>

    <!-- 机械臂控制面板组件，用于调节关节角度和夹爪 -->
    <!-- // 监听关节变化事件 // 监听夹爪变化事件 // 监听机械臂复位事件 -->
    <RobotControl
      @joint-change="handleJointChange"
      @gripper-change="handleGripperChange"
      @reset-all="resetAllJoints"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import * as THREE from "three"; // 引入 Three.js 核心库
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"; // 轨道控制器，支持鼠标交互
import URDFLoader from "urdf-loader"; // 用于加载 URDF 机器人模型
import RobotControl from "./RobotControl.vue"; // 引入机械臂控制面板子组件

// 响应式引用，指向模板中的 div 容器
const container = ref(null);

// Three.js 相关对象
let scene, camera, renderer, controls, robot; // 场景、相机、渲染器、控制器、机器人模型

/**
 * 初始化 3D 场景
 */
const initScene = () => {
  // 创建 Three.js 场景，并设置背景色
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeeeeee); // 浅灰色背景

  // 创建透视相机
  // 视野角度 85°，宽高比根据容器自适应，近裁剪面 0.1，远裁剪面 1000
  camera = new THREE.PerspectiveCamera(
    85,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000
  );

  // 创建 WebGL 渲染器，开启抗锯齿和高性能模式，解决深度冲突（z-fighting）
  renderer = new THREE.WebGLRenderer({
    antialias: true, // 开启抗锯齿
    powerPreference: "high-performance", // 强制使用高性能 GPU
    logarithmicDepthBuffer: true, // 解决远距离物体渲染异常
  });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight); // 设置渲染器尺寸
  renderer.setPixelRatio(window.devicePixelRatio); // 设置像素比，适配高DPI屏幕
  container.value.appendChild(renderer.domElement); // 将渲染器的画布插入到 DOM 中

  // 1. 保留原主方向光（照亮模型正面）
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(10, 20, 10); // 斜上方光源（原方向不变）
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  scene.add(directionalLight);

  // 2. 新增反向方向光（消除主光源的阴影死角）
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.9); // 强度稍低，避免过曝
  directionalLight2.position.set(-8, 15, -8); // 与主光源反向（覆盖模型背面/侧面）
  scene.add(directionalLight2);

  // 3. 提高环境光强度（增强阴影区域填充，避免死黑）
  const ambientLight = new THREE.AmbientLight(0x606060, 1.3); // 颜色从0x404040→0x606060，强度从0.8→1.3
  scene.add(ambientLight);

  // 添加网格地面，便于观察机器人相对位置
  const gridSize = 10;
  const gridDivisions = 10;
  const gridHelper = new THREE.GridHelper(
    gridSize,
    gridDivisions,
    0x444444, // 网格线颜色
    0x888888 // 网格背景色
  );
  gridHelper.position.y = -0.01; // 稍微下沉避免与地面 z-fighting
  scene.add(gridHelper);

  // 添加坐标系辅助线，便于观察方向
  const axesSize = 2;
  const axesHelper = new THREE.AxesHelper(axesSize);
  axesHelper.material.depthTest = false; // 始终显示在最前面
  scene.add(axesHelper);

  // 添加轨道控制器，支持鼠标拖拽旋转、缩放和平移视角
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // 开启阻尼效果，让操作更平滑
  controls.dampingFactor = 0.05;

  // 使用 URDFLoader 加载机器人模型
  const loader = new URDFLoader();
  // 指定机器人模型包路径，对应 /public/aubo_description/
  loader.packages = {
    aubo_description: "/aubo_description",
  };

  // 定义各个关节的初始角度（单位：弧度）
  const INITIAL_POSITIONS = {
    shoulder_joint: 0.0,
    upperArm_joint: 0.0,
    foreArm_joint: 1.57, // 约90度
    wrist1_joint: 0.0,
    wrist2_joint: 1.57,
    wrist3_joint: 0.0,
    finger_joint: 0.0,
  };

  // 加载 URDF 模型文件
  loader.load("./aubo_description/urdf/aubo_i5.urdf", (result) => {
    robot = result; // 保存机器人模型引用
    robot.rotation.x = -Math.PI / 2; // 初始旋转，调整朝向
    scene.add(robot); // 将机器人添加进场景

    // 计算机器人包围盒，用于设置相机初始位置
    const box = new THREE.Box3().setFromObject(robot);
    const center = box.getCenter(new THREE.Vector3()); // 模型中心点
    const size = box.getSize(new THREE.Vector3()).length(); // 模型对角线长度

    // 遍历初始关节角度配置，为每个关节设置初始值
    Object.entries(INITIAL_POSITIONS).forEach(([jointName, value]) => {
      if (robot.joints[jointName]) {
        robot.joints[jointName].setJointValue(value);
      }
    });

    // 设置相机初始位置，使模型处于视野中央且有一定距离
    camera.position.set(
      center.x + 10 * size,
      center.y - 1 * size, // Y轴向下偏移
      center.z + 8 * size // Z轴向后偏移
    );
    camera.lookAt(new THREE.Vector3(center.x, center.y, center.z)); // 看向模型中心

    controls.update(); // 更新控制器
  });
};

/**
 * 动画循环，用于实时渲染和控制更新
 */
const animate = () => {
  requestAnimationFrame(animate);
  controls.update(); // 更新轨道控制器
  renderer.render(scene, camera); // 渲染当前帧
};

/**
 * 处理窗口大小变化，调整相机和渲染器
 */
const handleResize = () => {
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
};

/**
 * 监听来自控制面板的关节变化事件，更新对应机器人关节
 */
// const handleJointChange = ({ jointName, angle, jointValues }) => {
//   if (robot && robot.joints[jointName]) {
//     robot.joints[jointName].setJointValue(angle);
//   }
// };

const handleJointChange = ({ jointValues }) => {
  if (!robot) return;

  // 定义机器人关节的顺序，必须与子组件中的 jointValues 顺序完全一致
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
    } else {
      console.warn(`未找到关节: ${jointName}`);
    }
  });
};

/**
 * 监听来自控制面板的夹爪变化事件，更新夹爪关节（通常是 finger_joint）
 */
const handleGripperChange = (value) => {
  if (robot && robot.joints.finger_joint) {
    robot.joints.finger_joint.setJointValue(value);
  }
};

/**
 * 重置所有关节到初始位置
 */
const resetAllJoints = (positions) => {
  if (!robot) return;

  // 遍历传入的关节初始值，逐个设置
  Object.entries(positions).forEach(([jointName, value]) => {
    if (robot.joints[jointName]) {
      robot.joints[jointName].setJointValue(value);
    }
  });
};

// 组件挂载后初始化场景并启动动画循环
onMounted(() => {
  initScene();
  animate();
  window.addEventListener("resize", handleResize); // 监听窗口 resize 事件
});

// 组件卸载前清理事件监听和释放资源
onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  if (container.value && renderer.domElement) {
    container.value.removeChild(renderer.domElement);
  }
  renderer.dispose(); // 释放 WebGL 资源
});
</script>

<style scoped>
.robot-model-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
}

.canvas-container {
  flex: 1;
  background: linear-gradient(to bottom right, #f0f0f0, #ffffff);
}
</style>
