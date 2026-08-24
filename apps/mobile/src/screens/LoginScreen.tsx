import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const logo = require('../assets/branding/logo-lazisnu-putih.png');
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '../stores';
import {AppButton, AppCard, AppTextInput, SegmentedControl} from '../components/ui';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';
import type {AuthNavigationProp} from '../navigation/types';

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<AuthNavigationProp>();
  const insets = useSafeAreaInsets();
  const {
    login,
    requestOTP,
    loginWithBiometric,
    isLoading,
    error,
    clearError,
    biometricEnabled,
    sessionRecoveryAvailable,
    dismissSessionRecovery,
  } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [method, setMethod] = useState<'password' | 'otp'>('password');
  // Auto-prompt biometrik sekali saja saat panel pemulihan tampil —
  // menghindari prompt berulang setiap re-render.
  const autoBiometricAttempted = useRef(false);

  const validatePhone = () => {
    if (!phone.trim()) {
      Alert.alert('Nomor Belum Diisi', 'Masukkan nomor handphone petugas.');
      return false;
    }
    return true;
  };

  const handlePasswordLogin = async () => {
    if (!validatePhone()) {
      return;
    }
    if (!password) {
      Alert.alert('Kata Sandi Belum Diisi', 'Masukkan kata sandi akun petugas.');
      return;
    }
    clearError();
    const success = await login(phone.trim(), password);
    if (!success) {
      const message = useAuthStore.getState().error;
      if (message) {
        Alert.alert('Tidak Dapat Masuk', message);
      }
    }
  };

  const handleOTPRequest = async () => {
    if (!validatePhone()) {
      return;
    }
    clearError();
    const success = await requestOTP(phone.trim());
    if (success) {
      navigation.navigate('OTP', {phone: phone.trim()});
      return;
    }
    const message = useAuthStore.getState().error;
    Alert.alert('OTP Tidak Terkirim', message || 'Coba kembali beberapa saat lagi.');
  };

  const handleBiometricLogin = useCallback(async () => {
    clearError();
    const success = await loginWithBiometric();
    if (!success) {
      const message = useAuthStore.getState().error;
      if (message) {
        Alert.alert('Login Biometrik Gagal', message);
      }
    }
  }, [clearError, loginWithBiometric]);

  const showRecoveryPanel = sessionRecoveryAvailable && biometricEnabled;

  useEffect(() => {
    if (showRecoveryPanel && !autoBiometricAttempted.current && !isLoading) {
      autoBiometricAttempted.current = true;
      handleBiometricLogin();
    }
  }, [showRecoveryPanel, isLoading, handleBiometricLogin]);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={Colors.brand.deepGreen} barStyle={'light-content'} />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps={'handled'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={[styles.hero, {paddingTop: insets.top + Spacing.xl}]}>
            <Image source={logo} style={styles.logo} resizeMode={'contain'} />
            <Text style={styles.taglineLine1}>Lembaga Amil Zakat</Text>
            <Text style={styles.taglineLine2}>Infak dan Sedekah Nahdlatul Ulama</Text>
          </View>

          <AppCard variant={'elevated'} style={styles.loginCard}>
            {showRecoveryPanel && (
              <View style={styles.recoveryPanel}>
                <View style={styles.recoveryIcon}>
                  <Icon name={'fingerprint'} size={26} color={Colors.brand.deepGreen} />
                </View>
                <View style={styles.recoveryContent}>
                  <Text style={styles.recoveryTitle}>Sesi Anda berakhir</Text>
                  <Text style={styles.recoveryText}>
                    Lanjutkan tanpa mengetik kata sandi menggunakan sidik jari.
                  </Text>
                </View>
                <AppButton
                  label={'Gunakan Sidik Jari'}
                  icon={'fingerprint'}
                  variant={'outline'}
                  onPress={handleBiometricLogin}
                  loading={isLoading}
                />
                <TouchableOpacity
                  accessibilityRole={'button'}
                  accessibilityLabel={'Tutup panel pemulihan sesi'}
                  onPress={() => {
                    autoBiometricAttempted.current = true;
                    dismissSessionRecovery();
                  }}
                  style={styles.recoveryDismiss}>
                  <Text style={styles.recoveryDismissText}>Masuk dengan akun</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.cardTitle}>Masuk ke akun</Text>
            <SegmentedControl
              options={[
                {label: 'Kata Sandi', value: 'password'},
                {label: 'OTP WhatsApp', value: 'otp'},
              ]}
              value={method}
              onChange={value => {
                setMethod(value);
                clearError();
              }}
            />

            <View style={styles.formStart}>
              <AppTextInput
                label={'Nomor handphone'}
                placeholder={'Contoh: 081234567890'}
                value={phone}
                onChangeText={value => {
                  setPhone(value);
                  if (error) {
                    clearError();
                  }
                }}
                keyboardType={'phone-pad'}
                autoComplete={'tel'}
                icon={'phone-outline'}
              />

              {method === 'password' && (
                <AppTextInput
                  label={'Kata sandi'}
                  placeholder={'Masukkan kata sandi'}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete={'password'}
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onIconPress={() => setShowPassword(current => !current)}
                  iconAccessibilityLabel={
                    showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
                  }
                />
              )}
            </View>

            {!!error && (
              <View style={styles.errorBanner}>
                <Icon name={'alert-circle-outline'} size={19} color={Colors.status.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <AppButton
              label={method === 'password' ? 'Masuk' : 'Kirim Kode OTP'}
              icon={method === 'password' ? 'login' : 'whatsapp'}
              onPress={method === 'password' ? handlePasswordLogin : handleOTPRequest}
              loading={isLoading}
              fullWidth
            />

            {biometricEnabled && (
              <>
                {/* Pemisah visual — sebelumnya tombol biometrik menempel
                    langsung di tombol Masuk tanpa jarak. */}
                <View style={styles.biometricDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>atau</Text>
                  <View style={styles.dividerLine} />
                </View>
                <AppButton
                  label={'Masuk dengan Sidik Jari'}
                  icon={'fingerprint'}
                  variant={'outline'}
                  onPress={handleBiometricLogin}
                  loading={isLoading}
                  fullWidth
                />
              </>
            )}
          </AppCard>

          <Text style={styles.footerText}>
            Hubungi admin ranting jika akun Anda belum terdaftar.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  keyboardView: {flex: 1},
  scrollContent: {flexGrow: 1, paddingBottom: Spacing.xl},
  hero: {
    backgroundColor: Colors.brand.deepGreen,
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 52,
    borderBottomLeftRadius: Radius.panel,
    borderBottomRightRadius: Radius.panel,
  },
  logo: {
    width: 240,
    height: 128,
    marginBottom: 0,
  },
  taglineLine1: {
    ...Typography.body,
    color: Colors.text.white,
    textAlign: 'center',
    fontWeight: '700',
    opacity: 0.95,
    marginTop: -20,
  },
  taglineLine2: {
    ...Typography.body,
    color: Colors.text.white,
    textAlign: 'center',
    fontWeight: '700',
    opacity: 0.95,
    marginTop: 2,
  },
  brandIcon: {
    width: 76,
    height: 76,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.mutedSand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    ...Typography.heading1,
    color: Colors.text.white,
    letterSpacing: 2,
    marginTop: Spacing.sm,
  },
  heroTitle: {
    ...Typography.heading3,
    color: Colors.text.white,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  heroSubtitle: {
    ...Typography.bodySmall,
    color: Colors.text.white,
    textAlign: 'center',
    opacity: 0.75,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  loginCard: {
    marginHorizontal: Layout.screenPadding,
    marginTop: -28,
    padding: Spacing.lg,
  },
  cardTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  formStart: {marginTop: Spacing.lg},
  recoveryPanel: {
    backgroundColor: Colors.surface.successSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  recoveryIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryContent: {alignItems: 'center'},
  recoveryTitle: {...Typography.body, color: Colors.brand.deepGreen, fontWeight: '700'},
  recoveryText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 17,
  },
  recoveryDismiss: {minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.sm},
  recoveryDismissText: {...Typography.label, color: Colors.text.secondary},
  biometricDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  dividerLine: {flex: 1, height: 1, backgroundColor: Colors.border.summary},
  dividerText: {...Typography.caption, color: Colors.text.muted},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface.errorSoft,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  errorText: {
    flex: 1,
    ...Typography.caption,
    color: Colors.status.error,
    marginLeft: Spacing.xs,
    lineHeight: 18,
  },
  footerText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
});

export default LoginScreen;
