<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const email = ref("");
const password = ref("");
const error = ref("");
const router = useRouter();
const auth = useAuthStore();

const register = async () => {
  try {
    await auth.register(email.value, password.value);
    // ダッシュボードに遷移
    router.push("/dashboard");
  } catch (err: any) {
    error.value = err.response?.data?.error || "ログイン失敗";
  }
};
</script>

<template>
  <section id="center">
    <div class="hero">
      <div class="font-bold">IR Insight</div>
    </div>
    <div class="login-container border-1 rounded-lg p-6 w-3/10">
      <h1 class="mb-6">アカウント登録</h1>
      <form @submit.prevent="register">
        <div class="mb-4">
          <input
            class="border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="email"
            type="email"
            v-model="email"
            required
            autocomplete="email"
            placeholder="Email"
          />
        </div>
        <div class="mb-4">
          <input
            class="border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="password"
            type="password"
            v-model="password"
            required
            autocomplete="new-password"
            placeholder="Password"
          />
        </div>
        <div style="padding-top: 8px">
          <button
            class="w-full text-base px-[10px] py-[5px] rounded-[5px] text-[var(--accent)] bg-[var(--accent-bg)] border-2 border-transparent transition-colors duration-300 mb-6 hover:border-[var(--accent-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
            type="submit"
          >
            アカウント登録
          </button>
        </div>
        <div>
          <p
            class="text-base px-[10px] py-[5px] rounded-[5px] border-2 border-transparent transition-colors duration-300 mb-6"
            @click="router.push('/')"
          >
            ログインはこちら
          </p>
        </div>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </section>
</template>
