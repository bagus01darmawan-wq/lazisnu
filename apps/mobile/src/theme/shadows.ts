import {Colors} from './colors';

export const Shadows = {
  soft: {
    shadowColor: Colors.overlay.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  medium: {
    shadowColor: Colors.overlay.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  strong: {
    shadowColor: Colors.overlay.shadow,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
};
