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
        @input="updateJoint(joint.name, jointValues[index])"
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
import { ref } from "vue";
import { Refresh, VideoPlay } from "@element-plus/icons-vue"; // 引入刷新图标
import { ElButton } from "element-plus"; // 引入 Element Plus 按钮组件

// 定义组件向父级传递的事件
const emit = defineEmits(["joint-change", "gripper-change", "reset-all"]);

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

// 定义协调运动的关节角度组合，这些组合保持夹爪高度不变
// 这些值需要根据您的具体机械臂模型进行调整
// 以下示例假设：
// - 当 shoulder_joint = 0.5, upperArm_joint = 0.5 时，夹爪Y轴位置保持不变
// - 您需要根据实际情况测量或计算这些组合
const coordinatedJointSets = [
  { shoulder: 0.5, upperArm: 0.5 }, // 示例组合1，保持高度
  { shoulder: 1.0, upperArm: 0.0 }, // 示例组合2，保持高度
  // 您可以根据需要添加更多组合
];

// 定义自动演示轨迹，使用协调关节组合来保持夹爪高度不变
const demoTrajectory = [
  // 步骤1: 初始位置（可省略，或者作为起点）
  // 步骤2: 向前（调整到协调组合1，保持夹爪高度）
  { name: "coordinated", set: { shoulder: 0.5, upperArm: 0.5 }, delay: 1000 },
  // 步骤3: 向左（调整到协调组合2，保持夹爪高度）
  { name: "coordinated", set: { shoulder: 1.0, upperArm: 0.0 }, delay: 1000 },
  // 步骤4: 向下（调整 wrist1_joint）
  { name: "wrist1_joint", value: -0.5, delay: 1000 },
  // 步骤5: 夹爪闭合（抓取）
  { name: "finger_joint", value: 0.8, delay: 1000 },
  // 步骤6: 抬起（调整 wrist1_joint 回正）
  { name: "wrist1_joint", value: 0.0, delay: 1000 },
  // 步骤7: 回到原位（所有关节复位）
  { name: "shoulder_joint", value: 0.0, delay: 1000 },
  { name: "upperArm_joint", value: 0.0, delay: 1000 },
  { name: "foreArm_joint", value: 1.57, delay: 1000 },
  { name: "wrist1_joint", value: 0.0, delay: 1000 },
  { name: "wrist2_joint", value: 1.57, delay: 1000 },
  { name: "wrist3_joint", value: 0.0, delay: 1000 },
  { name: "finger_joint", value: 0.0, delay: 1000 },
];

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
const updateJoint = (jointName, value) => {
  console.log(`更新关节 ${jointName} 的角度为 ${value} rad`);
  emit("joint-change", {
    jointName,
    angle: parseFloat(value), // 确保传递的是数值类型
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
 * 根据协调关节组合设置上臂和前臂关节，以保持夹爪高度不变
 * @param {Object} set - 包含 shoulder 和 upperArm 的目标值
 */
const setCoordinatedJoints = (set) => {
  if (set && set.shoulder !== undefined && set.upperArm !== undefined) {
    emit("joint-change", {
      jointName: "shoulder_joint",
      angle: set.shoulder,
    });
    emit("joint-change", {
      jointName: "upperArm_joint",
      angle: set.upperArm,
    });
  }
};

/**
 * 执行自动演示轨迹
 */
const startDemo = () => {
  if (isDemoRunning.value) return; // 防止重复执行
  isDemoRunning.value = true;

  let stepIndex = 0;

  const executeNextStep = () => {
    if (stepIndex >= demoTrajectory.length) {
      isDemoRunning.value = false;
      console.log("✅ 码垛操作完成！");
      return;
    }

    const step = demoTrajectory[stepIndex];
    console.log(
      `🔁 执行步骤 ${stepIndex + 1}: 关节 ${step.name} → ${
        step.set ? JSON.stringify(step.set) : step.value
      }`
    );

    if (step.name === "coordinated") {
      // 处理协调关节运动
      setCoordinatedJoints(step.set);
    } else if (step.name === "finger_joint") {
      // 处理夹爪关节
      emit("gripper-change", step.value);
    } else {
      // 处理单个关节
      emit("joint-change", {
        jointName: step.name,
        angle: step.value,
      });
    }

    stepIndex++;
    setTimeout(executeNextStep, step.delay || 1000); // 延时执行下一步
  };

  executeNextStep();
};
</script>

<style scoped>
/* 控制面板整体样式 */
.control-panel {
  background: rgba(245, 245, 245, 0.95); /* 半透明白色背景 */
  height: 100%; /* 高度占满父容器 */
  overflow-y: auto; /* 内容过多时允许滚动 */
  position: relative;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1); /* 右侧阴影，增加层次感 */
  backdrop-filter: blur(5px); /* 背景模糊效果，美化 */
}

/* 每个滑动条容器样式 */
.slider-container {
  margin-bottom: 15px;
}

/* 滑动条标签 */
.slider-container label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold; /* 加粗显示 */
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

/* 按钮区域样式（可进一步优化） */
.button-area {
  margin-top: 20px;
}

/* 重置按钮悬停效果（可自定义） */
.reset-all-btn:hover {
  background-color: #c0392b;
}
</style>
