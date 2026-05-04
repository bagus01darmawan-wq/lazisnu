// Collection Screen - Mobile App

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCollectionStore } from '../stores';
import { Task } from '@lazisnu/shared-types';

type CollectionRouteProp = RouteProp<{ Collection: { task: Task } }, 'Collection'>;

const CollectionScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<CollectionRouteProp>();
  const { task } = route.params;
  const { submitCollection, isSubmitting, error, reset } = useCollectionStore();

  const [nominal, setNominal] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const formatCurrency = (value: string) => {
    const num = parseInt(value.replace(/\D/g, ''), 10);
    if (isNaN(num)) {return '';}
    return new Intl.NumberFormat('id-ID').format(num);
  };

  const handleNominalChange = (text: string) => {
    const numeric = text.replace(/\D/g, '');
    setNominal(numeric);
  };

  const handleSubmit = async () => {
    const numericNominal = parseInt(nominal.replace(/\D/g, ''), 10);

    if (!numericNominal || numericNominal <= 0) {
      Alert.alert('Error', 'Nominal harus diisi');
      return;
    }

    reset();

    const result = await submitCollection({
      assignment_id: task.id,
      can_id: task.id,
      nominal: numericNominal,
      payment_method: paymentMethod,
      collected_at: new Date().toISOString(),
      offline_id: `local-${Date.now()}`,
    });

    if (result) {
      setShowSuccess(true);
    } else {
      Alert.alert('Error', error || 'Gagal menyimpan data penjemputan');
    }
  };

  const handleDone = () => {
    // Navigate back to dashboard or scan next
    navigation.navigate('Dashboard');
  };

  const handleNewCollection = () => {
    setNominal('');
    setNotes('');
    setPaymentMethod('CASH');
    setShowSuccess(false);
    navigation.navigate('Scan');
  };

  // Success View
  if (showSuccess) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Icon name="check" size={64} color="#4CAF50" />
          </View>

          <Text style={styles.successTitle}>Berhasil!</Text>
          <Text style={styles.successSubtitle}>
            Data penjemputan telah{'\n'}berhasil disimpan
          </Text>

          {/* Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Kode QR</Text>
              <Text style={styles.summaryValue}>{task.qr_code}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Pemilik</Text>
              <Text style={styles.summaryValue}>{task.owner_name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Nominal</Text>
              <Text style={[styles.summaryValue, styles.nominalValue]}>
                {formatCurrency(nominal)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Metode</Text>
              <Text style={styles.summaryValue}>
                {paymentMethod === 'CASH' ? 'Tunai' : 'Transfer'}
              </Text>
            </View>
          </View>

          {/* WhatsApp Info */}
          <View style={styles.whatsappInfo}>
            <Icon name="whatsapp" size={20} color="#25D366" />
            <Text style={styles.whatsappText}>
              Pesan terima kasih{'\n'}akan dikirim ke {task.owner_phone}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.newButton}
              onPress={handleNewCollection}
            >
              <Icon name="qrcode-scan" size={20} color="#1E88E5" />
              <Text style={styles.newButtonText}>Scan QR Baru</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <Text style={styles.doneButtonText}>Selesai</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Form View
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Input Penjemputan</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.formContainer}>
        {/* Task Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Icon name="identifier" size={18} color="#1E88E5" />
            <Text style={styles.infoText}>{task.qr_code}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="account" size={18} color="#1E88E5" />
            <Text style={styles.infoText}>{task.owner_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="map-marker" size={18} color="#1E88E5" />
            <Text style={styles.infoText} numberOfLines={2}>
              {task.owner_address}
            </Text>
          </View>
        </View>

        {/* Nominal Input */}
        <View style={styles.nominalSection}>
          <Text style={styles.label}>Nominal Penjemputan</Text>
          <View style={styles.nominalInputContainer}>
            <Text style={styles.currencyPrefix}>Rp</Text>
            <TextInput
              style={styles.nominalInput}
              value={formatCurrency(nominal)}
              onChangeText={handleNominalChange}
              placeholder="0"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.paymentSection}>
          <Text style={styles.label}>Metode Pembayaran</Text>
          <View style={styles.paymentOptions}>
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'CASH' && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('CASH')}
            >
              <Icon
                name="cash"
                size={24}
                color={paymentMethod === 'CASH' ? '#fff' : '#666'}
              />
              <Text
                style={[
                  styles.paymentOptionText,
                  paymentMethod === 'CASH' && styles.paymentOptionTextActive,
                ]}
              >
                Tunai
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'TRANSFER' && styles.paymentOptionActive,
              ]}
              onPress={() => setPaymentMethod('TRANSFER')}
            >
              <Icon
                name="bank-transfer"
                size={24}
                color={paymentMethod === 'TRANSFER' ? '#fff' : '#666'}
              />
              <Text
                style={[
                  styles.paymentOptionText,
                  paymentMethod === 'TRANSFER' && styles.paymentOptionTextActive,
                ]}
              >
                Transfer
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.notesSection}>
          <Text style={styles.label}>Catatan (opsional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Tambahkan catatan jika ada..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Anti-fraud Notice */}
        <View style={styles.notice}>
          <Icon name="shield-check" size={20} color="#FF9800" />
          <Text style={styles.noticeText}>
            Nominal yang Anda masukkan akan dikirimkan ke pemilik kaleng via WhatsApp
            sebagai bukti penjemputan.
          </Text>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.submitContainer}>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="check" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Simpan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E88E5',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
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
  formContainer: {
    flex: 1,
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  nominalSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  nominalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  currencyPrefix: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E88E5',
  },
  nominalInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
    paddingVertical: 16,
  },
  paymentSection: {
    marginBottom: 20,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  paymentOptionActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  paymentOptionText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  paymentOptionTextActive: {
    color: '#fff',
  },
  notesSection: {
    marginBottom: 20,
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#333',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  notice: {
    flexDirection: 'row',
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 12,
    color: '#FF9800',
    lineHeight: 18,
  },
  submitContainer: {
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    paddingVertical: 16,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Success View Styles
  successContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#999',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  nominalValue: {
    color: '#4CAF50',
  },
  whatsappInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    width: '100%',
  },
  whatsappText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 12,
    color: '#4CAF50',
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 24,
    width: '100%',
    gap: 12,
  },
  newButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1E88E5',
    borderRadius: 12,
    paddingVertical: 14,
  },
  newButtonText: {
    color: '#1E88E5',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#1E88E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CollectionScreen;
