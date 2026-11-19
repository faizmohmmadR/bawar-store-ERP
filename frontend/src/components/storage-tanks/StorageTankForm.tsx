import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import { Warehouse } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import api from '@/api/client';
import useFetchObjects from '@/api/useFetchObjects';
import { Form } from '@/components/ui/form';
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { useLanguage } from '@/contexts/LanguageContext';
import type { StorageTank } from '@/types/storage-tank';

type StorageTankFormProps = {
    mode: 'create' | 'edit';
};

export const StorageTankForm = ({ mode }: StorageTankFormProps) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { id } = useParams<{ id: string }>();
    const editing = mode === 'edit';
    const [saving, setSaving] = useState(false);
    const messages = useMemo(() => formMessages(t), [t]);
    const schema = useMemo(() => z.object({
        name: requiredString(messages.required),
        capacity_kg: z.string()
            .min(1, messages.required)
            .refine((value) => Number(value) > 0, messages.positive),
    }), [messages.required, messages.positive]);
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', capacity_kg: '' },
    });

    const { data: tank, isLoading } = useFetchObjects<StorageTank>({
        queryKey: ['storage-tank', id],
        endpoint: `storage-tanks/${id}`,
        enabled: editing && Boolean(id),
    });

    useEffect(() => {
        if (tank) {
            form.reset({
                name: tank.name,
                capacity_kg: tank.capacity_kg,

            });
        }
    }, [tank, form]);

    const onSubmit = async (values: z.infer<typeof schema>) => {
        if (editing && !tank) return;
        setSaving(true);
        try {
            const payload = {
                name: values.name,
                capacity_kg: values.capacity_kg,
                product: null,
            };
            if (editing) {
                await api.patch(`/storage-tanks/${tank?.id}/`, payload);
            } else {
                await api.post('/storage-tanks/', payload);
            }
            await queryClient.invalidateQueries({ queryKey: ['storage-tanks'] });
            if (id) await queryClient.invalidateQueries({ queryKey: ['storage-tank', id] });
            notifySuccess(
                t(editing
                    ? 'rawMaterialProcesses.storageTankUpdated'
                    : 'rawMaterialProcesses.storageTankCreated'),
                {
                    title: t('common.success'),
                    dismissLabel: t('common.dismiss') || 'Dismiss',
                },
            );
            navigate('/storage-tanks');
        } catch (error: unknown) {
            const responseData = isAxiosError(error) ? error.response?.data : undefined;
            const message = responseData && typeof responseData === 'object'
                ? Object.values(responseData).flatMap((value) => Array.isArray(value) ? value : [value]).join(' ')
                : t('rawMaterialProcesses.storageTankSaveFailed');
            toast.error(String(message));
        } finally {
            setSaving(false);
        }
    };

    if (editing && isLoading) {
        return <div className="flex justify-center py-8"><ReloadIcon className="h-8 w-8 animate-spin" /></div>;
    }

    if (editing && !tank) {
        return <div className="p-6 text-sm text-muted-foreground">{t('rawMaterialProcesses.storageTankNotFound')}</div>;
    }

    return (
        <FormPage
            title={t(editing ? 'rawMaterialProcesses.editStorageTank' : 'rawMaterialProcesses.addStorageTank')}
            description={t('rawMaterialProcesses.storageTanksSubtitle')}
            icon={<Warehouse />}
            backTo="/storage-tanks"
            maxWidth="3xl"
        >
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormPageFields className="lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('rawMaterialProcesses.storageTankName')} *</FormLabel>
                                    <FormControl>
                                        <Input maxLength={255} placeholder={t('rawMaterialProcesses.storageTankName')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="capacity_kg"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('rawMaterialProcesses.capacityKg', 'Capacity (kg)')} *</FormLabel>
                                    <FormControl>
                                        <Input type="number" min="0.0001" step="0.0001" placeholder="0" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                    </FormPageFields>
                    <FormActions
                        mode="edit"
                        onCancel={() => navigate('/storage-tanks')}
                        loading={saving}
                        submitLabel={t(editing ? 'common.update' : 'common.save')}
                        loadingLabel={t(editing ? 'common.updating' : 'common.saving')}
                    />
                </form>
            </Form>
        </FormPage>
    );
};
