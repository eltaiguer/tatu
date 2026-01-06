// Tatu - Uruguayan Expense Tracker
// A modern, trustworthy fintech app for managing Santander Uruguay statements

import { useState, useEffect } from 'react'
import { TatuLogo } from './components/TatuLogo'
import { Dashboard } from './components/Dashboard'
import { Transactions } from './components/Transactions'
import { Charts } from './components/Charts'
import { Tools } from './components/Tools'
import { ImportCSV } from './components/ImportCSV'
import { Button } from './components/ui/button'
import {
  Sun,
  Moon,
  Menu,
  X,
  Upload,
  ChartPie,
  ListFilter,
  Package,
  ChartBar,
} from 'lucide-react'
import { useStore } from 'zustand'
import { transactionStore } from './stores/transaction-store'

type View = 'dashboard' | 'transactions' | 'charts' | 'tools' | 'import'

function App() {
  // Initialize theme from localStorage
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Get transactions from store
  const transactions = useStore(transactionStore, (state) => state.transactions)

  // Handle theme toggle and persist to localStorage
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const navItems = [
    { id: 'dashboard' as View, label: 'Dashboard', icon: ChartBar },
    { id: 'transactions' as View, label: 'Transacciones', icon: ListFilter },
    { id: 'charts' as View, label: 'Insights', icon: ChartPie },
    { id: 'tools' as View, label: 'Herramientas', icon: Package },
    { id: 'import' as View, label: 'Importar', icon: Upload },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <TatuLogo size="md" />

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    currentView === item.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDark(!isDark)}
                className="hidden sm:flex"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </Button>

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card">
            <nav className="px-4 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id)
                      setMobileMenuOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      currentView === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
              <button
                onClick={() => setIsDark(!isDark)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
                <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && <Dashboard transactions={transactions} />}
        {currentView === 'transactions' && <Transactions transactions={transactions} />}
        {currentView === 'charts' && <Charts transactions={transactions} />}
        {currentView === 'tools' && <Tools transactions={transactions} />}
        {currentView === 'import' && <ImportCSV />}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <TatuLogo size="sm" />
              <p className="text-sm text-muted-foreground mt-3">
                Gestión inteligente de gastos para Uruguay. Privado, seguro y
                fácil de usar.
              </p>
            </div>
            <div>
              <h4 className="mb-3">Enlaces</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Cómo funciona
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Privacidad
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Términos de uso
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-primary transition-colors">
                    Soporte
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3">Contacto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>hola@tatu.uy</li>
                <li>Montevideo, Uruguay</li>
                <li className="pt-2">
                  <a href="#" className="text-primary hover:underline">
                    Ver en GitHub →
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>© 2024 Tatú. Hecho con ❤️ en Uruguay.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
