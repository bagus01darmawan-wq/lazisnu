import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  BackHandler,
  Vibration,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import {CompositeNavigationProp, useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Camera, CameraType} from 'react-native-camera-kit';
import {useTasksStore} from '../stores';
import {Task} from '@lazisnu/shared-types';
import type {MainTabParamList, RootStackParamList} from '../navigation/types';
import {pickAndDecodeQRCode} from '../services/qrImageScanner';
import {AppHeader} from '../components/ui';
import {Colors, Typography} from '../theme';
import {getErrorMessage} from '../utils';
import {ScanManualModal, ScanOverlay, ScanPermissionView, ScanResultCard} from './scan';

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
  const [cameraPermission, setCameraPermission] = useState<
    'checking' | 'granted' | 'denied' | 'blocked'
  >('checking');
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [scanStatus, setScanStatus] = useState('Arahkan kamera ke QR code');
  const processingRef = useRef(false);
  const imagePickerRef = useRef(false);

  const checkCameraPermission = async () => {
    try {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA!, {
        title: 'Izin Kamera',
        message: 'Aplikasi membutuhkan akses kamera untuk memindai QR code kaleng infaq.',
        buttonPositive: 'Izinkan',
        buttonNegative: 'Jangan',
      });
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
    if (processingRef.current || imagePickerRef.current || !isScanning) {
      return;
    }
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
          : 'Memeriksa kode yang ditempel...',
    );

    try {
      const result = await useTasksStore.getState().resolveTaskByQRCode(qrCode);

      if (result.success && result.task) {
        Vibration.vibrate(70);
        setIsScanning(false);
        setScannedData(result.task);
      } else {
        Vibration.vibrate([0, 100, 50, 100]);
        const errorCode = result.error?.code || '';
        const errorMessage =
          QR_ERROR_MESSAGES[errorCode] || result.error?.message || 'Kode QR tidak valid.';
        Alert.alert('QR Tidak Dapat Diproses', errorMessage, [{text: 'COBA LAGI'}]);
      }
    } catch {
      Vibration.vibrate([0, 100, 50, 100]);
      Alert.alert('Error', 'Gagal memproses QR code. Coba lagi.', [
        {text: 'SCAN ULANG', onPress: () => setIsLoading(false)},
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
    if (!manualCode) {
      return;
    }
    setIsManualInput(false);
    const code = manualCode;
    setManualCode('');
    processQRCode(code, 'MANUAL');
  };

  const handlePickQRImage = async () => {
    if (processingRef.current || imagePickerRef.current) {
      return;
    }

    imagePickerRef.current = true;
    setIsPickingImage(true);
    setScanStatus('Membaca QR dari gambar...');

    try {
      const qrCode = await pickAndDecodeQRCode();
      imagePickerRef.current = false;
      if (qrCode) {
        await processQRCode(qrCode, 'IMAGE');
      }
    } catch (error: unknown) {
      Alert.alert(
        'Gambar QR Tidak Dapat Diproses',
        getErrorMessage(error, 'Pilih gambar yang berisi tepat satu QR code.'),
      );
    } finally {
      imagePickerRef.current = false;
      setIsPickingImage(false);
      setScanStatus('Arahkan kamera ke QR code');
    }
  };

  if (isScanning) {
    if (cameraPermission !== 'granted') {
      return (
        <ScanPermissionView
          permission={cameraPermission}
          onRequestPermission={checkCameraPermission}
          onBack={() => navigation.goBack()}
        />
      );
    }

    return (
      <View style={styles.container}>
        <Camera
          style={StyleSheet.absoluteFill}
          cameraType={CameraType.Back}
          scanBarcode={!isLoading && !isManualInput && !isPickingImage}
          onReadCode={(event: {nativeEvent: {codeStringValue: string}}) =>
            processQRCode(event.nativeEvent.codeStringValue, 'CAMERA')
          }
          showFrame={false}
        />

        <ScanOverlay
          scanStatus={scanStatus}
          isLoading={isLoading}
          isPickingImage={isPickingImage}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onClose={() => navigation.goBack()}
          onManualInputPress={() => setIsManualInput(true)}
          onPickImagePress={handlePickQRImage}
        />

        <ScanManualModal
          visible={isManualInput}
          manualCode={manualCode}
          onChangeCode={setManualCode}
          onCancel={() => setIsManualInput(false)}
          onSubmit={handleManualSubmit}
        />
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
      <AppHeader variant="stack" title="Detail Kaleng" onBack={handleReset} />
      {scannedData && (
        <ScanResultCard
          task={scannedData}
          onReset={handleReset}
          onContinue={task => navigation.navigate('Collection', {task})}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface.page,
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
});

export default ScanScreen;
