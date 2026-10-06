import type {NavigatorScreenParams, CompositeNavigationProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {Task} from '@lazisnu/shared-types';

export type RootStackParamList = {
  Login: undefined;
  OTP: {phone: string};
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Collection: {task: Task};
  TaskDetail: {task: Task};
  RangeStats: undefined;
  // C1-T9: setoran PPK (status/TTD/BA/riwayat versi) via stack (stabil tab PPK).
  Setoran: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Scan: undefined;
  History: undefined;
  Profile: undefined;
  // C1-T9: tab peran (1 APK, tampil beda per kartu — roles/roleMap.tabsForRole).
  Persetujuan: undefined;
  Keuangan: undefined;
  Rekap: undefined;
};

export type MainNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

export type AuthNavigationProp = NativeStackNavigationProp<RootStackParamList>;
