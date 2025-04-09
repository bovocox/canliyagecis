import type { User } from '@supabase/supabase-js'

export interface AuthUser extends User {
  user_metadata: {
    full_name: string;
  };
} 