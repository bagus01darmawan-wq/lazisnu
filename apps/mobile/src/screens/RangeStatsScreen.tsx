import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {RangeStatsResponse} from '@lazisnu/shared-types';
import {tasksService} from '../services/api';
import {AppHeader, RangeCalendar} from '../components/ui';
import {Colors, Layout, Radius, Shadows, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils';

const toISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDateLabel = (d: Date | null): string =>
  d
    ? `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()]} ${d.getFullYear()}`
    : '…';

interface Preset {
  label: string;
  build: () => [Date, Date];
}

const PRESET_HARI_INI: Preset = {
  label: 'Hari ini',
  build: () => {
    const today = new Date();
    return [new Date(today.getFullYear(), today.getMonth(), today.getDate()), new Date(today)];
  },
};

const PRESET_BULAN_INI: Preset = {
  label: 'Bulan ini',
  build: () => {
    const now = new Date();
    return [new Date(now.getFullYear(), now.getMonth(), 1), now];
  },
};

const PRESETS: Preset[] = [
  PRESET_HARI_INI,
  {
    label: '7 hari',
    build: () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      return [start, end];
    },
  },
  PRESET_BULAN_INI,
  {
    label: 'Bulan lalu',
    build: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return [start, end];
    },
  },
];

/**
 * Statistik akumulasi dalam rentang tanggal bebas:
 * penjemputan + infak, dan progres tugas dari seluruh periode yang tersentuh.
 */
const RangeStatsScreen: React.FC = () => {
  const navigation = useNavigation();

  // Default rentang: awal bulan berjalan s/d hari ini.
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [stats, setStats] = useState<RangeStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Terapkan preset "Bulan ini" sebagai kondisi awal.
  useEffect(() => {
    const [s, e] = PRESET_BULAN_INI.build();
    setStartDate(s);
    setEndDate(e);
  }, []);

  const fetchStats = useCallback(async (start: Date, end: Date) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await tasksService.getRangeStats(toISODate(start), toISODate(end));
      if (result.success && result.data) {
        setStats(result.data);
      } else {
        setError(result.error?.message || 'Gagal memuat statistik');
      }
    } catch {
      setError('Tidak dapat terhubung ke server. Periksa koneksi internet.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchStats(startDate, endDate);
    }
  }, [startDate, endDate, fetchStats]);

  const handleCalendarChange = useCallback((start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    const [s, e] = preset.build();
    setStartDate(s);
    setEndDate(e);
  }, []);

  const rangeComplete = !!startDate && !!endDate;
  const taskProgress = useMemo(
    () => (stats && stats.task_total ? stats.task_completed / stats.task_total : 0),
    [stats],
  );

  return (
    <View style={styles.screen}>
      <AppHeader variant={'stack'} title={'Statistik Rentang'} onBack={() => navigation.goBack()} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {/* Pintasan preset */}
          <View style={styles.presetRow}>
            {PRESETS.map(preset => (
              <TouchableOpacity
                key={preset.label}
                accessibilityRole={'button'}
                accessibilityLabel={`Rentang ${preset.label}`}
                style={styles.presetChip}
                onPress={() => applyPreset(preset)}>
                <Text style={styles.presetText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Kalender */}
          <View style={styles.calendarCard}>
            <RangeCalendar
              startDate={startDate}
              endDate={endDate}
              onChange={handleCalendarChange}
              maxSpanDays={366}
            />
          </View>

          {/* Ringkasan rentang */}
          <View style={styles.rangeCard}>
            <View style={styles.rangeRow}>
              <Icon name={'calendar-range'} size={18} color={Colors.brand.emerald} />
              <Text style={styles.rangeText}>
                {formatDateLabel(startDate)} — {formatDateLabel(endDate)}
              </Text>
            </View>

            {!rangeComplete && (
              <Text style={styles.hintText}>Pilih tanggal mulai, lalu tanggal akhir.</Text>
            )}

            {rangeComplete && isLoading && (
              <View style={styles.stateBox}>
                <Icon name={'loading'} size={22} color={Colors.text.secondary} />
                <Text style={styles.hintText}>Memuat statistik…</Text>
              </View>
            )}

            {rangeComplete && !isLoading && !!error && (
              <TouchableOpacity
                accessibilityRole={'button'}
                accessibilityLabel={'Coba lagi memuat statistik'}
                style={styles.stateBox}
                onPress={() => startDate && endDate && fetchStats(startDate, endDate)}>
                <Icon name={'alert-circle-outline'} size={22} color={Colors.status.error} />
                <Text style={[styles.hintText, styles.errorText]}>{error}</Text>
                <Text style={styles.retryText}>Ketuk untuk mencoba lagi</Text>
              </TouchableOpacity>
            )}

            {rangeComplete && !isLoading && !error && stats && (
              <>
                <View style={styles.statGrid}>
                  <StatBlock
                    icon={'package-variant-closed'}
                    value={`${stats.collected}`}
                    label={'Penjemputan'}
                  />
                  <StatBlock
                    icon={'cash-multiple'}
                    value={formatCurrency(stats.total_nominal)}
                    label={'Total Infak'}
                  />
                  <StatBlock
                    icon={'progress-check'}
                    value={`${stats.task_active}`}
                    label={'Tugas Belum'}
                  />
                  <StatBlock
                    icon={'check-circle-outline'}
                    value={`${stats.task_completed}/${stats.task_total}`}
                    label={'Tugas Selesai'}
                  />
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, {width: `${Math.round(taskProgress * 100)}%`}]}
                  />
                </View>
                {!!stats.months_covered.length && (
                  <Text style={styles.monthsText}>
                    Mencakup periode tugas: {stats.months_covered.join(', ')}
                  </Text>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const StatBlock = ({icon, value, label}: {icon: string; value: string; label: string}) => (
  <View style={styles.statBlock}>
    <Icon name={icon} size={18} color={Colors.brand.emerald} />
    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    padding: Layout.screenPadding,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  presetChip: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    backgroundColor: Colors.surface.card,
  },
  presetText: {
    ...Typography.label,
    color: Colors.brand.deepGreen,
  },
  calendarCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Spacing.lg,
    ...Shadows.medium,
  },
  rangeCard: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.panel,
    borderWidth: 1,
    borderColor: Colors.border.accent,
    padding: Layout.cardPadding,
    ...Shadows.medium,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  rangeText: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    flex: 1,
  },
  hintText: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
  },
  stateBox: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  errorText: {
    color: Colors.status.error,
    textAlign: 'center',
  },
  retryText: {
    ...Typography.caption,
    color: Colors.brand.emerald,
    fontWeight: '600',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.lg,
  },
  statBlock: {
    width: '50%' as const,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    fontWeight: '800',
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  progressTrack: {
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.progressTrack,
    marginTop: Spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.emerald,
  },
  monthsText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});

export default RangeStatsScreen;
