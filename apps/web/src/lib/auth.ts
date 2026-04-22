import Cookies from 'js-cookie';

const TOKEN_NAME = 'lazisnu_token';
const REFRESH_TOKEN_NAME = 'lazisnu_refresh_token';

export const authHelper = {
  setToken: (token: string) => {
    Cookies.set(TOKEN_NAME, token, {
      expires: 1, // 1 day
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  },

  getToken: () => {
    return Cookies.get(TOKEN_NAME);
  },

  setRefreshToken: (token: string) => {
    Cookies.set(REFRESH_TOKEN_NAME, token, {
      expires: 7, // 7 days
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
  },

  getRefreshToken: () => {
    return Cookies.get(REFRESH_TOKEN_NAME);
  },

  removeToken: () => {
    Cookies.remove(TOKEN_NAME);
    Cookies.remove(REFRESH_TOKEN_NAME);
  },

  isAuthenticated: () => {
    return !!Cookies.get(TOKEN_NAME);
  },
};
