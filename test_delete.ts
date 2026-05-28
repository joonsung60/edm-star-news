import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf8')
const envMatchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)
const envMatchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)

const supabaseUrl = envMatchUrl ? envMatchUrl[1].trim() : ''
const supabaseAnonKey = envMatchKey ? envMatchKey[1].trim() : ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data: pendingRows } = await supabase
      .from('suggested_clusters')
      .select('id')
      .eq('status', 'pending')
      .limit(1)
  
  if (pendingRows && pendingRows.length > 0) {
      console.log("deleting", pendingRows[0].id)
      const { data, error } = await supabase
        .from('suggested_clusters')
        .delete()
        .eq('id', pendingRows[0].id)
        .select()
      console.log("delete result:", data, error)
  }
}
test()
