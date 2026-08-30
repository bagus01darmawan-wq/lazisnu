// Mock jest react-native-svg: cukup untuk render smoke test (ring progres
// tidak perlu divisualisasikan di test).
const React = require('react');
const {View} = require('react-native');

const Svg = ({children}) => React.createElement(View, {testID: 'svg-mock'}, children);
const Circle = () => null;

module.exports = {__esModule: true, default: Svg, Circle};
