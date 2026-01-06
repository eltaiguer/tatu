// Tatu - Uruguayan Expense Tracker
// A modern, trustworthy fintech app for managing Santander Uruguay statements

import { useState, useEffect } from 'react'
import { TatuLogo } from './components/TatuLogo'
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
import { generateSampleTransactions, type Transaction } from './utils/data'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { Button } from './components/ui/button'

// App configuration
const APP_CONFIG = {
  footer: {
    email: 'hola@tatu.uy',
    location: 'Montevideo, Uruguay',
    github: '#',
    description: 'Gestión inteligente de gastos para Uruguay. Privado, seguro y fácil de usar.',
    copyright: '© 2024 Tatú. Hecho con ❤️ en Uruguay.',
  },
  links: [
    { label: 'Cómo funciona', href: '#' },
    { label: 'Privacidad', href: '#' },
    { label: 'Términos de uso', href: '#' },
    { label: 'Soporte', href: '#' },
  ],
}

type View =
  | 'dashboard'
  | 'transactions'
  | 'charts'
  | 'tools'
  | 'import'
  | 'design-system'

function App() {
  // Initialize theme from localStorage
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark'
  })
  const [currentView, setCurrentView] = useState<View>('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  // Initialize sample data
  useEffect(() => {
    const sampleData = generateSampleTransactions(150)
    setTransactions(sampleData)
  }, [])

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
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  aria-current={currentView === item.id ? 'page' : undefined}
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
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </Button>

              {/* Mobile Menu Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden"
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card">
            <nav className="px-4 py-4 space-y-1" aria-label="Mobile navigation">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id)
                      setMobileMenuOpen(false)
                    }}
                    aria-current={currentView === item.id ? 'page' : undefined}
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
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
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
        {currentView === 'dashboard' && <DashboardPage transactions={transactions} />}
        {currentView === 'transactions' && <TransactionsPage />}
        {currentView === 'charts' && (
          <div className="text-center py-12">
            <ChartPie className="mx-auto mb-4 text-muted-foreground" size={48} />
            <h2 className="mb-2">Insights</h2>
            <p className="text-muted-foreground">Esta sección estará disponible próximamente</p>
          </div>
        )}
        {currentView === 'tools' && (
          <div className="text-center py-12">
            <Package className="mx-auto mb-4 text-muted-foreground" size={48} />
            <h2 className="mb-2">Herramientas</h2>
            <p className="text-muted-foreground">Esta sección estará disponible próximamente</p>
          </div>
        )}
        {currentView === 'import' && (
          <div className="text-center py-12">
            <Upload className="mx-auto mb-4 text-muted-foreground" size={48} />
            <h2 className="mb-2">Importar</h2>
            <p className="text-muted-foreground">Esta sección estará disponible próximamente</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <TatuLogo size="sm" />
              <p className="text-sm text-muted-foreground mt-3">
                {APP_CONFIG.footer.description}
              </p>
            </div>
            <div>
              <h4 className="mb-3">Enlaces</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {APP_CONFIG.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="hover:text-primary transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-3">Contacto</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>{APP_CONFIG.footer.email}</li>
                <li>{APP_CONFIG.footer.location}</li>
                <li className="pt-2">
                  <a href={APP_CONFIG.footer.github} className="text-primary hover:underline">
                    Ver en GitHub →
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>{APP_CONFIG.footer.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
