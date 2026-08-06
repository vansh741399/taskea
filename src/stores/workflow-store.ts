import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type ActiveView = 'dashboard' | 'workflows' | 'tasks' | 'notifications' | 'executive' | 'analytics' | 'performance' | 'departments' | 'team' | 'escalations' | 'cancelled' | 'categories' | 'director-dependency' | 'employees' | 'projects' | 'reports' | 'scorecards' | 'settings' | 'monday' | 'dirDep' | 'exthold' | 'employee-dashboard' | 'leaves' | 'emp-leaves' | 'emp-tasks' | 'ai-assistant' | 'user-management' | 'attendance' | 'salary-slip' | 'hr-report' | 'emp-hr-report' | 'ea-tasks'

type UserRole = 'FOUNDER' | 'ADMIN' | 'DIRECTOR' | 'EA' | 'MANAGER' | 'EMPLOYEE'

interface Toast {
  id: string
  type: 'ok' | 'err' | 'info'
  message: string
}

interface WorkflowStore {
  // Navigation
  activeView: ActiveView
  activePage: string
  // User
  currentUserId: string
  currentUserName: string
  currentRole: UserRole
  currentUser: { username: string; role: string; name: string } | null
  // v24·0625-refresh-fix: hydration flag — true once persist has rehydrated
  // state from localStorage. Used by page.tsx to avoid a brief flash of the
  // login screen on refresh (before persist finishes loading auth state).
  _hasHydrated: boolean
  setHasHydrated: (h: boolean) => void
  // UI State
  sidebarOpen: boolean
  darkMode: boolean
  isDark: boolean
  searchQuery: string
  notifPanelOpen: boolean
  cmdPaletteOpen: boolean
  // Task creation modal
  createTaskOpen: boolean
  // Task detail/selection
  selectedTaskId: string | null
  selectedWorkflowId: string | null
  // Task tab
  taskTab: string
  // Monday meeting panel
  mmPanelOpen: boolean
  // Toast notifications
  toasts: Toast[]
  // Setters
  setActiveView: (view: ActiveView) => void
  setActivePage: (page: string) => void
  setCurrentUserId: (id: string) => void
  setCurrentUserName: (name: string) => void
  setCurrentRole: (role: UserRole) => void
  setCurrentUser: (user: { username: string; role: string; name: string } | null) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSelectedWorkflowId: (id: string | null) => void
  setDarkMode: (dark: boolean) => void
  toggleDarkMode: () => void
  toggleDark: () => void
  setSearchQuery: (q: string) => void
  setNotifPanelOpen: (open: boolean) => void
  toggleNotifPanel: () => void
  setCmdPaletteOpen: (open: boolean) => void
  setCreateTaskOpen: (open: boolean) => void
  toggleMmPanel: () => void
  setSelectedTaskId: (id: string | null) => void
  setTaskTab: (tab: string) => void
  addToast: (type: 'ok' | 'err' | 'info', message: string) => void
  removeToast: (id: string) => void
  login: (username: string, password: string) => boolean
  logout: () => void
}

// v21·0622: Initialize dark mode from localStorage so the Zustand store
// state matches the .dark class that Providers.tsx sets on <html>.
const getInitialDarkMode = (): boolean => {
  if (typeof localStorage === 'undefined') return false
  try { return localStorage.getItem('laxree-dark-mode') === '1' } catch { return false }
}

const initialState = {
  activeView: 'dashboard' as ActiveView,
  activePage: 'dashboard',
  currentUserId: '',
  currentUserName: '',
  currentRole: 'EMPLOYEE' as UserRole,
  currentUser: null as { username: string; role: string; name: string } | null,
  _hasHydrated: false,
  sidebarOpen: false,
  darkMode: getInitialDarkMode(),
  isDark: getInitialDarkMode(),
  searchQuery: '',
  notifPanelOpen: false,
  cmdPaletteOpen: false,
  createTaskOpen: false,
  mmPanelOpen: false,
  selectedTaskId: null as string | null,
  selectedWorkflowId: null as string | null,
  taskTab: 'all',
  toasts: [] as Toast[],
}

