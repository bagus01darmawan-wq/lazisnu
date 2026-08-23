import React from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton, AppCard, AppTextInput} from '../../components/ui';
import {Colors, Spacing, Typography} from '../../theme';

export interface HistoryCorrectionData {
  id: string;
  nominal: string;
  originalNominal: number;
  isPending: boolean;
}

export interface HistoryCorrectionModalProps {
  correction: HistoryCorrectionData | null;
  reason: string;
  isSubmitting: boolean;
  onNominalChange: (text: string) => void;
  onReasonChange: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const HistoryCorrectionModal: React.FC<HistoryCorrectionModalProps> = ({
  correction,
  reason,
  isSubmitting,
  onNominalChange,
  onReasonChange,
  onClose,
  onSubmit,
}) => {
  return (
    <Modal
      visible={Boolean(correction)}
      transparent
      animationType={'fade'}
      onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <AppCard variant={'elevated'} style={styles.modalCard}>
          <View style={styles.modalHeading}>
            <View>
              <Text style={styles.modalTitle}>Koreksi Penjemputan</Text>
              <Text style={styles.modalSubtitle}>
                {correction?.isPending
                  ? 'Nominal akan diperbarui sebelum dikirim ke server.'
                  : 'Perubahan akan tercatat dalam audit.'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tutup koreksi'}
              onPress={onClose}
              style={styles.closeButton}>
              <Icon name={'close'} size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <AppTextInput
            label={'Nominal baru'}
            keyboardType={'numeric'}
            value={correction?.nominal || ''}
            onChangeText={onNominalChange}
            placeholder={'Masukkan nominal'}
          />
          {!correction?.isPending && (
            <AppTextInput
              label={'Alasan koreksi'}
              multiline
              numberOfLines={3}
              value={reason}
              onChangeText={onReasonChange}
              placeholder={'Contoh: salah memasukkan nominal'}
              helperText={'Minimal 5 karakter'}
            />
          )}

          <View style={styles.modalActions}>
            <View style={styles.modalButton}>
              <AppButton
                label={'Batal'}
                variant={'outline'}
                onPress={onClose}
                disabled={isSubmitting}
                fullWidth
              />
            </View>
            <View style={styles.modalButton}>
              <AppButton
                label={'Simpan Koreksi'}
                onPress={onSubmit}
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
  modalActions: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm},
  modalButton: {flex: 1},
});

export default HistoryCorrectionModal;
