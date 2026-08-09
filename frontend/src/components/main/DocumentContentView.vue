<script setup lang="ts">
import { computed } from "vue";
import DOMPurify from "dompurify";
import type { CompanyId, DocumentId } from "../../types/branded";
const props = defineProps<{
  document: any;
}>();
const emit = defineEmits(["select"]);

const sanitizedHtml = computed(() => {
  return DOMPurify.sanitize(props.document?.contents[0].contentEn, {
    ADD_TAGS: ["table", "thead", "tbody", "tr", "th", "td"],
  });
});

const goToCompany = (id: CompanyId) => {
  emit("select", id);
};
</script>

<template>
  <div>
    <h1 @click="goToCompany(document.company.id)">
      {{ document.company.name }}
    </h1>
    <div>
      <div class="bg-white" v-html="sanitizedHtml"></div>
    </div>
  </div>
</template>
<style scoped></style>
