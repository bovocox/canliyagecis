const isDevelopment = process.env.NODE_ENV === 'development'

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL,
  youtube: {
    baseUrl: 'https://www.googleapis.com/youtube/v3'
  }
}

if (!API_CONFIG.baseUrl) {
  throw new Error('Missing API URL environment variable (VITE_API_URL)')
} 