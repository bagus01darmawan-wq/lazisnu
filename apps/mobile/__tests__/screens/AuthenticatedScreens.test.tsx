import React from 'react';
import renderer, {act} from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockFetchDashboard = jest.fn();
const mockCheckStatus = jest.fn();
const mockFetchTasks = jest.fn();
const mockFetchStats = jest.fn();
const mockFetchCollections = jest.fn();

const mockTask = {
  id: 'assignment-1',
  can_id: 'can-1',
  qr_code: 'LAZ-PNG-25-00001',
  owner_name: 'Ibu Siti Aminah',
  owner_phone: '081234567890',
  owner_address: 'Dukuh Krajan, Paninggaran',
  address: 'Dukuh Krajan, Paninggaran',
  period: 'Juli 2026',
  status: 'ACTIVE',
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

jest.mock('react-native-linear-gradient', () => {
  const {View} = require('react-native');
  return View;
});

jest.mock('react-native-reanimated', () => {
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: {View},
    FadeInUp: {delay: () => ({duration: () => undefined})},
    Layout: {springify: () => undefined},
  };
});

jest.mock('../../src/stores', () => ({
  useAuthStore: (selector?: (state: any) => unknown) => {
    const state = {
      user: {
        id: 'user-1',
        full_name: 'Ahmad Petugas',
        phone: '081234567892',
        role: 'PETUGAS',
        is_active: true,
      },
      logout: jest.fn(),
    };
    return selector ? selector(state) : state;
  },
  useDashboardStore: () => ({
    todayStats: {collected: 4, remaining: 6, total_nominal: 450000},
    pendingTasks: [mockTask],
    fetchDashboard: mockFetchDashboard,
    isLoading: false,
    error: null,
  }),
  useSyncStore: () => ({
    pendingCount: 0,
    permanentFailedCount: 0,
    checkStatus: mockCheckStatus,
    clearFailed: jest.fn(),
  }),
  useTasksStore: () => ({
    tasks: [mockTask],
    fetchTasks: mockFetchTasks,
    fetchStats: mockFetchStats,
    loadMore: jest.fn(),
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    activeCount: 6,
    completedCount: 4,
    totalCount: 10,
    setStats: jest.fn(),
  }),
  useCollectionsStore: () => ({
    collections: [
      {
        id: 'collection-1',
        nominal: 125000,
        collected_at: '2026-07-05T10:00:00.000Z',
        sync_status: 'COMPLETED',
        can: {
          qr_code: mockTask.qr_code,
          owner_name: mockTask.owner_name,
          owner_address: mockTask.owner_address,
        },
      },
    ],
    fetchCollections: mockFetchCollections,
    loadMore: jest.fn(),
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    total: 1,
  }),
  useCollectionStore: () => ({
    submitCollection: jest.fn(),
    isSubmitting: false,
    reset: jest.fn(),
  }),
}));

jest.mock('../../src/services/api', () => ({
  __esModule: true,
  tasksService: {
    getTasks: jest.fn(() =>
      Promise.resolve({
        success: true,
        data: {pagination: {total: 1}},
      }),
    ),
  },
  default: {
    collection: {resubmitCollection: jest.fn()},
  },
}));

import DashboardScreen from '../../src/screens/DashboardScreen';
import TasksScreen from '../../src/screens/TasksScreen';
import HistoryScreen from '../../src/screens/HistoryScreen';
import ProfileScreen from '../../src/screens/ProfileScreen';
import CollectionScreen from '../../src/screens/CollectionScreen';

const render = (element: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!;
};

describe('authenticated screen render smoke tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders DashboardScreen with representative data', () => {
    const tree = render(<DashboardScreen />);
    expect(tree.toJSON()).not.toBeNull();
    expect(mockFetchDashboard).toHaveBeenCalled();
  });

  it('renders TasksScreen with an active task', () => {
    const tree = render(<TasksScreen />);
    expect(tree.toJSON()).not.toBeNull();
    expect(mockFetchTasks).toHaveBeenCalledWith('ACTIVE');
  });

  it('renders HistoryScreen with a completed collection', () => {
    const tree = render(<HistoryScreen />);
    expect(tree.toJSON()).not.toBeNull();
    expect(mockFetchCollections).toHaveBeenCalled();
  });

  it('renders ProfileScreen using authenticated user data', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ProfileScreen />);
    });
    expect(tree!.toJSON()).not.toBeNull();
  });

  it('renders CollectionScreen with a scanned task', () => {
    const navigation = {navigate: mockNavigate, goBack: mockGoBack} as any;
    const route = {params: {task: mockTask}} as any;
    expect(
      render(<CollectionScreen navigation={navigation} route={route} />).toJSON(),
    ).not.toBeNull();
  });
});
