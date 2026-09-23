import { FormEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { money } from './utils/money'

type View = 'Dashboard' | 'Budget' | 'Money' | 'Reports' | 'Settings'
type Transaction = { id: number | string; date: string; transactionDate?: string; description: string; category: string; amount: number; type: 'Expense' | 'Income'; need: 'Need' | 'Want' }
type Bill = { id?: string; name: string; amount: number; frequency: 'One-time' | 'Recurring'; due_day?: number }
type Goal = { id?: string; name: string; target: number; monthly: number; current?: number; status?: string }
type AuthMode = 'login' | 'register'
type AuthUser = { id: string; email: string; display_name: string | null; is_active: boolean }
type AuthTokens = { access_token: string; refresh_token: string; token_type: string }
type UserFacingError = { title: string; message: string; guidance: string }
type TransactionResponse = { id: string; transaction_date: string; transaction_type: 'INCOME' | 'EXPENSE'; amount: number; category: string; description: string; need_want: 'NEED' | 'WANT' | null }
type MonthlySummary = { month_start: string; opening_balance: number; planned_income: number; actual_income: number; total_income: number; total_expenses: number; available_balance: number; allocations: { name: string; planned: number; spent: number }[] }
type OnboardingData = {
  openingBalance: number
  monthlyIncome: number
  allocations: { name: string; amount: number }[]
  bills: Bill[]
  goals: Goal[]
}

const apiBase = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/v1`
let refreshRequest: Promise<boolean> | null = null

const errorFromResponse = async (response: Response, fallback: string): Promise<Error> => {
  let detail = ''
  try {
    const body = await response.json() as { detail?: string }
    detail = body.detail || ''
  } catch {
    // A response body is optional, including for proxy and platform errors.
  }
  return new Error(detail || fallback)
}

const explainError = (error: unknown, action: string): UserFacingError => {
  if (error instanceof TypeError) {
    return {
      title: 'We could not reach FinApp',
      message: `Your ${action} was not sent, so nothing has changed.`,
      guidance: 'Check your connection and try again. If this is the first visit to the free hosted app, wait up to a minute for the service to wake up.',
    }
  }
  const message = error instanceof Error ? error.message : `We could not ${action}.`
  if (/session|token|unauthorized|not authenticated/i.test(message)) {
    return { title: 'Your session needs attention', message: 'Please sign in again before continuing.', guidance: 'Your financial data has not been changed.' }
  }
  return { title: `We could not ${action}`, message, guidance: 'Your information is still safe. Review the message and try again.' }
}

const readJson = async <T,>(input: RequestInfo | URL, init: RequestInit, fallback: string): Promise<T> => {
  const response = await apiFetch(input, init)
  if (!response.ok) throw await errorFromResponse(response, fallback)
  return response.json() as Promise<T>
}

const refreshAccessToken = async (): Promise<boolean> => {
  const refreshToken = localStorage.getItem('finapp_refresh_token')
  if (!refreshToken) return false
  if (!refreshRequest) {
    refreshRequest = fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(async response => {
      if (!response.ok) return false
      const tokens = await response.json() as AuthTokens
      localStorage.setItem('finapp_access_token', tokens.access_token)
      localStorage.setItem('finapp_refresh_token', tokens.refresh_token)
      return true
    }).catch(() => false).finally(() => {
      refreshRequest = null
    })
  }
  return refreshRequest
}

const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers)
  const accessToken = localStorage.getItem('finapp_access_token')
  if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(input, { ...init, headers })
  const isAuthBootstrapRequest = String(input).endsWith('/auth/login') || String(input).endsWith('/auth/register') || String(input).endsWith('/auth/refresh') || String(input).endsWith('/auth/logout')
  if (response.status !== 401 || isAuthBootstrapRequest) return response
  if (!await refreshAccessToken()) return response
  const retryHeaders = new Headers(init.headers)
  const refreshedToken = localStorage.getItem('finapp_access_token')
  if (refreshedToken) retryHeaders.set('Authorization', `Bearer ${refreshedToken}`)
  return fetch(input, { ...init, headers: retryHeaders })
}

const nav: { name: View; icon: string }[] = [
  { name: 'Dashboard', icon: '⌂' }, { name: 'Budget', icon: '▥' }, { name: 'Money', icon: '↕' },
  { name: 'Reports', icon: '◒' }, { name: 'Settings', icon: '⚙' },
]
const mobileViews: View[] = ['Dashboard', 'Budget', 'Money', 'Reports', 'Settings']
const initialTransactions: Transaction[] = [
  { id: 1, date: 'Sep 18', description: 'Grocery shopping', category: 'Food', amount: 48500, type: 'Expense', need: 'Need' },
  { id: 2, date: 'Sep 16', description: 'Freelance payment', category: 'Income', amount: 180000, type: 'Income', need: 'Need' },
  { id: 3, date: 'Sep 14', description: 'Motor taxi', category: 'Transport', amount: 12500, type: 'Expense', need: 'Need' },
  { id: 4, date: 'Sep 12', description: 'Streaming subscription', category: 'Entertainment', amount: 9500, type: 'Expense', need: 'Want' },
  { id: 5, date: 'Sep 10', description: 'Electricity bill', category: 'Bills', amount: 32000, type: 'Expense', need: 'Need' },
]
const budgetRows = [
  ['Food', 120000, 48500, '🍜'], ['Transport', 80000, 12500, '🚌'], ['Bills', 160000, 32000, '⚡'],
  ['Entertainment', 45000, 9500, '🎧'], ['Savings', 100000, 50000, '🌱'],
]
const emptyOnboarding: OnboardingData = { openingBalance: 0, monthlyIncome: 0, allocations: [], bills: [], goals: [] }
const monthStart = (value: string) => {
  const date = new Date(`${value} 1`)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<UserFacingError | null>(null)
  const [view, setView] = useState<View>('Dashboard')
  const [month, setMonth] = useState('September 2026')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [showBillForm, setShowBillForm] = useState(false)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [transactionType, setTransactionType] = useState<'Expense' | 'Income'>('Expense')
  const [toast, setToast] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [onboarding, setOnboarding] = useState<OnboardingData | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<UserFacingError | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<UserFacingError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [pageSlide, setPageSlide] = useState<'left' | 'right' | null>(null)
  const pageTouchStart = useRef<{ x: number; y: number } | null>(null)
  const pageSlideTimeout = useRef<number | null>(null)
  const beginPageSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || window.matchMedia('(min-width: 701px)').matches) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, textarea, a')) {
      pageTouchStart.current = null
      return
    }
    pageTouchStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const finishPageSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = pageTouchStart.current
    pageTouchStart.current = null
    if (!start || event.pointerType !== 'touch' || window.matchMedia('(min-width: 701px)').matches) return
    const distance = event.clientX - start.x
    const verticalDistance = event.clientY - start.y
    if (Math.abs(distance) < 56 || Math.abs(distance) <= Math.abs(verticalDistance)) return
    const currentIndex = mobileViews.indexOf(view)
    const nextIndex = distance < 0 ? currentIndex + 1 : currentIndex - 1
    if (nextIndex < 0 || nextIndex >= mobileViews.length) return
    setPageSlide(distance < 0 ? 'left' : 'right')
    setView(mobileViews[nextIndex])
    if (pageSlideTimeout.current) window.clearTimeout(pageSlideTimeout.current)
    pageSlideTimeout.current = window.setTimeout(() => setPageSlide(null), 220)
  }
  useEffect(() => {
    const accessToken = localStorage.getItem('finapp_access_token')
    if (!accessToken) {
      setAuthLoading(false)
      return
    }
    apiFetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async response => {
        if (!response.ok) throw new Error('Your session has expired. Please sign in again.')
        return response.json() as Promise<AuthUser>
      })
      .then(user => {
        setSetupLoading(true)
        setAuthUser(user)
      })
      .catch(error => {
        localStorage.removeItem('finapp_access_token')
        localStorage.removeItem('finapp_refresh_token')
        setAuthError(explainError(error, 'restore your session'))
      })
      .finally(() => setAuthLoading(false))
  }, [])
  useEffect(() => {
    if (authUser) {
      setSetupLoading(true)
      setSetupError(null)
      const accessToken = localStorage.getItem('finapp_access_token')
      apiFetch(`${apiBase}/setup`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(async response => {
          if (!response.ok) throw new Error('Unable to load your financial setup.')
          return response.json()
        })
        .then((saved: { month_start: string; opening_balance: number; monthly_income: number; allocations: { name: string; amount: number }[]; bills: Bill[]; goals: Goal[] } | null) => {
          if (saved) {
            setOnboarding({
              openingBalance: saved.opening_balance,
              monthlyIncome: saved.monthly_income,
              allocations: saved.allocations.map(item => ({ name: item.name, amount: Number(item.amount) })),
              bills: saved.bills.map(item => ({ id: item.id, name: item.name, amount: Number(item.amount), frequency: item.frequency, due_day: 1 })),
              goals: saved.goals.map(item => ({ id: item.id, name: item.name, target: Number(item.target), monthly: Number(item.monthly) })),
            })
          } else {
            setOnboarding(null)
          }
        })
        .catch(error => setSetupError(explainError(error, 'load your setup')))
        .finally(() => setSetupLoading(false))
    }
  }, [authUser])
  useEffect(() => {
    if (!authUser || !onboarding) return
    let active = true
    const selectedMonth = monthStart(month)
    const headers = { Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` }
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    Promise.all([
      readJson<Bill[]>(`${apiBase}/bills`, { headers }, 'Unable to load bills.'),
      readJson<Goal[]>(`${apiBase}/goals`, { headers }, 'Unable to load savings goals.'),
      readJson<TransactionResponse[]>(`${apiBase}/transactions?month_start=${selectedMonth}`, { headers }, 'Unable to load transactions.'),
      readJson<MonthlySummary>(`${apiBase}/reports/monthly-summary?month_start=${selectedMonth}`, { headers }, 'Unable to load this month’s summary.'),
    ]).then(([loadedBills, loadedGoals, loadedTransactions, loadedSummary]) => {
      if (!active) return
      setBills(loadedBills.map(item => ({ ...item, amount: Number(item.amount) })))
      setGoals(loadedGoals.map(item => ({ ...item, target: Number(item.target), monthly: Number(item.monthly), current: Number(item.current) })))
      setTransactions(loadedTransactions.map(item => ({
        id: item.id,
        date: new Date(`${item.transaction_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        transactionDate: item.transaction_date,
        description: item.description,
        category: item.category,
        amount: Number(item.amount),
        type: item.transaction_type === 'INCOME' ? 'Income' : 'Expense',
        need: item.need_want === 'WANT' ? 'Want' : 'Need',
      })))
      setSummary(loadedSummary)
    }).catch(error => {
      if (active) setWorkspaceError(explainError(error, 'load your workspace'))
    }).finally(() => {
      if (active) setWorkspaceLoading(false)
    })
    return () => { active = false }
  }, [authUser, onboarding, month, reloadKey])
  const expenses = summary?.total_expenses ?? transactions.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0)
  const income = summary?.total_income ?? transactions.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0) + (onboarding?.monthlyIncome || 0)
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const openTransactionForm = (type: 'Expense' | 'Income') => {
    setEditingTransaction(null)
    setTransactionType(type)
    setShowForm(true)
  }
  const editTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction)
    setTransactionType(transaction.type)
    setShowForm(true)
  }
  const deleteTransaction = async (transaction: Transaction) => {
    if (!window.confirm('Delete this transaction?')) return
    const response = await apiFetch(`${apiBase}/transactions/${transaction.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
    })
    if (!response.ok) {
      notify('Unable to delete transaction')
      return
    }
    setTransactions(current => current.filter(item => item.id !== transaction.id))
    notify('Transaction deleted')
  }
  const addTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const amount = Number(data.get('amount'))
    if (!amount || amount < 1) return
    const response = await apiFetch(`${apiBase}/transactions${editingTransaction ? `/${editingTransaction.id}` : ''}`, {
      method: editingTransaction ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
      body: JSON.stringify({
        transaction_date: data.get('date'),
        transaction_type: transactionType === 'Income' ? 'INCOME' : 'EXPENSE',
        amount,
        category: data.get('category'),
        description: data.get('description'),
        need_want: transactionType === 'Expense' ? data.get('need') === 'Want' ? 'WANT' : 'NEED' : null,
      }),
    })
    if (!response.ok) {
      notify('Unable to save transaction')
      return
    }
    const item = await response.json() as TransactionResponse
    const savedTransaction: Transaction = {
      id: item.id,
      date: new Date(`${item.transaction_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      transactionDate: item.transaction_date,
      description: item.description,
      category: item.category,
      amount: Number(item.amount),
      type: item.transaction_type === 'INCOME' ? 'Income' : 'Expense',
      need: item.need_want === 'WANT' ? 'Want' : 'Need',
    }
    setTransactions(current => editingTransaction
      ? current.map(existing => existing.id === editingTransaction.id ? savedTransaction : existing)
      : [savedTransaction, ...current])
    setShowForm(false)
    setEditingTransaction(null)
    notify('Transaction saved successfully')
  }

  const openBillForm = (bill: Bill | null = null) => {
    setEditingBill(bill)
    setShowBillForm(true)
  }
  const saveBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload = {
      name: String(data.get('name') || '').trim(),
      amount: Number(data.get('amount')),
      frequency: data.get('frequency'),
      due_day: Number(data.get('due_day')) || 1,
    }
    if (!payload.name || !payload.amount || payload.amount < 1) return
    const response = await apiFetch(`${apiBase}/bills${editingBill?.id ? `/${editingBill.id}` : ''}`, {
      method: editingBill ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      notify('Unable to save bill')
      return
    }
    const saved = await response.json() as Bill
    const normalized = { ...saved, amount: Number(saved.amount) }
    setBills(current => editingBill?.id ? current.map(item => item.id === editingBill.id ? normalized : item) : [...current, normalized])
    setShowBillForm(false)
    setEditingBill(null)
    notify('Bill saved successfully')
  }
  const deleteBill = async (bill: Bill) => {
    if (!window.confirm(`Delete ${bill.name}?`) || !bill.id) return
    const response = await apiFetch(`${apiBase}/bills/${bill.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
    })
    if (!response.ok) {
      notify('Unable to delete bill')
      return
    }
    setBills(current => current.filter(item => item.id !== bill.id))
    notify('Bill deleted')
  }
  const signOut = async () => {
    const refreshToken = localStorage.getItem('finapp_refresh_token')
    if (refreshToken) {
      try {
        const response = await fetch(`${apiBase}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!response.ok) notify('Signed out locally; the server could not revoke this session.')
      } catch {
        notify('Signed out locally; the server could not be reached.')
      }
    }
    localStorage.removeItem('finapp_access_token')
    localStorage.removeItem('finapp_refresh_token')
    setAuthUser(null)
    setOnboarding(null)
    setSetupLoading(false)
    setSummary(null)
    setTransactions([])
    setBills([])
    setGoals([])
    setView('Dashboard')
  }
  const openGoalForm = (goal: Goal | null = null) => {
    setEditingGoal(goal)
    setShowGoalForm(true)
  }
  const saveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload = {
      name: String(data.get('name') || '').trim(),
      target: Number(data.get('target')),
      monthly: Number(data.get('monthly')) || 0,
    }
    if (!payload.name || payload.target < 1) return
    const response = await apiFetch(`${apiBase}/goals${editingGoal?.id ? `/${editingGoal.id}` : ''}`, {
      method: editingGoal?.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      notify('Unable to save goal')
      return
    }
    const saved = await response.json() as Goal
    const normalized = { ...saved, target: Number(saved.target), monthly: Number(saved.monthly), current: Number(saved.current) }
    setGoals(current => editingGoal?.id ? current.map(item => item.id === editingGoal.id ? normalized : item) : [...current, normalized])
    setShowGoalForm(false)
    setEditingGoal(null)
    notify('Goal saved successfully')
  }
  const deleteGoal = async (goal: Goal) => {
    if (!goal.id || !window.confirm(`Delete ${goal.name}?`)) return
    const response = await apiFetch(`${apiBase}/goals/${goal.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
    })
    if (!response.ok) {
      notify('Unable to delete goal')
      return
    }
    setGoals(current => current.filter(item => item.id !== goal.id))
    notify('Goal deleted')
  }
  const addContribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!contributingGoal?.id) return
    const data = new FormData(event.currentTarget)
    const amount = Number(data.get('amount'))
    if (amount < 1) return
    const response = await apiFetch(`${apiBase}/goals/${contributingGoal.id}/contributions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
      body: JSON.stringify({ amount, contribution_date: data.get('date') }),
    })
    if (!response.ok) {
      notify('Unable to add savings')
      return
    }
    setGoals(current => current.map(item => item.id === contributingGoal.id ? { ...item, current: (item.current || 0) + amount } : item))
    setContributingGoal(null)
    notify('Savings contribution added')
  }
  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const names = Array.from(data.entries()).filter(([key]) => key.startsWith('allocation-name-'))
    const allocations = names.map(([key, value]) => {
      const index = key.replace('allocation-name-', '')
      return { name: String(value).trim(), amount: Number(data.get(`allocation-amount-${index}`)) || 0 }
    }).filter(item => item.name)
    const response = await apiFetch(`${apiBase}/budget/allocations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
      body: JSON.stringify({ month_start: monthStart(month), allocations }),
    })
    if (!response.ok) {
      notify('Unable to save budget allocations')
      return
    }
    setShowBudgetForm(false)
    notify('Budget allocations saved')
    const summaryResponse = await apiFetch(`${apiBase}/reports/monthly-summary?month_start=${monthStart(month)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` } })
    if (summaryResponse.ok) setSummary(await summaryResponse.json() as MonthlySummary)
  }

  if (authLoading) return <LoadingState title="Checking your secure session" message="This usually takes only a moment." />
  if (!authUser) return <AuthScreen initialError={authError} onAuthenticated={(user, tokens) => {
    localStorage.setItem('finapp_access_token', tokens.access_token)
    localStorage.setItem('finapp_refresh_token', tokens.refresh_token)
    setSetupLoading(true)
    setAuthUser(user)
    setAuthError(null)
  }} /> 
  if (setupLoading) return <LoadingState title="Preparing your workspace" message="We are loading your plan, goals, and recent activity." />
  if (setupError) return <WorkspaceErrorState error={setupError} onRetry={() => window.location.reload()} onSignOut={signOut} />
  if (!onboarding) return <OnboardingScreen user={authUser} onComplete={async data => {
    const response = await apiFetch(`${apiBase}/setup`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('finapp_access_token')}` },
      body: JSON.stringify({
        month_start: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
        opening_balance: data.openingBalance,
        monthly_income: data.monthlyIncome,
        allocations: data.allocations,
        bills: data.bills,
        goals: data.goals,
      }),
    })
    if (!response.ok) throw new Error('Unable to save your setup. Please check that the backend is running.')
    const saved = await response.json() as { bills: Bill[]; goals: Goal[] }
    localStorage.setItem(`finapp_onboarding_${authUser.id}`, JSON.stringify(data))
    setTransactions([])
    setBills(saved.bills.map(item => ({ ...item, amount: Number(item.amount) })))
    setGoals(saved.goals.map(item => ({ ...item, target: Number(item.target), monthly: Number(item.monthly), current: 0 })))
    setOnboarding(data)
  }} />
  if (workspaceLoading) return <LoadingState title="Loading your money overview" message="Your information stays private while we refresh it." />
  if (workspaceError) return <WorkspaceErrorState error={workspaceError} onRetry={() => setReloadKey(value => value + 1)} onSignOut={signOut} />
  return <div className={`${theme === 'dark' ? 'app dark' : 'app'} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><button type="button" className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setSidebarCollapsed(value => !value)}><span aria-hidden="true">☰</span></button><span className="brand-mark" aria-hidden="true"><span>F</span></span><span className="brand-name">Fin<b>App</b></span></div>
      <div className="profile"><div className="avatar">{(authUser.display_name || authUser.email).slice(0, 2).toUpperCase()}</div><div><strong>{authUser.display_name || authUser.email}</strong><small>Personal workspace</small></div><button className="dots" aria-label="Sign out" onClick={signOut}>↪</button></div>
      <nav>{nav.map(item => <button className={view === item.name ? 'nav-item active' : 'nav-item'} onClick={() => setView(item.name)} key={item.name}><span>{item.icon}</span><b>{item.name}</b></button>)}</nav>
      <div className="sidebar-bottom"><div className="tip"><span>✧</span><div><b>Small steps add up</b><small>You're 24% closer to your savings goal.</small></div></div><button className="upgrade">✦ Upgrade plan <span>→</span></button></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{view}</b></div><div className="top-actions"><label className="month-select">◷ <select aria-label="Select month" value={month} onChange={e => setMonth(e.target.value)}><option>September 2026</option><option>August 2026</option><option>July 2026</option></select></label></div></header>
      <div className={`content${pageSlide ? ` page-slide-${pageSlide}` : ''}`} onPointerDown={beginPageSwipe} onPointerUp={finishPageSwipe}>
        {view === 'Dashboard' && <Dashboard month={month} expenses={expenses} income={income} openingBalance={summary?.opening_balance ?? onboarding.openingBalance} allocations={summary?.allocations ?? []} transactions={transactions} goals={goals} onAdd={openTransactionForm} onNavigate={setView} />}
        {view === 'Budget' && <Budget allocations={summary?.allocations ?? []} onAdd={() => setShowBudgetForm(true)} />}
        {view === 'Money' && <MoneyCenter transactions={transactions} bills={bills} goals={goals} onNavigate={setView} onAddTransaction={openTransactionForm} onEditTransaction={editTransaction} onDeleteTransaction={deleteTransaction} onAddBill={() => openBillForm()} onEditBill={openBillForm} onDeleteBill={deleteBill} onAddGoal={() => openGoalForm()} onEditGoal={openGoalForm} onDeleteGoal={deleteGoal} onContribute={setContributingGoal} />}
        {view === 'Reports' && <Reports expenses={expenses} income={income} allocations={summary?.allocations ?? []} />}
        {view === 'Settings' && <Settings theme={theme} setTheme={setTheme} onSave={() => notify('Settings saved')} />}
      </div>
    </main>
    {showForm && <TransactionModal type={transactionType} transaction={editingTransaction} onClose={() => { setShowForm(false); setEditingTransaction(null) }} onSubmit={addTransaction} />}
    {showBillForm && <BillModal bill={editingBill} onClose={() => { setShowBillForm(false); setEditingBill(null) }} onSubmit={saveBill} />}
    {showGoalForm && <GoalModal goal={editingGoal} onClose={() => { setShowGoalForm(false); setEditingGoal(null) }} onSubmit={saveGoal} />}
    {contributingGoal && <ContributionModal goal={contributingGoal} onClose={() => setContributingGoal(null)} onSubmit={addContribution} />}
    {showBudgetForm && <BudgetModal allocations={summary?.allocations ?? []} onClose={() => setShowBudgetForm(false)} onSubmit={saveBudget} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </div>
}

function FeedbackPanel({ error, onRetry }: { error: UserFacingError; onRetry?: () => void }) {
  return <div className="feedback-panel" role="alert"><div className="feedback-icon" aria-hidden="true">!</div><div><strong>{error.title}</strong><p>{error.message}</p><small>{error.guidance}</small>{onRetry && <button type="button" className="feedback-retry" onClick={onRetry}>Try again</button>}</div></div>
}

function LoadingState({ title, message }: { title: string; message: string }) {
  return <div className="auth-shell"><div className="state-card" role="status" aria-live="polite"><span className="loading-spinner" aria-hidden="true" /><h1>{title}</h1><p>{message}</p></div></div>
}

function WorkspaceErrorState({ error, onRetry, onSignOut }: { error: UserFacingError; onRetry: () => void; onSignOut: () => void }) {
  return <div className="auth-shell"><div className="state-card"><span className="state-icon" aria-hidden="true">↻</span><h1>{error.title}</h1><p>{error.message}</p><p className="state-guidance">{error.guidance}</p><div className="state-actions"><button className="primary" onClick={onRetry}>Try again</button><button className="secondary" onClick={onSignOut}>Sign out</button></div></div></div>
}

function AuthScreen({ initialError, onAuthenticated }: { initialError: UserFacingError | null; onAuthenticated: (user: AuthUser, tokens: AuthTokens) => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<UserFacingError | null>(initialError)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const endpoint = mode === 'login' ? 'login' : 'register'
      const body = mode === 'login' ? { email, password } : { email, password, display_name: displayName || null }
      const response = await fetch(`${apiBase}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json() as AuthTokens | { detail?: string }
      if (!response.ok || !('access_token' in result)) {
        throw new Error('detail' in result && result.detail ? result.detail : 'Unable to authenticate. Please try again.')
      }
      const userResponse = await fetch(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${result.access_token}` } })
      if (!userResponse.ok) throw new Error('Authentication succeeded, but the user profile could not be loaded.')
      onAuthenticated(await userResponse.json() as AuthUser, result)
    } catch (requestError) {
      setError(explainError(requestError, mode === 'login' ? 'sign you in' : 'create your account'))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="auth-shell"><div className="auth-card"><div className="auth-brand"><span className="brand-mark" aria-hidden="true"><span>F</span></span><span className="brand-name">Fin<b>App</b></span></div><span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Get started'}</span><h1>{mode === 'login' ? 'Sign in to FinApp' : 'Create your FinApp account'}</h1><p>{mode === 'login' ? 'Continue planning and tracking your money.' : 'Set up your private personal finance workspace.'}</p>{error && <FeedbackPanel error={error} onRetry={() => setError(null)} />}<form onSubmit={submit} className="auth-form">{mode === 'register' && <label>Name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your name" maxLength={100} /></label>}<label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label><button className="primary full" disabled={submitting}>{submitting ? 'Signing you in…' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form><button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}>{mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button></div></div>
}

function OnboardingScreen({ user, onComplete }: { user: AuthUser; onComplete: (data: OnboardingData) => Promise<void> }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>(emptyOnboarding)
  const [allocationName, setAllocationName] = useState('')
  const [allocationAmount, setAllocationAmount] = useState('')
  const [billName, setBillName] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billFrequency, setBillFrequency] = useState<'One-time' | 'Recurring'>('Recurring')
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalMonthly, setGoalMonthly] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const firstName = user.display_name?.split(' ')[0] || 'there'
  const titles = ['Start with your income', 'Plan your allocations', 'Add your bills and debts', 'Set your starter goals']
  const descriptions = [
    'Tell FinApp what you are starting with this month.',
    'Give every franc a job by planning what you intend to spend.',
    'Track recurring payments and one-time debts before they surprise you.',
    'Choose the savings targets you want to make progress toward.',
  ]
  const addAllocation = () => {
    const amount = Number(allocationAmount)
    if (!allocationName.trim() || amount <= 0) return
    setData(current => ({ ...current, allocations: [...current.allocations, { name: allocationName.trim(), amount }] }))
    setAllocationName('')
    setAllocationAmount('')
  }
  const addBill = () => {
    const amount = Number(billAmount)
    if (!billName.trim() || amount <= 0) return
    setData(current => ({ ...current, bills: [...current.bills, { name: billName.trim(), amount, frequency: billFrequency }] }))
    setBillName('')
    setBillAmount('')
  }
  const addGoal = () => {
    const target = Number(goalTarget)
    const monthly = Number(goalMonthly)
    if (!goalName.trim() || target <= 0 || monthly < 0) return
    setData(current => ({ ...current, goals: [...current.goals, { name: goalName.trim(), target, monthly }] }))
    setGoalName('')
    setGoalTarget('')
    setGoalMonthly('')
  }
  const next = async () => {
    if (step < titles.length - 1) {
      setStep(step + 1)
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await onComplete(data)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save your setup.')
    } finally {
      setSaving(false)
    }
  }
  return <div className="onboarding-shell"><div className="onboarding-card"><div className="auth-brand"><span className="brand-mark" aria-hidden="true"><span>F</span></span><span className="brand-name">Fin<b>App</b></span><span className="onboarding-count">Step {step + 1} of {titles.length}</span></div><div className="onboarding-progress"><span style={{ width: `${((step + 1) / titles.length) * 100}%` }} /></div><span className="eyebrow">Personal setup</span><h1>{step === 0 ? `Welcome, ${firstName}` : titles[step]}</h1><p className="onboarding-description">{descriptions[step]}</p>{saveError && <div className="auth-error" role="alert">{saveError}</div>}{step === 0 && <div className="onboarding-fields"><label>Opening balance<input type="number" min="0" value={data.openingBalance || ''} onChange={event => setData({ ...data, openingBalance: Number(event.target.value) })} placeholder="0" /><small>Money already available at the start of this period.</small></label><label>Expected monthly income<input type="number" min="0" value={data.monthlyIncome || ''} onChange={event => setData({ ...data, monthlyIncome: Number(event.target.value) })} placeholder="e.g. 300000" /><small>Your salary and other expected income for the month.</small></label></div>}{step === 1 && <SetupList title="Planned allocations" name={allocationName} setName={setAllocationName} amount={allocationAmount} setAmount={setAllocationAmount} onAdd={addAllocation} placeholder="e.g. Food, transport, rent" items={data.allocations.map(item => `${item.name} · ${money(item.amount)}`)} onRemove={index => setData({ ...data, allocations: data.allocations.filter((_, itemIndex) => itemIndex !== index) })} />}{step === 2 && <div className="onboarding-fields"><div className="setup-add-row"><label>Bill or debt name<input value={billName} onChange={event => setBillName(event.target.value)} placeholder="e.g. Rent or loan" /></label><label>Amount<input type="number" min="1" value={billAmount} onChange={event => setBillAmount(event.target.value)} placeholder="0" /></label><label>Type<select value={billFrequency} onChange={event => setBillFrequency(event.target.value as 'One-time' | 'Recurring')}><option>Recurring</option><option>One-time</option></select></label><button className="secondary setup-add" type="button" onClick={addBill}>Add</button></div><SetupItems items={data.bills.map(item => `${item.name} · ${money(item.amount)} · ${item.frequency}`)} onRemove={index => setData({ ...data, bills: data.bills.filter((_, itemIndex) => itemIndex !== index) })} /></div>}{step === 3 && <div className="onboarding-fields"><div className="setup-add-row"><label>Goal name<input value={goalName} onChange={event => setGoalName(event.target.value)} placeholder="e.g. Emergency fund" /></label><label>Target<input type="number" min="1" value={goalTarget} onChange={event => setGoalTarget(event.target.value)} placeholder="0" /></label><label>Monthly saving<input type="number" min="0" value={goalMonthly} onChange={event => setGoalMonthly(event.target.value)} placeholder="0" /></label><button className="secondary setup-add" type="button" onClick={addGoal}>Add</button></div><SetupItems items={data.goals.map(item => `${item.name} · ${money(item.target)} target · ${money(item.monthly)}/month`)} onRemove={index => setData({ ...data, goals: data.goals.filter((_, itemIndex) => itemIndex !== index) })} /></div>}<div className="onboarding-actions">{step > 0 && <button className="secondary" onClick={() => setStep(step - 1)}>Back</button>}<button className="primary" onClick={next} disabled={saving}>{saving ? 'Saving setup…' : step === titles.length - 1 ? 'Finish setup' : 'Continue'}</button></div><button className="onboarding-skip" onClick={() => onComplete(data)}>Skip for now</button></div></div>
}

