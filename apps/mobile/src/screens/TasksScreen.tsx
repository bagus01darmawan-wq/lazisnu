import React, {memo, useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {FadeInUp, Layout as AnimatedLayout} from 'react-native-reanimated';
import type {Task} from '@lazisnu/shared-types';
import {useTasksStore, useSyncStore} from '../stores';
import {AppCard, SegmentedControl, StatusBadge} from '../components/ui';
import {Colors, DashboardLayout, Layout, Radius, Shadows, Spacing, Typography} from '../theme';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

const formatPeriod = (period: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) {
    return period;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const TaskItem = memo(
  ({
    item,
    index,
    onCopy,
    onSkip,
  }: {
    item: Task;
    index: number;
    onCopy: (text: string) => void;
    onSkip: (taskId: string) => void;
  }) => {
    const active = item.status === 'ACTIVE';

    return (
      <Animated.View
        entering={FadeInUp.delay(index * 40).duration(320)}
        layout={AnimatedLayout.springify()}>
        <AppCard variant={'elevated'} style={styles.taskCard}>
          <View style={styles.taskHeading}>
            <View style={styles.taskIcon}>
              <Icon
                name={'package-variant-closed'}
                size={24}
                color={Colors.brand.deepGreen}
              />
            </View>
            <View style={styles.taskIdentity}>
              <Text style={styles.ownerName} numberOfLines={1}>
                {item.owner_name}
              </Text>
              <Text style={styles.ownerAddress} numberOfLines={2}>
                {item.owner_address || 'Alamat belum tersedia'}
              </Text>
            </View>
            <StatusBadge
              status={active ? 'pending' : item.status === 'UNCOLLECTED' ? 'warning' : 'success'}
              label={active ? 'Belum' : item.status === 'UNCOLLECTED' ? 'Terlewat' : 'Selesai'}
            />
          </View>

          <View style={styles.metaRow}>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Salin kode QR'}
              onPress={() => onCopy(item.qr_code)}
              style={styles.qrChip}>
              <Icon name={'qrcode'} size={16} color={Colors.brand.deepGreen} />
              <Text style={styles.qrCode} numberOfLines={1}>
                {item.qr_code}
              </Text>
              <Icon name={'content-copy'} size={14} color={Colors.text.muted} />
            </TouchableOpacity>
            <View style={styles.periodChip}>
              <Icon name={'calendar-month-outline'} size={15} color={Colors.text.muted} />
              <Text style={styles.periodText}>{formatPeriod(item.period)}</Text>
            </View>
          </View>

          {item.last_collection && (
            <View style={styles.lastCollection}>
              <View>
                <Text style={styles.lastCollectionLabel}>Penjemputan terakhir</Text>
                <Text style={styles.lastCollectionAmount}>
                  {formatCurrency(item.last_collection.nominal)}
                </Text>
              </View>
              <Icon name={'history'} size={22} color={Colors.brand.mutedTeal} />
            </View>
          )}

          {active && (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tandai tidak dijemput'}
              onPress={() => onSkip(item.id)}
              style={styles.skipButton}>
              <Icon name={'cancel'} size={16} color={Colors.status.warning} />
              <Text style={styles.skipText}>Tidak Dijemput</Text>
            </TouchableOpacity>
          )}

          {!active && item.status === 'UNCOLLECTED' && (
            <View style={styles.uncollectedBadge}>
              <Icon name={'alert-circle-outline'} size={17} color={Colors.status.warning} />
              <Text style={styles.uncollectedText}>Terlewat</Text>
            </View>
          )}


        </AppCard>
      </Animated.View>
    );
  },
);

const logo = require('../assets/branding/logo-lazisnu-putih.png');

const Stat = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.stat}>
    <Text
      style={styles.statValue}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.72}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const TasksScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { pendingCount, permanentFailedCount, checkStatus, triggerSync } = useSyncStore();
  const totalSyncIssues = pendingCount + permanentFailedCount;
  const {
    tasks,
    fetchTasks,
    loadMore,
    isLoading,
    error,
    page,
    totalPages,
    activeCount,
    completedCount,
    totalCount,
    completedNominal,
    fetchStats,
    skipAssignment,
    completePeriod,
  } = useTasksStore();
  const [filter, setFilter] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchTasks(filter);
    fetchStats();
    checkStatus();
  }, [checkStatus, filter, fetchTasks, fetchStats]);

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
    ToastAndroid.show('Kode QR disalin', ToastAndroid.SHORT);
  }, []);


  const handleSearch = (text: string) => {
    setSearchQuery(text);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handleSkip = useCallback((taskId: string) => {
    Alert.alert(
      'Tandai Tidak Dijemput',
      'Tandai kaleng ini sebagai tidak dijemput untuk periode berjalan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Tandai',
          onPress: async () => {
            const ok = await skipAssignment(taskId);
            if (!ok) {
              Alert.alert('Gagal', 'Gagal menandai kaleng. Pastikan koneksi internet tersedia.');
            }
          },
        },
      ],
    );
  }, [skipAssignment]);

  const handleCompletePeriod = useCallback(() => {
    if (activeCount === 0) { return; }
    Alert.alert(
      'Selesai Periode',
      `Anda memiliki ${activeCount} kaleng yang belum dijemput. Tandai semua sebagai selesai dan lanjut ke periode berikutnya?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Selesaikan',
          onPress: async () => {
            const result = await completePeriod();
            if (result.error) {
              Alert.alert('Gagal', result.error);
            } else if (result.skipped > 0) {
              Alert.alert('Berhasil', `${result.skipped} kaleng ditandai tidak dijemput. Periode berjalan selesai.`);
            }
          },
        },
      ],
    );
  }, [activeCount, completePeriod]);

  const filteredTasks = tasks.filter(task => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {return true;}
    return (
      task.owner_name?.toLowerCase().includes(query) ||
      task.owner_address?.toLowerCase().includes(query) ||
      task.qr_code?.toLowerCase().includes(query)
    );
  });

  const progress = totalCount ? completedCount / totalCount : 0;

  const renderTaskItem = useCallback(
    ({item, index}: {item: Task; index: number}) => (
      <TaskItem
        item={item}
        index={index}
        onCopy={copyToClipboard}
        onSkip={handleSkip}
      />
    ),
    [copyToClipboard, handleSkip],
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Icon
          name={filter === 'ACTIVE' ? 'clipboard-check-outline' : 'clipboard-text-outline'}
          size={44}
          color={Colors.brand.deepGreen}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {filter === 'ACTIVE' ? 'Semua tugas selesai' : 'Belum ada tugas'}
      </Text>
      <Text style={styles.emptyText}>
        {filter === 'ACTIVE'
          ? 'Tidak ada penjemputan yang masih menunggu.'
          : 'Daftar tugas pada kategori ini masih kosong.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.brand.heroStart, Colors.brand.deepGreen, Colors.brand.heroEnd]}
        style={[styles.header, {paddingTop: insets.top + Spacing.md}]}>
        <View pointerEvents={'none'} style={styles.heroArcOuter} />
        <View pointerEvents={'none'} style={styles.heroArcInner} />

        <View style={styles.topRow}>
          <View style={styles.logoContainer}>
            <Image source={logo} style={styles.logo} resizeMode={'contain'} />
          </View>
          <View style={styles.topActions}>
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
                  'Penjemputan tetap aman tersimpan di perangkat. Aplikasi akan mencoba mengirim kembali secara otomatis.',
                  [
                    { text: 'Nanti', style: 'cancel' },
                    { text: 'Lihat Detail', onPress: () => navigation.navigate('History') },
                    { text: 'Coba Kirim Lagi', onPress: () => triggerSync() },
                  ],
                );
              }}
              style={styles.iconButton}>
              <Icon
                name={
                  permanentFailedCount
                    ? 'cloud-alert'
                    : pendingCount
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
        </View>

        <Text style={styles.headerTitle}>Daftar Tugas</Text>
        <Text style={styles.headerSubtitle}>
          {isLoading && page === 1
            ? 'Memuat penugasan...'
            : `${tasks.length} tugas ditampilkan`}
        </Text>

        <View style={styles.searchContainer}>
          <Icon name={'magnify'} size={24} color={Colors.brand.deepGreen} />
          <TextInput
            placeholder={'Cari nama donatur atau alamat...'}
            placeholderTextColor={Colors.brand.deepGreen + '70'}
            value={searchQuery}
            onChangeText={handleSearch}
            style={styles.searchInput}
            autoCapitalize={'none'}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Icon name={'close-circle'} size={20} color={Colors.brand.deepGreen} />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Progres Tugas</Text>
          <View style={styles.statsRow}>
            <Stat value={`${activeCount}`} label={'Belum'} />
            <View style={styles.statDivider} />
            <Stat value={`${completedCount}`} label={'Selesai'} />
            <View style={styles.statDivider} />
            <Stat value={`${totalCount}`} label={'Semua'} />
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressHeading}>
            <Text style={styles.progressLabel}>
              {formatCurrency(completedNominal)} terjemput
            </Text>
            <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          {activeCount > 0 && (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Selesaikan periode berjalan'}
              onPress={handleCompletePeriod}
              style={styles.completePeriodButton}>
              <Icon name={'flag-checkered'} size={18} color={Colors.status.warning} />
              <Text style={styles.completePeriodText}>Selesai Periode ({activeCount} belum)</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterContainer}>
        <SegmentedControl
          options={[
            {label: 'Belum', value: 'ACTIVE'},
            {label: 'Selesai', value: 'COMPLETED'},
          ]}
          value={filter}
          onChange={value => setFilter(value as typeof filter)}
        />
      </View>

      {!!error && !isLoading && (
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Coba lagi memuat tugas'}
          onPress={() => fetchTasks(filter)}
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
              fetchTasks(filter);
              fetchStats();
              checkStatus();
            }}
            colors={[Colors.brand.emerald]}
            tintColor={Colors.brand.emerald}
          />
        }
        onEndReached={() => {
          if (!isLoading && page < totalPages) {
            loadMore(filter);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoading && page > 1 ? (
            <ActivityIndicator
              style={styles.loadingFooter}
              color={Colors.brand.emerald}
            />
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
    paddingBottom: DashboardLayout.heroBottomPadding,
    borderBottomLeftRadius: DashboardLayout.heroCornerRadius,
    borderBottomRightRadius: DashboardLayout.heroCornerRadius,
  },
  heroArcOuter: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    borderWidth: 1, borderColor: Colors.overlay.sandSoft, top: -200, right: -132,
  },
  heroArcInner: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    borderWidth: 1, borderColor: Colors.overlay.sandSubtle, top: -156, right: -102,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  logoContainer: {
    width: 140,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 22,
  },
  logo: {
    width: 131,
    height: 70,
    tintColor: Colors.text.white,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  notificationDot: {
    position: 'absolute', right: 5, top: 5, width: 9, height: 9,
    borderRadius: Radius.pill, backgroundColor: Colors.status.error,
    borderWidth: 2, borderColor: Colors.brand.deepGreen,
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
  filterContainer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  listContainer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.xs,
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
  taskCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  taskHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.successSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  taskIdentity: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  ownerName: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
  },
  ownerAddress: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 3,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  qrChip: {
    minWidth: 0,
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    backgroundColor: Colors.surface.page,
  },
  qrCode: {
    flex: 1,
    ...Typography.caption,
    color: Colors.text.primary,
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  periodText: {
    ...Typography.caption,
    color: Colors.text.muted,
  },
  lastCollection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.cardMuted,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  lastCollectionLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  lastCollectionAmount: {
    ...Typography.bodySmall,
    fontWeight: '700',
    color: Colors.brand.deepGreen,
    marginTop: 2,
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
  body: {
    paddingHorizontal: Layout.screenPadding,
    marginTop: -DashboardLayout.heroOverlap,
  },
  searchContainer: {
    paddingVertical: Spacing.xs - 2,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand.mutedSand,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.brand.deepGreen,
    paddingVertical: 4,
    height: 40,
  },
  summaryCard: {
    minHeight: 160,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Layout.cardPadding,
    ...Shadows.medium,
  },
  summaryTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    marginBottom: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.brand.deepGreen,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
  },
  statLabel: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 54,
    backgroundColor: Colors.border.summary,
  },
  progressDivider: {
    height: 1,
    backgroundColor: Colors.border.summary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  progressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...Typography.bodySmall,
    color: Colors.brand.deepGreen,
    fontWeight: '600',
  },
  progressPercent: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.progressTrack,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.emerald,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.status.warning + '50',
    alignSelf: 'flex-start',
  },
  skipText: {
    ...Typography.caption,
    color: Colors.status.warning,
    fontWeight: '600',
  },
  uncollectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: '#F59E0B15',
    alignSelf: 'flex-start',
  },
  uncollectedText: {
    ...Typography.caption,
    color: '#D97706',
    fontWeight: '600',
  },
  completePeriodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.status.warning + '60',
    backgroundColor: '#F59E0B12',
  },
  completePeriodText: {
    ...Typography.label,
    color: Colors.status.warning,
  },
});

export default TasksScreen;
