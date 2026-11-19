import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import ActivityLogList from '../activity-logs/ActivityLogList';
import { BackupList } from './backups/BackupList';

export const Settings: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="page-container">

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.title', 'System Settings')}</CardTitle>
          <CardDescription>
            {t('settings.description', 'Manage system configuration including backups')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="activityLogs" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activityLogs">Activity Logs</TabsTrigger>
              <TabsTrigger value="backups">Backups</TabsTrigger>
            </TabsList>

            <TabsContent value="activityLogs" className="mt-6">
              <ActivityLogList />
            </TabsContent>

            <TabsContent value="backups" className="mt-6">
              <BackupList />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
