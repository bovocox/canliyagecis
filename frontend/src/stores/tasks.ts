import { defineStore } from 'pinia'
import { supabase } from '../config/supabase'

interface Task {
  id: string
  video_id: string
  task_type: 'transcript_fetch'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  language: string
  error?: string
}

interface TaskResult {
  id: string
  task_id: string
  content: string
  metadata: Record<string, any>
}

export const useTaskStore = defineStore('tasks', {
  state: () => ({
    tasks: new Map<string, Task>(),
    results: new Map<string, TaskResult>(),
    activeVideoTasks: new Map<string, string>() // video_id -> task_id
  }),

  getters: {
    getTaskByVideo: (state) => {
      return (videoId: string) => {
        const taskId = state.activeVideoTasks.get(videoId)
        return taskId ? state.tasks.get(taskId) : null
      }
    },

    getResultByVideo: (state) => {
      return (videoId: string) => {
        const taskId = state.activeVideoTasks.get(videoId)
        return taskId ? state.results.get(taskId) : null
      }
    }
  },

  actions: {
    async createTranscriptTask(videoId: string, language: string) {
      try {
        // Önce mevcut task'ı temizle
        this.clearVideoTask(videoId)

        // Yeni task oluştur
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({
            video_id: videoId,
            task_type: 'transcript_fetch',
            language,
            status: 'pending'
          })
          .select()
          .single()

        if (error) throw error

        // Store'a ekle
        this.tasks.set(task.id, task)
        this.activeVideoTasks.set(videoId, task.id)

        // Realtime subscription başlat
        this.subscribeToTask(task.id)

        return task
      } catch (error) {
        console.error('Error creating task:', error)
        throw error
      }
    },

    subscribeToTask(taskId: string) {
      return supabase
        .channel(`task-${taskId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `id=eq.${taskId}`
        }, (payload) => {
          // Task güncellemesi
          this.tasks.set(taskId, payload.new as Task)

          // Task tamamlandıysa sonucu al
          if (payload.new.status === 'completed') {
            this.fetchTaskResult(taskId)
          }
        })
        .subscribe()
    },

    async fetchTaskResult(taskId: string) {
      const { data: result, error } = await supabase
        .from('task_results')
        .select('*')
        .eq('task_id', taskId)
        .single()

      if (error) {
        console.error('Error fetching task result:', error)
        return
      }

      if (result) {
        this.results.set(taskId, result)
      }
    },

    clearVideoTask(videoId: string) {
      const taskId = this.activeVideoTasks.get(videoId)
      if (taskId) {
        this.tasks.delete(taskId)
        this.results.delete(taskId)
        this.activeVideoTasks.delete(videoId)
      }
    }
  }
}) 