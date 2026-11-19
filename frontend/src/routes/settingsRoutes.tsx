import { Navigate, Route, useParams } from 'react-router-dom';
import { BackupList } from '@/pages/settings/backups/BackupList';
import { TrashPage } from '@/pages/settings/trash/TrashPage';
import { PreferencesSettings } from '@/pages/settings/preferences/PreferencesSettings';
import { ExchangeRateList } from '@/pages/settings/exchange-rates/ExchangeRateList';
import { AddExchangeRate } from '@/pages/settings/exchange-rates/AddExchangeRate';
import { EditExchangeRate } from '@/pages/settings/exchange-rates/EditExchangeRate';
import JournalEntryList from '@/pages/accounts/JournalEntryList';
import AddJournalEntry from '@/pages/accounts/AddJournalEntry';
import EditJournalEntry from '@/pages/accounts/EditJournalEntry';
import JournalEntryDetail from '@/pages/accounts/JournalEntryDetail';

export const settingsRoutes = (
  <>
    <Route path="settings/preferences" element={<PreferencesSettings />} />
    <Route path="settings/backups" element={<BackupList />} />
    <Route path="settings/trash" element={<TrashPage />} />
    <Route path="settings/exchange-rates" element={<ExchangeRateList />} />
    <Route path="settings/exchange-rates/add" element={<AddExchangeRate />} />
    <Route path="settings/exchange-rates/:id/edit" element={<EditExchangeRate />} />
    <Route path="journal-entries" element={<JournalEntryList />} />
    <Route path="journal-entries/add" element={<AddJournalEntry />} />
    <Route path="journal-entries/:id" element={<JournalEntryDetail />} />
    <Route path="journal-entries/:id/edit" element={<EditJournalEntry />} />
  </>
);
