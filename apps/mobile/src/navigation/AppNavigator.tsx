import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator, BottomTabBarProps} from '@react-navigation/bottom-tabs';
import React, {useEffect, useRef} from 'react';
import {
  View,
  ActivityIndicator,
  Image,
  StyleSheet,
  AppState,
  type AppStateStatus,
} from 'react-native';

// Screens
import LoginScreen from '../screens/LoginScreen';
import OTPScreen from '../screens/OTPScreen';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen from '../screens/TasksScreen';
import ScanScreen from '../screens/ScanScreen';
import CollectionScreen from '../screens/CollectionScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RangeStatsScreen from '../screens/RangeStatsScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import SetoranScreen from '../screens/SetoranScreen';
import PersetujuanScreen from '../screens/PersetujuanScreen';
import KeuanganScreen from '../screens/KeuanganScreen';
import RekapScreen from '../screens/RekapScreen';

// Types
import {RootStackParamList, MainTabParamList} from './types';
import {useAuthStore, useSyncStore, useUpdateStore} from '../stores';
import {normalizeRole, tabsForRole, TAB_TITLES, type TabName} from '../roles/roleMap';
import {Colors, Spacing} from '../theme';
import UpdateModal from '../components/UpdateModal';
import FloatingTabBar from '../components/FloatingTabBar';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const logo = require('../assets/branding/logo-lazisnu-putih.png');

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.brand.deepGreen,
  },
  logo: {width: 180, height: 96, marginBottom: Spacing.xl},
});

// Splash ringan selama initializeAuth() berjalan. Tanpa ini, UI akan
// flash ke LoginScreen lalu ke MainTabs pada cold start dengan token valid.
const SplashScreen = () => (
  <View style={splashStyles.container}>
    <Image source={logo} style={splashStyles.logo} resizeMode="contain" />
    <ActivityIndicator size="large" color={Colors.brand.accentGold} />
  </View>
);

// Tab Navigator — C1-T9: susunan tab mengikuti peran (1 APK beda kartu).
// PPK tidak berubah; Scan (FAB) hanya dirender untuk PPK.
const TAB_COMPONENTS: Record<TabName, React.ComponentType> = {
  Dashboard: DashboardScreen,
  Tasks: TasksScreen,
  Scan: ScanScreen,
  History: HistoryScreen,
  Profile: ProfileScreen,
  Persetujuan: PersetujuanScreen,
  Keuangan: KeuanganScreen,
  Rekap: RekapScreen,
};

const MainTabs = () => {
  const role = normalizeRole(useAuthStore(state => state.user?.role));
  const tabs = tabsForRole(role);
  return (
    <Tab.Navigator screenOptions={{headerShown: false}} tabBar={renderTabBar}>
      {tabs.map(name => (
        <Tab.Screen
          key={name}
          name={name}
          component={TAB_COMPONENTS[name]}
          options={
            name === 'Scan'
              ? {title: TAB_TITLES[name], headerShown: false, unmountOnBlur: true}
              : {title: TAB_TITLES[name]}
          }
        />
      ))}
    </Tab.Navigator>
  );
};
// Tab Navigator
const renderTabBar = (props: BottomTabBarProps) => <FloatingTabBar {...props} />;

// Authenticated Stack
// MainTabs adalah layar utama, sedangkan Collection hanya dapat dibuka
// melalui alur scan dengan parameter task yang valid.
const MainStack = () => {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Collection" component={CollectionScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <Stack.Screen
        name="RangeStats"
        component={RangeStatsScreen}
        options={{title: 'Statistik Rentang'}}
      />
      <Stack.Screen name="Setoran" component={SetoranScreen} options={{title: 'Setoran'}} />
    </Stack.Navigator>
  );
};

// Auth Stack
const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
    </Stack.Navigator>
  );
};

// Main App Navigator
const AppNavigator = () => {
  const {isAuthenticated, isInitializing} = useAuthStore();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Cek pembaruan sekali setiap kali aplikasi dibuka (setelah login).
  // Senyap: modal hanya muncul bila memang ada versi lebih baru.
  useEffect(() => {
    if (isAuthenticated && !isInitializing) {
      useUpdateStore.getState().checkOnLaunch();
    }
  }, [isAuthenticated, isInitializing]);

  // C1-T9: auto-sync saat aplikasi kembali ke depan (foreground). Guard
  // SYNC_IN_PROGRESS ada di dalam triggerSync — panggilan ganda aman.
  // Pengingat deadline tampil di layar peran (reminderFor); push asli = T11.
  useEffect(() => {
    if (!isAuthenticated || isInitializing) return;
    const sub = AppState.addEventListener('change', next => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        const {isSyncing, triggerSync} = useSyncStore.getState();
        if (!isSyncing) {
          triggerSync().catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, isInitializing]);

  // Selama initializeAuth() berjalan, tampilkan splash agar UI tidak
  // flash ke LoginScreen saat ternyata token masih valid.
  if (isInitializing) {
    return (
      <NavigationContainer>
        <SplashScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
      {/* Modal pembaruan (Tingkat 1) — melayang di atas semua layar */}
      <UpdateModal />
    </NavigationContainer>
  );
};

export default AppNavigator;
