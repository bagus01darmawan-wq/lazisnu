import React, {useEffect} from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore, useDashboardStore, useSyncStore, useTasksStore} from '../stores';
import {SyncBanner} from '../components/ui';
import {Colors, DashboardLayout, Layout, Radius, Shadows, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils';
import type {MainNavigationProp} from '../navigation/types';
import {TaskSummaryCard} from './tasks';
import {MonthProgressCard} from './dashboard';

const logo = require('../assets/branding/logo-lazisnu-putih.png');

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<MainNavigationProp>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(state => state.user);
  const {todayStats, monthStats, fetchDashboard, isLoading, error} = useDashboardStore();
  const {activeCount, completedCount, totalCount, completedNominal, fetchStats} = useTasksStore();
  const {
    pendingCount,
    permanentFailedCount,
    pendingCorrectionsCount,
    failedCorrectionsCount,
    isSyncing,
    checkStatus,
    triggerSync,
  } = useSyncStore();
  const totalWaiting = pendingCount + pendingCorrectionsCount;
  const totalReview = permanentFailedCount + failedCorrectionsCount;
  const totalSyncIssues = totalWaiting + totalReview;

  useEffect(() => {
    fetchDashboard();
    fetchStats();
    checkStatus();
  }, [checkStatus, fetchDashboard, fetchStats]);

  const refresh = () => {
    fetchDashboard();
    fetchStats();
    checkStatus();
  };

  const collected = todayStats?.collected || 0;
  const remaining = todayStats?.remaining || 0;
  const total = collected + remaining;
  const progress = total ? collected / total : 0;
  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'Petugas';
  const date = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const openSyncIssue = () => {
    if (!totalSyncIssues) {
      return;
    }
    Alert.alert(
      'Data Belum Terkirim',
      'Penjemputan dan koreksi tetap aman tersimpan di perangkat. Aplikasi akan mencoba mengirim kembali secara otomatis.',
      [
        {text: 'Nanti', style: 'cancel'},
        {text: 'Lihat Detail', onPress: () => navigation.navigate('History')},
        {text: 'Coba Kirim Lagi', onPress: () => triggerSync()},
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refresh}
            colors={[Colors.brand.emerald]}
            tintColor={Colors.brand.emerald}
          />
        }>
        <LinearGradient
          colors={[Colors.brand.heroStart, Colors.brand.deepGreen, Colors.brand.heroEnd]}
          style={[styles.hero, {paddingTop: insets.top + Spacing.md}]}>
          <View pointerEvents={'none'} style={styles.heroArcOuter} />
          <View pointerEvents={'none'} style={styles.heroArcInner} />

          <View style={styles.topRow}>
            <View style={styles.logoContainer}>
              <Image source={logo} style={styles.logo} resizeMode={'contain'} />
            </View>
            <View style={styles.topActions}>
              {permanentFailedCount ? (
                <TouchableOpacity
                  accessibilityRole={'button'}
                  accessibilityLabel={'Buka data yang gagal dikirim'}
                  onPress={openSyncIssue}
                  style={styles.iconButton}>
                  <Icon name={'bell-alert-outline'} size={28} color={Colors.text.white} />
                  <View style={styles.notificationDot} />
                </TouchableOpacity>
              ) : (
                <View
                  accessible={false}
                  importantForAccessibility={'no-hide-descendants'}
                  style={styles.iconButton}>
                  <Icon name={'bell-outline'} size={28} color={Colors.text.white} />
                </View>
              )}
              <TouchableOpacity
                accessibilityRole={'button'}
                accessibilityLabel={'Buka profil'}
                onPress={() => navigation.navigate('Profile')}
                style={styles.avatar}>
                <Icon name={'account'} size={29} color={Colors.brand.deepGreen} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.greeting}>Assalamu’alaikum, {firstName}</Text>
          <Text style={styles.date}>{date}</Text>

          <SyncBanner
            status={
              isSyncing ? 'syncing' : totalReview ? 'failed' : totalWaiting ? 'offline' : 'synced'
            }
            count={totalSyncIssues || undefined}
            subtext={
              totalSyncIssues
                ? totalReview
                  ? `${totalWaiting} menunggu, ${totalReview} perlu ditinjau`
                  : 'Akan dikirim saat koneksi tersedia'
                : undefined
            }
            onPress={totalSyncIssues ? openSyncIssue : undefined}
            style={styles.syncBanner}
          />
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Ringkasan Hari Ini</Text>
            <View style={styles.statsRow}>
              <Stat value={`${collected}`} label={'Dijemput'} />
              <View style={styles.statDivider} />
              <Stat
                value={formatCurrency(todayStats?.total_nominal || 0)}
                label={'Total Infak'}
                wide
              />
              <View style={styles.statDivider} />
              <Stat value={`${remaining}`} label={'Sisa Tugas'} />
            </View>
            <View style={styles.progressDivider} />
            <View style={styles.progressHeading}>
              <Text style={styles.progressLabel}>
                {collected} dari {total} tugas selesai
              </Text>
              <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} />
            </View>
          </View>

          {!!error && !isLoading && (
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Coba lagi memperbarui ringkasan'}
              style={styles.errorBanner}
              onPress={refresh}>
              <Icon name={'alert-circle-outline'} size={20} color={Colors.status.error} />
              <Text style={styles.errorText}>
                Ringkasan gagal diperbarui. Ketuk untuk mencoba lagi.
              </Text>
            </TouchableOpacity>
          )}

          <MonthProgressCard
            collected={monthStats?.collected || 0}
            nominal={monthStats?.total_nominal || 0}
            taskTotal={monthStats?.task_total || 0}
            taskCompleted={monthStats?.task_completed || 0}
            onPress={() => navigation.navigate('RangeStats')}
          />

          <View style={styles.taskSummaryWrap}>
            <TaskSummaryCard
              activeCount={activeCount}
              completedCount={completedCount}
              totalCount={totalCount}
              completedNominal={completedNominal}
              subtitle={'Rekap akumulasi sepanjang masa'}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const Stat = ({value, label, wide = false}: {value: string; label: string; wide?: boolean}) => (
  <View style={[styles.stat, wide && styles.statWide]}>
    <Text
      style={[styles.statValue, wide && styles.statValueWide]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.72}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: Colors.surface.page},
  scrollContent: {paddingBottom: Spacing.xl},
  hero: {
    overflow: 'hidden',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: DashboardLayout.heroBottomPadding,
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
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
  topActions: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  iconButton: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  notificationDot: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 9,
    height: 9,
    borderRadius: Radius.pill,
    backgroundColor: Colors.status.error,
    borderWidth: 2,
    borderColor: Colors.brand.deepGreen,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.avatar,
    borderWidth: 2,
    borderColor: Colors.text.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {...Typography.heading1, color: Colors.text.white, fontSize: 23, lineHeight: 29},
  date: {...Typography.body, color: Colors.text.white, opacity: 0.86, marginTop: Spacing.xs},
  syncBanner: {
    // Nilai visual (bg/radius/padding/row) disediakan oleh komponen SyncBanner
    // sesuai statusnya — style di sini hanya untuk penempatan di hero.
    marginTop: Spacing.md,
  },
  body: {paddingHorizontal: Layout.screenPadding, marginTop: -DashboardLayout.heroOverlap},
  summaryCard: {
    minHeight: DashboardLayout.summaryMinHeight,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Layout.cardPadding,
    ...Shadows.medium,
  },
  summaryTitle: {...Typography.heading2, color: Colors.brand.deepGreen, marginBottom: Spacing.md},
  statsRow: {flexDirection: 'row', alignItems: 'center'},
  stat: {flex: 0.8, alignItems: 'center'},
  statWide: {flex: 1.6},
  statValue: {color: Colors.brand.deepGreen, fontSize: 27, lineHeight: 33, fontWeight: '800'},
  statValueWide: {fontSize: 19},
  statLabel: {...Typography.bodySmall, color: Colors.text.secondary, marginTop: 2},
  statDivider: {width: 1, height: 54, backgroundColor: Colors.border.summary},
  progressDivider: {
    height: 1,
    backgroundColor: Colors.border.summary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  progressHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  progressLabel: {...Typography.bodySmall, color: Colors.brand.deepGreen, fontWeight: '600'},
  progressPercent: {...Typography.caption, color: Colors.text.secondary},
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.progressTrack,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {height: '100%', borderRadius: Radius.pill, backgroundColor: Colors.brand.emerald},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface.errorSoft,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  errorText: {...Typography.caption, color: Colors.status.error, flex: 1},
  taskSummaryWrap: {
    marginTop: Spacing.md,
  },
});

export default DashboardScreen;
