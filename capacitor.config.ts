import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.teamseason',
  appName: 'Team Season',
  webDir: 'dist',
  server: {
    // In production, the app loads from the local bundle
    // For dev, uncomment the url below to point at your Vite dev server:
    // url: 'http://192.168.1.XXX:3001',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1B4332',
    preferredContentMode: 'mobile',
    scheme: 'Team Season',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#1B4332',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_team_season',
      iconColor: '#1B4332',
      sound: 'default',
    },
    Camera: {
      presentationStyle: 'fullScreen',
    },
  },
};

export default config;
