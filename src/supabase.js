import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cgivmvuxrimhutmjdybh.supabase.co'

const supabaseKey =
  'sb_publishable_rS32CZmBvWGbEcwolfWDDg_VMZV5A6p'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
)