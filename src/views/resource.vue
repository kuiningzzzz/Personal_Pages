<script setup>
import { useRoute } from 'vue-router'
import EntryList from '../components/EntryList.vue'
const route = useRoute()
</script>
<template><EntryList kind="resource" :collection-id="route.params.collectionId || null" /></template>
