import React from 'react';
import {FlatList, Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton, AppCard} from '../../components/ui';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {formatCurrency, formatDate} from '../../utils';
import type {QueuedCorrection} from '../../services/offline/corrections';

export interface HistoryCorrectionFailureModalProps {
  visible: boolean;
  items: QueuedCorrection[];
  onClose: () => void;
  onDismiss: (correctionId: string) => void;
}

/**
 * Daftar koreksi yang DITOLAK server (gagal permanen) — mis. NOT_LATEST:
 * record sudah dikoreksi jalur lain, sehingga user harus koreksi ulang
 * dari data terbaru. Tampilan kembali ke nominal server; entri di sini
 * hanya jejak agar penolakan tidak hilang tanpa jejak.
 */
export const HistoryCorrectionFailureModal: React.FC<HistoryCorrectionFailureModalProps> = ({
  visible,
  items,
  onClose,
  onDismiss,
}) => {
  return (
    <Modal visible={visible} transparent animationType={'fade'} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <AppCard style={styles.modalCard}>
          <View style={styles.modalHeading}>
            <View style={styles.headingContent}>
              <Text style={styles.modalTitle}>Koreksi Ditolak Server</Text>
              <Text style={styles.modalSubtitle}>
                Koreksi ulang dari data terbaru bila masih diperlukan
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tutup daftar koreksi ditolak'}
              onPress={onClose}
              style={styles.closeButton}>
              <Icon name={'close'} size={24} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={items}
            keyExtractor={item => item.correction_id}
            style={styles.list}
            renderItem={({item}) => (
              <View style={styles.itemCard}>
                <Text style={styles.itemNominal}>
                  {formatCurrency(item.nominal_lama)} → {formatCurrency(item.nominal_baru)}
                </Text>
                <Text style={styles.itemMeta}>{formatDate(item.created_at)}</Text>
                <Text style={styles.itemReason}>“{item.alasan_resubmit}”</Text>
                <Text style={styles.itemError}>
                  {item.error_message || 'Koreksi ditolak server.'}
                </Text>
                <TouchableOpacity
                  accessibilityRole={'button'}
                  accessibilityLabel={'Hapus catatan koreksi ditolak'}
                  onPress={() => onDismiss(item.correction_id)}
                  style={styles.dismissButton}>
                  <Icon name={'delete-outline'} size={16} color={Colors.status.error} />
                  <Text style={styles.dismissText}>Hapus Catatan</Text>
                </TouchableOpacity>
              </View>
            )}
          />

          <View style={styles.modalActions}>
            <AppButton label={'Tutup'} variant={'outline'} onPress={onClose} fullWidth />
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
  modalCard: {padding: Spacing.lg, maxHeight: '80%'},
  headingContent: {flex: 1, paddingRight: Spacing.sm},
  modalHeading: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md},
  modalTitle: {...Typography.heading3, color: Colors.status.error},
  modalSubtitle: {...Typography.caption, color: Colors.text.secondary, marginTop: 3},
  closeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {marginBottom: Spacing.sm},
  itemCard: {
    borderWidth: 1,
    borderColor: Colors.border.warm,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  itemNominal: {...Typography.bodySmall, color: Colors.text.primary, fontWeight: '700'},
  itemMeta: {...Typography.caption, color: Colors.text.muted, marginTop: 2},
  itemReason: {...Typography.caption, color: Colors.text.secondary, marginTop: Spacing.xs},
  itemError: {...Typography.caption, color: Colors.status.error, marginTop: 4},
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
  dismissText: {...Typography.label, color: Colors.status.error},
  modalActions: {marginTop: Spacing.xs},
});

export default HistoryCorrectionFailureModal;
