import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Users, Eye, EyeOff, ShieldAlert } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import useAdd from '@/api/useAdd';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { isHqAdminUser } from '@/lib/apps';
import { emailString, requiredString } from '@/lib/formSchemas';

type CreatedUser = { id: number | string };

const AddUser = () => {
  const { t } = useLanguage();
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isHqAdmin = isHqAdminUser(authUser);

  const schema = useMemo(
    () =>
      z
        .object({
          email: emailString(t('user.emailRequired'), t('user.emailInvalid')),
          password: requiredString(t('user.passwordRequired')).min(6, t('user.passwordMinLength')),
          confirmPassword: requiredString(t('user.confirmPasswordRequired')),
          first_name: requiredString(t('user.firstNameRequired')),
          last_name: requiredString(t('user.lastNameRequired')),
          phone: z.string().optional(),
          role: z.enum(isHqAdmin
            ? ['admin', 'staff', 'employee', 'customer', 'vendor']
            : ['staff', 'employee']),
          is_active: z.boolean(),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t('user.passwordsDoNotMatch'),
          path: ['confirmPassword'],
        }),
    [t, isHqAdmin],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      first_name: '',
      last_name: '',
      phone: '',
      role: 'staff',
      is_active: true,
    },
  });

  const { handleAdd, loading, isSuccess, responseData } = useAdd<CreatedUser>({
    queryKey: ['users'],
    endpoint: 'users/',
    customSuccessMessage: t('user.userAddedSuccess', 'User added successfully'),
  });

  const onReset = useCallback(() => {
    form.reset({
      email: '',
      password: '',
      confirmPassword: '',
      first_name: '',
      last_name: '',
      phone: '',
      role: 'staff',
      is_active: true,
    });
  }, [form]);

  const getSuccessPath = useCallback(() => {
    const id = responseData?.id;
    return id != null ? `/users/${id}/permissions` : '/users';
  }, [responseData]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/users',
    getSuccessPath,
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    const { confirmPassword: _, ...rest } = data;
    handleAdd({
      ...rest,
      role: isHqAdmin ? rest.role : (rest.role === 'employee' ? 'employee' : 'staff'),
    });
  };

  return (
    <FormPage
      title={t('user.addUser')}
      icon={<Users />}
      backTo="/users"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Alert className="border-primary/20 bg-primary/5">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <AlertTitle>
              {t('user.noDefaultPermissionsTitle', 'No section access by default')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'user.noDefaultPermissionsHelp',
                'New users cannot open any ERP section until you grant permissions. After saving, you will be taken to the permissions page.',
              )}
            </AlertDescription>
          </Alert>

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
                    <FormLabel>{t('user.password')} *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder={t('user.enterPassword')}
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
                    <FormLabel>{t('user.confirmPassword')} *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder={t('user.confirmPassword')}
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
            mode="create"
            showSaveAndCreateNew={showSaveAndCreateNew}
            onIntent={onIntent}
            onCancel={() => navigate('/users')}
            loading={loading}
            submitLabel={t('common.add')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddUser;
