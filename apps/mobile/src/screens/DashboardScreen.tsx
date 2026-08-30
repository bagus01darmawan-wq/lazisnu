import React, {useEffect, useState} from 'react';
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
import Svg, {Circle} from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore, useDashboardStore, useSyncStore, useTasksStore} from '../stores';
import {Colors, Layout, Radius, Shadows, Spacing, Typography} from '../theme';
import {formatCurrency, getInitials} from '../utils';
import {AppPressable, SegmentedControl} from '../components/ui';
import {SyncIssuesSheet} from '../components/SyncIssuesSheet';
import type {MainNavigationProp} from '../navigation/types';

const logo = require('../assets/branding/logo-lazisnu-putih.png');

type PeriodFilter = 'today' | 'week';

const PERIOD_OPTIONS: {label: string; value: PeriodFilter}[] = [
  {label: 'Hari Ini', value: 'today'},
  {label: 'Minggu Ini', value: 'week'},
];

const RING_SIZE = 74;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

// Ring progres via react-native-svg: lintas emas terisi sesuai progres
// (strokeDasharray), mulai dari arah jam 12.
const RingProgress: React.FC<{progress: number}> = ({progress}) => {
  const clamped = Math.max(0, Math.min(1, progress));
  const percent = Math.round(clamped * 100);

  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={Colors.overlay.lightSubtle}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {clamped > 0 && (
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={Colors.brand.mutedSand}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRC * clamped} ${RING_CIRC}`}
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        )}
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringPercent}>{percent}%</Text>
        <Text style={styles.ringCaption}>TUGAS</Text>
      </View>
    </View>
  );
};

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<MainNavigationProp>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(state => state.user);
  const {todayStats, weekStats, monthStats, yesterdayStats, fetchDashboard, isLoading, error} =
    useDashboardStore();
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
  const [issuesVisible, setIssuesVisible] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>('today');

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

  const periodStats = period === 'today' ? todayStats : weekStats;
  const periodNominal = periodStats?.total_nominal || 0;
  const periodCollected = periodStats?.collected || 0;

  // Chip tren: perbandingan nominal periode aktif terhadap nominal kemarin.
  // Periode belum ada nominal atau tanpa data kemarin → 0% (konsisten antar
  // segmen, tidak menampilkan -100% saat hari berjalan masih kosong).
  const yesterdayNominal = yesterdayStats?.total_nominal || 0;
  const chipPct =
    periodNominal > 0 && yesterdayNominal > 0
      ? Math.round(((periodNominal - yesterdayNominal) / yesterdayNominal) * 100)
      : 0;
  const chipUp = chipPct >= 0;

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
        {text: 'Lihat Detail', onPress: () => setIssuesVisible(true)},
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
          <Image source={logo} style={styles.heroWatermark} resizeMode={'contain'} />
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
                <Text style={styles.avatarText}>{getInitials(user?.full_name)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.greeting}>Assalamu’alaikum, {firstName}</Text>
          <Text style={styles.date}>{date}</Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.mainCard}>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              style={styles.periodControl}
            />
            <Text style={styles.totalLabel}>TOTAL INFAK TERKUMPUL</Text>
            <View style={styles.totalRow}>
              <Text
                style={styles.totalValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}>
                {formatCurrency(periodNominal)}
              </Text>
              <View
                style={[styles.trendChip, !chipUp && {backgroundColor: Colors.surface.errorSoft}]}>
                <Icon
                  name={chipUp ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={chipUp ? Colors.status.success : Colors.status.error}
                />
                <Text style={[styles.trendChipText, !chipUp && {color: Colors.status.error}]}>
                  {chipPct}%
                </Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <View style={[styles.metaIcon, {backgroundColor: Colors.surface.successSoft}]}>
                  <Icon name={'hand-heart-outline'} size={18} color={Colors.brand.emerald} />
                </View>
                <View style={styles.metaTextWrap}>
                  <Text style={styles.metaNum}>{periodCollected}</Text>
                  <Text style={styles.metaTxt}>Kaleng dijemput</Text>
                </View>
              </View>
              <View style={styles.metaDivider} />
              <AppPressable
                accessibilityRole={totalSyncIssues ? 'button' : undefined}
                accessibilityLabel={
                  totalSyncIssues ? `${totalSyncIssues} data belum tersinkronisasi` : undefined
                }
                disabled={!totalSyncIssues}
                onPress={openSyncIssue}
                style={styles.metaItem}>
                <View style={[styles.metaIcon, {backgroundColor: Colors.surface.warningSoft}]}>
                  <Icon name={'cloud-sync-outline'} size={18} color={Colors.brand.accentGold} />
                </View>
                <View style={styles.metaTextWrap}>
                  <Text style={styles.metaNum}>{totalWaiting}</Text>
                  <Text style={styles.metaTxt}>Menunggu sinkron</Text>
                </View>
              </AppPressable>
            </View>
          </View>

          <LinearGradient
            colors={[Colors.brand.heroStart, Colors.brand.heroEnd]}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={styles.monthCard}>
            <View style={styles.monthTextWrap}>
              <Text style={styles.monthLabel}>BULAN INI</Text>
              <Text
                style={styles.monthValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}>
                {formatCurrency(monthStats?.total_nominal || 0)}
              </Text>
              <Text style={styles.monthSub}>
                {monthStats?.collected || 0} kaleng · {monthTaskCompleted} dari {monthTaskTotal}{' '}
                tugas
              </Text>
            </View>
            <RingProgress progress={monthTaskProgress} />
          </LinearGradient>

          {!!error && !isLoading && (
            <AppPressable
              accessibilityRole={'button'}
              accessibilityLabel={'Coba lagi memperbarui ringkasan'}
              style={styles.errorBanner}
              onPress={refresh}>
              <Icon name={'alert-circle-outline'} size={20} color={Colors.status.error} />
              <Text style={styles.errorText}>
                Ringkasan gagal diperbarui. Ketuk untuk mencoba lagi.
              </Text>
            </AppPressable>
          )}

          <AppPressable
            accessibilityRole={'button'}
            accessibilityLabel={'Buka statistik rekap rentang tanggal'}
            onPress={() => navigation.navigate('RangeStats')}
            style={styles.rekapRow}>
            <View style={styles.rekapIcon}>
              <Icon name={'chart-bar'} size={20} color={Colors.brand.accentGold} />
            </View>
            <View style={styles.rekapTextWrap}>
              <Text style={styles.rekapTitle}>Lihat Rekap Lengkap</Text>
              <Text style={styles.rekapSub}>Statistik per rentang tanggal</Text>
            </View>
            <Icon name={'chevron-right'} size={24} color={Colors.text.secondary} />
          </AppPressable>
        </View>
      </ScrollView>
      <SyncIssuesSheet visible={issuesVisible} onClose={() => setIssuesVisible(false)} />
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
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
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
  avatarText: {
    color: Colors.brand.deepGreen,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  greeting: {...Typography.heading1, color: Colors.text.white, fontSize: 23, lineHeight: 29},
  date: {...Typography.body, color: Colors.text.white, opacity: 0.86, marginTop: Spacing.xs},
  heroWatermark: {
    position: 'absolute',
    right: -140,
    bottom: -92,
    width: 440,
    height: 233,
    opacity: 0.12,
  },
  body: {paddingHorizontal: Layout.screenPadding},
  mainCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    padding: Layout.cardPadding,
    ...Shadows.medium,
  },
  periodControl: {backgroundColor: Colors.surface.sunken},
  totalLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    letterSpacing: 0.6,
    marginTop: Spacing.md,
  },
  totalValue: {
    color: Colors.brand.deepGreen,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface.successSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
  },
  trendChipText: {fontSize: 11, fontWeight: '700', color: Colors.status.success},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border.warm,
    borderStyle: 'dashed',
  },
  metaItem: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10},
  metaIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaTextWrap: {flex: 1},
  metaNum: {
    color: Colors.brand.deepGreen,
    fontSize: 16,
    fontWeight: '700',
  },
  metaTxt: {...Typography.caption, color: Colors.text.secondary, marginTop: 1},
  metaDivider: {
    width: 1,
    height: 34,
    backgroundColor: Colors.border.warm,
    marginHorizontal: Spacing.sm,
  },
  monthCard: {
    marginTop: Spacing.md,
    borderRadius: Radius.panel,
    padding: Layout.cardPadding + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    ...Shadows.medium,
  },
  monthTextWrap: {flex: 1},
  monthLabel: {
    ...Typography.caption,
    color: Colors.text.white,
    opacity: 0.72,
    letterSpacing: 0.6,
  },
  monthValue: {
    color: Colors.text.white,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  monthSub: {
    ...Typography.caption,
    color: Colors.text.white,
    opacity: 0.72,
    marginTop: 5,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {color: Colors.text.white, fontSize: 16, fontWeight: '800'},
  ringCaption: {
    color: Colors.text.white,
    opacity: 0.66,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 1,
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
  rekapRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.card,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    borderRadius: Radius.lg,
    padding: Layout.cardPadding,
    gap: 12,
  },
  rekapIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.avatar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rekapTextWrap: {flex: 1},
  rekapTitle: {...Typography.label, color: Colors.brand.deepGreen},
  rekapSub: {...Typography.caption, color: Colors.text.secondary, marginTop: 1},
});

export default DashboardScreen;
