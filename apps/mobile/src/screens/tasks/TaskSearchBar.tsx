import React from 'react';
import {StyleSheet, TextInput, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Radius, Spacing, Typography} from '../../theme';

export interface TaskSearchBarProps {
  searchQuery: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

export const TaskSearchBar: React.FC<TaskSearchBarProps> = ({
  searchQuery,
  onChangeText,
  onClear,
}) => {
  return (
    <View style={styles.searchContainer}>
      <Icon name={'magnify'} size={24} color={Colors.brand.deepGreen} />
      <TextInput
        placeholder={'Cari nama donatur atau alamat...'}
        placeholderTextColor={Colors.brand.deepGreen + '70'}
        value={searchQuery}
        onChangeText={onChangeText}
        style={styles.searchInput}
        autoCapitalize={'none'}
        autoCorrect={false}
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Hapus pencarian'}
          onPress={onClear}>
          <Icon name={'close-circle'} size={20} color={Colors.brand.deepGreen} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  searchContainer: {
    paddingVertical: Spacing.xs - 2,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand.mutedSand,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.brand.deepGreen,
    paddingVertical: 4,
    height: 40,
  },
});

export default TaskSearchBar;
