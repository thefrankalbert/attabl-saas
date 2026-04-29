import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportRequestSchema } from '@/lib/validations/supports.schema';
import { supportsExportLimiter, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { Document, Page, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import React from 'react';

const W_CM = 21.7;
const H_CM = 11;
// 1 cm = 28.3465 pt (PDF points at 72 DPI base)
const CM2PT = 28.3465;

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    padding: 0,
  },
});

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = res.headers.get('content-type') ?? 'image/png';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function buildQrDataUrl(url: string, style: string): Promise<string> {
  const dark = style === 'inverted' || style === 'dark' ? '#FFFFFF' : '#000000';
  const light = style === 'inverted' ? '#000000' : '#FFFFFF';
  return QRCode.toDataURL(url, {
    width: 600,
    margin: 1,
    color: { dark, light },
  });
}

export async function POST(request: Request) {
  // 1. Rate limiting
  const ip = getClientIp(request);
  const { success: allowed } = await supportsExportLimiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de requetes' }, { status: 429 });
  }

  // 2. Validate input (before auth to fail fast on bad payloads)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = exportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const { config } = parsed.data;

  // 3. Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 4. Derive tenant from session (never trust client-supplied tenant identifiers)
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('slug, logo_url')
    .eq('id', adminUser.tenant_id)
    .maybeSingle();
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  try {
    // 5. Fetch assets using server-derived logo_url
    const logoUrl = tenant.logo_url ?? null;
    const [logoDataUrl, qrDataUrl] = await Promise.all([
      (config.logo.visible || config.verso === 'logo') && logoUrl
        ? fetchImageAsDataUrl(logoUrl)
        : Promise.resolve(null),
      buildQrDataUrl(config.qrCode.menuUrl, config.qrCode.style),
    ]);

    // 6. Build PDF page components
    const RectoPage = () =>
      React.createElement(
        Page,
        {
          size: [W_CM * CM2PT, H_CM * CM2PT] as [number, number],
          style: { ...styles.page, backgroundColor: config.background },
        },
        config.logo.visible && logoDataUrl
          ? React.createElement(Image, {
              src: logoDataUrl,
              style: {
                position: 'absolute',
                left: config.logo.x * CM2PT,
                top: config.logo.y * CM2PT,
                width: config.logo.width * CM2PT,
              },
            })
          : null,
        config.name.visible
          ? React.createElement(
              Text,
              {
                style: {
                  position: 'absolute',
                  left: config.name.x * CM2PT,
                  top: config.name.y * CM2PT,
                  fontSize: config.name.fontSize,
                  color: config.accentColor,
                  fontWeight: 700,
                },
              },
              config.name.text,
            )
          : null,
        config.tagline.visible
          ? React.createElement(
              Text,
              {
                style: {
                  position: 'absolute',
                  left: config.tagline.x * CM2PT,
                  top: config.tagline.y * CM2PT,
                  fontSize: config.tagline.fontSize,
                  color: config.accentColor,
                  opacity: 0.75,
                },
              },
              config.tagline.text,
            )
          : null,
        React.createElement(Image, {
          src: qrDataUrl,
          style: {
            position: 'absolute',
            left: config.qrCode.x * CM2PT,
            top: config.qrCode.y * CM2PT,
            width: config.qrCode.width * CM2PT,
            height: config.qrCode.width * CM2PT,
          },
        }),
      );

    const VersoPage = () => {
      if (config.verso === 'mirror') return React.createElement(RectoPage);
      return React.createElement(
        Page,
        {
          size: [W_CM * CM2PT, H_CM * CM2PT] as [number, number],
          style: { ...styles.page, backgroundColor: config.background },
        },
        logoDataUrl
          ? React.createElement(Image, {
              src: logoDataUrl,
              style: {
                position: 'absolute',
                left: (W_CM / 2 - config.logo.width / 2) * CM2PT,
                top: (H_CM / 2 - config.logo.width / 2) * CM2PT,
                width: config.logo.width * CM2PT,
              },
            })
          : null,
      );
    };

    const doc = React.createElement(
      Document,
      {},
      React.createElement(RectoPage),
      ...(config.verso !== 'none' ? [React.createElement(VersoPage)] : []),
    );

    const buffer = await renderToBuffer(doc);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="chevalet-${tenant.slug}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Supports export error', { error, userId: user.id });
    return NextResponse.json({ error: 'Erreur export' }, { status: 500 });
  }
}
