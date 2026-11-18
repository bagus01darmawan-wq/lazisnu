import {useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject} from 'react';
import {Keyboard, Platform, ScrollView, View} from 'react-native';
import {Spacing} from '../theme';

type ViewInstance = ComponentRef<typeof View>;

// Both values are window coordinates; a resized viewport needs no extra inset.
export function keyboardOverlap(viewportBottom: number, keyboardTop: number) {
  return Math.max(0, viewportBottom - keyboardTop);
}

export function useLoginKeyboard() {
  const viewportRef = useRef<ViewInstance>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const focusedField = useRef<RefObject<ViewInstance | null> | null>(null);
  const keyboardTop = useRef<number | null>(null);
  const [bottomInset, setBottomInset] = useState(0);

  const revealFocused = useCallback(() => {
    const scroll = scrollRef.current;
    const target = focusedField.current?.current;
    if (!scroll || !target) {
      return;
    }
    target.measureLayout(
      scroll,
      (_x, y) => scroll.scrollTo({y: Math.max(0, y - Spacing.sm), animated: true}),
      () => {},
    );
  }, []);

  const updateInset = useCallback(() => {
    if (Platform.OS !== 'android' || keyboardTop.current === null) {
      return;
    }
    viewportRef.current?.measureInWindow((_x, y, _width, height) => {
      if (keyboardTop.current !== null) {
        setBottomInset(keyboardOverlap(y + height, keyboardTop.current));
      }
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      updateInset();
      // Focus can precede keyboard display even when the window has resized.
      requestAnimationFrame(revealFocused);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setBottomInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [revealFocused, updateInset]);

  const reveal = useCallback(
    (field: RefObject<ViewInstance | null>) => {
      focusedField.current = field;
      revealFocused();
    },
    [revealFocused],
  );

  const blur = useCallback((field: RefObject<ViewInstance | null>) => {
    if (focusedField.current === field) {
      focusedField.current = null;
    }
  }, []);

  const onViewportLayout = useCallback(() => {
    updateInset();
    if (keyboardTop.current !== null) {
      requestAnimationFrame(revealFocused);
    }
  }, [revealFocused, updateInset]);

  const onScrollLayout = useCallback(() => {
    if (focusedField.current) {
      requestAnimationFrame(revealFocused);
    }
  }, [revealFocused]);

  return {viewportRef, scrollRef, bottomInset, reveal, blur, onViewportLayout, onScrollLayout};
}
