<template>
  <div class="app-show">
    <router-view />
  </div>
</template>

<script setup>
// import { onMounted } from "vue";

// const preventGlobalScroll = (e) => {
//   e.preventDefault();
// };
// onMounted(() => {
//   document.addEventListener("touchmove", preventGlobalScroll, {
//     passive: false,
//   });
// });
</script>

<style lang="scss" scoped>
.app-show {
  width: 100%;
  height: 100%;
  // background: #102133;
  // background: url("@/assets/Home/background.png") no-repeat;
}
</style>

 
