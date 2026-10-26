import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Radius, Spacing, Typography} from '../theme';
import {AppButton} from './ui/AppButton';
import {AppTextInput} from './ui/AppTextInput';
import {authService} from '../services/api';

type PasswordSheetProps = {
  visible: boolean;
  /** Nomor HP petugas yang terdaftar — OTP dikirim ke WhatsApp nomor ini. */
  phone: string;
  /** Sudah pernah membuat sandi sendiri? Menentukan judul dan label tombol. */
  passwordSet: boolean;
  onDismiss: () => void;
  /** Dipanggil setelah sandi tersimpan — parent memuat ulang status. */
  onSaved: () => void;
};

const maskPhone = (phone: string) =>
  phone.length > 6 ? `${phone.slice(0, 3)}****${phone.slice(-3)}` : phone;

/**
 * Sheet buat/ubah kata sandi petugas. Konfirmasi memakai OTP WhatsApp yang
 * dikirim ke nomor petugas sendiri — bukan sandi lama — karena OTP adalah
 * faktor identitas utama sekaligus jalur pemulihan akun petugas.
 */
export function PasswordSheet({
  visible,
  phone,
  passwordSet,
  onDismiss,
  onSaved,
}: PasswordSheetProps) {
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Android edge-to-edge (RN 0.88, targetSdk 36): ADJUST_RESIZE pada jendela
  // Modal tidak lagi menggeser layout, jadi tinggi keyboard ditambahkan
  // manual sebagai padding bawah overlay — sheet (flex-end) terangkat di atas
  // keyboard. iOS tetap memakai KeyboardAvoidingView.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const show = Keyboard.addListener('keyboardDidShow', e =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const reset = () => {
    setOtpSent(false);
    setOtp('');
    setPassword('');
    setShowPassword(false);
    setError(null);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const handleSendOtp = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await authService.requestOTP(phone);
      if (res.success) {
        setOtpSent(true);
      } else {
        setError(res.error?.message || 'Kode OTP gagal dikirim. Coba lagi.');
      }
    } catch {
      setError('Kode OTP gagal dikirim. Periksa koneksi lalu coba lagi.');
    } finally {
      setSending(false);
    }
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await authService.setPassword(phone, otp.trim(), password);
      if (res.success) {
        reset();
        onSaved();
      } else {
        setError(res.error?.message || 'Kata sandi gagal disimpan. Coba lagi.');
      }
    } catch {
      setError('Kata sandi gagal disimpan. Periksa koneksi lalu coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSave = otp.trim().length === 6 && password.length > 0 && !submitting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, keyboardHeight > 0 && {paddingBottom: keyboardHeight}]}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Icon name="lock-reset" size={28} color={Colors.brand.deepGreen} />
            <Text style={styles.title}>{passwordSet ? 'Ubah Kata Sandi' : 'Buat Kata Sandi'}</Text>
            <Text style={styles.subtitle}>
              {passwordSet
                ? 'Ganti sandi untuk masuk tanpa kode OTP.'
                : 'Buat sandi untuk masuk tanpa kode OTP.'}
            </Text>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepLabel}>1. Kode OTP via WhatsApp ke {maskPhone(phone)}</Text>
            <AppButton
              label={otpSent ? 'Kirim Ulang Kode' : 'Kirim Kode OTP'}
              icon="message-text-lock-outline"
              variant={otpSent ? 'outline' : 'primary'}
              onPress={handleSendOtp}
              loading={sending}
              disabled={submitting}
              fullWidth
              accessibilityLabel={otpSent ? 'Kirim ulang kode OTP' : 'Kirim kode OTP'}
            />
            {otpSent ? (
              <Text style={styles.sentNote}>
                Kode terkirim, berlaku 5 menit. Periksa WhatsApp {maskPhone(phone)}.
              </Text>
            ) : null}

            <Text style={styles.stepLabel}>2. Masukkan kode OTP</Text>
            <AppTextInput
              value={otp}
              onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 digit"
              keyboardType="number-pad"
              maxLength={6}
              editable={otpSent}
              accessibilityLabel="Kode OTP"
            />

            <Text style={styles.stepLabel}>3. Kata sandi baru</Text>
            <AppTextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Kata sandi bebas, tidak ada syarat karakter"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={otpSent}
              icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
              onIconPress={() => setShowPassword(prev => !prev)}
              iconAccessibilityLabel={
                showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
              }
              accessibilityLabel="Kata sandi baru"
            />
            <Text style={styles.hint}>
              Sandi ini alternatif masuk selain OTP. Perangkat lain akan diminta masuk ulang setelah
              sandi diubah.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            <View style={styles.actionWrap}>
              <AppButton
                label="Batal"
                variant="outline"
                onPress={handleDismiss}
                disabled={submitting}
                fullWidth
              />
            </View>
            <View style={styles.actionWrap}>
              <AppButton
                label="Simpan"
                icon="check"
                onPress={handleSave}
                loading={submitting}
                disabled={!canSave}
                fullWidth
              />
            </View>
          </View>
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
  body: {
    flexGrow: 0,
  },
  stepLabel: {
    ...Typography.label,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sentNote: {
    ...Typography.caption,
    color: Colors.status.success,
    marginTop: Spacing.xs,
  },
  hint: {
    ...Typography.caption,
    color: Colors.text.muted,
    marginTop: Spacing.xs,
  },
  error: {
    ...Typography.caption,
    color: Colors.status.error,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  actionWrap: {
    flex: 1,
  },
});
