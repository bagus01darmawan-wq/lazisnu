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
import {Colors, DashboardLayout, Layout, Radius, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils';
import type {MainNavigationProp} from '../navigation/types';

const logo = require('../assets/branding/logo-lazisnu-putih.png');

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<MainNavigationProp>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(state => state.user);
  const {todayStats, monthStats, fetchDashboard, isLoading, error} = useDashboardStore();
  const {fetchStats} = useTasksStore();
  const {
    pendingCount,
    permanentFailedCount,
    pendingCorrectionsCount,
    failedCorrectionsCount,
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
  const monthTaskTotal = monthStats?.task_total || 0;
  const monthTaskCompleted = monthStats?.task_completed || 0;
  const monthTaskProgress = monthTaskTotal ? monthTaskCompleted / monthTaskTotal : 0;
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
              <TouchableOpacity
                accessibilityRole={totalSyncIssues ? 'button' : undefined}
                accessibilityLabel={
                  totalSyncIssues ? `${totalSyncIssues} data belum tersinkronisasi` : undefined
                }
                disabled={!totalSyncIssues}
                activeOpacity={totalSyncIssues ? 0.8 : 1}
                onPress={openSyncIssue}
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
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hari Ini</Text>
            <View style={styles.statsRow}>
              <View style={styles.statWide}>
                <Text
                  style={styles.statValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}>
                  {formatCurrency(todayStats?.total_nominal || 0)}
                </Text>
                <Text style={styles.statLabel}>Total Infak</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statNarrow}>
                <Text
                  style={styles.statValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}>
                  {`${collected}`}
                </Text>
                <Text style={styles.statLabel}>Dijemput</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionGap} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bulan Ini</Text>
            <View style={styles.statsRow}>
              <View style={styles.statWide}>
                <Text
                  style={styles.statValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}>
                  {formatCurrency(monthStats?.total_nominal || 0)}
                </Text>
                <Text style={styles.statLabel}>Total Infak</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statNarrow}>
                <Text
                  style={styles.statValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}>
                  {`${monthStats?.collected || 0}`}
                </Text>
                <Text style={styles.statLabel}>Dijemput</Text>
              </View>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {width: `${Math.round(monthTaskProgress * 100)}%`},
              ]}
            />
          </View>
          <View style={styles.progressLine}>
            <Text style={styles.progressCaption}>
              {monthTaskCompleted} dari {monthTaskTotal} tugas selesai
            </Text>
            <Text style={styles.progressCaption}>{Math.round(monthTaskProgress * 100)}%</Text>
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

          <TouchableOpacity
            accessibilityRole={'button'}
            accessibilityLabel={'Buka statistik rekap rentang tanggal'}
            onPress={() => navigation.navigate('RangeStats')}
            activeOpacity={0.7}
            style={styles.rekapRow}>
            <Text style={styles.sectionTitle}>Lihat Rekap</Text>
            <Icon name={'chevron-right'} size={24} color={Colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: Colors.surface.page},
  scrollContent: {paddingBottom: Spacing.xl},
  hero: {
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
  body: {paddingHorizontal: Layout.screenPadding},
  section: {},
  sectionTitle: {...Typography.heading3, color: Colors.brand.deepGreen},
  statsRow: {flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md},
  statWide: {flex: 2.35, alignItems: 'flex-start'},
  statNarrow: {flex: 1, alignItems: 'center'},
  statValue: {color: Colors.brand.deepGreen, fontSize: 24, lineHeight: 31, fontWeight: '600'},
  statLabel: {...Typography.bodySmall, color: Colors.text.secondary, marginTop: 2},
  statDivider: {
    width: 1,
    height: 54,
    backgroundColor: Colors.border.summary,
    marginHorizontal: 14,
  },
  sectionGap: {height: Spacing.lg},
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.progressTrack,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: {height: '100%', borderRadius: Radius.pill, backgroundColor: Colors.brand.emerald},
  progressLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  progressCaption: {...Typography.caption, color: Colors.text.secondary},
  rekapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingVertical: 4,
  },
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
});

export default DashboardScreen;
