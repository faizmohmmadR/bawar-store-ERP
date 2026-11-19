import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, Calendar, User, Building, FileText, Link, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { ReloadIcon } from '@radix-ui/react-icons';

const AccountEntryDetail = () => {
  const { t } = useLanguage();
  const { formatDateLong, formatDateTime } = useFormatAppDate();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: entry, isLoading } = useFetchObjects({
    queryKey: ['account-entry', id],
    endpoint: `account-entries/${id}`,
    enabled: !!id,
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['account-entries'],
    endpoint: 'account-entries',
    onSuccess: () => navigate('/account-entries')
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <ReloadIcon className="animate-spin h-8 w-8" />
        <span className="ml-2">Loading entry details...</span>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Receipt className="h-16 w-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-600">Entry not found</h2>
        <Button onClick={() => navigate('/account-entries')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Entries
        </Button>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: formatDateLong(dateString),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      })
    };
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const isManualEntry = !entry.content_type;
  const entryDate = formatDate(entry.entry_date);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/account-entries')}
              className="h-8 w-8 p-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Account Entry Details</h1>
              <p className="text-gray-600">
                {entry.reference_number || `Entry #${entry.id}`}
              </p>
            </div>
          </div>
          
          {isManualEntry && (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => navigate(`/account-entries/${entry.id}/edit`)}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => handleDelete(entry.id, entry.reference_number || `Entry ${entry.id}`)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Entry Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Entry Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Entry Type</label>
                    <div className="mt-1">
                      <Badge variant="outline" className="text-sm">
                        {entry.entry_type_details?.name || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Reference Number</label>
                    <p className="mt-1 text-sm font-medium">
                      {entry.reference_number || 'No reference'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Entry Date</label>
                    <div className="mt-1">
                      <p className="text-sm font-medium">{entryDate.date}</p>
                      <p className="text-xs text-gray-500">{entryDate.time}</p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Entry Source</label>
                    <div className="mt-1">
                      {entry.content_type ? (
                        <Badge variant="secondary" className="text-xs">
                          {entry.content_type_name || 'System Generated'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Manual Entry
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {entry.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Notes</label>
                    <p className="mt-1 text-sm bg-gray-50 p-3 rounded-md">
                      {entry.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Account Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Account Number</label>
                    <p className="mt-1 text-sm font-medium">
                      {entry.account_details?.account_number || 'Unknown'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Account Holder</label>
                    <p className="mt-1 text-sm font-medium">
                      {entry.account_details?.holder_name || 'Unknown'}
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Account Type</label>
                    <div className="mt-1">
                      <Badge variant="outline">
                        {entry.account_details?.account_type || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Currency</label>
                    <p className="mt-1 text-sm font-medium">
                      {entry.account_details?.currency_code || 'Unknown'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Linked Transaction */}
            {entry.content_type && entry.object_id && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link className="h-5 w-5" />
                    Linked Transaction
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-primary/10 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-primary">
                          {entry.content_type_name || 'Transaction'}
                        </p>
                        <p className="text-xs text-primary">
                          ID: {entry.object_id}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        System Generated
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Amount Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Amount Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-primary/10 rounded-lg">
                    <span className="text-sm font-medium text-primary">Debit Amount</span>
                    <span className="text-lg font-bold text-primary">
                      {formatAmount(parseFloat(entry.debit_amount || 0))}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                    <span className="text-sm font-medium text-red-800">Credit Amount</span>
                    <span className="text-lg font-bold text-red-600">
                      {formatAmount(parseFloat(entry.credit_amount || 0))}
                    </span>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                    <span className="text-sm font-medium text-gray-800">Net Effect</span>
                    <span className={`text-lg font-bold ${
                      (parseFloat(entry.debit_amount || 0) - parseFloat(entry.credit_amount || 0)) >= 0 
                        ? 'text-primary' 
                        : 'text-red-600'
                    }`}>
                      {formatAmount(
                        parseFloat(entry.debit_amount || 0) - parseFloat(entry.credit_amount || 0)
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Entry Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Entry Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Created
                  </label>
                  <p className="text-sm">
                    {formatDateTime(entry.created_at)}
                  </p>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Last Updated
                  </label>
                  <p className="text-sm">
                    {formatDateTime(entry.updated_at)}
                  </p>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Entry ID
                  </label>
                  <p className="text-sm font-mono">#{entry.id}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog />
    </div>
  );
};

export default AccountEntryDetail;