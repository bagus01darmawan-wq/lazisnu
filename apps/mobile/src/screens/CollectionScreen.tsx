import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useCollectionStore} from '../stores';
import type {RootStackParamList} from '../navigation/types';
import {AppButton, AppCard, AppHeader, AppTextInput} from '../components/ui';
import {Colors, Layout, Radius, Spacing, Typography} from '../theme';
import {formatCurrency, formatInputCurrency} from '../utils';

type Props = NativeStackScreenProps<RootStackParamList, 'Collection'>;

const CollectionScreen: React.FC<Props> = ({navigation, route}) => {
  const {task} = route.params;
  const {submitCollection, isSubmitting, reset} = useCollectionStore();
  const [nominal, setNominal] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async () => {
    const numericNominal = Number(nominal);
    if (isNaN(numericNominal) || nominal === '') {
      Alert.alert('Nominal Belum Diisi', 'Masukkan nominal hasil penjemputan.');
      return;
    }
    if (numericNominal > 10_000_000) {
      Alert.alert(
        'Nominal Terlalu Besar',
        'Maksimal nominal per penjemputan adalah Rp10.000.000. Hubungi admin untuk penjemputan khusus.',
      );
      return;
    }
    if (numericNominal === 0) {
      return new Promise<void>(resolve => {
        Alert.alert(
          'Konfirmasi Kaleng Kosong',
          'Nominal yang dimasukkan adalah Rp0. Apakah kaleng benar-benar kosong?',
          [
            {text: 'Tidak', style: 'cancel', onPress: () => resolve()},
            {
              text: 'Ya, Lanjutkan',
              onPress: () => {
                resolve(doSubmit(numericNominal));
              },
            },
          ],
        );
      });
    }

    await doSubmit(numericNominal);
  };

  const doSubmit = async (numericNominal: number) => {
    reset();
    const result = await submitCollection({
      assignment_id: task.id,
      can_id: task.can_id,
      nominal: numericNominal,
      collected_at: new Date().toISOString(),
    });

    if (!result.success) {
      Alert.alert(
        'Gagal Menyimpan',
        result.error || useCollectionStore.getState().error || 'Data penjemputan gagal disimpan.',
      );
      return;
    }

    setShowSuccess(true);
    if (!result.synced) {
      Alert.alert(
        'Tersimpan di Perangkat',
        'Data akan dikirim otomatis saat koneksi internet tersedia.',
      );
    }
  };

  const handleNewCollection = () => {
    setNominal('');
    setShowSuccess(false);
    navigation.navigate('Main', {screen: 'Scan'});
  };

  if (showSuccess) {
    return (
      <View style={styles.container}>
        <AppHeader
          variant={'stack'}
          title={'Penjemputan Tersimpan'}
          onBack={() => navigation.navigate('Main', {screen: 'Dashboard'})}
        />
        <ScrollView
          contentContainerStyle={styles.successContainer}
          showsVerticalScrollIndicator={false}>
          <View style={styles.successIcon}>
            <Icon name={'check'} size={48} color={Colors.text.white} />
          </View>
          <Text style={styles.successTitle}>Penjemputan Berhasil</Text>
          <Text style={styles.successSubtitle}>
            Data penjemputan sudah tersimpan dan siap disinkronkan.
          </Text>

          <AppCard variant={'elevated'} style={styles.summaryCard}>
            <SummaryRow label={'Kode QR'} value={task.qr_code} />
            <SummaryRow label={'Pemilik'} value={task.owner_name} />
            <SummaryRow label={'Nominal'} value={formatCurrency(Number(nominal))} accent last />
          </AppCard>

          <View style={styles.whatsappInfo}>
            <Icon name={'whatsapp'} size={22} color={Colors.brand.whatsapp} />
            <Text style={styles.whatsappText}>
              Pesan konfirmasi akan dikirim ke {task.owner_phone}.
            </Text>
          </View>

          <View style={styles.successActions}>
            <AppButton
              label={'Scan QR Baru'}
              icon={'qrcode-scan'}
              variant={'outline'}
              onPress={handleNewCollection}
              fullWidth
            />
            <AppButton
              label={'Kembali ke Beranda'}
              icon={'home-outline'}
              onPress={() => navigation.navigate('Main', {screen: 'Dashboard'})}
              fullWidth
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppHeader variant={'stack'} title={'Input Penjemputan'} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps={'handled'}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Detail penerimaan</Text>
        <AppCard variant={'default'} style={styles.formCard}>
          <Text style={styles.label}>Nominal infaq</Text>
          <View style={styles.nominalRow}>
            <Text style={styles.currencyPrefix}>Rp</Text>
            <View style={styles.nominalInputContainer}>
              <AppTextInput
                placeholder={'0'}
                value={formatInputCurrency(nominal)}
                onChangeText={text => setNominal(text.replace(/\D/g, ''))}
                keyboardType={'numeric'}
                returnKeyType={'done'}
                style={styles.nominalInput}
              />
            </View>
          </View>
          <Text style={styles.helperText}>
            Pastikan nominal sesuai dengan uang yang diterima. Nominal akan dicantumkan pada pesan
            konfirmasi donatur.
          </Text>
        </AppCard>

        <Text style={styles.sectionTitle}>Detail Kaleng</Text>
        <AppCard variant={'elevated'} style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Icon name="qrcode" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Kode QR</Text>
              <Text style={styles.detailValue}>{task.qr_code}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Icon name="account" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Nama Pemilik</Text>
              <Text style={styles.detailValue}>{task.owner_name}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Icon name="phone" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Nomor HP</Text>
              <Text style={styles.detailValue}>{task.owner_phone || '-'}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Icon name="map-marker" size={20} color={Colors.brand.emerald} />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Alamat</Text>
              <Text style={styles.detailValue}>
                {task.owner_address || 'Alamat belum tersedia'}
              </Text>
            </View>
          </View>

          {task.last_collection && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Icon name="history" size={20} color={Colors.status.warning} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Penjemputan Terakhir</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(task.last_collection.nominal)}
                  </Text>
                </View>
              </View>
            </>
          )}
        </AppCard>
      </ScrollView>

      <View style={styles.submitContainer}>
        <AppButton
          label={'Simpan Penjemputan'}
          icon={'check-circle-outline'}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={nominal === ''}
          fullWidth
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const SummaryRow = ({
  label,
  value,
  accent = false,
  last = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) => (
  <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, accent && styles.summaryValueAccent]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  formContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
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
  sectionTitle: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  formCard: {padding: Spacing.md},
  label: {...Typography.label, color: Colors.text.primary, marginBottom: Spacing.sm},
  nominalRow: {flexDirection: 'row', alignItems: 'center'},
  nominalInputContainer: {flex: 1},
  currencyPrefix: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    marginRight: Spacing.sm,
    marginBottom: Spacing.md,
  },
  nominalInput: {fontSize: 22, fontWeight: '700', color: Colors.brand.deepGreen},
  helperText: {...Typography.caption, color: Colors.text.muted, marginTop: -Spacing.sm},
  submitContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border.warm,
  },
  successContainer: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: Radius.pill,
    backgroundColor: Colors.brand.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  successTitle: {...Typography.heading1, color: Colors.brand.deepGreen, marginTop: Spacing.md},
  successSubtitle: {
    ...Typography.bodySmall,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  summaryCard: {width: '100%', padding: Spacing.md},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  summaryRowLast: {borderBottomWidth: 0},
  summaryLabel: {...Typography.bodySmall, color: Colors.text.secondary},
  summaryValue: {
    flex: 1,
    ...Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'right',
  },
  summaryValueAccent: {color: Colors.brand.emerald, fontSize: 17},
  whatsappInfo: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.successSoft,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  whatsappText: {
    flex: 1,
    ...Typography.bodySmall,
    color: Colors.brand.deepGreen,
    marginLeft: Spacing.sm,
  },
  successActions: {width: '100%', gap: Spacing.sm, marginTop: Spacing.lg},
});

export default CollectionScreen;
