import React from 'react';
import {Keyboard, Platform, ScrollView, View, type KeyboardEvent} from 'react-native';
import renderer from 'react-test-renderer';
import {keyboardOverlap, useLoginKeyboard} from '../src/hooks/useLoginKeyboard';

describe('login keyboard handling', () => {
  it('only adds the part of the keyboard covering the viewport', () => {
    expect(keyboardOverlap(800, 500)).toBe(300);
    expect(keyboardOverlap(500, 500)).toBe(0);
    expect(keyboardOverlap(480, 500)).toBe(0);
  });

  it('reveals a field focused before the keyboard and adjusts when the viewport resizes', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', {value: 'android', configurable: true});
    const listeners: Record<string, (event: KeyboardEvent) => void> = {};
    const subscription = {remove: jest.fn()};
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => {
      listeners[name] = listener;
      return subscription;
    });
    const animationFrame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(0);
        return 1;
      });
    const scrollTo = jest.fn();
    let viewportHeight = 800;
    let api!: {
      viewportRef: React.RefObject<React.ComponentRef<typeof View> | null>;
      scrollRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
      bottomInset: number;
      reveal: (field: React.RefObject<React.ComponentRef<typeof View> | null>) => void;
      onViewportLayout: () => void;
      onScrollLayout: () => void;
    };
    // Native measurement is represented by doubles installed on the hook's refs.
    const field = {
      current: {
        measureLayout: (_scroll: unknown, success: (x: number, y: number) => void) =>
          success(0, 600),
      } as unknown as React.ComponentRef<typeof View>,
    };
    const TestScreen = () => {
      api = useLoginKeyboard();
      return null;
    };
    let tree!: renderer.ReactTestRenderer;
    try {
      await renderer.act(async () => {
        tree = renderer.create(<TestScreen />);
      });
      Object.assign(api.viewportRef, {
        current: {
          measureInWindow: (
            callback: (x: number, y: number, width: number, height: number) => void,
          ) => callback(0, 0, 400, viewportHeight),
        },
      });
      Object.assign(api.scrollRef, {current: {scrollTo}});
      const show = listeners.keyboardDidShow;
      const hide = listeners.keyboardDidHide;
      if (!show || !hide) {
        throw new Error('Keyboard listeners were not registered');
      }
      await renderer.act(async () => {
        api.reveal(field);
        scrollTo.mockClear();
        show({endCoordinates: {screenY: 500}} as KeyboardEvent);
      });
      expect(api.bottomInset).toBe(300);
      await renderer.act(async () => {
        viewportHeight = 500;
        api.onViewportLayout();
        api.onScrollLayout();
      });
      expect(api.bottomInset).toBe(0);
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({y: expect.any(Number)}));
      await renderer.act(async () => hide({} as KeyboardEvent));
      expect(api.bottomInset).toBe(0);
    } finally {
      if (tree) {
        await renderer.act(async () => tree.unmount());
      }
      addListener.mockRestore();
      animationFrame.mockRestore();
      Object.defineProperty(Platform, 'OS', {value: originalOS, configurable: true});
    }
  });
});
