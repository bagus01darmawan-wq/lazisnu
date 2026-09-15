import React, {useState} from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Radius, Spacing, Typography} from '../../theme';
import {AppButton} from './AppButton';
import {AppTextInput} from './AppTextInput';
import {OptionList} from './OptionList';

/** 6 alasan baku, sama persis dengan `SKIP_REASON_LABELS` di back-end. */
export const SKIP_REASON_OPTIONS = [
  {value: 'OWNER_ABSENT', label: 'Pemilik tidak di tempat'},
  {value: 'OWNER_REFUSED', label: 'Pemilik menolak dijemput'},
  {
    value: 'CAN_DAMAGED',
    label: 'Kaleng rusak',
    hint: 'Mengusulkan status Rusak — admin akan menindaklanjuti.',
  },
  {
    value: 'CAN_LOST',
    label: 'Kaleng hilang',
    hint: 'Mengusulkan status Hilang — admin akan menindaklanjuti.',
  },
  {value: 'ACCESS_DIFFICULT', label: 'Akses ke lokasi sulit'},
  {value: 'OTHER', label: 'Lainnya'},
] as const;

export type SkipReasonCode = (typeof SKIP_REASON_OPTIONS)[number]['value'];

type SkipReasonSheetProps = {
  visible: boolean;
  qrCode: string;
  /** Sedang mengirim? Tombol Simpan jadi loading. */
  loading?: boolean;
  onDismiss: () => void;
  onConfirm: (reasonCode: SkipReasonCode, notes: string) => void;
};

/**
 * Pilihan alasan "tidak terjemput" — menggantikan konfirmasi Ya/Batal.
 *
 * Petugas wajib pilih 1 dari 6 alasan sebelum bisa menyimpan. Catatan teks opsional.
 * Pilihan "Kaleng rusak"/"Kaleng hilang" memicu usulan perubahan kondisi di server.
 */
export function SkipReasonSheet({
  visible,
  qrCode,
  loading = false,
  onDismiss,
  onConfirm,
}: SkipReasonSheetProps) {
  const [reasonCode, setReasonCode] = useState<SkipReasonCode | null>(null);
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    if (!reasonCode) return;
    onConfirm(reasonCode, notes.trim());
  };

  const handleDismiss = () => {
    // Reset agar pilihan tidak nyangkut saat dibuka lagi.
    setReasonCode(null);
    setNotes('');
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Icon name="clipboard-list-outline" size={28} color={Colors.brand.deepGreen} />
            <Text style={styles.title}>Tandai Tidak Dijemput</Text>
            <Text style={styles.subtitle}>
              Kaleng <Text style={styles.qrCode}>{qrCode}</Text> untuk periode berjalan
            </Text>
          </View>

          <Text style={styles.question}>Kenapa tidak terjemput?</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            <OptionList
              options={SKIP_REASON_OPTIONS}
              value={reasonCode}
              onChange={code => setReasonCode(code)}
            />

            <Text style={styles.notesLabel}>Catatan (opsional)</Text>
            <AppTextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Contoh: pemilik pindah rumah sementara"
              multiline
              numberOfLines={2}
              maxLength={255}
            />
          </ScrollView>

          <View style={styles.actions}>
            <AppButton
              label="Batal"
              variant="outline"
              onPress={handleDismiss}
              disabled={loading}
              fullWidth
            />
            <AppButton
              label="Simpan"
              icon="check"
              onPress={handleConfirm}
              loading={loading}
              disabled={!reasonCode || loading}
              fullWidth
            />
          </View>

          {!reasonCode ? (
            <Text style={styles.hint}>Pilih salah satu alasan untuk menyimpan.</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay.dark,
  },
  sheet: {
    backgroundColor: Colors.surface.page,
    borderTopLeftRadius: Radius.panel,
    borderTopRightRadius: Radius.panel,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border.warm,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...Typography.heading3,
    marginTop: Spacing.xs,
  },
  subtitle: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
  qrCode: {
    fontWeight: '700',
    color: Colors.text.primary,
  },
  question: {
    ...Typography.label,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  notesLabel: {
    ...Typography.label,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  notesInput: {
    marginTop: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  hint: {
    ...Typography.caption,
    textAlign: 'center',
    marginTop: Spacing.sm,
    color: Colors.text.muted,
  },
});
