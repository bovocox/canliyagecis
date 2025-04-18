import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { VideoData, VideoSummary } from '@/types/video'
import { useLanguageStore } from './languageStore'

export const useVideoStore = defineStore('video', () => {
  const languageStore = useLanguageStore()

  // Video related states
  const videoId = ref('lFZvLeMbJ_U')
  const videoData = ref<VideoData>({
    id: '',
    title: '',
    description: '',
    thumbnail: '',
    url: '',
    date: new Date().toLocaleDateString(),
    views: languageStore.t('common.views'),
    duration: '',
    transcript: '',
    transcriptPreview: '',
    summary: languageStore.t('common.loading'),
    summaryPreview: '',
    formatted_text: languageStore.t('common.loadingTranscript'),
    loading: {
      transcript: false,
      summary: false
    },
    error: null
  })
  const summaries = ref<VideoSummary[]>([])
  const selectedSummary = ref<VideoSummary | null>(null)

  // Loading states
  const loadingStates = ref({
    video: false,
    summary: false,
    transcript: false,
    processing: false
  })

  // Spinner states
  const spinnerStates = ref({
    video: false,
    summary: false,
    transcript: false,
    processing: false
  })

  // Processing states
  const transcriptionStatus = ref({
    transcribing: false,
    detectingLanguage: false,
    savingTranscript: false,
    generatingSummary: false,
    message: ''
  })
  const processingStatus = ref({
    isProcessing: false,
    currentStep: '',
    steps: {
      FETCHING: languageStore.t('home.processing.fetchingInfo'),
      TRANSCRIBING: languageStore.t('home.processing.creatingTranscript'),
      SUMMARIZING: languageStore.t('home.processing.creatingSummary'),
      SAVING: languageStore.t('home.processing.savingResults')
    }
  })

  // Current processing video ID
  const currentProcessingVideoId = ref('');

  // Computed properties
  const isLoading = computed(() => {
    return Object.values(loadingStates.value).some(state => state)
  })

  const shouldShowSpinner = computed(() => {
    return Object.values(spinnerStates.value).some(state => state)
  })

  // Actions
  function setLoadingState(type: 'video' | 'summary' | 'transcript' | 'processing', value: boolean) {
    loadingStates.value[type] = value
  }

  function getLoadingState(type: 'video' | 'summary' | 'transcript' | 'processing') {
    return loadingStates.value[type]
  }

  function updateProcessingStatus(step: keyof typeof processingStatus.value.steps) {
    processingStatus.value.isProcessing = true
    processingStatus.value.currentStep = processingStatus.value.steps[step]
    setLoadingState('processing', true)
  }

  function resetVideoData() {
    videoData.value = {
      id: '',
      title: '',
      description: '',
      thumbnail: '',
      url: '',
      date: new Date().toLocaleDateString(),
      views: languageStore.t('common.views'),
      duration: '',
      transcript: '',
      transcriptPreview: '',
      summary: languageStore.t('common.loading'),
      summaryPreview: '',
      formatted_text: languageStore.t('common.loadingTranscript'),
      loading: {
        transcript: false,
        summary: false
      },
      error: null
    }
  }

  function setVideoId(id: string) {
    videoId.value = id
  }

  function setSelectedSummary(summary: VideoSummary | null) {
    selectedSummary.value = summary
  }

  function setVideoData(data: Partial<VideoData>) {
    videoData.value = { ...videoData.value, ...data }
  }

  function setSummaries(newSummaries: VideoSummary[]) {
    summaries.value = newSummaries
  }

  function clearProcessingStatus() {
    console.log('🧹 Clearing processing status in videoStore');
    processingStatus.value = {
      isProcessing: false,
      currentStep: '',
      steps: processingStatus.value.steps
    };
    currentProcessingVideoId.value = '';
    loadingStates.value = {
      video: false,
      transcript: false,
      summary: false,
      processing: false
    };
    spinnerStates.value = {
      video: false,
      transcript: false,
      summary: false,
      processing: false
    };
    console.log('✅ Processing status cleared');
  }

  function toggleSpinner(type: 'video' | 'summary' | 'transcript' | 'processing', show: boolean) {
    spinnerStates.value[type] = show
  }

  function clearTranscriptData() {
    console.log(`🧹 videoStore.clearTranscriptData`);
    videoData.value.transcript = '';
    videoData.value.transcriptPreview = '';
  }

  function clearSummaryData() {
    console.log(`🧹 videoStore.clearSummaryData`);
    videoData.value.summary = languageStore.t('common.loading');
    videoData.value.summaryPreview = '';
  }

  function clearFormattedText() {
    console.log(`🧹 videoStore.clearFormattedText`);
    videoData.value.formatted_text = '';
  }

  function setCurrentProcessingVideoId(id: string) {
    console.log(`🔄 videoStore.setCurrentProcessingVideoId: ${id}`);
    currentProcessingVideoId.value = id;
  }

  function setIsVideoProcessing(isProcessing: boolean) {
    console.log(`🔄 videoStore.setIsVideoProcessing: ${isProcessing}`);
    loadingStates.value.processing = isProcessing;
  }

  function setShouldShowSpinner(shouldShow: boolean) {
    console.log(`🔄 videoStore.setShouldShowSpinner: ${shouldShow}`);
    // Update all spinner states
    for (const key in spinnerStates.value) {
      spinnerStates.value[key as keyof typeof spinnerStates.value] = shouldShow;
    }
  }

  return {
    // States
    videoId,
    videoData,
    summaries,
    selectedSummary,
    loadingStates,
    spinnerStates,
    transcriptionStatus,
    processingStatus,
    currentProcessingVideoId,

    // Computed
    isLoading,
    shouldShowSpinner,

    // Actions
    setLoadingState,
    getLoadingState,
    toggleSpinner,
    updateProcessingStatus,
    resetVideoData,
    setVideoId,
    setSelectedSummary,
    setVideoData,
    setSummaries,
    clearProcessingStatus,
    clearTranscriptData,
    clearSummaryData,
    clearFormattedText,
    setCurrentProcessingVideoId,
    setIsVideoProcessing,
    setShouldShowSpinner
  }
}) 