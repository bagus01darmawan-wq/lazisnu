import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {Collection} from '@lazisnu/shared-types';
import {AppButton, AppCard} from '../../components/ui';
import {Colors, Spacing, Typography} from '../../theme';
import {formatCurrency, formatDate} from '../../utils';

export interface HistoryFailureModalProps {
  failureItem: Collection | null;
  isSubmitting: boolean;
  onClose: () => void;
  onRetry: (id: string) => void;
}

export const HistoryFailureModal: React.FC<HistoryFailureModalProps> = ({
  failureItem,
  isSubmitting,
  onClose,
  onRetry,
}) => {
  return (
    <Modal visible={Boolean(failureItem)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <AppCard style={styles.modalCard}>
          <View style={styles.modalHeading}>
            <View>
              <Text style={styles.modalTitle}>Detail Gagal Kirim</Text>
              <Text style={styles.modalSubtitle}>Transaksi tertunda di perangkat</Text>
            </View>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tutup detail'}
              onPress={onClose}
              style={styles.closeButton}>
              <Icon name="close" size={24} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.bodyContent}>
            <Text style={styles.inputLabel}>Kaleng Infaq</Text>
            <Text style={styles.textValue}>
              {failureItem?.can?.owner_name || 'Donatur'} ({failureItem?.can?.qr_code || '-'})
            </Text>

            <Text style={styles.inputLabel}>Nominal</Text>
            <Text style={styles.textValue}>
              {failureItem ? formatCurrency(Number(failureItem.nominal)) : ''}
            </Text>

            <Text style={styles.inputLabel}>Waktu Penjemputan</Text>
            <Text style={styles.textValue}>
              {failureItem ? formatDate(failureItem.collected_at) : ''}
            </Text>

            <Text style={styles.inputLabel}>Jumlah Percobaan</Text>
            <Text style={styles.textValue}>{failureItem?.retry_attempts || 0} kali</Text>

            <Text style={styles.inputLabel}>Pesan Masalah</Text>
            <Text style={[styles.textValue, {color: Colors.status.error}]}>
              {failureItem?.error_message ||
                'Koneksi internet bermasalah. Sistem akan mencoba mengirim kembali secara otomatis.'}
            </Text>
          </View>

          <View style={styles.modalActions}>
            <View style={styles.modalButton}>
              <AppButton
                label={'Tutup'}
                variant={'outline'}
                onPress={onClose}
                disabled={isSubmitting}
                fullWidth
              />
            </View>
            <View style={styles.modalButton}>
              <AppButton
                label={'Kirim Ulang'}
                onPress={() => {
                  if (failureItem) {
                    onRetry(failureItem.id);
                  }
                }}
                loading={isSubmitting}
                fullWidth
              />
            </View>
          </View>
        </AppCard>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: Colors.overlay.dark,
    padding: Spacing.md,
  },
  modalCard: {padding: Spacing.lg},
  modalHeading: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md},
  modalTitle: {...Typography.heading3, color: Colors.brand.deepGreen},
  modalSubtitle: {...Typography.caption, color: Colors.text.secondary, marginTop: 3},
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyContent: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: Spacing.sm,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  textValue: {
    ...Typography.bodySmall,
    color: Colors.text.primary,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  modalActions: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm},
  modalButton: {flex: 1},
});

export default HistoryFailureModal;
