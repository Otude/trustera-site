import { supabase } from '../supabase'

export async function getCurrentProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('User is not authenticated.')
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, company_id, role, email')
    .eq('id', user.id)
    .single()

  if (error) {
    throw error
  }

  if (!data.company_id) {
    throw new Error(
      'Your profile is not assigned to a company.'
    )
  }

  return data
}

export async function getCompanyId() {
  const profile = await getCurrentProfile()
  return profile.company_id
}

export async function requireCompanyId() {
  const companyId = await getCompanyId()

  if (!companyId) {
    throw new Error(
      'Company ID is required.'
    )
  }

  return companyId
}