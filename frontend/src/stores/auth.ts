// src/stores/auth.ts
import { defineStore } from "pinia";
import axios from "axios";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem("token") || "",
    user: null as null | { id: number; email: string },
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
  },
  actions: {
    async register(email: string, password: string) {
      const res = await axios.post(
        "http://localhost:3000/register",
        {
          email,
          password,
        },
        { withCredentials: true },
      );
      this.token = res.data.accessToken;
      localStorage.setItem("token", this.token);
    },
    async login(email: string, password: string) {
      const res = await axios.post(
        "http://localhost:3000/login",
        {
          email,
          password,
        },
        { withCredentials: true },
      );
      this.token = res.data.accessToken;
      localStorage.setItem("token", this.token);
      //await this.fetchMe();
    },
    async fetchMe() {
      try {
        const res = await api.get("/me");
        this.user = res.data;
      } catch (err) {
        // トークン無効ならログアウト
        this.logout();
        throw err;
      }
    },
    async logout() {
      try {
        // 👇 サーバーに通知（refreshToken削除）
        await axios.post(
          "http://localhost:3000/logout",
          {
            refreshToken: localStorage.getItem("refreshToken"),
          },
          { withCredentials: true },
        );
      } catch (err) {
        console.error("logout error:", err);
      }
      this.token = "";
      localStorage.removeItem("token");
    },
  },
});
