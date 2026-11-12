import React from 'react';
import {ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppButton} from './ui/AppButton';
import type {SignedPpkBaHistoryDto} from '../services/api';
import {Colors, Spacing, Typography} from '../theme';
import {formatPeriod} from '../utils/format';

type BaHistorySheetProps = {
  visible: boolean;
  history: SignedPpkBaHistoryDto[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  downloadError: string | null;
  onDownload: (submissionId: string) => void;
  onRetry: () => void;
  onClose: () => void;
};

/** Lembar dari bawah untuk mengunduh BA PPK yang sudah ditandatangani lengkap. */
export const BaHistorySheet: React.FC<BaHistorySheetProps> = ({
  visible,
  history,
  loading,
  error,
  busyId,
  downloadError,
  onDownload,
  onRetry,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

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
              Unduh berita acara yang sudah ditandatangani lengkap.
            </Text>
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
            {!loading && !error && history.length === 0 ? (
              <Text style={styles.stateText}>
                Belum ada berita acara yang ditandatangani lengkap.
              </Text>
            ) : null}
            {!loading && !error
              ? history.map(item => (
                  <View key={item.id} style={styles.item}>
                    {item.ba_number ? (
                      <Text style={styles.number}>Nomor {item.ba_number}</Text>
                    ) : null}
                    <AppButton
                      accessibilityLabel={`Unduh BA ${formatPeriod(item.period)}`}
                      label={
                        busyId === item.id
                          ? 'Menyiapkan unduhan…'
                          : `Unduh BA ${formatPeriod(item.period)}`
                      }
                      icon="download"
                      variant="outline"
                      fullWidth
                      disabled={busyId !== null}
                      loading={busyId === item.id}
                      onPress={() => onDownload(item.id)}
                    />
                  </View>
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
            disabled={busyId !== null}
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
  scroll: {flexShrink: 1},
  list: {gap: Spacing.md, paddingBottom: Spacing.sm},
  item: {gap: Spacing.xs},
  number: {...Typography.caption, color: Colors.text.muted},
  stateRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  stateText: {...Typography.body, color: Colors.text.muted},
  error: {...Typography.body, color: Colors.status.error},
});
