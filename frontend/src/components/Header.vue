<script setup lang="ts">
import { useAuthStore } from "../stores/auth";
import { useRouter } from "vue-router";

const auth = useAuthStore();
const router = useRouter();

const handleLogout = () => {
  auth.logout();
  router.push("/");
};
</script>

<template>
  <header
    class="h-16 flex items-center justify-between px-6 border-b border-gray-800"
  >
    <h4 class="text-lg font-bold text-[#d5c5a9]">IR Insight</h4>
    <button
      v-if="auth.isLoggedIn"
      @click="handleLogout"
      class="text-sm text-gray-400 hover:text-white"
    >
      Logout
    </button>
  </header>
</template>
