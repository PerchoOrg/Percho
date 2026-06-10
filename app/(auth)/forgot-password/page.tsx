import { ForgotPasswordForm } from './forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-5">
      <ForgotPasswordForm />
      <p className="text-center text-sm text-cream/60">
        Remembered it?{' '}
        <a href="/login" className="text-gold underline hover:text-gold/80">
          Sign in
        </a>
      </p>
    </div>
  );
}
