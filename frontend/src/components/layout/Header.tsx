import { useWebSocket } from '@/hooks/useWebSocket'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  const { isConnected } = useWebSocket()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}
        />
        {isConnected ? 'Live' : 'Offline'}
      </div>
    </header>
  )
}