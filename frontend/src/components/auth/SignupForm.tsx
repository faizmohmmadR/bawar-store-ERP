import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignupFormProps {
  onToggleMode: () => void;
}

export const SignupForm = ({ onToggleMode }: SignupFormProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { signup, isLoading } = useAuth();
  const { t, direction } = useLanguage();

  const signupSchema = z
    .object({
      name: z.string().min(2, t('auth.nameMin', 'Name must be at least 2 characters')),
      email: z.string().email(t('auth.invalidEmail', 'Invalid email address')),
      password: z.string().min(6, t('auth.passwordMinSignup', 'Password must be at least 6 characters')),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.passwordsMismatch', "Passwords don't match"),
      path: ['confirmPassword'],
    });

  type SignupFormData = z.infer<typeof signupSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    try {
      await signup(data.email, data.password, data.name);
    } catch {
      // Error is handled in the auth context
    }
  };

  const iconPad = direction === 'rtl' ? 'pr-10' : 'pl-10';
  const togglePad = direction === 'rtl' ? 'left-0' : 'right-0';

  const PasswordField = ({
    id,
    show,
    onToggle,
    placeholder,
    error,
    registerProps,
  }: {
    id: string;
    show: boolean;
    onToggle: () => void;
    placeholder: string;
    error?: string;
    registerProps: ReturnType<typeof register>;
  }) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(`auth.${id === 'password' ? 'password' : 'confirmPassword'}`)}</Label>
      <div className="relative">
        <Lock
          className={cn(
            'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none',
            direction === 'rtl' ? 'right-3' : 'left-3',
          )}
        />
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={id === 'password' ? 'new-password' : 'new-password'}
          placeholder={placeholder}
          className={cn(
            iconPad,
            direction === 'rtl' ? 'pl-10' : 'pr-10',
            'h-11',
            error && 'border-destructive focus-visible:ring-destructive',
          )}
          {...registerProps}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'absolute top-0 h-full px-3 hover:bg-transparent text-muted-foreground',
            togglePad,
          )}
          onClick={onToggle}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );

  return (
    <div className="w-full">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {t('auth.createAccount', 'Create account')}
        </h2>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          {t('auth.signUpSubtitle', 'Get started with your ERP workspace')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('auth.fullName', 'Full name')}</Label>
          <div className="relative">
            <User
              className={cn(
                'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none',
                direction === 'rtl' ? 'right-3' : 'left-3',
              )}
            />
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder={t('auth.fullNamePlaceholder', 'John Doe')}
              className={cn(iconPad, 'h-11', errors.name && 'border-destructive focus-visible:ring-destructive')}
              {...register('name')}
            />
          </div>
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email', 'Email')}</Label>
          <div className="relative">
            <Mail
              className={cn(
                'absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none',
                direction === 'rtl' ? 'right-3' : 'left-3',
              )}
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('auth.emailPlaceholder', 'name@company.com')}
              className={cn(iconPad, 'h-11', errors.email && 'border-destructive focus-visible:ring-destructive')}
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <PasswordField
          id="password"
          show={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          placeholder={t('auth.passwordPlaceholder', 'Enter your password')}
          error={errors.password?.message}
          registerProps={register('password')}
        />

        <PasswordField
          id="confirmPassword"
          show={showConfirmPassword}
          onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
          placeholder={t('auth.confirmPasswordPlaceholder', 'Re-enter your password')}
          error={errors.confirmPassword?.message}
          registerProps={register('confirmPassword')}
        />

        <Button type="submit" className="w-full h-11 text-base font-medium mt-2" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('auth.creatingAccount', 'Creating account...')}
            </>
          ) : (
            t('auth.createAccount', 'Create account')
          )}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t('auth.hasAccount', 'Already have an account?')}{' '}
        <Button
          variant="link"
          className="p-0 h-auto font-medium text-primary"
          onClick={onToggleMode}
        >
          {t('auth.signIn', 'Sign in')}
        </Button>
      </p>
    </div>
  );
};
