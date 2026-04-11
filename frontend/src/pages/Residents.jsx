import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Search, Filter } from 'lucide-react';
import ResidentModal from '../components/ResidentModal';
import { useAuth } from '../context/AuthContext';
import { fetchElderlyResidents } from '../services/api';

const Residents = () => {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const canManageResidents = user?.role === 'ADMIN';

  const { data: residents, isLoading } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchElderlyResidents,
  });

  const filteredResidents = residents?.filter(resident => {
    const matchesSearch = resident.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         resident.watchId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || resident.status === filterStatus;
    return matchesSearch && matchesFilter;
  }) || [];

  const handleAddResident = () => {
    setSelectedResident(null);
    setIsModalOpen(true);
  };

  const handleEditResident = (resident) => {
    setSelectedResident(resident);
    setIsModalOpen(true);
  };

  const handleDeleteResident = (residentId) => {
    if (window.confirm('Are you sure you want to delete this resident?')) {
      // In real app, call API to delete
      console.log('Delete resident:', residentId);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      demo: 'bg-blue-100 text-blue-800',
      inactive: 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.inactive}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white rounded-lg p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Residents Management</h1>
            <p className="text-gray-600">
              {canManageResidents ? 'Manage elderly residents and their watch devices' : 'View the resident assigned to your account'}
            </p>
          </div>
          {canManageResidents ? (
            <button
              onClick={handleAddResident}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Resident
            </button>
          ) : null}
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or watch ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="demo">Demo</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Residents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredResidents.map((resident) => (
            <div key={resident.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{resident.name}</h3>
                  <p className="text-sm text-gray-500">Age: {resident.age}</p>
                </div>
                {getStatusBadge(resident.status)}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Watch ID:</span>
                  <span className="text-sm font-medium">{resident.watchId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Room:</span>
                  <span className="text-sm font-medium">{resident.room}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Emergency:</span>
                  <span className="text-sm font-medium">{resident.emergencyContact}</span>
                </div>
              </div>

              {canManageResidents ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditResident(resident)}
                    className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteResident(resident.id)}
                    className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {filteredResidents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No residents found matching your criteria.</p>
          </div>
        )}

        {/* Resident Modal */}
        {canManageResidents ? (
          <ResidentModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            resident={selectedResident}
          />
        ) : null}
      </div>
    </div>
  );
};

export default Residents;
