import type { NavigatorScreenParams } from '@react-navigation/native';
import type { Task } from '@lazisnu/shared-types';

export type RootStackParamList = {
  Login: undefined;
  OTP: { phone: string };
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Collection: { task: Task };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Scan: undefined;
  History: undefined;
  Profile: undefined;
};
