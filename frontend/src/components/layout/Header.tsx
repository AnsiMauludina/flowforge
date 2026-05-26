import { useWebSocket } from '@/hooks/useWebSocket'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  const { isConnected } = useWebSocket()

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10 shrink-0">
      <h1 className="text-sm font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2">
        <div
          className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
            isConnected ? 'bg-emerald-500 shadow-sm shadow-emerald-400' : 'bg-gray-300'
          }`}
        />
        <span className={`text-xs font-medium transition-colors duration-300 ${
          isConnected ? 'text-emerald-600' : 'text-gray-400'
        }`}>
          {isConnected ? 'Live' : 'Offline'}
        </span>
      </div>
    </header>
  )
}