function SetupList({ title, name, setName, amount, setAmount, onAdd, placeholder, items, onRemove }: { title: string; name: string; setName: (value: string) => void; amount: string; setAmount: (value: string) => void; onAdd: () => void; placeholder: string; items: string[]; onRemove: (index: number) => void }) {
  return <div className="onboarding-fields"><h2>{title}</h2><div className="setup-add-row"><label>Name<input value={name} onChange={event => setName(event.target.value)} placeholder={placeholder} /></label><label>Planned amount<input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" /></label><button className="secondary setup-add" type="button" onClick={onAdd}>Add</button></div><SetupItems items={items} onRemove={onRemove} /></div>
}
function SetupItems({ items, onRemove }: { items: string[]; onRemove: (index: number) => void }) {
  return <div className="setup-items">{items.length === 0 ? <small>No items added yet.</small> : items.map((item, index) => <div className="setup-item" key={`${item}-${index}`}><span>{item}</span><button type="button" onClick={() => onRemove(index)} aria-label={`Remove ${item}`}>×</button></div>)}</div>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}
function TransactionActions({ onAdd }: { onAdd: (type: 'Expense' | 'Income') => void }) {
  return <div className="transaction-actions"><button className="income-action" onClick={() => onAdd('Income')}>＋ Income</button><button className="expense-action" onClick={() => onAdd('Expense')}>− Expense</button></div>
}
function getDailySpending(transactions: Transaction[], month: string) {
  const selected = new Date(`${month} 1`)
  const lastDay = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate()
  const today = new Date()
  const endDay = selected.getFullYear() === today.getFullYear() && selected.getMonth() === today.getMonth() ? today.getDate() : lastDay
  const start = Math.max(1, endDay - 6)
  return Array.from({ length: endDay - start + 1 }, (_, index) => {
    const day = start + index
    const date = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return {
      date,
      label: String(day),
      amount: transactions.filter(item => item.type === 'Expense' && item.transactionDate === date).reduce((total, item) => total + item.amount, 0),
    }
  })
}
function Dashboard({ month, expenses, income, openingBalance, allocations, transactions, goals, onAdd, onNavigate }: { month: string; expenses: number; income: number; openingBalance: number; allocations: { name: string; planned: number; spent: number }[]; transactions: Transaction[]; goals: Goal[]; onAdd: (type: 'Expense' | 'Income') => void; onNavigate: (v: View) => void }) {
  const balance = openingBalance + income - expenses
  const planned = allocations.reduce((total, item) => total + item.planned, 0)
  const usedPercent = planned > 0 ? Math.round(expenses / planned * 100) : 0
  const savings = goals.reduce((total, goal) => total + (goal.current || 0), 0)
  const visualUsedPercent = Math.min(100, usedPercent)
  const dailySpending = getDailySpending(transactions, month)
  const maxDailySpending = Math.max(...dailySpending.map(item => item.amount), 1)
  const goalCards = goals.slice(0, 2)
  return <><PageHeading eyebrow={month} title="Good morning, Alex" description="Here's your financial snapshot for this month." action={<TransactionActions onAdd={onAdd} />} />
    <section className="kpi-grid"><Kpi label="Available balance" value={money(balance)} change="Current period" tone="orange" icon="◉" /><Kpi label="Income" value={money(income)} change="Current period" tone="green" icon="↗" /><Kpi label="Expenses" value={money(expenses)} change="Current period" tone="blue" icon="↘" /><Kpi label="Savings" value={money(savings)} change="Contributions" tone="purple" icon="♡" /></section>
    <div className="dashboard-grid"><section className="card budget-card"><div className="section-title"><div><h2>Budget overview</h2><p>How you're tracking this month</p></div><button className="text-button" onClick={() => onNavigate('Budget')}>View budget →</button></div><div className="budget-total"><div><small>Spent so far</small><strong>{money(expenses)}</strong><span>of {money(planned)} planned</span></div><div className="donut" style={{ '--used-percent': `${visualUsedPercent}%` } as React.CSSProperties}><span>{usedPercent}%<small>used</small></span></div></div><div className="progress wide"><span style={{ width: `${visualUsedPercent}%` }} /></div><div className="legend"><span><i className="dot orange" />Spent <b>{money(expenses)}</b></span><span><i className="dot muted" />Remaining <b>{money(Math.max(0, planned - expenses))}</b></span></div></section>
      <section className="card spending-card"><div className="section-title"><div><h2>Spending activity</h2><p>Daily outflow over the last 7 days</p></div><span className="pill">This month</span></div><div className="chart"><div className="y-labels"><span>{money(maxDailySpending).replace('RWF ', '')}</span><span>{money(maxDailySpending / 2).replace('RWF ', '')}</span><span>0</span></div><div className="bars">{dailySpending.map(item => <div className="bar-col" key={item.date}><span className="bar" title={`${item.label}: ${money(item.amount)}`} style={{ height: `${item.amount / maxDailySpending * 100}%` }} /><small>{item.label}</small></div>)}</div></div></section></div>
    <div className="lower-grid"><section className="card"><div className="section-title"><div><h2>Recent transactions</h2><p>Your latest money moves</p></div><button className="text-button" onClick={() => onNavigate('Money')}>View all →</button></div><TransactionList transactions={transactions.slice(0, 4)} /></section><section className="card goals-card"><div className="section-title"><div><h2>Savings goals</h2><p>Keep your momentum going</p></div><button className="text-button" onClick={() => onNavigate('Money')}>View goals →</button></div>{goalCards.length ? goalCards.map((goal, index) => <GoalMini key={goal.id || goal.name} title={goal.name} current={goal.current || 0} target={goal.target} color={index ? 'purple' : 'orange'} icon={index ? '▣' : '✦'} />) : <div className="empty-state">No savings goals yet.</div>}</section></div>
  </>
}
function Kpi({ label, value, change, tone, icon }: { label: string; value: string; change: string; tone: string; icon: string }) { return <div className="card kpi"><div className={`kpi-icon ${tone}`}>{icon}</div><small>{label}</small><strong>{value}</strong><span className={change.startsWith('-') ? 'negative' : 'positive'}>{change.startsWith('-') ? '↓' : '↑'} {change} <em>vs last month</em></span></div> }
function TransactionList({ transactions, onEdit, onDelete }: { transactions: Transaction[]; onEdit?: (transaction: Transaction) => void; onDelete?: (transaction: Transaction) => void }) { return <div className="transaction-list">{transactions.length === 0 ? <div className="empty-state"><strong>No transactions for this month</strong><span>Add income or an expense to begin tracking your progress.</span></div> : transactions.map(t => <div className="transaction" key={t.id}><div className={`transaction-icon ${t.category.toLowerCase()}`}>{t.category === 'Food' ? '⌁' : t.category === 'Transport' ? '↗' : t.category === 'Income' ? '↙' : t.category === 'Bills' ? 'ϟ' : '♫'}</div><div className="transaction-desc"><strong>{t.description}</strong><small>{t.date} · {t.category}</small></div><b className={t.type === 'Income' ? 'income' : ''}>{t.type === 'Income' ? '+' : '-'}{money(t.amount).replace('RWF ', 'RWF ')}</b>{onEdit && <button className="transaction-action" onClick={() => onEdit(t)} aria-label={`Edit ${t.description}`}>Edit</button>}{onDelete && <button className="transaction-action delete" onClick={() => onDelete(t)} aria-label={`Delete ${t.description}`}>×</button>}</div>)}</div> }
function GoalMini({ title, current, target, color, icon }: { title: string; current: number; target: number; color: string; icon: string }) { return <div className="goal-mini"><div className={`goal-icon ${color}`}>{icon}</div><div className="goal-info"><strong>{title}</strong><span>{money(current)} <small>of {money(target)}</small></span><div className="progress"><span className={color} style={{ width: `${current / target * 100}%` }} /></div></div><b>{Math.round(current / target * 100)}%</b></div> }

