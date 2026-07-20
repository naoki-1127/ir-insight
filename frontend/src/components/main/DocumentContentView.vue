<script setup lang="ts">
const props = defineProps<{
  document: any;
}>();
const emit = defineEmits(["select"]);

const goToCompany = (id: string) => {
  emit("select", id);
};
</script>

<template>
  <div>
    <h1 @click="goToCompany(document.company.id)">
      {{ document.company.name }}
    </h1>
    <div>
      <h1>{{ document.contents[0].contentEn }}</h1>
    </div>
  </div>
</template>
<style scoped></style>
