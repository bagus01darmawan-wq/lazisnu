import React from 'react';
import {Image, View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors, ComponentSizes, Spacing, Typography} from '../../theme';
import {usePeriodStore} from '../../stores';

// Versi crop pas ke konten (tanpa padding transparan bawah bawaan aslinya)
// supaya mark sejajar optis dengan judul di header.
const logo = require('../../assets/branding/logo-lazisnu-mark.png');

type AppHeaderVariant = 'auth' | 'main' | 'stack';

type AppHeaderProps = {
  variant: AppHeaderVariant;
  title?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
};

export const AppHeader: React.FC<AppHeaderProps> = ({variant, title, onBack, rightAction}) => {
  const insets = useSafeAreaInsets();
  const isStalePeriod = usePeriodStore(state => state.isStale);

  if (variant === 'auth') {
    return (
      <View style={[styles.container, styles.authContainer]}>
        <Image
          source={logo}
          style={styles.authLogo}
          resizeMode="contain"
          accessibilityLabel="Logo LAZISNU"
        />
        {title && <Text style={styles.authTitle}>{title}</Text>}
      </View>
    );
  }

  if (variant === 'main') {
    return (
      <View style={[styles.safeContainer, {paddingTop: insets.top}]}>
        <View style={styles.headerRow}>
          <View style={styles.mainLeft}>
            <Image
              source={logo}
              style={styles.mainLogo}
              resizeMode="contain"
              accessibilityLabel="Logo LAZISNU"
            />
            {title && (
              <Text style={styles.mainTitle} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
          <View style={styles.rightAction}>{rightAction}</View>
        </View>
        {isStalePeriod ? (
          <View
            style={styles.staleBar}
            accessibilityRole="status"
            accessibilityLabel="Periode dari penyimpanan, sedang menyinkronkan data terbaru">
            <Icon name="timer-sand" size={13} color={Colors.status.warning} />
            <Text style={styles.staleBarText}>
              Periode dari penyimpanan — menyinkronkan…
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        styles.safeContainer,
        {paddingTop: insets.top, height: ComponentSizes.buttonHeight + insets.top},
      ]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Kembali"
        hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
        <Icon name="arrow-left" size={24} color={Colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.stackTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rightAction}>{rightAction}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ComponentSizes.buttonHeight,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface.page,
  },
  safeContainer: {
    backgroundColor: Colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  staleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface.warningSoft,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  staleBarText: {
    fontSize: 11,
    color: Colors.status.warning,
    fontWeight: '600',
  },
  // Baris konten persis 56px — dipisah dari paddingTop insets.top supaya
  // logo+judul benar-benar center terhadap header, bukan terhadap (56 + inset).
  headerRow: {
    height: ComponentSizes.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  authContainer: {
    flexDirection: 'column',
    height: 'auto',
    paddingVertical: Spacing.xl,
    justifyContent: 'center',
  },
  authTitle: {
    ...Typography.heading1,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  authLogo: {
    width: 140,
    height: 75,
  },
  mainLogo: {
    // rasio mark 512x191 (~2.68)
    width: 64,
    height: 24,
  },
  mainLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainTitle: {
    ...Typography.heading2,
    marginLeft: Spacing.sm,
    flexShrink: 1,
  },
  backButton: {
    marginRight: Spacing.md,
    minHeight: ComponentSizes.minimumTouchTarget,
    minWidth: ComponentSizes.minimumTouchTarget,
    justifyContent: 'center',
    alignItems: 'flex-start', // supaya touch target lebar tapi icon di kiri
  },
  stackTitle: {
    ...Typography.heading3,
    flex: 1,
  },
  rightAction: {
    minHeight: ComponentSizes.minimumTouchTarget,
    minWidth: ComponentSizes.minimumTouchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
});
