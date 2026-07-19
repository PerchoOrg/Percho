import { ForgotPasswordForm } from './forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-5">
      <ForgotPasswordForm />
      <p className="text-center text-sm text-ink2">
        Remembered it?{' '}
        <a href="/login" className="text-ink underline hover:text-ink/80">
          Log in
        </a>
      </p>
    </div>
  );
}
