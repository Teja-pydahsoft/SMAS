import React from 'react';

export default function VehicleInfoCard({ formData, setFormData, types, categories, disabled = false }) {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="admin-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        Vehicle Information
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div>
          <label className="admin-label" style={{ marginBottom: '8px' }}>Vehicle Number *</label>
          <input 
            type="text" 
            name="plateNumber"
            required
            disabled={disabled}
            placeholder="e.g. MH12AB1234"
            className="admin-input" 
            style={{ width: '100%' }}
            value={formData.plateNumber || ''}
            onChange={handleChange}
          />
        </div>
        
        <div>
          <label className="admin-label" style={{ marginBottom: '8px' }}>Equipment Name</label>
          <input 
            type="text" 
            name="equipmentName"
            disabled={disabled}
            placeholder="e.g. Delivery Truck 1"
            className="admin-input" 
            style={{ width: '100%' }}
            value={formData.equipmentName || ''}
            onChange={handleChange}
          />
        </div>

        <div>
          <label className="admin-label" style={{ marginBottom: '8px' }}>Vehicle Type *</label>
          <select 
            name="typeId"
            required
            disabled={disabled}
            className="admin-input"
            style={{ width: '100%' }}
            value={formData.typeId || ''}
            onChange={handleChange}
          >
            <option value="">Select Type...</option>
            {types.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="admin-label" style={{ marginBottom: '8px' }}>Category *</label>
          <select 
            name="categoryId"
            required
            disabled={disabled}
            className="admin-input"
            style={{ width: '100%' }}
            value={formData.categoryId || ''}
            onChange={handleChange}
          >
            <option value="">Select Category...</option>
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="admin-label" style={{ marginBottom: '8px' }}>Department</label>
          <select 
            name="departmentId"
            disabled={disabled}
            className="admin-input"
            style={{ width: '100%' }}
            value={formData.departmentId || ''}
            onChange={handleChange}
          >
            <option value="">No Department Assigned</option>
            {/* Populate dynamically if departments exist, or just leave optional for now */}
          </select>
        </div>

        <div>
          <label className="admin-label" style={{ marginBottom: '8px' }}>Remarks</label>
          <input 
            type="text" 
            name="remarks"
            disabled={disabled}
            placeholder="Any additional notes..."
            className="admin-input" 
            style={{ width: '100%' }}
            value={formData.remarks || ''}
            onChange={handleChange}
          />
        </div>
      </div>
    </div>
  );
}
