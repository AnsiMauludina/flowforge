import { useState } from 'react'
import { useLogin, useRegister } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import { Zap } from 'lucide-react'

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

  const inputClass =
    'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50/60 ' +
    'placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 ' +
    'focus:ring-indigo-500 focus:border-transparent transition-all duration-150'

  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 tracking-wide'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">FlowForge</h1>
          <p className="text-gray-400 text-sm mt-1">Workflow Orchestration Engine</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200 ring-1 ring-gray-900/5 p-8">
          <h2 className="text-base font-semibold text-gray-900 mb-6">
            {isRegister ? 'Create your account' : 'Sign in to your account'}
          </h2>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{(error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Something went wrong'}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className={labelClass}>Organization Name</label>
                  <input
                    type="text"
                    value={form.tenantName}
                    onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                    className={inputClass}
                    placeholder="Acme Corp"
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Organization Slug</label>
                  <input
                    type="text"
                    value={form.tenantSlug}
                    onChange={(e) =>
                      setForm({ ...form, tenantSlug: e.target.value.toLowerCase() })
                    }
                    className={inputClass}
                    placeholder="acme"
                    required
                  />
                </div>
              </>
            )}

            {!isRegister && (
              <div>
                <label className={labelClass}>Organization Slug</label>
                <input
                  type="text"
                  value={form.tenantSlug}
                  onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}
                  className={inputClass}
                  placeholder="acme"
                  required
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
                placeholder="admin@acme.com"
                required
              />
            </div>

            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputClass}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="pt-1">
              <Button type="submit" loading={isLoading} className="w-full justify-center py-2.5">
                {isRegister ? 'Create Account' : 'Sign In'}
              </Button>
            </div>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsRegister(!isRegister)}
              className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors"
            >
              {isRegister ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-gray-300 mt-6">
          FlowForge &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
