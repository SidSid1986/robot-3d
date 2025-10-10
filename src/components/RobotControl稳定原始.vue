<template>
  <div class="control-panel">
    <div v-for="(joint, index) in joints" :key="index" class="slider-container">
      <label>{{ joint.label }}</label>
      <input
        type="range"
        v-model.number="jointValues[index]"
        :min="joint.min"
        :max="joint.max"
        :step="joint.step"
        @input="updateJoint(joint.name, jointValues[index], jointValues)"
      />
      <span>{{ Number(jointValues[index]).toFixed(2) }} rad</span>
    </div>

    <!-- 夹爪控制 -->
    <div class="slider-container">
      <label>夹爪开合</label>
      <input
        type="range"
        v-model.number="gripperValue"
        min="0"
        max="1"
        step="0.01"
        @input="updateGripper(gripperValue)"
      />
      <span>{{ Number(gripperValue).toFixed(2) }}</span>

      <div class="button-area">
        <hr />
        <el-button @click="startDemo" type="success">
          <VideoPlay style="width: 1em; height: 1em; margin-right: 8px" />
          开始码垛操作
        </el-button>
        <el-button @click="robotReset" type="warning">
          <Refresh style="width: 1em; height: 1em; margin-right: 8px" />
          机械臂复位
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Refresh, VideoPlay } from "@element-plus/icons-vue"; // 引入刷新图标
import { ElButton } from "element-plus"; // 引入 Element Plus 按钮组件
import demoTrajectory from "./demo-trajectory.json";

// 定义组件向父级传递的事件
const emit = defineEmits(["joint-change", "gripper-change", "reset-all"]);
// 当前正在插值的关节值
const currentJointValues = ref([0.0, 0.0, 1.57, 0.0, 1.57, 0.0]);

// 目标关节值（当前帧的目标）
const targetJointValues = ref([0.0, 0.0, 1.57, 0.0, 1.57, 0.0]);

// 当前轨迹帧索引
const currentFrameIndex = ref(0);

// 插值因子（越小越平滑，比如 0.02 ~ 0.05）
const lerpFactor = 0.03;

// 动画循环 ID（用于取消）
let animationFrameId = null;

// 定义所有可控制的关节信息
const joints = ref([
  {
    name: "shoulder_joint",
    label: "肩关节",
    min: -3.04,
    max: 3.04,
    step: 0.01,
  },
  {
    name: "upperArm_joint",
    label: "上臂关节",
    min: -3.04,
    max: 3.04,
    step: 0.01,
  },
  {
    name: "foreArm_joint",
    label: "前臂关节",
    min: -3.04,
    max: 3.04,
    step: 0.01,
  },
  { name: "wrist1_joint", label: "腕关节1", min: -3.04, max: 3.04, step: 0.01 },
  { name: "wrist2_joint", label: "腕关节2", min: -3.04, max: 3.04, step: 0.01 },
  { name: "wrist3_joint", label: "腕关节3", min: -3.04, max: 3.04, step: 0.01 },
]);

// 当前各个关节的值，双向绑定到滑动条
const jointValues = ref(
  [
    0.0, // shoulder_joint
    0.0, // upperArm_joint
    1.57, // foreArm_joint
    0.0, // wrist1_joint
    1.57, // wrist2_joint
    0.0, // wrist3_joint
  ].map(Number)
);

// 夹爪关节值
const gripperValue = ref(Number(0.0));

// 所有关节的初始位置定义，用于复位时传递给父组件
const INITIAL_POSITIONS = {
  shoulder_joint: 0.0,
  upperArm_joint: 0.0,
  foreArm_joint: 1.57,
  wrist1_joint: 0.0,
  wrist2_joint: 1.57,
  wrist3_joint: 0.0,
  finger_joint: 0.0, // 夹爪关节
};

// 每个子数组包含 6 个数字（单位：弧度），依次对应：
// [shoulder_joint, upperArm_joint, foreArm_joint, wrist1_joint, wrist2_joint, wrist3_joint]

let isDemoRunning = ref(false); // 防止重复点击

