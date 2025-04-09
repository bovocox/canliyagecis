// Environment configuration
export const ENV = {
  MODE: import.meta.env.MODE || 'development',
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  API_URL: import.meta.env.VITE_API_URL,
}

// Environment checks
export const isDevMode = ENV.MODE === 'development'
export const isProdMode = ENV.MODE === 'production'

// Validate required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'API_URL']
requiredEnvVars.forEach(varName => {
  if (!ENV[varName as keyof typeof ENV]) {
    throw new Error(`Missing required environment variable: ${varName}`)
  }
}) 