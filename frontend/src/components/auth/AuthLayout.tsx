import React from 'react';
import { BarChart3, ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/contexts/LanguageContext';
import { Language, languageNames } from '@/i18n';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { MadeByCredit } from '@/components/layout/MadeByCredit';
import '@/styles/auth.css';

interface AuthLayoutProps {
  children: React.ReactNode;
  wide?: boolean;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, wide = false }) => {
  const { language, changeLanguage, direction, t } = useLanguage();

  return (
    <div
      className="auth-shell relative flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain text-white"
      dir={direction}
      style={{
        background:
          'radial-gradient(1200px 720px at 12% 18%, rgba(245,158,26,0.18), transparent 52%), radial-gradient(1000px 640px at 88% 82%, rgba(31,118,209,0.18), transparent 50%), linear-gradient(155deg, #0b0d11 0%, #111827 20%, #0b0d11 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="auth-glow absolute -left-20 top-10 h-[26rem] w-[26rem] rounded-full blur-3xl"
          style={{ backgroundColor: `${BRAND.colors.primary}33` }}
        />
        <div
          className="auth-glow absolute -right-20 bottom-0 h-[30rem] w-[30rem] rounded-full blur-3xl"
          style={{ backgroundColor: `${BRAND.colors.secondary}26`, animationDelay: '-5s' }}
        />
        <div className="auth-grid-pattern absolute inset-0 opacity-20" />
      </div>

      <header className="relative z-20 flex shrink-0 items-center justify-between px-4 py-3 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="auth-logo-shell rounded-2xl border border-white/10 bg-white/5 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.22)] backdrop-blur-sm">
            <img
              src={BRAND.logo}
              alt={BRAND.name}
              className="h-9 w-auto max-w-[115px] object-contain sm:h-11 sm:max-w-[130px]"
            />
          </div>
          <div className="hidden sm:block">
            <p className="auth-display text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
              {t('core.app.sidebarTitle', BRAND.sidebarTitle)}
            </p>
            <p className="text-[10px] tracking-[0.18em] text-white/55">
              {t('core.app.location', BRAND.location)}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-white/85 shadow-[0_8px_25px_rgba(0,0,0,0.22)] hover:bg-white/10 hover:text-white"
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">{languageNames[language]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={direction === 'rtl' ? 'start' : 'end'}>
            {(Object.keys(languageNames) as Language[]).map((lang) => (
              <DropdownMenuItem
                key={lang}
                onClick={() => changeLanguage(lang)}
                className={cn(language === lang && 'bg-accent')}
              >
                {languageNames[lang]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 content-center gap-8 px-4 py-4 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-12 lg:py-8">
        <section className="auth-anim-up hidden lg:flex lg:items-center">
          <div className="auth-brand-panel w-full max-w-xl rounded-[32px] border border-white/10 bg-white/5 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="mb-7 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
              <img src={BRAND.logo} alt={BRAND.name} className="h-14 w-auto max-w-[150px] object-contain" />
            </div>

            <p
              className="auth-display mb-3 text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: BRAND.colors.primary }}
            >
              {t('core.app.tagline', BRAND.tagline)}
            </p>

            <h1 className="auth-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-white xl:text-5xl">
              {t('core.app.title', BRAND.name)}
            </h1>

            <div
              className="auth-accent-line mt-5 h-1 w-24 rounded-full"
              style={{
                background: `linear-gradient(90deg, ${BRAND.colors.primary}, ${BRAND.colors.secondary})`,
              }}
            />

            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/70 sm:text-lg">
              {t('auth.secureAccess', 'One system. Clear control.')}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { icon: ShieldCheck, label: 'Secure', value: '99.9%' },
                { icon: BarChart3, label: 'Operations', value: 'Live' },
                { icon: BarChart3, label: 'Insights', value: 'Live' },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div
                    className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${BRAND.colors.primary}1A`, color: BRAND.colors.primary }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-white/65">
              <span>{t('core.app.subtitle', BRAND.subtitle)}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
              <a
                href={BRAND.facebook || '#'}
                target={BRAND.facebook ? '_blank' : undefined}
                rel={BRAND.facebook ? 'noopener noreferrer' : undefined}
                className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-white"
                style={{ color: BRAND.colors.primary }}
              >
                Mirbat Zada
                {BRAND.facebook && <ExternalLink className="h-3 w-3" />}
              </a>
            </div>
          </div>
        </section>

        <section className="auth-anim-up auth-anim-up-delay-2 w-full lg:flex lg:justify-end">
          <div className="mb-4 lg:hidden">
            <p
              className="auth-display text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: BRAND.colors.primary }}
            >
              {t('core.app.tagline', BRAND.tagline)}
            </p>
            <h1 className="auth-display mt-1 text-2xl font-bold leading-tight text-white">
              {t('core.app.title', BRAND.name)}
            </h1>
          </div>

          <div
            className={cn(
              'auth-form-shell w-full rounded-[30px] border border-white/10 bg-[#0b0d11]/80 p-4 shadow-[0_32px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-6 lg:ml-auto',
              wide ? 'max-w-3xl' : 'max-w-[460px]',
            )}
          >
            <div className="mb-4 flex justify-end">
              <span
                className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  borderColor: `${BRAND.colors.primary}55`,
                  backgroundColor: `${BRAND.colors.primary}14`,
                  color: BRAND.colors.primary,
                }}
              >
                ERP
              </span>
            </div>

            <InstallPrompt />
            {children}
          </div>
        </section>
      </div>

      <footer className="relative z-20 shrink-0 px-4 pb-4 pt-1 sm:px-8 lg:px-12 print:hidden">
        <MadeByCredit variant="auth" className="w-full" />
      </footer>
    </div>
  );
};
