import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ArrowRight,
} from 'lucide-react';
import useAdd from '@/api/useAdd';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import {
  buildSessionUser,
  extractAuthToken,
  mapLoginUser,
  type LoginApiResponse,
} from '@/lib/authSession';
import { toast } from 'sonner';

export const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const { setUser } = useAuth();
  const { t, direction } = useLanguage();
  const navigate = useNavigate();

  const loginSchema = z.object({
    email: z.string().email(t('auth.invalidEmail', 'Invalid email address')),
    password: z.string().min(4, t('auth.passwordMinLogin', 'Password must be at least 4 characters')),
  });

  type LoginFormData = z.infer<typeof loginSchema>;

  const { handleAdd, loading, responseData } = useAdd<any>({
    queryKey: 'login',
    endpoint: 'login/',
    showSuccessToast: false,
    customErrorMessage: 'Login failed. Please check your credentials.',
  });

  React.useEffect(() => {
    if (!responseData) return;

    const loginData = responseData as LoginApiResponse;
    const token = extractAuthToken(loginData);
    if (!token) {
      toast.error(t('auth.loginFailed', 'Login failed'), {
        description: t('auth.missingToken', 'No session token was returned. Please try again.'),
      });
      return;
    }

    const baseUser = mapLoginUser(loginData);
    const session = buildSessionUser({ ...baseUser, token });
    if (session && setUser(session)) {
      navigate('/');
    }
  }, [responseData, setUser, navigate, t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormData) => {
    handleAdd(data);
  };

  const iconPad = direction === 'rtl' ? 'pr-11' : 'pl-11';
  const togglePad = direction === 'rtl' ? 'left-1' : 'right-1';

  return (
    <div className="w-full text-white">
      <div className="auth-anim-up mb-8">
        <p
          className="auth-display mb-2 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: BRAND.colors.primary }}
        >
          {t('core.app.subtitle', BRAND.subtitle)}
        </p>
        <h2 className="auth-display text-3xl font-bold tracking-tight text-white sm:text-[2rem]">
          {t('auth.welcomeBack', 'Welcome back')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          {t('auth.signInSubtitle', 'Sign in with your credentials to open the workspace')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="auth-anim-up auth-anim-up-delay-2 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-white/70">
            {t('auth.email', 'Email')}
          </Label>
          <div className="relative">
            <Mail
              className={cn(
                'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-white/35',
                direction === 'rtl' ? 'right-3.5' : 'left-3.5',
              )}
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder', 'name@company.com')}
              className={cn(
                iconPad,
                'h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:border-primary/50 focus-visible:ring-primary/30',
                errors.email && 'border-destructive focus-visible:ring-destructive',
              )}
              {...register('email')}
            />
          </div>
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-white/70">
            {t('auth.password', 'Password')}
          </Label>
          <div className="relative">
            <Lock
              className={cn(
                'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-white/35',
                direction === 'rtl' ? 'right-3.5' : 'left-3.5',
              )}
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
              className={cn(
                iconPad,
                direction === 'rtl' ? 'pl-11' : 'pr-11',
                'h-12 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30 focus-visible:border-primary/50 focus-visible:ring-primary/30',
                errors.password && 'border-destructive focus-visible:ring-destructive',
              )}
              {...register('password')}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'absolute top-0 h-full px-3 text-white/40 hover:bg-transparent hover:text-white/80',
                togglePad,
              )}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="h-12 w-full text-base font-semibold shadow-[0_12px_40px_rgba(70,176,72,0.25)]"
          style={{
            background: `linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primary}dd)`,
          }}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('auth.signingIn', 'Signing in...')}
            </>
          ) : (
            <>
              {t('auth.signIn', 'Sign in')}
              <ArrowRight className={cn('h-4 w-4', direction === 'rtl' && 'rotate-180')} />
            </>
          )}
        </Button>
      </form>
    </div>
  );
};
