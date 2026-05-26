import { useState } from 'react'
import { useLogin, useRegister } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({
    tenantName: '',
    tenantSlug: '',
    email: '',
    password: '',
    role: 'admin',
  })

  const login = useLogin()
  const register = useRegister()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isRegister) {
      register.mutate(form)
    } else {
      login.mutate({
        tenantSlug: form.tenantSlug,
        email: form.email,
        password: form.password,
      })
    }
  }

  const isLoading = login.isPending || register.isPending
  const error = login.error || register.error

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <span className="text-white text-xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">FlowForge</h1>
          <p className="text-gray-500 text-sm mt-1">
            Workflow Orchestration Engine
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {isRegister ? 'Create your account' : 'Sign in to your account'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {(error as any)?.response?.data?.error || 'Something went wrong'}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={form.tenantName}
                    onChange={(e) =>
                      setForm({ ...form, tenantName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization Slug
                  </label>
                  <input
                    type="text"
                    value={form.tenantSlug}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tenantSlug: e.target.value.toLowerCase(),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="acme"
                    required
                  />
                </div>
              </>
            )}

            {!isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization Slug
                </label>
                <input
                  type="text"
                  value={form.tenantSlug}
                  onChange={(e) =>
                    setForm({ ...form, tenantSlug: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="acme"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@acme.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
                required
              />
            </div>

            <Button
              type="submit"
              loading={isLoading}
              className="w-full"
            >
              {isRegister ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-blue-600 font-medium hover:underline"
            >
              {isRegister ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}