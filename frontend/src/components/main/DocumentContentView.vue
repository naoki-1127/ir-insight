<script setup lang="ts">
import { computed } from "vue";
import DOMPurify from "dompurify";
const props = defineProps<{
  document: any;
}>();
const emit = defineEmits(["select"]);

const sanitizedHtml = computed(() => {
  return DOMPurify.sanitize(props.document?.contents[0].contentEn, {
    ADD_TAGS: ["table", "thead", "tbody", "tr", "th", "td"],
  });
});
</script>

<template>
  <div>
    <div>
      <div class="bg-white" v-html="sanitizedHtml"></div>
    </div>
  </div>
</template>
<style scoped></style>
