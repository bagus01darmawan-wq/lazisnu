import React from 'react';
import {ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppButton} from './ui/AppButton';
import {AppPressable} from './ui/AppPressable';
import type {KeuanganHistoryItemDto} from '../services/api';
import {Colors, Spacing, Typography} from '../theme';
import {formatPeriod, periodKeyOf} from '../utils/format';

export interface PeriodValue {
  year: number;
  month: number;
}

type KeuanganHistorySheetProps = {
  visible: boolean;
  period: PeriodValue;
  /** Dipanggil saat panah periode ditekan — parent mengganti periode & memuat ulang. */
  onPeriodChange: (period: PeriodValue) => void;
  items: KeuanganHistoryItemDto[];
  loading: boolean;
  error: string | null;
  downloadingId: string | null;
  downloadError: string | null;
  onDownload: (submissionId: string) => void;
  onRetry: () => void;
  onClose: () => void;
};

/** Asia/Jakarta (UTC+7, tanpa DST) — batas maju panah periode. */
export const currentJakartaPeriod = (): PeriodValue => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {year: d.getUTCFullYear(), month: d.getUTCMonth() + 1};
};

const periodIndex = (p: PeriodValue) => p.year * 12 + (p.month - 1);

const shiftPeriod = (p: PeriodValue, delta: number): PeriodValue => {
  const idx = periodIndex(p) + delta;
  return {year: Math.floor(idx / 12), month: (idx % 12) + 1};
};

/**
 * Lembar unduh BA final ranting — satu periode sekaligus, satu baris per PPK.
 * Daftar panjang dihindari: panah ‹ › memindahkan periode, bukan scroll tahun.
 */
export const KeuanganHistorySheet: React.FC<KeuanganHistorySheetProps> = ({
  visible,
  period,
  onPeriodChange,
  items,
  loading,
  error,
  downloadingId,
  downloadError,
  onDownload,
  onRetry,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const periodIdx = periodIndex(period);
  const currentIdx = periodIndex(currentJakartaPeriod());
  const canGoNext = periodIdx < currentIdx;
  const periodLabel = formatPeriod(periodKeyOf(period));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, Spacing.md)}]}>
          <View style={styles.heading}>
            <Text style={styles.title}>Riwayat Berita Acara</Text>
            <Text style={styles.subtitle}>
              Unduh BA final ranting yang sudah Anda tandatangani.
            </Text>
          </View>

          <View style={styles.periodRow}>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Periode sebelumnya"
              onPress={() => onPeriodChange(shiftPeriod(period, -1))}
              style={styles.periodButton}>
              <Icon name="chevron-left" size={26} color={Colors.brand.deepGreen} />
            </AppPressable>
            <Text style={styles.periodLabel}>{periodLabel}</Text>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Periode berikutnya"
              accessibilityState={{disabled: !canGoNext}}
              disabled={!canGoNext}
              onPress={() => canGoNext && onPeriodChange(shiftPeriod(period, 1))}
              style={styles.periodButton}>
              <Icon
                name="chevron-right"
                size={26}
                color={canGoNext ? Colors.brand.deepGreen : Colors.border.warm}
              />
            </AppPressable>
          </View>

          {downloadError ? <Text style={styles.error}>{downloadError}</Text> : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.stateRow}>
                <ActivityIndicator color={Colors.brand.emerald} />
                <Text style={styles.stateText}>Memuat riwayat berita acara…</Text>
              </View>
            ) : null}
            {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && !error && items.length === 0 ? (
              <Text style={styles.stateText}>
                Belum ada BA final periode {periodLabel}. BA yang sudah Anda tandatangani akan
                muncul di sini.
              </Text>
            ) : null}
            {!loading && !error
              ? items.map(item => (
                  <AppButton
                    key={item.id}
                    label={`Unduh BA ${formatPeriod(periodKeyOf(period))} - ${
                      item.officer_name ?? 'PPK'
                    }`}
                    icon="download"
                    variant="outline"
                    fullWidth
                    disabled={downloadingId !== null}
                    loading={downloadingId === item.id}
                    onPress={() => onDownload(item.id)}
                  />
                ))
              : null}
          </ScrollView>

          {error && !loading ? (
            <AppButton label="Coba muat ulang" variant="outline" onPress={onRetry} />
          ) : null}
          <AppButton
            label="Tutup"
            variant="secondary"
            onPress={onClose}
            disabled={downloadingId !== null}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {
    maxHeight: '80%',
    backgroundColor: Colors.surface.page,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  heading: {gap: Spacing.xs},
  title: {...Typography.heading3},
  subtitle: {...Typography.caption, color: Colors.text.muted},
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border.warm,
  },
  periodButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
  },
  scroll: {flexShrink: 1},
  list: {gap: Spacing.sm, paddingVertical: Spacing.xs},
  stateRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  stateText: {...Typography.bodySmall, color: Colors.text.muted, lineHeight: 20},
  error: {...Typography.bodySmall, color: Colors.status.error},
});
