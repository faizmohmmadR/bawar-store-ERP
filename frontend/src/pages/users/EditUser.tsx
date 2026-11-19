import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Users, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { isHqAdminUser } from '@/lib/apps';
import { emailString, requiredString } from '@/lib/formSchemas';

interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: string;
  is_active: boolean;
}

const EditUser = () => {
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isHqAdmin = isHqAdminUser(authUser);

  const schema = useMemo(
    () =>
      z
        .object({
          email: emailString(t('user.emailRequired'), t('user.emailInvalid')),
          first_name: requiredString(t('user.firstNameRequired')),
          last_name: requiredString(t('user.lastNameRequired')),
          phone: z.string().optional(),
          role: z.enum(isHqAdmin
            ? ['admin', 'staff', 'employee', 'customer', 'vendor']
            : ['staff', 'employee']),
          is_active: z.boolean(),
          password: z.string().optional(),
          confirmPassword: z.string().optional(),
        })
        .refine((data) => !data.password?.trim() || data.password.length >= 6, {
          message: t('user.passwordMinLength'),
          path: ['password'],
        })
        .refine((data) => !data.password?.trim() || data.password === data.confirmPassword, {
          message: t('user.passwordsDoNotMatch'),
          path: ['confirmPassword'],
        }),
    [t, isHqAdmin],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      role: 'staff',
      is_active: true,
      password: '',
      confirmPassword: '',
    },
  });

  const { data: user, isLoading: userLoading } = useFetchObjects<User>({
    queryKey: ['user', id],
    endpoint: `users/${id}/`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['users'],
    endpoint: 'users',
  });

  useEffect(() => {
    if (user) {
      form.reset({
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        phone: user.phone || '',
        role: (user.role as z.infer<typeof schema>['role']) || 'staff',
        is_active: user.is_active,
        password: '',
        confirmPassword: '',
      });
    }
  }, [user, form]);

  useRedirectOnSuccess(isSuccess, '/users');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!user) return;
    const { confirmPassword: _, ...rest } = data;
    const submitData: Record<string, unknown> = {
      ...rest,
      role: isHqAdmin ? rest.role : (rest.role === 'employee' ? 'employee' : 'staff'),
    };
    if (!String(submitData.password || '').trim()) {
      delete submitData.password;
    }
    handleUpdate(user.id, submitData);
  };

  if (userLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <FormPage
      title={t('user.editUser')}
      icon={<Users />}
      backTo="/users"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('user.personalInformation')}>
            <FormPageFields>
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.firstName')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('user.enterFirstName')} autoComplete="given-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.lastName')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('user.enterLastName')} autoComplete="family-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.email')} *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder={t('user.enterEmail')} autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.phone')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('user.enterPhone')} autoComplete="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormPageFields>
          </FormPageSection>

          <FormPageSection title={t('user.accountInformation')}>
            <FormPageFields>
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.newPassword')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder={t('user.enterNewPassword')}
                          autoComplete="new-password"
                          className="pe-10"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute end-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.confirmNewPassword')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder={t('user.confirmNewPassword')}
                          autoComplete="new-password"
                          className="pe-10"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute end-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          tabIndex={-1}
                        >
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.role')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('user.selectRole')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isHqAdmin && (
                          <SelectItem value="admin">{t('user.roles.admin')}</SelectItem>
                        )}
                        <SelectItem value="staff">{t('user.roles.staff')}</SelectItem>
                        <SelectItem value="employee">{t('user.roles.employee')}</SelectItem>
                        {isHqAdmin && (
                          <>
                            <SelectItem value="customer">{t('user.roles.customer')}</SelectItem>
                            <SelectItem value="vendor">{t('user.roles.vendor')}</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('user.status')}</FormLabel>
                    <Select
                      value={field.value ? 'true' : 'false'}
                      onValueChange={(value) => field.onChange(value === 'true')}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="true">{t('user.active')}</SelectItem>
                        <SelectItem value="false">{t('user.inactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormPageFields>
          </FormPageSection>

          <FormActions
            onCancel={() => navigate('/users')}
            loading={loading}
            submitLabel={t('common.update')}
            loadingLabel={t('common.updating')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditUser;
