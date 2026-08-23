import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {AppButton, AppCard, AppTextInput} from '../../components/ui';
import {Colors, Spacing, Typography} from '../../theme';

export interface ScanManualModalProps {
  visible: boolean;
  manualCode: string;
  onChangeCode: (code: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export const ScanManualModal: React.FC<ScanManualModalProps> = ({
  visible,
  manualCode,
  onChangeCode,
  onCancel,
  onSubmit,
}) => {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.modalOverlay}>
      <AppCard variant="elevated" style={styles.modalContent}>
        <Text style={styles.modalTitle}>Tempel Kode Kaleng</Text>
        <AppTextInput
          placeholder="Contoh: LAZ-PNG-25-00004-952"
          value={manualCode}
          onChangeText={onChangeCode}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        <View style={styles.modalButtons}>
          <View style={styles.actionHalf}>
            <AppButton label="Batal" variant="outline" onPress={onCancel} fullWidth />
          </View>
          <View style={styles.actionHalf}>
            <AppButton label="Proses" onPress={onSubmit} fullWidth />
          </View>
        </View>
      </AppCard>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay.darkStrong,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '90%',
    padding: Spacing.lg,
  },
  modalTitle: {
    ...Typography.heading3,
    color: Colors.text.primary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionHalf: {
    flex: 1,
  },
});

export default ScanManualModal;
