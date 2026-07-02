/**
 * SMS delivery hook. Offline by default (logs to console) so the platform works
 * with no gateway. If an SMS provider is configured later (e.g. Africa's Talking
 * or Twilio), implement the call here — no caller changes required. This is the
 * clean seam for the "SMS/USSD fallback" roadmap item.
 */
export async function sendSms(to: string | null | undefined, body: string): Promise<void> {
  if (!to) return;
  const provider = process.env.SMS_PROVIDER?.trim();
  if (!provider) {
    console.log(`[SMS offline] -> ${to}: ${body}`);
    return;
  }
  // Placeholder for a real provider integration.
  console.log(`[SMS ${provider}] -> ${to}: ${body}`);
}
