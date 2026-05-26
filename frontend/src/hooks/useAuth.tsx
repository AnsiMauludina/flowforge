import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { AuthResponse } from '@/types'

interface LoginParams {
  tenantSlug: string
  email: string
  password: string
}

export function useLogin() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (params: LoginParams) => {
      const { data } = await api.post<{ data: AuthResponse }>('/auth/login', {
        tenant_slug: params.tenantSlug,
        email: params.email,
        password: params.password,
      })
      return data.data
    },
    onSuccess: (data) => {
      setAuth(data.token, data.user)
      navigate('/dashboard')
    },
  })
}

export function useRegister() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (params: {
      tenantName: string
      tenantSlug: string
      email: string
      password: string
      role: string
    }) => {
      const { data } = await api.post<{ data: AuthResponse }>('/auth/register', {
        tenant_name: params.tenantName,
        tenant_slug: params.tenantSlug,
        email: params.email,
        password: params.password,
        role: params.role,
      })
      return data.data
    },
    onSuccess: (data) => {
      setAuth(data.token, data.user)
      navigate('/dashboard')
    },
  })
}