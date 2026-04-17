import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Screens
import LoginScreen from '../screens/LoginScreen';
import OTPScreen from '../screens/OTPScreen';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen from '../screens/TasksScreen';
import ScanScreen from '../screens/ScanScreen';
import CollectionScreen from '../screens/CollectionScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HistoryScreen from '../screens/HistoryScreen';

// Types
import { RootStackParamList, MainTabParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Placeholder components for navigation structure
const PlaceholderScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text>Screen</Text>
  </View>
);

// Tab Navigator
const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'home';

          if (route.name === 'Dashboard') {
            iconName = 'view-dashboard';
          } else if (route.name === 'Tasks') {
            iconName = 'clipboard-list';
          } else if (route.name === 'Scan') {
            iconName = 'qrcode-scan';
          } else if (route.name === 'History') {
            iconName = 'history';
          } else if (route.name === 'Profile') {
            iconName = 'account';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#1E88E5',
        tabBarInactiveTintColor: 'gray',
        headerStyle: {
          backgroundColor: '#1E88E5',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Beranda' }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ title: 'Tugas' }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Scan', headerShown: false }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'Riwayat' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil' }}
      />
    </Tab.Navigator>
  );
};

// Auth Stack
const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
    </Stack.Navigator>
  );
};

// Main App Navigator
const AppNavigator = () => {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
};

export default AppNavigator;