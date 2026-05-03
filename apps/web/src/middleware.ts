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
    try {
      const secret = new TextEncoder().encode(process.env.NEXT_PUBLIC_JWT_SECRET || process.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;

      const path = request.nextUrl.pathname;

      // Restricted routes for Admin Kecamatan
      if ((path.includes('/users') || path.includes('/audit-log') || path.includes('/wa-monitor')) && 
          userRole !== 'ADMIN_KECAMATAN') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }
      
      // Restricted routes for Reports (all except petugas)
      if (path.includes('/reports') && userRole === 'PETUGAS') {
        return NextResponse.redirect(new URL('/dashboard/overview', request.url));
      }
    } catch (e) {
      // Invalid token format
      return NextResponse.redirect(new URL('/login', request.url));
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
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
