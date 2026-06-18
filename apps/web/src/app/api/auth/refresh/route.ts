import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('lazisnu_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token tidak ditemukan',
          },
        },
        { status: 401 }
      );
    }

    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

    if (process.env.NODE_ENV === 'production' && !backendUrl) {
      throw new Error(
        'Production configuration error: Both API_URL and NEXT_PUBLIC_API_URL environment variables are missing. ' +
        'Cannot route refresh token request safely.'
      );
    }

    const finalBackendUrl = backendUrl || 'http://localhost:3001';
    const backendRes = await fetch(`${finalBackendUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data = await backendRes.json();

    if (!backendRes.ok || !data.success) {
      // Clear cookies if refresh fails (since token is invalid or expired)
      const response = NextResponse.json(data, { status: backendRes.status });
      response.cookies.delete('lazisnu_token');
      response.cookies.delete('lazisnu_refresh_token');
      return response;
    }

    const { access_token, refresh_token: newRefreshToken } = data.data;

    const response = NextResponse.json({
      success: true,
      data: {
        access_token,
      },
    });

    // Set Access Token (non-HttpOnly for client Axios and middleware)
    response.cookies.set('lazisnu_token', access_token, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 1 day
      path: '/',
    });

    // Set Refresh Token (HttpOnly for security)
    if (newRefreshToken) {
      response.cookies.set('lazisnu_refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('[API AUTH REFRESH ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terjadi kesalahan pada server refresh proxy',
        },
      },
      { status: 500 }
    );
  }
}
