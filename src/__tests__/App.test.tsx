import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { vi } from 'vitest'

// Need to mock child components to isolate App testing and avoid complex contexts
vi.mock('../components/AppShell', () => ({
  AppShell: ({ children, active, onNavigate, statusSlot }: any) => (
    <div data-testid="app-shell" data-active={active}>
      <nav>
        <button onClick={() => onNavigate('dashboard')}>Dashboard</button>
        <button onClick={() => onNavigate('trades')}>Trades</button>
        <button onClick={() => onNavigate('journal')}>Journal</button>
        <button onClick={() => onNavigate('analytics')}>Analytics</button>
        <button onClick={() => onNavigate('settings')}>Settings</button>
        <button onClick={() => onNavigate('about')}>About</button>
      </nav>
      <div data-testid="status-slot">{statusSlot}</div>
      <main>{children}</main>
    </div>
  )
}))

vi.mock('../routes/Dashboard', () => ({ Dashboard: () => <div data-testid="route-dashboard">Dashboard Route</div> }))
vi.mock('../routes/TradeLog', () => ({ TradeLog: () => <div data-testid="route-trades">Trades Route</div> }))
vi.mock('../routes/JournalEntry', () => ({ JournalEntry: () => <div data-testid="route-journal">Journal Route</div> }))
vi.mock('../routes/Analytics', () => ({ Analytics: () => <div data-testid="route-analytics">Analytics Route</div> }))
vi.mock('../routes/Settings', () => ({ Settings: () => <div data-testid="route-settings">Settings Route</div> }))
vi.mock('../routes/About', () => ({ About: () => <div data-testid="route-about">About Route</div> }))
vi.mock('../routes/ErrorLog', () => ({ ErrorLog: () => <div data-testid="route-error">Error Route</div> }))
vi.mock('../routes/TradeEditor', () => ({ TradeEditor: () => <div data-testid="route-editor">Editor Route</div> }))

vi.mock('../components/SyncPanel', () => ({
    SyncPanel: () => <div data-testid="sync-panel">SyncPanel</div>
}))

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('renders dashboard route by default', async () => {
    await act(async () => {
        render(<App />)
    })
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-active', 'dashboard')
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument()
  })

  it('navigates between routes using AppShell onNavigate', async () => {
    const user = userEvent.setup()
    await act(async () => {
        render(<App />)
    })

    await act(async () => {
        await user.click(screen.getByText('Trades'))
    })
    expect(screen.getByTestId('route-trades')).toBeInTheDocument()

    await act(async () => {
        await user.click(screen.getByText('Analytics'))
    })
    expect(screen.getByTestId('route-analytics')).toBeInTheDocument()
  })

  it('handles keyboard shortcuts for navigation (Ctrl+1 to Ctrl+6)', async () => {
    await act(async () => {
        render(<App />)
    })

    // Ctrl+2 -> Trades
    await act(async () => {
        fireEvent.keyDown(window, { key: '2', ctrlKey: true })
    })
    expect(screen.getByTestId('route-trades')).toBeInTheDocument()

    // Ctrl+3 -> Journal
    await act(async () => {
        fireEvent.keyDown(window, { key: '3', ctrlKey: true })
    })
    expect(screen.getByTestId('route-journal')).toBeInTheDocument()

    // Ctrl+4 -> Analytics
    await act(async () => {
        fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    })
    expect(screen.getByTestId('route-analytics')).toBeInTheDocument()

    // Ctrl+5 -> Settings
    await act(async () => {
        fireEvent.keyDown(window, { key: '5', ctrlKey: true })
    })
    expect(screen.getByTestId('route-settings')).toBeInTheDocument()

    // Ctrl+6 -> About
    await act(async () => {
        fireEvent.keyDown(window, { key: '6', ctrlKey: true })
    })
    expect(screen.getByTestId('route-about')).toBeInTheDocument()

    // Ctrl+1 -> Dashboard
    await act(async () => {
        fireEvent.keyDown(window, { key: '1', ctrlKey: true })
    })
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument()
  })

  it('does not trigger keyboard shortcuts when typing in inputs', async () => {
    await act(async () => {
        render(
            <div>
                <input data-testid="test-input" type="text" />
                <textarea data-testid="test-textarea"></textarea>
                <div data-testid="test-contenteditable" contentEditable></div>
                <App />
            </div>
        )
    })

    // By default it is on dashboard
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument()

    const input = screen.getByTestId('test-input')
    await act(async () => {
        // Construct KeyboardEvent to ensure target is the input
        const event = new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })
        Object.defineProperty(event, 'target', { value: input })
        window.dispatchEvent(event)
    })
    // It should STILL be dashboard, not trades
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument()

    const textarea = screen.getByTestId('test-textarea')
    await act(async () => {
        const event = new KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true })
        Object.defineProperty(event, 'target', { value: textarea })
        window.dispatchEvent(event)
    })
    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument()

    const contenteditable = screen.getByTestId('test-contenteditable')
    await act(async () => {
        const event = new KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true })
        Object.defineProperty(event, 'target', { value: contenteditable, writable: false })

        // This makes `target.isContentEditable` return true
        Object.defineProperty(contenteditable, 'isContentEditable', { value: true, configurable: true })

        window.dispatchEvent(event)
    })

    expect(screen.getByTestId('route-dashboard')).toBeInTheDocument()
  })
})
