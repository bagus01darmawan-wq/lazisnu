import Cookies from 'js-cookie';

const TOKEN_NAME = 'lazisnu_token';

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

  removeToken: () => {
    Cookies.remove(TOKEN_NAME);
  },

  isAuthenticated: () => {
    return !!Cookies.get(TOKEN_NAME);
  },
};