function Budget({ allocations, onAdd }: { allocations: { name: string; planned: number; spent: number }[]; onAdd: () => void }) { const plannedTotal = allocations.reduce((total, item) => total + item.planned, 0); const spentTotal = allocations.reduce((total, item) => total + item.spent, 0); const usedTotal = plannedTotal ? spentTotal / plannedTotal * 100 : 0; const visualUsedTotal = Math.min(100, usedTotal); return <><PageHeading title="Monthly budget" description="Plan ahead and make every franc count." action={<button className="primary" onClick={onAdd}>＋ Edit allocations</button>} /><div className="card allocation-card"><div className="allocation-summary"><div><small>Total planned</small><strong>{money(plannedTotal)}</strong></div><div><small>Total spent</small><strong>{money(spentTotal)}</strong></div><div><small>Remaining</small><strong className="orange-text">{money(Math.max(0, plannedTotal - spentTotal))}</strong></div><div className="allocation-chart"><div className="donut small" style={{ '--used-percent': `${visualUsedTotal}%` } as React.CSSProperties}><span>{Math.round(usedTotal)}%<small>used</small></span></div></div></div><div className="table-wrap"><table><thead><tr><th>Category</th><th>Planned</th><th>Actual</th><th>Remaining</th><th>Used</th><th>Status</th></tr></thead><tbody>{allocations.map(item => { const used = item.planned ? item.spent / item.planned * 100 : 0; return <tr key={item.name}><td><span className="category-icon">•</span><b>{item.name}</b></td><td>{money(item.planned)}</td><td>{money(item.spent)}</td><td className="orange-text">{money(Math.max(0, item.planned - item.spent))}</td><td><div className="table-progress"><span style={{ width: `${Math.min(100, used)}%` }} /></div><small>{Math.round(used)}%</small></td><td><span className={`status ${used > 70 ? 'warning' : 'good'}`}>{used > 70 ? 'Watch' : 'On track'}</span></td></tr> })}</tbody></table></div></div></> }
function BudgetModal({ allocations, onClose, onSubmit }: { allocations: { name: string; planned: number; spent: number }[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const [rows, setRows] = useState(allocations.map(item => ({ name: item.name, amount: item.planned }))); const addRow = () => setRows(current => [...current, { name: '', amount: 0 }]); return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="eyebrow">Monthly plan</span><h2>Edit allocations</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><div className="budget-edit-list">{rows.map((row, index) => <div className="form-row budget-edit-row" key={`allocation-row-${index}`}><label>Category<input name={`allocation-name-${index}`} value={row.name} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} required /></label><label>Planned amount<div className="amount-input"><span>RWF</span><input name={`allocation-amount-${index}`} type="number" min="0" value={row.amount || ''} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: Number(event.target.value) } : item))} required /></div></label><button type="button" className="transaction-action delete" onClick={() => setRows(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div><button type="button" className="secondary full" onClick={addRow}>＋ Add allocation</button><button className="primary full" type="submit">Save allocations</button></form></div> }

function MoneyCenter({ transactions, bills, goals, onNavigate, onAddTransaction, onEditTransaction, onDeleteTransaction, onAddBill, onEditBill, onDeleteBill, onAddGoal, onEditGoal, onDeleteGoal, onContribute }: { transactions: Transaction[]; bills: Bill[]; goals: Goal[]; onNavigate: (view: View) => void; onAddTransaction: (type: 'Expense' | 'Income') => void; onEditTransaction: (transaction: Transaction) => void; onDeleteTransaction: (transaction: Transaction) => void; onAddBill: () => void; onEditBill: (bill: Bill) => void; onDeleteBill: (bill: Bill) => void; onAddGoal: () => void; onEditGoal: (goal: Goal) => void; onDeleteGoal: (goal: Goal) => void; onContribute: (goal: Goal) => void }) {
  const [tab, setTab] = useState<'Transactions' | 'Bills' | 'Goals'>('Transactions')
  const tabTouchStart = useRef<{ x: number; y: number } | null>(null)
  const handleTabTouchStart = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.pointerType !== 'touch' || window.matchMedia('(min-width: 701px)').matches) return
    tabTouchStart.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleTabTouchEnd = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const start = tabTouchStart.current
    tabTouchStart.current = null
    if (!start || event.pointerType !== 'touch' || window.matchMedia('(min-width: 701px)').matches) return
    const distance = event.clientX - start.x
    if (Math.abs(distance) < 48 || Math.abs(distance) <= Math.abs(event.clientY - start.y)) return
    const tabs: ('Transactions' | 'Bills' | 'Goals')[] = ['Transactions', 'Bills', 'Goals']
    const nextIndex = tabs.indexOf(tab) + (distance < 0 ? 1 : -1)
    if (nextIndex >= 0 && nextIndex < tabs.length) {
      setTab(tabs[nextIndex])
    } else if (distance < 0 && tab === 'Goals') {
      onNavigate('Reports')
    } else if (distance > 0 && tab === 'Transactions') {
      onNavigate('Budget')
    }
  }
  return <div className="money-center" onPointerDown={handleTabTouchStart} onPointerUp={handleTabTouchEnd}><PageHeading title="Money center" description="Manage transactions, bills, debts, and savings goals in one place." /><div className="money-tabs" role="tablist" aria-label="Money center sections"><button role="tab" aria-selected={tab === 'Transactions'} className={tab === 'Transactions' ? 'money-tab active' : 'money-tab'} onClick={() => setTab('Transactions')}>Transactions</button><button role="tab" aria-selected={tab === 'Bills'} className={tab === 'Bills' ? 'money-tab active' : 'money-tab'} onClick={() => setTab('Bills')}>Bills & debts</button><button role="tab" aria-selected={tab === 'Goals'} className={tab === 'Goals' ? 'money-tab active' : 'money-tab'} onClick={() => setTab('Goals')}>Savings goals</button></div>{tab === 'Transactions' && <Transactions showHeading={false} transactions={transactions} onAdd={onAddTransaction} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />}{tab === 'Bills' && <Bills showHeading={false} bills={bills} onAdd={onAddBill} onEdit={onEditBill} onDelete={onDeleteBill} />}{tab === 'Goals' && <Goals showHeading={false} goals={goals} onAdd={onAddGoal} onEdit={onEditGoal} onDelete={onDeleteGoal} onContribute={onContribute} />}</div>
}

