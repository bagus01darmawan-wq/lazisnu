import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '../stores';
import {AppButton, AppCard, AppHeader} from '../components/ui';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';

type OTPRoute = RouteProp<{OTP: {phone: string}}, 'OTP'>;

const EMPTY_OTP = ['', '', '', '', '', ''];

const OTPScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {phone} = useRoute<OTPRoute>().params;
  const {verifyOTP, requestOTP, isLoading, error, clearError} = useAuthStore();
  const [digits, setDigits] = useState([...EMPTY_OTP]);
  const [countdown, setCountdown] = useState(300);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (!countdown) {
      return;
    }
    const timer = setTimeout(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const verifyCode = useCallback(
    async (code: string) => {
      if (code.length !== 6 || isLoading) {
        return;
      }
      clearError();
      const success = await verifyOTP(phone, code);
      if (!success) {
        const message = useAuthStore.getState().error;
        Alert.alert('Verifikasi Gagal', message || 'Kode OTP tidak dapat diverifikasi.');
        setDigits([...EMPTY_OTP]);
        inputs.current[0]?.focus();
      }
    },
    [clearError, isLoading, phone, verifyOTP],
  );

  useEffect(() => {
    const code = digits.join('');
    if (code.length === 6) {
      verifyCode(code);
    }
  }, [digits, verifyCode]);

  const updateDigit = (value: string, index: number) => {
    const numeric = value.replace(/\D/g, '');
    if (index === 0 && numeric.length >= 6) {
      const pasted = numeric.slice(0, 6).split('');
      setDigits(pasted);
      inputs.current[5]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = numeric.slice(-1);
    setDigits(next);
    if (numeric && index < 5) {
      inputs.current[index + 1]?.focus();
    }
  };

  const resendOTP = async () => {
    if (countdown || isLoading) {
      return;
    }
    clearError();
    const success = await requestOTP(phone);
    if (!success) {
      Alert.alert(
        'OTP Tidak Terkirim',
        useAuthStore.getState().error || 'Coba kembali beberapa saat lagi.',
      );
      return;
    }
    setDigits([...EMPTY_OTP]);
    setCountdown(300);
    inputs.current[0]?.focus();
    Alert.alert('OTP Dikirim', 'Kode OTP baru telah dikirim melalui WhatsApp.');
  };

  const minutes = Math.floor(countdown / 60);
  const seconds = String(countdown % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <AppHeader
        variant={'stack'}
        title={'Verifikasi OTP'}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.messageIcon}>
            <Icon name={'whatsapp'} size={38} color={Colors.brand.whatsapp} />
          </View>
          <Text style={styles.title}>Masukkan kode OTP</Text>
          <Text style={styles.subtitle}>
            Kode 6 digit telah dikirim melalui WhatsApp ke
          </Text>
          <Text style={styles.phone}>{phone}</Text>

          <AppCard variant={'elevated'} style={styles.otpCard}>
            <View style={styles.otpRow}>
              {digits.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={reference => {
                    inputs.current[index] = reference;
                  }}
                  style={[styles.otpInput, !!digit && styles.otpInputFilled]}
                  value={digit}
                  onChangeText={value => updateDigit(value, index)}
                  onKeyPress={event => {
                    if (event.nativeEvent.key === 'Backspace' && !digit && index > 0) {
                      inputs.current[index - 1]?.focus();
                    }
                  }}
                  keyboardType={'number-pad'}
                  maxLength={index === 0 ? 6 : 1}
                  textAlign={'center'}
                  autoFocus={index === 0}
                  selectTextOnFocus
                  selectionColor={Colors.brand.emerald}
                  accessibilityLabel={`Digit OTP ${index + 1}`}
                />
              ))}
            </View>

            {!!error && (
              <View style={styles.errorBanner}>
                <Icon name={'alert-circle-outline'} size={18} color={Colors.status.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.timerRow}>
              <Icon name={'clock-outline'} size={18} color={Colors.text.secondary} />
              <Text style={styles.timerText}>
                {countdown ? `Kode berlaku ${minutes}:${seconds}` : 'Kode telah kedaluwarsa'}
              </Text>
            </View>

            <AppButton
              label={'Verifikasi'}
              icon={'shield-check-outline'}
              onPress={() => verifyCode(digits.join(''))}
              loading={isLoading}
              disabled={digits.join('').length !== 6}
              fullWidth
            />

            {!countdown && (
              <View style={styles.resendButton}>
                <AppButton
                  label={'Kirim Ulang OTP'}
                  variant={'outline'}
                  onPress={resendOTP}
                  loading={isLoading}
                  fullWidth
                />
              </View>
            )}
          </AppCard>

          <Text style={styles.helpText}>
            Jangan berikan kode OTP kepada siapa pun.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  keyboardView: {flex: 1},
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.xl,
  },
  messageIcon: {
    width: 76,
    height: 76,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {...Typography.heading1, color: Colors.brand.deepGreen, marginTop: Spacing.md},
  subtitle: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  phone: {...Typography.body, fontWeight: '700', color: Colors.text.primary, marginTop: 3},
  otpCard: {width: '100%', padding: Spacing.lg, marginTop: Spacing.lg},
  otpRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 5},
  otpInput: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderWidth: 1,
    borderColor: Colors.border.warm,
    borderRadius: Radius.md,
    fontSize: 23,
    fontWeight: '700',
    color: Colors.text.primary,
    backgroundColor: Colors.surface.card,
  },
  otpInputFilled: {
    borderColor: Colors.brand.emerald,
    backgroundColor: Colors.surface.successSubtle,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: Spacing.lg,
  },
  timerText: {...Typography.bodySmall, color: Colors.text.secondary},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface.errorSoft,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.md,
  },
  errorText: {
    flex: 1,
    ...Typography.caption,
    color: Colors.status.error,
    marginLeft: Spacing.xs,
  },
  resendButton: {marginTop: Spacing.sm},
  helpText: {
    ...Typography.caption,
    color: Colors.text.muted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});

export default OTPScreen;
