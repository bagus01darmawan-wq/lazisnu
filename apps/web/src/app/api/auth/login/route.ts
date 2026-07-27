import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, password, device_id } = body;

    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

    if (process.env.NODE_ENV === 'production' && !backendUrl) {
      throw new Error(
        'Production configuration error: Both API_URL and NEXT_PUBLIC_API_URL environment variables are missing. ' +
        'Cannot route login request safely.'
      );
    }

    const finalBackendUrl = backendUrl || 'http://localhost:3001';

    // Build device info for backend
    const deviceId = device_id || request.cookies.get('lazisnu_device_id')?.value;
    const backendBody: Record<string, string> = { identifier, password };
    if (deviceId) {
      backendBody.device_id = deviceId;
      backendBody.device_label = 'Web Dashboard';
    }

    const backendRes = await fetch(`${finalBackendUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backendBody),
    });

    const data = await backendRes.json();

    if (!backendRes.ok || !data.success) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    const { access_token, refresh_token, user } = data.data;

    const response = NextResponse.json({
      success: true,
      data: {
        access_token,
        user,
      },
    });

    // Set Access Token (non-HttpOnly for client Axios and middleware)
    // maxAge 15 menit = 900 detik, sesuai TTL access token
    response.cookies.set('lazisnu_token', access_token, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 15, // 15 menit
      path: '/',
    });

    // Set Refresh Token (HttpOnly for security)
    if (refresh_token) {
      response.cookies.set('lazisnu_refresh_token', refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }

    // Persist deviceId cookie (non-HttpOnly) agar route handler refresh bisa membacanya
    if (deviceId) {
      response.cookies.set('lazisnu_device_id', deviceId, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 365, // 365 hari — sama dengan refresh token TTL
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('[API AUTH LOGIN ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Terjadi kesalahan pada server login proxy',
        },
      },
      { status: 500 }
    );
  }
}