function Transactions({ transactions, onAdd, onEdit, onDelete, showHeading = true }: { transactions: Transaction[]; onAdd: (type: 'Expense' | 'Income') => void; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void; showHeading?: boolean }) { const [query, setQuery] = useState(''); const filtered = transactions.filter(t => t.description.toLowerCase().includes(query.toLowerCase()) || t.category.toLowerCase().includes(query.toLowerCase())); return <>{showHeading && <PageHeading title="Transactions" description="A clear history of where your money goes." action={<TransactionActions onAdd={onAdd} />} />}{!showHeading && <div className="tab-action-row transaction-tab-actions"><TransactionActions onAdd={onAdd} /></div>}<div className="card transactions-card"><div className="filters"><label className="search">⌕ <input placeholder="Search transactions" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="filter-button">All types ▾</button><button className="filter-button">All categories ▾</button><button className="filter-button">September ▾</button></div><TransactionList transactions={filtered} onEdit={onEdit} onDelete={onDelete} /></div></> }
function Bills({ bills, onAdd, onEdit, onDelete, showHeading = true }: { bills: Bill[]; onAdd: () => void; onEdit: (bill: Bill) => void; onDelete: (bill: Bill) => void; showHeading?: boolean }) { return <>{showHeading && <PageHeading title="Bills" description="Stay ahead of recurring payments and one-time debts." action={<button className="primary" onClick={onAdd}>＋ Add bill</button>} />}{!showHeading && <div className="tab-action-row"><h2>Bills & debts</h2><button className="primary" onClick={onAdd}>＋ Add bill</button></div>}<div className="bill-grid">{bills.map((bill, index) => <div className="card bill-card" key={bill.id || `${bill.name}-${index}`}><div className="bill-top"><span className="bill-icon">ϟ</span><span className="status neutral">{bill.frequency}</span></div><h2>{bill.name}</h2><p>{bill.frequency === 'Recurring' ? `Due on day ${bill.due_day}` : 'One-time debt'}</p><div className="bill-amount"><span>Amount <b>{money(bill.amount)}</b></span></div><div className="progress"><span style={{ width: '0%' }} /></div><div className="bill-actions"><button className="transaction-action" onClick={() => onEdit(bill)}>Edit</button><button className="transaction-action delete" onClick={() => onDelete(bill)}>Delete</button></div></div>)}</div>{bills.length === 0 && <div className="card empty-state">No bills or debts have been added yet.</div>}</> }
function BillModal({ bill, onClose, onSubmit }: { bill: Bill | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="eyebrow">Planned payment</span><h2>{bill ? 'Edit bill' : 'Add bill'}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Name<input name="name" defaultValue={bill?.name || ''} placeholder="e.g. Rent or loan payment" required /></label><label>Amount<div className="amount-input"><span>RWF</span><input name="amount" type="number" min="1" defaultValue={bill?.amount || ''} placeholder="0" required /></div></label><div className="form-row"><label>Frequency<select name="frequency" defaultValue={bill?.frequency || 'Recurring'}><option>Recurring</option><option>One-time</option></select></label><label>Due day<input name="due_day" type="number" min="1" max="31" defaultValue={bill?.due_day || 1} required /></label></div><button className="primary full" type="submit">Save bill</button></form></div> }
function Goals({ goals, onAdd, onEdit, onDelete, onContribute, showHeading = true }: { goals: Goal[]; onAdd: () => void; onEdit: (goal: Goal) => void; onDelete: (goal: Goal) => void; onContribute: (goal: Goal) => void; showHeading?: boolean }) { return <>{showHeading && <PageHeading title="Savings goals" description="Give your money a purpose, one goal at a time." action={<button className="primary" onClick={onAdd}>＋ New goal</button>} />}{!showHeading && <div className="tab-action-row"><h2>Savings goals</h2><button className="primary" onClick={onAdd}>＋ New goal</button></div>}<div className="goal-grid">{goals.map((goal, index) => { const current = goal.current || 0; const percent = goal.target ? Math.min(100, Math.round(current / goal.target * 100)) : 0; return <div className="card big-goal" key={goal.id || `${goal.name}-${index}`}><div className="goal-header"><span className={`goal-icon ${index % 2 ? 'purple' : 'orange'}`}>✦</span><span className={`status ${percent >= 100 ? 'good' : 'neutral'}`}>{percent >= 100 ? 'Complete' : goal.status === 'COMPLETED' ? 'Complete' : 'On track'}</span></div><h2>{goal.name}</h2><p>Monthly target: {money(goal.monthly)}</p><strong className="goal-number">{money(current)} <small>of {money(goal.target)}</small></strong><div className="progress large"><span style={{ width: `${percent}%` }} /></div><div className="goal-meta"><span>{percent}% complete</span><span>Target: {money(goal.target)}</span></div><div className="goal-actions"><button className="secondary" onClick={() => onContribute(goal)}>＋ Add savings</button><button className="transaction-action" onClick={() => onEdit(goal)}>Edit</button><button className="transaction-action delete" onClick={() => onDelete(goal)}>Delete</button></div></div> })}</div>{goals.length === 0 && <div className="card empty-state">No savings goals have been added yet.</div>}</> }
function GoalModal({ goal, onClose, onSubmit }: { goal: Goal | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="eyebrow">Savings plan</span><h2>{goal ? 'Edit goal' : 'New goal'}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Name<input name="name" defaultValue={goal?.name || ''} placeholder="e.g. Emergency fund" required /></label><label>Target amount<div className="amount-input"><span>RWF</span><input name="target" type="number" min="1" defaultValue={goal?.target || ''} placeholder="0" required /></div></label><label>Monthly contribution<div className="amount-input"><span>RWF</span><input name="monthly" type="number" min="0" defaultValue={goal?.monthly || ''} placeholder="0" /></div></label><button className="primary full" type="submit">Save goal</button></form></div> }
function ContributionModal({ goal, onClose, onSubmit }: { goal: Goal; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="eyebrow">Savings contribution</span><h2>Add to {goal.name}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Amount<div className="amount-input"><span>RWF</span><input name="amount" type="number" min="1" placeholder="0" required autoFocus /></div></label><label>Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><button className="primary full" type="submit">Add savings</button></form></div> }
function Reports({ expenses, income, allocations }: { expenses: number; income: number; allocations: { name: string; planned: number; spent: number }[] }) { const comparisonMax = Math.max(income, expenses, 1); return <><PageHeading title="Reports" description="The story behind your money this month." action={<button className="secondary">⇩ Export report</button>} /><div className="report-grid"><div className="card report-chart"><div className="section-title"><div><h2>Income vs expenses</h2><p>Current monthly comparison</p></div><span className="pill">This month</span></div><div className="comparison-chart"><div><span>Income</span><div className="comparison-track"><span className="comparison-income" style={{ width: `${income / comparisonMax * 100}%` }} /></div><strong>{money(income)}</strong></div><div><span>Expenses</span><div className="comparison-track"><span className="comparison-expense" style={{ width: `${expenses / comparisonMax * 100}%` }} /></div><strong>{money(expenses)}</strong></div></div><div className="chart-legend"><span><i className="dot orange" />Income</span><span><i className="dot blue" />Expenses</span></div></div><div className="card insight"><span className="insight-icon">✧</span><h2>{income >= expenses ? 'You are on track' : 'Review your spending'}</h2><p>{income >= expenses ? `You have ${money(income - expenses)} more income than expenses this month.` : `Your expenses exceed income by ${money(expenses - income)} this month.`}</p></div></div><div className="card category-report"><div className="section-title"><div><h2>Spending by category</h2><p>Share of total expenses</p></div></div>{allocations.map(item => <div className="report-row" key={item.name}><span className="category-icon">•</span><b>{item.name}</b><div className="report-bar"><span style={{ width: `${expenses ? Math.min(100, item.spent / expenses * 100) : 0}%` }} /></div><strong>{money(item.spent)}</strong></div>)}</div></> }
function Settings({ theme, setTheme, onSave }: { theme: 'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void; onSave: () => void }) { return <><PageHeading title="Profile & settings" description="Manage your profile and make FinApp feel like yours." /><div className="settings-grid"><section className="card settings-card"><h2>Profile</h2><p>Personalise your workspace.</p><label>Full name<input defaultValue="Alex Morgan" /></label><label>Email address<input defaultValue="alex@example.com" /></label><button className="primary" onClick={onSave}>Save changes</button></section><section className="card settings-card"><h2>Appearance</h2><p>Choose how FinApp looks for you.</p><div className="theme-options"><button className={theme === 'light' ? 'theme active' : 'theme'} onClick={() => setTheme('light')}>☼<b>Light</b><small>Warm and bright</small></button><button className={theme === 'dark' ? 'theme active' : 'theme'} onClick={() => setTheme('dark')}>☾<b>Dark</b><small>Easy on the eyes</small></button></div><h2 className="settings-subtitle">Preferences</h2><label className="toggle-row">Monthly summary emails <input type="checkbox" defaultChecked /></label><label className="toggle-row">Show cents in amounts <input type="checkbox" /></label></section></div></> }
function TransactionModal({ type, transaction, onClose, onSubmit }: { type: 'Expense' | 'Income'; transaction: Transaction | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const isIncome = type === 'Income'; const dateValue = transaction?.transactionDate || new Date().toISOString().slice(0, 10); return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><form className="modal" onSubmit={onSubmit}><div className="modal-heading"><div><span className="eyebrow">{isIncome ? 'Money in' : 'Money out'}</span><h2>{transaction ? 'Edit' : 'Add'} {type.toLowerCase()}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><div className={`transaction-type-banner ${isIncome ? 'income-banner' : 'expense-banner'}`}>{isIncome ? '＋ Recording money you earned' : '− Recording money you spent'}</div><label>Amount <div className="amount-input"><span>RWF</span><input name="amount" type="number" placeholder="0" defaultValue={transaction?.amount || ''} autoFocus required /></div></label><label>{isIncome ? 'Source' : 'Description'}<input name="description" defaultValue={transaction?.description || ''} placeholder={isIncome ? 'e.g. Salary or freelance payment' : 'e.g. Lunch with a friend'} required /></label><div className="form-row"><label>Category<select name="category" defaultValue={transaction?.category || (isIncome ? 'Income' : 'Food')}>{isIncome ? <><option>Income</option><option>Salary</option><option>Freelance</option><option>Other</option></> : <><option>Food</option><option>Transport</option><option>Bills</option><option>Entertainment</option><option>Other</option></>}</select></label>{!isIncome && <label>Need or want<select name="need" defaultValue={transaction?.need || 'Need'}><option>Need</option><option>Want</option></select></label>}</div><label>Date<input name="date" type="date" defaultValue={dateValue} /></label><button className={`primary full ${isIncome ? 'income-submit' : ''}`} type="submit">Save {type.toLowerCase()}</button></form></div> }

export default App