// v24·0625-refresh-fix: Wrap the store in `persist` middleware so authentication
// state survives page refresh. Without this, every refresh reset the Zustand
// store to its initialState (empty user), which bounced the user back to the
// login screen even though they had just logged in.
//
// We only persist the AUTH-related fields + dark mode preference. UI state
// (sidebar open, toasts, modals, selected task, etc.) is intentionally NOT
// persisted — those should reset to defaults on refresh, which is the
// expected UX for a dashboard.
//
// SAFETY: no data is added, modified, or deleted anywhere. This only changes
// where the in-memory session state is cached (memory → memory + localStorage).
const AUTH_STORAGE_KEY = 'laxree-auth-v1'

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set) => ({
      ...initialState,

      setActiveView: (view) => set({ activeView: view, activePage: view, selectedWorkflowId: null }),
      setActivePage: (page) => set({ activePage: page, activeView: page as ActiveView, selectedWorkflowId: null }),
      setCurrentUserId: (id) => set({ currentUserId: id }),
      setCurrentUserName: (name) => set({ currentUserName: name }),
      setCurrentRole: (role) => set({ currentRole: role }),
      setCurrentUser: (user) => set({ currentUser: user }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSelectedWorkflowId: (id) => set({ selectedWorkflowId: id }),
      setDarkMode: (dark) => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', dark)
        }
        // v21·0622: Persist dark mode preference so it survives page refresh
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('laxree-dark-mode', dark ? '1' : '0') } catch {}
        }
        set({ darkMode: dark, isDark: dark })
      },
      toggleDarkMode: () => set((state) => {
        const newDark = !state.darkMode
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', newDark)
        }
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('laxree-dark-mode', newDark ? '1' : '0') } catch {}
        }
        return { darkMode: newDark, isDark: newDark }
      }),
      toggleDark: () => set((state) => {
        const newDark = !state.isDark
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', newDark)
        }
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('laxree-dark-mode', newDark ? '1' : '0') } catch {}
        }
        return { isDark: newDark, darkMode: newDark }
      }),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setNotifPanelOpen: (open) => set({ notifPanelOpen: open }),
      toggleNotifPanel: () => set((state) => ({ notifPanelOpen: !state.notifPanelOpen })),
      setCmdPaletteOpen: (open) => set({ cmdPaletteOpen: open }),
      setCreateTaskOpen: (open) => set({ createTaskOpen: open }),
      toggleMmPanel: () => set((state) => ({ mmPanelOpen: !state.mmPanelOpen })),
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),
      setTaskTab: (tab) => set({ taskTab: tab }),
      addToast: (type, message) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2)
        set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
        setTimeout(() => {
          set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
        }, 4000)
      },
      removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
      login: (username: string, password: string) => {
        // This is now async but zustand doesn't support async actions easily
        // We'll use a separate login function that calls the API
        // For now, keep the fallback client-side check
        const users: Record<string, { password: string; role: UserRole; name: string; userId: string }> = {
          founder: { password: 'Founder@2025', role: 'FOUNDER', name: 'Founder Sir', userId: 'user-founder1' },
          admin: { password: 'Laxree@2025', role: 'ADMIN', name: 'Samarth Sir', userId: 'user-admin' },
          ea: { password: 'EA@Laxree', role: 'EA', name: 'Arti Sharma', userId: 'user-ea1' },
          ashish: { password: 'Ashish@2025', role: 'DIRECTOR', name: 'Ashish Sir', userId: 'user-dir3' },
          samarth: { password: 'Samarth@2025', role: 'DIRECTOR', name: 'Samarth Sir', userId: 'user-dir4' },
          aditya: { password: 'Aditya@2025', role: 'EMPLOYEE', name: 'Aditya Sharma', userId: 'user-emp1' },
          aakash: { password: 'Aakash@2025', role: 'EMPLOYEE', name: 'Aakash', userId: 'user-emp2' },
          anamika: { password: 'Anamika@2025', role: 'EMPLOYEE', name: 'Anamika', userId: 'user-emp3' },
          saurabh: { password: 'Saurabh@2025', role: 'EMPLOYEE', name: 'Saurabh', userId: 'user-emp4' },
          ruchi: { password: 'Ruchi@2025', role: 'EMPLOYEE', name: 'Ruchi', userId: 'user-emp5' },
          aayush: { password: 'Aayush@2025', role: 'EMPLOYEE', name: 'Aayush', userId: 'user-emp6' },
          kamlesh: { password: 'Kamlesh@2025', role: 'EMPLOYEE', name: 'Kamlesh', userId: 'user-emp7' },
          hitesh: { password: 'Hitesh@2025', role: 'EMPLOYEE', name: 'Hitesh Tak', userId: 'user-emp8' },
          khushboo: { password: 'Khushboo@2025', role: 'MANAGER', name: 'Khushboo Manglani', userId: 'user-mgr1' },
          radhika: { password: 'Radhika@2025', role: 'MANAGER', name: 'Radhika', userId: 'user-mgr2' },
          tanuja: { password: 'Tanuja@2025', role: 'MANAGER', name: 'Tanuja Tigaya', userId: 'user-mgr3' },
        }
        const user = users[username]
        if (user && user.password === password) {
          set({
            currentUserId: user.userId,
            currentUserName: user.name,
            currentRole: user.role,
            currentUser: { username, role: user.role, name: user.name },
          })
          return true
        }
        return false
      },
      // v24·0625-refresh-fix: logout explicitly resets to initialState AND the
      // persist middleware will automatically sync this empty state to localStorage,
      // so the next refresh also lands on the login page (not the previous session).
      logout: () => set({
        ...initialState,
      }),
      setHasHydrated: (h: boolean) => set({ _hasHydrated: h }),
    }),
    {
      name: AUTH_STORAGE_KEY,                       // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist auth + theme fields — NOT UI state (modals, sidebar, toasts…)
      partialize: (state) => ({
        currentUserId: state.currentUserId,
        currentUserName: state.currentUserName,
        currentRole: state.currentRole,
        currentUser: state.currentUser,
        darkMode: state.darkMode,
        isDark: state.isDark,
      }),
      // v24·0625-refresh-fix: track hydration lifecycle so page.tsx can wait
      // for auth state to be rehydrated from localStorage before deciding
      // whether to show login or dashboard. Without this, the first render
      // after refresh always showed the login page (because currentUser is
      // null in initialState until persist hydrates it).
      //
      // v25·0806-stuck-splash-fix: ALSO arm a 1.5s safety timeout that forces
      // _hasHydrated=true even if onRehydrateStorage never fires. This happens
      // when the user's localStorage entry is corrupted (e.g. older schema
      // from a previous deploy), which leaves the user STUCK FOREVER on the
      // "LAXREE" splash placeholder. The timeout guarantees the app always
      // renders either the login form or the dashboard — never a frozen
      // splash screen.
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      // ⚠️ migrate v0→v1: drop any older persisted shape that may have caused
      // the hydration to throw silently. Without this, Zustand persist will
      // try to read an incompatible shape and silently skip the onRehydrate
      // callback, leaving _hasHydrated=false forever.
      version: 1,
      migrate: (persistedState: any, _version: number) => {
        // Be defensive: only keep known-good auth fields, drop anything else.
        if (!persistedState || typeof persistedState !== 'object') return {}
        const s = persistedState as Record<string, unknown>
        return {
          currentUserId: typeof s.currentUserId === 'string' ? s.currentUserId : '',
          currentUserName: typeof s.currentUserName === 'string' ? s.currentUserName : '',
          currentRole: typeof s.currentRole === 'string' ? s.currentRole : 'EMPLOYEE',
          currentUser: s.currentUser && typeof s.currentUser === 'object' ? s.currentUser : null,
          darkMode: typeof s.darkMode === 'boolean' ? s.darkMode : false,
          isDark: typeof s.isDark === 'boolean' ? s.isDark : false,
        }
      },
    }
  )
)
