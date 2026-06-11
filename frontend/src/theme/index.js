import { extendTheme } from '@chakra-ui/react';

const config = {
  initialColorMode: 'light',
  useSystemColorMode: false,
};

const colors = {
  navy: {
    50: '#eef1f8',
    100: '#d4dae8',
    200: '#a9b5d1',
    300: '#7e90ba',
    400: '#536ba3',
    500: '#2a4578',
    600: '#1f3560',
    700: '#152748',
    800: '#0f1729',
    900: '#0a0f1c',
  },
  gold: {
    50: '#fbf6e8',
    100: '#f5e9c4',
    200: '#ebd389',
    300: '#e0bc4e',
    400: '#d4a62e',
    500: '#c9a227',
    600: '#a8841f',
    700: '#876619',
    800: '#654912',
    900: '#432c0c',
  },
};

const theme = extendTheme({ config, colors });

export default theme;
