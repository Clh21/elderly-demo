import React, { useState, useEffect } from 'react';
import { X, User, Watch, Phone, MapPin } from 'lucide-react';

const ResidentModal = ({ isOpen, onClose, resident }) => {
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    watchId: '',
    room: '',
    emergencyContact: '',
    status: 'active'
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (resident) {
      setFormData({
        name: resident.name || '',
        age: resident.age || '',
        watchId: resident.watchId || '',
        room: resident.room || '',
        emergencyContact: resident.emergencyContact || '',
        status: resident.status || 'active'
      });
    } else {
      setFormData({
        name: '',
        age: '',
        watchId: '',
        room: '',
        emergencyContact: '',
        status: 'active'
      });
    }
    setErrors({});
  }, [resident, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.age || formData.age < 1 || formData.age > 120) {
      newErrors.age = 'Please enter a valid age (1-120)';
    }
    
    if (!formData.watchId.trim()) {
      newErrors.watchId = 'Watch ID is required';
    }
    
    if (!formData.room.trim()) {
      newErrors.room = 'Room number is required';
    }
    
    if (!formData.emergencyContact.trim()) {
      newErrors.emergencyContact = 'Emergency contact is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      // In real app, call API to save resident
      console.log('Saving resident:', formData);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {resident ? 'Edit Resident' : 'Add New Resident'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <User className="h-4 w-4" />
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter full name"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Age */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Age
            </label>
            <input
              type="number"
              name="age"
              value={formData.age}
              onChange={handleChange}
              min="1"
              max="120"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.age ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter age"
            />
            {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age}</p>}
          </div>

          {/* Watch ID */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Watch className="h-4 w-4" />
              Watch ID
            </label>
            <input
              type="text"
              name="watchId"
              value={formData.watchId}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.watchId ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., real-watch-001"
            />
            {errors.watchId && <p className="text-red-500 text-xs mt-1">{errors.watchId}</p>}
          </div>

          {/* Room */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <MapPin className="h-4 w-4" />
              Room Number
            </label>
            <input
              type="text"
              name="room"
              value={formData.room}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.room ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., 101"
            />
            {errors.room && <p className="text-red-500 text-xs mt-1">{errors.room}</p>}
          </div>

          {/* Emergency Contact */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Phone className="h-4 w-4" />
              Emergency Contact
            </label>
            <input
              type="tel"
              name="emergencyContact"
              value={formData.emergencyContact}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.emergencyContact ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="+1-555-0123"
            />
            {errors.emergencyContact && <p className="text-red-500 text-xs mt-1">{errors.emergencyContact}</p>}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="active">Active</option>
              <option value="demo">Demo</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {resident ? 'Update' : 'Add'} Resident
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResidentModal;
