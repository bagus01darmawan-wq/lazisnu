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
import {type CanVisitOutcome, type Task} from '@lazisnu/shared-types';
import type {MainTabParamList, RootStackParamList} from '../navigation/types';
import {collectionService} from '../services/api';
import {pickAndDecodeQRCode} from '../services/qrImageScanner';
import {AppHeader, SkipReasonSheet} from '../components/ui';
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
  CAN_RETURNED: 'Kaleng ini sudah dikembalikan dan ditarik admin, bukan tugas aktif.',
  QR_NOT_ASSIGNED: 'Kaleng ini bukan tugas Anda pada periode berjalan.',
  QR_ALREADY_SUBMITTED: 'Kaleng ini sudah disetor pada periode berjalan.',
  // C1-T2: pesan server untuk dua kode ini sudah menyematkan periode
  // (mis. "Periode 2026-09 sudah dikunci, pakai tugas 2026-10.") — teks di
  // sini hanya fallback bila pesan server kosong (lihat processQRCode).
  QR_WRONG_PERIOD: 'Kaleng ini tugas Anda pada periode lain — di luar periode berjalan.',
  QR_PERIOD_CLOSED: 'Periode sudah dikunci, pakai tugas periode berjalan.',
  NETWORK_ERROR: 'Tidak ada koneksi internet. Coba lagi setelah jaringan tersedia.',
};

// Kode yang pesannya wajib memakai teks server (menyematkan periode spesifik).
const SERVER_MESSAGE_CODES = new Set(['QR_WRONG_PERIOD', 'QR_PERIOD_CLOSED']);

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

  // Aktifkan jalur tab Scan saat berada di Detail Kaleng: menekan tab Scan
  // mengembalikan kamera (sebelumnya tombol tidak merespons sama sekali).
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', e => {
      if (!isScanning || scannedData) {
        e.preventDefault();
        handleReset();
      }
    });
    return unsubscribe;
  });

  const [skipSheetTask, setSkipSheetTask] = useState<Task | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [visiting, setVisiting] = useState(false);

  const handleSkip = (task: Task) => {
    setSkipSheetTask(task);
  };

  const handleSkipConfirm = async (reasonCode: string, notes: string) => {
    const task = skipSheetTask;
    if (!task) return;
    setSkipping(true);
    try {
      const result = await useTasksStore.getState().skipAssignment(task.id, reasonCode, notes);
      if (result.success) {
        setSkipSheetTask(null);
        handleReset();
        if (result.proposalId) {
          Alert.alert(
            'Usulan Terkirim',
            'Usulan perubahan status kaleng terkirim dan menunggu persetujuan admin.',
            [{text: 'OK', onPress: () => navigation.navigate('Tasks')}],
          );
        } else {
          navigation.navigate('Tasks');
        }
      } else {
        // Pesan jujur: alasan asli (server / jaringan) — bukan tuduhan sinyal.
        Alert.alert('Gagal Menandai', result.error || 'Gagal menandai kaleng. Coba lagi.');
      }
    } finally {
      setSkipping(false);
    }
  };

  const submitVisitOutcome = async (outcome: Exclude<CanVisitOutcome, 'ISI'>) => {
    if (!scannedData) return;
    setVisiting(true);
    try {
      const result = await collectionService.recordCanVisit(scannedData.can_id, outcome);
      if (!result.success) {
        Alert.alert('Gagal Mencatat', result.error?.message || 'Gagal menyimpan tindakan kaleng.');
        return;
      }
      Alert.alert('Tindakan Tercatat', result.data?.message || 'Tindakan kaleng tersimpan.', [
        {text: 'OK', onPress: handleReset},
      ]);
    } catch (error) {
      Alert.alert(
        'Gagal Mencatat',
        error instanceof Error ? error.message : 'Gagal menyimpan tindakan kaleng.',
      );
    } finally {
      setVisiting(false);
    }
  };
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
        const serverMessage = result.error?.message || '';
        const errorMessage = SERVER_MESSAGE_CODES.has(errorCode)
          ? serverMessage || QR_ERROR_MESSAGES[errorCode] || 'Kode QR tidak valid.'
          : QR_ERROR_MESSAGES[errorCode] || serverMessage || 'Kode QR tidak valid.';
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
          onSkip={handleSkip}
          onContinue={task => navigation.navigate('Collection', {task})}
          onVisitOutcome={outcome => void submitVisitOutcome(outcome)}
          visiting={visiting}
        />
      )}

      <SkipReasonSheet
        visible={!!skipSheetTask}
        qrCode={skipSheetTask?.qr_code ?? ''}
        loading={skipping}
        onDismiss={() => setSkipSheetTask(null)}
        onConfirm={handleSkipConfirm}
      />
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
