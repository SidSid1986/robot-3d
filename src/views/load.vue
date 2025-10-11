<!--
 * @Author: Sid Li
 * @Date: 2025-10-07 11:02:41
 * @LastEditors: Sid Li
 * @LastEditTime: 2025-10-11 15:17:55
 * @FilePath: \robot-3d-git\src\views\load.vue
 * @Description: 
-->
<template>
  <!-- <div class="container">
    <div class="left">
      <BallTwo :trajectory="trajectory" />

      <BallOne @getTrajectory="getTrajectory" />
    </div>
    <div class="right">
      <BallOne @getTrajectory="getTrajectory" />

      <BallTwo :trajectory="trajectory" />
      <RobotModel />
    </div>
  </div> -->

  <div class="container">
    <!-- <BallOne @getTrajectory="getTrajectory" /> -->

    <RobotModel />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import BallOne from "@/components/BallOne.vue";
import BallTwo from "@/components/BallTwo.vue";

import RobotModel from "@/components/RobotModel.vue";

const trajectory = ref([]);

const getTrajectory = (data) => {
  trajectory.value = data;
};

onMounted(() => {
  console.log("组件挂载了");
});
</script>

<style scoped lang="scss">
.container {
  display: flex;
  width: 100%;
  height: 100vh;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;

  .left {
    width: 50%;
    height: 100%;
    // border: 3px solid pink;
    box-sizing: border-box;
  }
  .right {
    width: 50%;
    height: 100%;
    // border: 3px solid green;

    box-sizing: border-box;
  }
}
</style>
