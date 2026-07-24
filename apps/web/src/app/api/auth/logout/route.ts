import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('lazisnu_refresh_token')?.value;

    if (refreshToken) {
      const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${backendUrl}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    }
  } catch (error) {
    console.error('[API AUTH LOGOUT ERROR]', error);
    // Continue clearing cookies even if backend logout fails
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('lazisnu_token');
  response.cookies.delete('lazisnu_refresh_token');

  return response;
}
