import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Phone, MapPin, User, Calendar, AtSign } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';

type ProfileData = {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  profile_picture?: string;
  role?: string;
  is_active?: boolean;
  created_at?: string;
};

function displayName(profile?: ProfileData | null, fallback?: string) {
  const full = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  return full || fallback || profile?.email || 'User';
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}

export const CustomerProfile: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { formatDateLong } = useFormatAppDate();

  const { data: profile, isLoading } = useFetchObjects<ProfileData>({
    queryKey: ['user-profile'],
    endpoint: 'profile/',
    enabled: !!user?.token,
  });

  const name = displayName(profile, user?.name);
  const email = profile?.email || user?.email;
  const phone = profile?.phone || user?.phone;
  const address = profile?.address || user?.address;
  const role = profile?.role || user?.role;
  const avatarSrc = profile?.profile_picture || user?.profile_picture;
  const memberSince = profile?.created_at || user?.created_at;

  const roleLabel = (() => {
    if (!role) return '—';
    const key = `common.roles.${role}`;
    const translated = t(key);
    return translated !== key ? translated : role;
  })();

  const formatDate = (value?: string) => {
    if (!value) return '—';
    return formatDateLong(value);
  };

  if (isLoading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-start">
            <Avatar className="h-20 w-20 ring-4 ring-primary/10">
              <AvatarImage src={avatarSrc || undefined} alt={name} />
              <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight truncate">{name}</h1>
              {email && (
                <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5">
                  <AtSign className="h-3.5 w-3.5 shrink-0" />
                  {email}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                {role && (
                  <Badge variant="default" className="capitalize">
                    {roleLabel}
                  </Badge>
                )}
                <Badge variant={profile?.is_active !== false ? 'outline' : 'destructive'}>
                  {profile?.is_active !== false ? t('common.active') : t('common.inactive')}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5" />
            {t('core.navigation.profile', 'Profile')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('core.email', 'Email')}</p>
                <p className="text-sm font-medium truncate">{email || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('core.phone', 'Phone')}</p>
                <p className="text-sm font-medium">{phone || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 sm:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('core.address', 'Address')}</p>
                <p className="text-sm font-medium">{address || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t('core.profile.memberSince', 'Member since')}</p>
                <p className="text-sm font-medium">{formatDate(memberSince)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
