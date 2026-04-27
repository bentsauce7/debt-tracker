import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json({ error: 'Authentication is handled by Clerk' }, { status: 410 });
}
