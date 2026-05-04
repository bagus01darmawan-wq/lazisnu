// Login Screen - Mobile App (Premium UI)

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  ImageBackground,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { BlurView } from '@react-native-community/blur';

const { width, height } = Dimensions.get('window');

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { login, requestOTP, isLoading, error, clearError } = useAuthStore();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 20,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!phone.trim()) {
      Alert.alert('Perhatian', 'Nomor Handphone tidak boleh kosong.');
      return;
    }

    if (loginMethod === 'password' && !password.trim()) {
      Alert.alert('Perhatian', 'Kata Sandi tidak boleh kosong.');
      return;
    }

    clearError();
    const success = await login(phone.trim(), password);
    if (!success && error) {
      Alert.alert('Login Gagal', error);
    }
  };

  const handleRequestOTP = async () => {
    if (!phone.trim()) {
      Alert.alert('Perhatian', 'Nomor Handphone tidak boleh kosong untuk menerima OTP.');
      return;
    }

    clearError();
    const success = await requestOTP(phone.trim());
    if (success) {
      navigation.navigate('OTP', { phone: phone.trim() });
    } else {
      Alert.alert('Koneksi Terputus', 'Gagal mengirim pesan WhatsApp OTP. Coba lagi.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Background Gradient */}
      <LinearGradient
        colors={['#044F35', '#0A8A5E', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Decorative Blur Orbs */}
      <View style={[styles.orb, styles.orb1]} />
      <View style={[styles.orb, styles.orb2]} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Header/Logo Section */}
          <View style={styles.headerContainer}>
            <View style={styles.logoBadge}>
              <Icon name="cube-scan" size={42} color="#10B981" />
            </View>
            <Text style={styles.title}>LAZISNU</Text>
            <Text style={styles.subtitle}>Infaq Collection System</Text>
          </View>

          {/* Glassmorphism Card */}
          <View style={styles.glassCardWrapper}>
            <BlurView
              style={StyleSheet.absoluteFillObject}
              blurType="light"
              blurAmount={15}
              reducedTransparencyFallbackColor="white"
            />
            <View style={styles.glassCardContent}>

              {/* Login Method Toggle */}
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabButton, loginMethod === 'password' && styles.tabButtonActive]}
                  onPress={() => { setLoginMethod('password'); clearError(); }}
                >
                  <Text style={[styles.tabText, loginMethod === 'password' && styles.tabTextActive]}>
                    Password
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabButton, loginMethod === 'otp' && styles.tabButtonActive]}
                  onPress={() => { setLoginMethod('otp'); clearError(); }}
                >
                  <Text style={[styles.tabText, loginMethod === 'otp' && styles.tabTextActive]}>
                    WhatsApp OTP
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error Message display */}
              {error ? (
                <View style={styles.errorContainer}>
                  <Icon name="alert-circle" size={16} color="#ef4444" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Form Fields */}
              <View style={styles.inputGroup}>
                <View style={styles.inputWrapper}>
                  <Icon name="phone" size={22} color="#9CA3AF" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Nomor Handphone"
                    placeholderTextColor="#9CA3AF"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    selectionColor="#10B981"
                  />
                </View>

                {loginMethod === 'password' && (
                  <View style={styles.inputWrapper}>
                    <Icon name="lock-outline" size={22} color="#9CA3AF" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Kata Sandi"
                      placeholderTextColor="#9CA3AF"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                      selectionColor="#10B981"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                    >
                      <Icon
                        name={showPassword ? 'eye-off' : 'eye'}
                        size={22}
                        color="#4B5563"
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Action Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={isLoading}
                onPress={loginMethod === 'password' ? handleLogin : handleRequestOTP}
              >
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.loginBtnText}>
                      {loginMethod === 'password' ? 'Masuk Sekarang' : 'Kirim Kode OTP'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Security Badge */}
              <View style={styles.securityBadge}>
                <Icon name="shield-check" size={14} color="#059669" />
                <Text style={styles.securityText}>Sistem Antrean Enkripsi Offline-First</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A8A5E',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.4,
  },
  orb1: {
    width: 300,
    height: 300,
    backgroundColor: '#34D399',
    top: -100,
    right: -100,
  },
  orb2: {
    width: 400,
    height: 400,
    backgroundColor: '#064E3B',
    bottom: -150,
    left: -150,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBadge: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  glassCardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  glassCardContent: {
    padding: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  tabTextActive: {
    color: '#065F46',
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  eyeButton: {
    padding: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 226, 226, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  loginBtn: {
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  securityText: {
    marginLeft: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
});

export default LoginScreen;
