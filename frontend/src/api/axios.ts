// src/api/axios.js
import axios from "axios";
import { useAuthStore } from "../stores/auth";
import router from "../router";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const auth = useAuthStore();
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const res = await axios.post(
          `${import.meta.env.VITE_API_BASE_URL}/refresh`,
          {},
          {
            withCredentials: true,
          },
        );
        auth.token = res.data.accessToken;
        originalRequest.headers.Authorization = `Bearer ${auth.token}`;
        return api(originalRequest);
      } catch (e) {
        auth.token = "";
        router.push("/login");
      }
    }

    return Promise.reject(error);
  },
);

export default api;
