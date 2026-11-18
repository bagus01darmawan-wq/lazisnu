import {ScrollView, View} from 'react-native';
import {useCallback, useRef, type ComponentRef, type RefObject} from 'react';
import {Spacing} from '../theme';

type ViewInstance = ComponentRef<typeof View>;

/**
 * Android (edge-to-edge, RN 0.88): adjustResize tidak menggeser konten dan
 * RN tidak auto-scroll ke input fokus — field yang jauh dari atas tertutup
 * keyboard. Hook ini mengukur posisi wrapper field (measureLayout) lalu
 * men-scroll ScrollView induk agar field yang fokus selalu terlihat.
 */
export function useFieldReveal() {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const reveal = useCallback((field: RefObject<ViewInstance | null>) => {
    const scroll = scrollRef.current;
    const target = field.current;
    if (!scroll || !target) {
      return;
    }
    target.measureLayout(
      scroll,
      (_x, y) => scroll.scrollTo({y: Math.max(0, y - Spacing.sm), animated: true}),
      () => {},
    );
  }, []);

  return {scrollRef, reveal};
}