/**
 * 机械臂复位功能：将所有关节重置为初始角度，夹爪闭合
 */
const robotReset = () => {
  console.log("机械臂复位");

  // 重置六个主要关节的值为初始值（单位：弧度）
  jointValues.value = [
    0.0, // shoulder_joint
    0.0, // upperArm_joint
    1.57, // foreArm_joint
    0.0, // wrist1_joint
    1.57, // wrist2_joint
    0.0, // wrist3_joint
  ];

  // 重置夹爪为闭合状态
  gripperValue.value = 0.0;

  // 向父组件发送复位事件，并传递所有关节的初始值
  emit("reset-all", INITIAL_POSITIONS);
};

/**
 * 更新某个关节的角度
 */
// const updateJoint = (jointName, value, jointValues) => {
//   console.log(`更新关节 ${jointName} 的角度为 ${value} rad`);
//   console.log("所有轴的数据", jointValues);

//   emit("joint-change", {
//     jointName,
//     angle: parseFloat(value), // 确保传递的是数值类型
//     jointValues,
//   });
// };
const updateJoint = (jointName, value, jointValues) => {
  // 我们仍然传 jointName 和 value 用于日志等，但真正有用的是 jointValues
  // console.log(`更新关节 ${jointName} 的角度为 ${value} rad`);
  console.log("所有轴的数据", jointValues);

  //  将整个 jointValues 数组传给父组件，父组件会一次性更新所有关节
  emit("joint-change", {
    jointValues: jointValues.map(Number), // 确保是数字类型
  });
};

/**
 * 更新夹爪关节
 */
const updateGripper = (value) => {
  const numValue = Number(value);
  if (!isNaN(numValue)) {
    emit("gripper-change", value); // 传递夹爪值
  }
};

/**
 * 平滑插值执行函数
 */
const smoothDemoLoop = () => {
  if (!isDemoRunning.value) return;

  // 获取当前目标帧
  if (currentFrameIndex.value < demoTrajectory.length) {
    targetJointValues.value = demoTrajectory[currentFrameIndex.value];
  } else {
    // 所有帧执行完毕
    console.log("码垛操作完成（所有轨迹帧执行完毕）");
    isDemoRunning.value = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    return;
  }

  // 对每个关节进行 lerp 插值
  const newJointValues = currentJointValues.value.map((current, i) => {
    const target = targetJointValues.value[i];
    return current + (target - current) * lerpFactor; // lerp 公式
  });

  // 更新机械臂关节（通过父组件）
  emit("joint-change", {
    jointValues: newJointValues,
  });

  // 更新当前值
  currentJointValues.value = newJointValues;

  // 检查是否足够接近目标，可设置一个阈值，比如 0.01
  const isClose = targetJointValues.value.every(
    (t, i) => Math.abs(t - newJointValues[i]) < 0.01
  );

  if (isClose) {
    // 接近目标，切换到下一帧
    currentFrameIndex.value++;
  }

  // 请求下一帧动画
  animationFrameId = requestAnimationFrame(smoothDemoLoop);
};

/**
 * 开始演示
 */
const startDemo = () => {
  if (isDemoRunning.value) return;
  isDemoRunning.value = true;
  currentFrameIndex.value = 0;
  smoothDemoLoop(); // 开始插值循环
};
onMounted(() => {
  // console.log(demoTrajectory);
});
</script>

<style scoped>
.control-panel {
  background: rgba(245, 245, 245, 0.95);
  height: 100%;
  overflow-y: auto;
  position: relative;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(5px);
}

.slider-container {
  margin-bottom: 15px;
}

/* 滑动条标签 */
.slider-container label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

/* 滑动条样式 */
.slider-container input[type="range"] {
  width: 100%;
  margin: 5px 0;
}

/* 数值显示 */
.slider-container span {
  font-size: 0.9em;
  color: #555;
}

/* 按钮区域样式 */
.button-area {
  margin-top: 20px;
}

/* 重置按钮悬停效果  */
.reset-all-btn:hover {
  background-color: #c0392b;
}
</style>
