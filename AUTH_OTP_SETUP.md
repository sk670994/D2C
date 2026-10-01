# Zooptrack Email OTP setup

1. Replace:
- components/auth/EmailAuthForm.tsx
- app/login/page.tsx

2. Supabase Dashboard → Authentication → Email Templates → Magic Link.
Use an OTP template containing:
{{ .Token }}

Example:
<h2>Your Zooptrack verification code</h2>
<p>Enter this 6-digit code to sign in to Zooptrack:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>

3. Configure production SMTP for Supabase Auth. The existing Resend helper in
lib/email/send.ts is for application email; it does not automatically configure
Supabase Auth SMTP.

Recommended sender:
Zooptrack <auth@zooptrack.co.in>

hello.zooptrack@gmail.com can remain the support address.

4. Keep Google OAuth enabled.

5. After testing, disable password authentication in Supabase Auth if you want
email OTP to be the only email login method.

6. Test locally:
npm run lint
npm run build
npm run dev

Test:
- Sign Up → real email → OTP → /today
- Sign In → same email → fresh OTP → /today
- Check user_profiles has the correct auth user_id
- Try a made-up email/OTP: it must not authenticate
- Try an expired/incorrect OTP: it must not authenticate

The phone number collected during signup is profile data only. It is not
verified until Mobile OTP is implemented.
