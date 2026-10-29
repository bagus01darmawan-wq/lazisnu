import React from 'react';
import {ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppButton} from './ui/AppButton';
import type {BaTextDto} from '../services/api';
import {Colors, Radius, Spacing, Typography} from '../theme';

type BaPreviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  ba: BaTextDto | null;
  loading?: boolean;
  error?: string | null;
};

/**
 * Lembar BACA-SAJA isi berita acara — dibuka dari kartu setoran di
 * SetoranScreen supaya PPK sempat membaca dokumennya sebelum membubuhkan
 * tanda tangan, seperti memeriksa kertas sebelum menandatangani.
 *
 * Tidak ada kanvas maupun tombol kirim di sini: menandatangani tetap lewat
 * SignSheet, sehingga membaca dan menandatangani tidak tercampur dalam satu
 * layar.
 */
export const BaPreviewSheet: React.FC<BaPreviewSheetProps> = ({
  visible,
  onClose,
  ba,
  loading = false,
  error = null,
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
          <Text style={styles.title}>Draf Berita Acara</Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.stateRow}>
                <ActivityIndicator color={Colors.brand.emerald} />
                <Text style={styles.hint}>Memuat isi berita acara…</Text>
              </View>
            ) : null}
            {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && !error && ba ? (
              <>
                <Text style={styles.docTitle}>{ba.title}</Text>
                <Text style={styles.meta}>
                  {[
                    ba.form_code,
                    ba.ba_number ? `Nomor: ${ba.ba_number}` : null,
                    ba.period ? `Periode ${ba.period}` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
                {ba.draft_warning ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>{ba.draft_warning}</Text>
                  </View>
                ) : null}
                {ba.table.length > 0 ? (
                  <View style={styles.table}>
                    {ba.table.map(row => (
                      <View key={row.label} style={styles.tableRow}>
                        <Text style={styles.tableLabel}>{row.label}</Text>
                        <Text style={styles.tableValue}>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {ba.statements.length > 0 ? (
                  <View style={styles.statements}>
                    {ba.statements.map((line, i) => (
                      <Text key={`${i}-${line.slice(0, 12)}`} style={styles.line}>
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <AppButton label="Tutup" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end'},
  sheet: {
    maxHeight: '92%',
    backgroundColor: Colors.surface.page,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
  title: {...Typography.heading3},
  scroll: {flexShrink: 1},
  scrollBody: {gap: Spacing.sm, paddingBottom: Spacing.md},
  stateRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  hint: {...Typography.caption, color: Colors.text.muted},
  error: {...Typography.body, color: Colors.status.error},
  docTitle: {...Typography.heading3, fontWeight: '700'},
  meta: {...Typography.caption, color: Colors.text.muted},
  warningBox: {
    backgroundColor: Colors.surface.warningSoft,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  warningText: {...Typography.caption, color: Colors.status.warning, fontWeight: '600'},
  table: {gap: Spacing.xs, marginTop: Spacing.xs},
  tableRow: {flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md},
  tableLabel: {...Typography.body, color: Colors.text.muted, flexShrink: 1},
  tableValue: {...Typography.body, color: Colors.text.primary, fontWeight: '600'},
  statements: {gap: Spacing.xs, marginTop: Spacing.xs},
  line: {...Typography.body, color: Colors.text.primary},
  actions: {flexDirection: 'row', gap: Spacing.sm},
});
