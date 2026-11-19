import { useMemo, useState } from 'react';
import { Plus, Search, Calendar, Package, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useFetchObjects from '@/api/useFetchObjects';
import { formatCartonPiece } from '@/lib/packaging';
import type { InventoryBatch } from '@/types/inventory';

export default function BatchList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expiryFilter, setExpiryFilter] = useState('all');
  const navigate = useNavigate();

  const { data, isLoading } = useFetchObjects<{
    results?: InventoryBatch[];
  } | InventoryBatch[]>({
    queryKey: ['inventory-batches', statusFilter, expiryFilter],
    endpoint: 'inventory-batches',
    params: {
      ...(statusFilter !== 'all' && { status: statusFilter }),
      ...(expiryFilter !== 'all' && { expiry: expiryFilter }),
    },
  });

  const batches = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.results || [];
  }, [data]);

  const filteredBatches = batches.filter(
    (batch) =>
      batch.batch_number.toLowerCase().includes(search.toLowerCase()) ||
      (batch.product_details?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (batch.supplier_details?.name || '').toLowerCase().includes(search.toLowerCase()),
  );

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      expired: 'bg-red-100 text-red-800',
      empty: 'bg-gray-100 text-gray-800',
      damaged: 'bg-yellow-100 text-yellow-800',
      returned: 'bg-blue-100 text-blue-800',
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${
          colors[status as keyof typeof colors] || colors.active
        }`}
      >
        {status}
      </span>
    );
  };

  const getExpiryBadge = (batch: InventoryBatch) => {
    if (!batch.expire_date) return null;
    if (batch.is_expired) {
      return (
        <span className="flex items-center gap-1 text-red-600 text-sm">
          <AlertTriangle className="w-4 h-4" />
          Expired
        </span>
      );
    }
    if (batch.is_near_expiry) {
      return (
        <span className="flex items-center gap-1 text-yellow-600 text-sm">
          <Calendar className="w-4 h-4" />
          {batch.days_until_expiry} days
        </span>
      );
    }
    return <span className="text-gray-600 text-sm">{batch.days_until_expiry} days</span>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Batches</h1>
        <button
          onClick={() => navigate('/inventory/batches/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Manual Adjustment
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search batches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="empty">Empty</option>
          <option value="damaged">Damaged</option>
        </select>
        <select
          value={expiryFilter}
          onChange={(e) => setExpiryFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Expiry</option>
          <option value="expired">Expired</option>
          <option value="near_expiry">Near Expiry</option>
          <option value="not_expired">Not Expired</option>
        </select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Batch Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Warehouse
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Remaining
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiry
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Condition
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBatches.map((batch) => (
              <tr
                key={batch.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/inventory/batches/${batch.id}`)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{batch.batch_number}</div>
                  {batch.supplier_details?.name && (
                    <div className="text-xs text-gray-500">
                      {batch.supplier_details.name}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{batch.product_details?.name}</div>
                  <div className="text-xs text-gray-500">{batch.product_details?.barcode}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {batch.warehouse_details?.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {formatCartonPiece(batch.remaining_pieces)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {batch.cartons_remaining} cartons, {batch.loose_pieces} loose
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{getExpiryBadge(batch)}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(batch.status || 'active')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                  {batch.condition}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredBatches.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No batches found</p>
          </div>
        )}
      </div>
    </div>
  );
}
