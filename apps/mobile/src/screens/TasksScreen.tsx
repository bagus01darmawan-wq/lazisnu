import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import type {Task} from '@lazisnu/shared-types';
import {useTasksStore, useSyncStore} from '../stores';
import {Colors, DashboardLayout, Layout, Radius, Spacing, Typography} from '../theme';
import type {MainNavigationProp} from '../navigation/types';
import {TaskItem, TaskSearchBar} from './tasks';

const TasksScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<MainNavigationProp>();
  const {
    pendingCount,
    permanentFailedCount,
    pendingCorrectionsCount,
    failedCorrectionsCount,
    checkStatus,
    triggerSync,
  } = useSyncStore();
  const totalSyncIssues =
    pendingCount + permanentFailedCount + pendingCorrectionsCount + failedCorrectionsCount;
  const {tasks, fetchTasks, loadMore, isLoading, error, page, totalPages, fetchStats} =
    useTasksStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTasks();
    fetchStats();
    checkStatus();
  }, [checkStatus, fetchTasks, fetchStats]);

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
    ToastAndroid.show('Kode QR disalin', ToastAndroid.SHORT);
  }, []);

  const filteredTasks = tasks.filter(task => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return true;
    }
    return (
      task.owner_name?.toLowerCase().includes(query) ||
      task.owner_address?.toLowerCase().includes(query) ||
      task.qr_code?.toLowerCase().includes(query)
    );
  });

  const renderTaskItem = useCallback(
    ({item, index}: {item: Task; index: number}) => (
      <TaskItem
        item={item}
        index={index}
        onCopy={copyToClipboard}
        onPress={task => navigation.navigate('TaskDetail', {task})}
      />
    ),
    [copyToClipboard, navigation],
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Icon
          name={'clipboard-check-outline'}
          size={44}
          color={Colors.brand.deepGreen}
        />
      </View>
      <Text style={styles.emptyTitle}>Semua tugas selesai</Text>
      <Text style={styles.emptyText}>
        Tidak ada penjemputan yang masih menunggu.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.brand.heroStart, Colors.brand.deepGreen, Colors.brand.heroEnd]}
        style={[styles.header, {paddingTop: insets.top + Spacing.lg}]}>
        <View pointerEvents={'none'} style={styles.heroArcOuter} />
        <View pointerEvents={'none'} style={styles.heroArcInner} />

        <View style={styles.titleRow}>
          <Text style={styles.headerTitle}>Daftar Tugas</Text>
          <TouchableOpacity
            accessibilityRole={totalSyncIssues ? 'button' : undefined}
            accessibilityLabel={
              totalSyncIssues ? `${totalSyncIssues} data belum tersinkronisasi` : undefined
            }
            disabled={!totalSyncIssues}
            activeOpacity={totalSyncIssues ? 0.8 : 1}
            onPress={() => {
              Alert.alert(
                'Data Belum Terkirim',
                'Penjemputan dan koreksi tetap aman tersimpan di perangkat. Aplikasi akan mencoba mengirim kembali secara otomatis.',
                [
                  {text: 'Nanti', style: 'cancel'},
                  {text: 'Lihat Detail', onPress: () => navigation.navigate('History')},
                  {text: 'Coba Kirim Lagi', onPress: () => triggerSync()},
                ],
              );
            }}
            style={styles.iconButton}>
            <Icon
              name={
                permanentFailedCount || failedCorrectionsCount
                  ? 'cloud-alert'
                  : pendingCount || pendingCorrectionsCount
                    ? 'cloud-sync-outline'
                    : 'cloud-check-outline'
              }
              size={28}
              color={Colors.text.white}
            />
            {!!totalSyncIssues && (
              <View style={styles.syncCountBadge}>
                <Text style={styles.syncCountText}>{totalSyncIssues}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.headerSubtitle}>
          {isLoading && page === 1 ? 'Memuat penugasan...' : `${tasks.length} tugas ditampilkan`}
        </Text>

        <TaskSearchBar
          searchQuery={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />
      </LinearGradient>

      {!!error && !isLoading && (
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Coba lagi memuat tugas'}
          onPress={() => fetchTasks()}
          style={styles.errorBanner}>
          <Icon name={'alert-circle-outline'} size={20} color={Colors.status.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Coba lagi</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={filteredTasks}
        renderItem={renderTaskItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size={'large'} color={Colors.brand.emerald} />
              <Text style={styles.loadingText}>Memuat tugas...</Text>
            </View>
          ) : (
            renderEmpty
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading && page === 1}
            onRefresh={() => {
              fetchTasks();
              fetchStats();
              checkStatus();
            }}
            colors={[Colors.brand.emerald]}
            tintColor={Colors.brand.emerald}
          />
        }
        onEndReached={() => {
          if (!isLoading && page < totalPages) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoading && page > 1 ? (
            <ActivityIndicator style={styles.loadingFooter} color={Colors.brand.emerald} />
          ) : null
        }
        showsVerticalScrollIndicator={false}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  header: {
    overflow: 'hidden',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.md,
    borderBottomLeftRadius: DashboardLayout.heroCornerRadius,
    borderBottomRightRadius: DashboardLayout.heroCornerRadius,
  },
  heroArcOuter: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: Colors.overlay.sandSoft,
    top: -200,
    right: -132,
  },
  heroArcInner: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: Colors.overlay.sandSubtle,
    top: -156,
    right: -102,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncCountBadge: {
    position: 'absolute',
    right: -5,
    top: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.status.error,
  },
  syncCountText: {
    ...Typography.caption,
    color: Colors.text.white,
    fontWeight: '700',
    fontSize: 11,
  },
  headerTitle: {
    ...Typography.heading1,
    color: Colors.text.white,
    fontSize: 23,
    lineHeight: 29,
  },
  headerSubtitle: {
    ...Typography.body,
    color: Colors.text.white,
    opacity: 0.86,
    marginTop: Spacing.xs,
  },
  listContainer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  errorBanner: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Layout.screenPadding,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.errorSoft,
  },
  errorText: {
    flex: 1,
    ...Typography.caption,
    color: Colors.status.error,
  },
  retryText: {
    ...Typography.label,
    color: Colors.status.error,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  loadingText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...Typography.heading3,
    color: Colors.text.primary,
    marginTop: Spacing.md,
  },
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 20,
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
  },
});

export default TasksScreen;
