import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('lazisnu_token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');

  // 1. Redirect to login if no token and trying to access dashboard
  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Redirect to dashboard if already logged in and trying to access login page
  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard/overview', request.url));
  }

  // 3. Proper Role Check using JWT decoding
  if (token && !isAuthPage) {
    const jwtSecretRaw = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!jwtSecretRaw || jwtSecretRaw.length < 32) {
      console.error('[SECURITY] JWT_ACCESS_SECRET (atau JWT_SECRET fallback) tidak terkonfigurasi atau kurang dari 32 karakter!');
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('lazisnu_token');
      return response;
    }

    try {
      const secret = new TextEncoder().encode(jwtSecretRaw);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;

      const path = request.nextUrl.pathname;

      // Restricted routes for Admin Kecamatan only
      if ((path.includes('/audit-log')) && 
          userRole !== 'ADMIN_KECAMATAN') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }

      // Restricted routes: users only for Kecamatan + Ranting
      if (path.includes('/users') && 
          userRole !== 'ADMIN_KECAMATAN' && userRole !== 'ADMIN_RANTING') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }

      // Restricted routes: wa-monitor only for Kecamatan, Ranting, and Bendahara
      if (path.includes('/wa-monitor') && 
          userRole !== 'ADMIN_KECAMATAN' && userRole !== 'ADMIN_RANTING' && userRole !== 'BENDAHARA') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }
      
      // Restricted routes for Reports (all except petugas)
      if (path.includes('/reports') && userRole === 'PETUGAS') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }

      // Re-submit tracker is read-only and available to all dashboard reporting roles.
      if (path.includes('/resubmit') && 
          userRole !== 'ADMIN_KECAMATAN' && userRole !== 'ADMIN_RANTING' && userRole !== 'BENDAHARA') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }
    } catch {
      // Invalid token or missing JWT_SECRET
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('lazisnu_token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp)$).*)',
  ],
};
