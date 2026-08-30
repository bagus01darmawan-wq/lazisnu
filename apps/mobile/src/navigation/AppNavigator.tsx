import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator, BottomTabBarProps} from '@react-navigation/bottom-tabs';
import React, {useEffect} from 'react';
import {View, ActivityIndicator, Image, StyleSheet} from 'react-native';

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

// Types
import {RootStackParamList, MainTabParamList} from './types';
import {useAuthStore, useUpdateStore} from '../stores';
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

// Tab Navigator
const renderTabBar = (props: BottomTabBarProps) => <FloatingTabBar {...props} />;

const MainTabs = () => {
  return (
    <Tab.Navigator screenOptions={{headerShown: false}} tabBar={renderTabBar}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{title: 'Beranda'}} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{title: 'Tugas'}} />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{title: 'Scan', headerShown: false, unmountOnBlur: true}}
      />
      <Tab.Screen name="History" component={HistoryScreen} options={{title: 'Riwayat'}} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{title: 'Profil'}} />
    </Tab.Navigator>
  );
};

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

  // Cek pembaruan sekali setiap kali aplikasi dibuka (setelah login).
  // Senyap: modal hanya muncul bila memang ada versi lebih baru.
  useEffect(() => {
    if (isAuthenticated && !isInitializing) {
      useUpdateStore.getState().checkOnLaunch();
    }
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
