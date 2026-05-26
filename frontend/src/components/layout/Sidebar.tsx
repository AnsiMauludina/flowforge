import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  GitBranch,
  Activity,
  LogOut,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/workflows', icon: GitBranch, label: 'Workflows' },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()

  return (
    <aside className="w-56 h-screen bg-gray-900 flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-800">
        <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-semibold text-sm">FlowForge</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="px-3 py-2 mb-1">
          <p className="text-white text-sm font-medium truncate">
            {user?.email}
          </p>
          <p className="text-gray-400 text-xs capitalize">{user?.role}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}