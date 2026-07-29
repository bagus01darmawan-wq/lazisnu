import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  Vibration,
  ActivityIndicator,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { tasksService } from '../services/api';
import NetInfo from '@react-native-community/netinfo';
import {taskCache} from '../services/offline/tasks';
import { Task } from '@lazisnu/shared-types';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { pickAndDecodeQRCode } from '../services/qrImageScanner';
import { Camera, CameraType } from 'react-native-camera-kit';
import { AppHeader, AppCard, AppButton, AppTextInput } from '../components/ui';
import {Colors, Radius, Spacing, Typography} from '../theme';

type ScanNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Scan'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type QRInputSource = 'CAMERA' | 'MANUAL' | 'IMAGE';

const QR_ERROR_MESSAGES: Record<string, string> = {
  QR_INVALID: 'Format kode QR tidak valid.',
  CAN_NOT_FOUND: 'Kaleng tidak ditemukan.',
  QR_NOT_ASSIGNED: 'Kaleng ini bukan tugas Anda pada periode berjalan.',
  QR_ALREADY_SUBMITTED: 'Kaleng ini sudah disetor pada periode berjalan.',
  NETWORK_ERROR: 'Tidak ada koneksi internet. Coba lagi setelah jaringan tersedia.',
};

const ScanScreen: React.FC = () => {
  const navigation = useNavigation<ScanNavigationProp>();
  const insets = useSafeAreaInsets();
  const [scannedData, setScannedData] = useState<Task | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraPermission, setCameraPermission] = useState<'checking' | 'granted' | 'denied' | 'blocked'>('checking');
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [scanStatus, setScanStatus] = useState('Arahkan kamera ke QR code');
  const processingRef = useRef(false);
  const imagePickerRef = useRef(false);

  const checkCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Izin Kamera',
          message: 'Aplikasi membutuhkan akses kamera untuk memindai QR code kaleng infaq.',
          buttonPositive: 'Izinkan',
          buttonNegative: 'Jangan',
        }
      );
      if (granted === 'granted') {
        setCameraPermission('granted');
      } else if (granted === 'never_ask_again') {
        setCameraPermission('blocked');
      } else {
        setCameraPermission('denied');
      }
    } catch {
      setCameraPermission('denied');
    }
  };

  useEffect(() => {
    checkCameraPermission();
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isManualInput) {
        setIsManualInput(false);
        return true;
      }
      if (!isScanning) {
        setIsScanning(true);
        setScannedData(null);
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [isScanning, isManualInput]);

  const processQRCode = async (qrCode: string, source: QRInputSource) => {
    if (processingRef.current || imagePickerRef.current || !isScanning) {return;}
    if (!qrCode) {
      Alert.alert('Kode Kosong', 'Salin ulang kode dari kartu donatur.');
      return;
    }

    processingRef.current = true;
    setIsLoading(true);
    setScanStatus(
      source === 'CAMERA'
        ? 'QR terdeteksi, memeriksa tugas...'
        : source === 'IMAGE'
          ? 'QR dari gambar terdeteksi, memeriksa tugas...'
          : 'Memeriksa kode yang ditempel...'
    );

    try {
      const netInfo = await NetInfo.fetch();
      const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);
      if (!isOnline) {
        const cachedTask = taskCache.findByQRCode(qrCode);
        if (cachedTask) {
          Vibration.vibrate(70);
          setIsScanning(false);
          setScannedData(cachedTask);
          return;
        }
        Alert.alert('Data Kaleng Tidak Tersedia Offline', 'Kode QR ini belum tersimpan di perangkat. Hubungkan internet sekali untuk memuat detail kaleng.');
        return;
      }

      const result = await tasksService.getTaskByQR(qrCode);

      if (result.success && result.data) {
        Vibration.vibrate(70);
        setIsScanning(false);
        setScannedData(result.data as Task);
      } else {
        Vibration.vibrate([0, 100, 50, 100]);
        Alert.alert(
          'QR Tidak Dapat Diproses',
          QR_ERROR_MESSAGES[result.error?.code || ''] || result.error?.message || 'Kode QR tidak valid.',
          [{ text: 'COBA LAGI' }]
        );
      }
    } catch {
      Vibration.vibrate([0, 100, 50, 100]);
      Alert.alert('Error', 'Gagal memproses QR code. Coba lagi.', [
        { text: 'SCAN ULANG', onPress: () => setIsLoading(false) },
      ]);
    } finally {
      processingRef.current = false;
      setIsLoading(false);
      setScanStatus('Arahkan kamera ke QR code');
    }
  };

  const handleReset = () => {
    setIsScanning(true);
    setScannedData(null);
    setScanStatus('Arahkan kamera ke QR code');
  };

  const handleManualSubmit = () => {
    if (!manualCode) {return;}
    setIsManualInput(false);
    const code = manualCode;
    setManualCode('');
    processQRCode(code, 'MANUAL');
  };

  const handlePickQRImage = async () => {
    if (processingRef.current || imagePickerRef.current) {return;}

    imagePickerRef.current = true;
    setIsPickingImage(true);
    setScanStatus('Membaca QR dari gambar...');

    try {
      const qrCode = await pickAndDecodeQRCode();
      imagePickerRef.current = false;
      if (qrCode) {
        await processQRCode(qrCode, 'IMAGE');
      }
    } catch (error: any) {
      Alert.alert(
        'Gambar QR Tidak Dapat Diproses',
        error.message || 'Pilih gambar yang berisi tepat satu QR code.'
      );
    } finally {
      imagePickerRef.current = false;
      setIsPickingImage(false);
      setScanStatus('Arahkan kamera ke QR code');
    }
  };

  if (isScanning) {
    if (cameraPermission === 'checking') {
      return (
        <View style={styles.container}>
          <View style={styles.permissionContainer}>
            <ActivityIndicator size="large" color={Colors.brand.emerald} />
            <Text style={styles.permissionText}>Memeriksa izin kamera...</Text>
          </View>
        </View>
      );
    }

    if (cameraPermission === 'denied' || cameraPermission === 'blocked') {
      const isBlocked = cameraPermission === 'blocked';
      return (
        <View style={styles.container}>
          <AppHeader variant="stack" title="Scan QR Code" onBack={() => navigation.goBack()} />
          <View style={styles.permissionContainer}>
            <Icon name="camera-off" size={64} color={Colors.text.muted} />
            <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
            <Text style={styles.permissionDesc}>
              {isBlocked
                ? 'Izin kamera telah ditolak permanen. Buka Pengaturan untuk mengaktifkan.'
                : 'Izinkan akses kamera untuk memindai QR code kaleng infaq.'}
            </Text>
            <View style={styles.permissionAction}>
              <AppButton
                label={isBlocked ? 'Buka Pengaturan' : 'Izinkan Kamera'}
                icon={isBlocked ? 'cog' : 'camera'}
                onPress={() => isBlocked ? Linking.openSettings() : checkCameraPermission()}
                fullWidth
              />
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <Camera
          style={StyleSheet.absoluteFill}
          cameraType={CameraType.Back}
          scanBarcode={!isLoading && !isManualInput && !isPickingImage}
          onReadCode={(event: any) => processQRCode(event.nativeEvent.codeStringValue, 'CAMERA')}
          showFrame={false}
        />

        <View style={styles.overlay}>
          <View style={[styles.transparentHeader, {paddingTop: insets.top + Spacing.sm}]}>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tutup pemindai'}
              onPress={() => navigation.goBack()}
              style={styles.backButton}>
              <Icon name="close" size={28} color={Colors.text.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scan QR Code</Text>
            <View style={styles.placeholder} />
          </View>

          <View
            style={[
              styles.scannerContainer,
              {paddingBottom: insets.bottom + Spacing.lg},
            ]}>
            <View style={styles.scannerFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
              {isLoading && <ActivityIndicator size="large" color={Colors.brand.emerald} />}
            </View>

            <Text style={styles.instructionText}>
              {scanStatus}
            </Text>
            <Text style={styles.instructionHelper}>
              Posisikan seluruh kode QR kaleng di dalam bingkai
            </Text>

            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Tempel kode QR secara manual'}
              style={styles.manualButton}
              onPress={() => setIsManualInput(true)}>
              <Icon name="keyboard-outline" size={20} color={Colors.text.white} />
              <Text style={styles.manualButtonText}>Tempel Kode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={'Pilih gambar berisi kode QR'}
              style={styles.imageButton}
              onPress={handlePickQRImage}
              disabled={isPickingImage || isLoading}
            >
              {isPickingImage ? (
                <ActivityIndicator size="small" color={Colors.text.white} />
              ) : (
                <Icon name="image-search-outline" size={20} color={Colors.text.white} />
              )}
              <Text style={styles.manualButtonText}>Pilih Gambar QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isManualInput && (
          <View style={styles.modalOverlay}>
            <AppCard variant="elevated" style={styles.modalContent}>
              <Text style={styles.modalTitle}>Tempel Kode Kaleng</Text>
              <AppTextInput
                placeholder="Contoh: LAZ-PNG-25-00004-952"
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <View style={styles.actionHalf}>
                  <AppButton label="Batal" variant="outline" onPress={() => setIsManualInput(false)} fullWidth />
                </View>
                <View style={styles.actionHalf}>
                  <AppButton label="Proses" onPress={handleManualSubmit} fullWidth />
                </View>
              </View>
            </AppCard>
          </View>
        )}
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AppHeader variant="stack" title="Memproses" onBack={() => {}} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brand.emerald} />
          <Text style={styles.loadingText}>Memproses data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader variant="stack" title="Detail Kaleng" onBack={() => handleReset()} />
      <View style={styles.resultContainer}>
        <View style={styles.successIcon}>
          <Icon name="check" size={48} color={Colors.status.success} />
        </View>

        <Text style={styles.successTitle}>QR Code Terdeteksi!</Text>

        {scannedData && (
          <AppCard variant="elevated" style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Icon name="identifier" size={20} color={Colors.brand.emerald} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Kode QR</Text>
                <Text style={styles.detailValue}>{scannedData.qr_code}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Icon name="account" size={20} color={Colors.brand.emerald} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Nama Pemilik</Text>
                <Text style={styles.detailValue}>{scannedData.owner_name}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Icon name="phone" size={20} color={Colors.brand.emerald} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Nomor HP</Text>
                <Text style={styles.detailValue}>{scannedData.owner_phone}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Icon name="map-marker" size={20} color={Colors.brand.emerald} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Alamat</Text>
                <Text style={styles.detailValue}>{scannedData.owner_address || 'Alamat belum tersedia'}</Text>
              </View>
            </View>

            {scannedData.last_collection && (
              <>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Icon name="history" size={20} color={Colors.status.warning} />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Penjemputan Terakhir</Text>
                    <Text style={styles.detailValue}>
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0,
                      }).format(scannedData.last_collection.nominal)}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </AppCard>
        )}

        <View style={styles.actionButtons}>
          <View style={styles.actionHalf}>
            <AppButton label="Scan Ulang" variant="outline" onPress={handleReset} fullWidth />
          </View>
          <View style={styles.actionHalf}>
            <AppButton label="Lanjutkan" icon="arrow-right" onPress={() => scannedData && navigation.navigate('Collection', { task: scannedData })} fullWidth />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: Colors.surface.page,
  },
  permissionText: {
    ...Typography.body,
    color: Colors.text.secondary,
    marginTop: 16,
  },
  permissionTitle: {
    ...Typography.heading2,
    color: Colors.text.primary,
    marginTop: 20,
    textAlign: 'center',
  },
  permissionDesc: {
    ...Typography.body,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  permissionAction: {
    width: '80%',
    marginTop: Spacing.lg,
  },
  transparentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.overlay.darkSubtle,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.overlay.darkSoft,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.white,
  },
  placeholder: {
    width: 40,
  },
  scannerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  scannerFrame: {
    width: 264,
    height: 264,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: Colors.brand.mutedSand,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 8 },
  instructionText: {
    marginTop: Spacing.lg,
    ...Typography.heading3,
    color: Colors.text.white,
    textAlign: 'center',
  },
  instructionHelper: {
    ...Typography.bodySmall,
    color: Colors.text.white,
    opacity: 0.78,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay.dark,
  },
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.overlay.lightSubtle,
    width: 220,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.overlay.lightBorder,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.overlay.emeraldStrong,
    width: 220,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.overlay.lightBorder,
  },
  manualButtonText: {
    color: Colors.text.white,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    ...Typography.body,
    color: Colors.text.secondary,
  },
  resultContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  successTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  detailCard: {
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  detailContent: {
    flex: 1,
    marginLeft: 12,
  },
  detailLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
  detailValue: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.warm,
    marginVertical: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});

export default ScanScreen;
