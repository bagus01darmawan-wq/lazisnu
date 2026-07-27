import Cookies from 'js-cookie';

const TOKEN_NAME = 'lazisnu_token';

export const authHelper = {
  setToken: (token: string) => {
    Cookies.set(TOKEN_NAME, token, {
      // 15 menit — server akan overwrite dengan response cookie, jadi
      // client-side set hanya dipakai sebagai fallback saat refresh interceptor.
      expires: new Date(Date.now() + 15 * 60 * 1000),
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
