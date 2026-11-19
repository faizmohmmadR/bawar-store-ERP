import { useEffect, useMemo, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'pwa_install_prompt_dismissed';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [iosHint, setIosHint] = useState(false);

  const isStandalone = useMemo(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || !!nav.standalone;
  }, []);

  useEffect(() => {
    if (isStandalone) return;
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|opr\//.test(ua);
    setIosHint(isIos && isSafari);
  }, [isStandalone]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isStandalone || dismissed || (!deferred && !iosHint)) return null;

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div className="mb-3 rounded-xl border border-white/12 bg-black/35 p-3 text-white/85 backdrop-blur">
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 rounded-md p-1.5"
          style={{ backgroundColor: `${BRAND.colors.primary}22`, color: BRAND.colors.primary }}
        >
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install App</p>
          {iosHint && !deferred ? (
            <p className="mt-1 text-xs text-white/65">
              On iPhone/iPad, tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-white/65">
              Install this ERP app for faster access on your phone.
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {deferred ? (
              <Button
                type="button"
                size="sm"
                onClick={install}
                className="h-8 px-3 text-xs font-semibold"
                style={{
                  background: `linear-gradient(135deg, ${BRAND.colors.primary}, ${BRAND.colors.primary}dd)`,
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Install
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismiss}
              className="h-8 px-2 text-xs text-white/70 hover:text-white"
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
