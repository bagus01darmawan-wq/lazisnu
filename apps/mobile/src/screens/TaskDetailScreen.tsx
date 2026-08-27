import React from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppButton, AppHeader} from '../components/ui';
import {useTasksStore} from '../stores';
import {KalengInfoCard} from './scan';
import {Colors, Radius, Spacing, Typography} from '../theme';
import type {RootStackParamList} from '../navigation/types';

/**
 * Detail Penjemputan — dibuka dengan menekan KARTU TUGAS (belum dijemput)
 * di halaman Tugas. Variasi dari "Detail Kaleng" hasil scan:
 * TANPA ikon centang & "QR Code Terdeteksi!" (itu eksklusif alur kamera),
 * ditambah baris Periode dan aksi tidak-lanjut / lanjutkan.
 */
const TaskDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>();
  const {task} = route.params;

  const handleSkip = () => {
    Alert.alert(
      'Tandai Tidak Dijemput',
      `Tandai kaleng ${task.qr_code} sebagai tidak dijemput untuk periode berjalan?`,
      [
        {text: 'Batal', style: 'cancel'},
        {
          text: 'Ya, Tandai',
          onPress: async () => {
            const result = await useTasksStore.getState().skipAssignment(task.id);
            if (result.success) {
              // Segarkan daftar di belakang lalu kembali.
              useTasksStore
                .getState()
                .fetchTasks('ACTIVE')
                .catch(() => {});
              navigation.goBack();
            } else {
              // Pesan jujur: alasan asli (server / jaringan) — bukan tuduhan sinyal.
              Alert.alert('Gagal Menandai', result.error || 'Gagal menandai kaleng. Coba lagi.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <AppHeader variant="stack" onBack={() => navigation.goBack()} />

      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Icon name="clipboard-list-outline" size={48} color={Colors.brand.deepGreen} />
        </View>
        <Text style={styles.headTitle}>Detail Penjemputan</Text>
      </View>

      <View style={styles.body}>
        <KalengInfoCard task={task} showPeriod />

        <View style={styles.actions}>
          <AppButton label="Tidak Dijemput" variant="outline" onPress={handleSkip} fullWidth />
          <AppButton
            label="Lanjutkan"
            icon="arrow-right"
            onPress={() => navigation.navigate('Collection', {task})}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface.page,
  },
  head: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headTitle: {
    ...Typography.heading2,
    color: Colors.brand.deepGreen,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  body: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  actions: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});

export default TaskDetailScreen;
