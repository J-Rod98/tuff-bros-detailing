import { bookingStore, detectImageType, json, safePhotoKey, takeRateLimit, validPhotoType, verifyBookingSession } from './lib/booking-security.mjs';

const MAX_FILE_BYTES = 4_250_000;

export default async (request) => {
  if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
  const session = await verifyBookingSession(request);
  if (!session.ok) return session.response;
  try {
    if (!await takeRateLimit(request, { name: 'photo-upload', limit: 30, windowMs: 5 * 60_000 })) {
      return json({ message: 'Too many photo uploads. Please wait a few minutes and try again.' }, 429);
    }
    const form = await request.formData();
    const file = form.get('file');
    const photoType = form.get('photoType');
    if (!(file instanceof File) || !validPhotoType(photoType)) return json({ message: 'Choose a valid booking photo.' }, 400);
    if (!file.size || file.size > MAX_FILE_BYTES) return json({ message: 'Each photo must be 4.25 MB or smaller after compression.' }, 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = detectImageType(bytes);
    if (!detected) return json({ message: 'Use a HEIC, JPG, PNG, or WebP image file.' }, 415);
    const id = safePhotoKey(photoType, detected.extension);
    await bookingStore('booking-photos').set(id, bytes, {
      metadata: { mime: detected.mime, photoType, sessionId: session.sessionId, uploadedAt: new Date().toISOString() }
    });
    return json({ id, photoType });
  } catch (error) {
    console.error('booking-upload failed', error);
    return json({ message: 'We could not securely store that photo. Please try again.' }, 500);
  }
};

export const config = {
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 300, windowLimit: 30 }
};
