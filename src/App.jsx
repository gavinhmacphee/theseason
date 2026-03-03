import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { TeamProvider, useTeam } from './hooks/useTeam'
import { SeasonsProvider, useSeasons } from './hooks/useSeasons'
import { EntriesProvider } from './hooks/useEntries'
import Toast from './components/ui/Toast'
import LoadingScreen from './components/ui/LoadingScreen'
import AuthScreen from './components/auth/AuthScreen'
import TeamSetupScreen from './components/setup/TeamSetupScreen'
import HomePage from './pages/HomePage'

function AppRouter() {
  const { loading: authLoading, session } = useAuth()
  const { team, loading: teamLoading } = useTeam()
  const { activeSeason, loading: seasonLoading } = useSeasons()

  // Auth loading
  if (authLoading) return <LoadingScreen />

  // Not signed in
  if (!session) return <AuthScreen />

  // Loading team data
  if (teamLoading || seasonLoading) return <LoadingScreen />

  // No team yet — setup
  if (!team || !activeSeason) return <TeamSetupScreen />

  // Main app
  return <HomePage />
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <TeamProvider>
          <SeasonsProvider>
            <EntriesProvider>
              <AppRouter />
              <Toast />
            </EntriesProvider>
          </SeasonsProvider>
        </TeamProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
