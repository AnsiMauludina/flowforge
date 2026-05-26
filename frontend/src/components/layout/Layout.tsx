import Sidebar from './Sidebar'
import Header from './Header'

interface LayoutProps {
  title: string
  children: React.ReactNode
}

export default function Layout({ title, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        <Header title={title} />
        <main className="flex-1 p-6">
          <div className="max-w-screen-xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
