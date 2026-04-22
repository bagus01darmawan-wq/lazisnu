// Scan QR Screen - Mobile App

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
  Vibration,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { tasksService } from '../services/api';
import { Task } from '@lazisnu/shared-types';

const ScanScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [scannedData, setScannedData] = useState<Task | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Prevent back navigation
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isScanning) {
        setIsScanning(true);
        setScannedData(null);
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isScanning]);

  const handleQRCodeScanned = async (qrCode: string) => {
    if (isLoading) return;

    setIsLoading(true);
    setIsScanning(false);

    try {
      const result = await tasksService.getTaskByQR(qrCode);

      if (result.success && result.data) {
        Vibration.vibrate(50); // Haptic feedback
        setScannedData(result.data as Task);
      } else {
        Alert.alert(
          'QR Tidak Ditemukan',
          result.error?.message || 'QR code tidak valid atau tidak terdaftar',
          [
            {
              text: 'Scan Ulang',
              onPress: () => {
                setIsScanning(true);
                setScannedData(null);
              },
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Gagal memindai QR code', [
        {
          text: 'Scan Ulang',
          onPress: () => {
            setIsScanning(true);
            setScannedData(null);
          },
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Mock QR scanner - in production, use react-native-camera or ML Kit
  const simulateScan = () => {
    // Simulate scanning a random QR code for demo purposes
    const mockQRCodes = [
      'LZNU-KC01-00001',
      'LZNU-KC01-00002',
      'LZNU-KC01-00003',
    ];
    const randomQR = mockQRCodes[Math.floor(Math.random() * mockQRCodes.length)];
    handleQRCodeScanned(randomQR);
  };

  const handleContinue = () => {
    if (scannedData) {
      // Navigate to collection screen with the scanned task data
      navigation.navigate('Collection', { task: scannedData });
    }
  };

  const handleReset = () => {
    setIsScanning(true);
    setScannedData(null);
  };

  // Scanning View
  if (isScanning) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Scanner Area */}
        <View style={styles.scannerContainer}>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>

          <Text style={styles.instructionText}>
            Arahkan kamera ke QR code{'\n'}yang ada di kaleng kotak infaq
          </Text>

          {/* Mock Scan Button - Remove in production */}
          <TouchableOpacity style={styles.mockScanButton} onPress={simulateScan}>
            <Icon name="camera" size={20} color="#fff" />
            <Text style={styles.mockScanText}>Tap to Simulate Scan (Demo)</Text>
          </TouchableOpacity>
        </View>

        {/* Flashlight Button */}
        <View style={styles.bottomControls}>
          <TouchableOpacity style={styles.controlButton}>
            <Icon name="flashlight" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Loading View
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Memproses...</Text>
        </View>
      </View>
    );
  }

  // Result View
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.resultHeader}>
        <TouchableOpacity onPress={handleReset} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detail Kaleng</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Result Card */}
      <View style={styles.resultContainer}>
        <View style={styles.successIcon}>
          <Icon name="check" size={48} color="#4CAF50" />
        </View>

        <Text style={styles.successTitle}>QR Code Terdeteksi!</Text>

        {scannedData && (
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Icon name="identifier" size={20} color="#1E88E5" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Kode QR</Text>
                <Text style={styles.detailValue}>{scannedData.qr_code}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Icon name="account" size={20} color="#1E88E5" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Nama Pemilik</Text>
                <Text style={styles.detailValue}>{scannedData.owner_name}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Icon name="phone" size={20} color="#1E88E5" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Nomor HP</Text>
                <Text style={styles.detailValue}>{scannedData.owner_phone}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Icon name="map-marker" size={20} color="#1E88E5" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Alamat</Text>
                <Text style={styles.detailValue}>{scannedData.owner_address}</Text>
              </View>
            </View>

            {scannedData.last_collection && (
              <>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Icon name="history" size={20} color="#FF9800" />
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
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Scan Ulang</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Lanjutkan</Text>
            <Icon name="arrow-right" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#1E88E5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  scannerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  scannerFrame: {
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#1E88E5',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  instructionText: {
    marginTop: 30,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  mockScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E88E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 40,
  },
  mockScanText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  bottomControls: {
    alignItems: 'center',
    paddingBottom: 60,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingSpinner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: '#1E88E5',
    borderTopColor: 'transparent',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#fff',
  },
  resultContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -24,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  detailCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
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
    fontSize: 12,
    color: '#999',
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1E88E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#1E88E5',
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flex: 1,
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
});

export default ScanScreen;